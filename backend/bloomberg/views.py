from datetime import date

from django.db.models import F
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.permissions import IsAdminUser

from bloomberg.models import (
    BloombergAsset, BloombergField, BloombergFieldGroup,
    BloombergAssetException, BloombergDataPoint, BloombergFetchLog,
    BloombergApiQuota, Trade, InternalNAV, AssetRiskProxy,
    AssetRegistrationRequest, PositionSnapshot,
)
from bloomberg.serializers import (
    BloombergAssetSerializer, BloombergFieldSerializer,
    BloombergFieldGroupSerializer, BloombergAssetExceptionSerializer,
    AgentConfigSerializer, DataPointBulkItemSerializer,
    FetchLogCreateSerializer, QuotaIncrementSerializer,
    BloombergDataPointSerializer, BloombergFetchLogSerializer,
    BloombergApiQuotaSerializer, TradeSerializer, InternalNAVSerializer,
    BloombergAssetFullSerializer, AssetRiskProxySerializer,
    AssetRegistrationRequestSerializer, PositionSnapshotSerializer,
)
from bloomberg.services import detect_gaps, get_data_freshness, calculate_nav


# =========================================================================
# BBG Agent Endpoints — called by the local Python agent
# =========================================================================

class AgentConfigView(APIView):
    """GET /api/bbg/config/ — Agent pulls its full configuration."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            'assets': BloombergAsset.objects.filter(is_active=True),
            'fields': BloombergField.objects.filter(is_active=True),
            'field_groups': BloombergFieldGroup.objects.filter(
                field__is_active=True
            ).select_related('field'),
            'exceptions': BloombergAssetException.objects.select_related(
                'asset', 'field', 'proxy_asset', 'proxy_field'
            ),
        }
        serializer = AgentConfigSerializer(data)
        return Response(serializer.data)


class DataBulkUploadView(APIView):
    """POST /api/bbg/data/bulk/ — Agent uploads a batch of data points."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DataPointBulkItemSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        # Pre-fetch lookups
        asset_map = {a.code_bbg: a for a in BloombergAsset.objects.filter(is_active=True)}
        field_map = {f.name: f for f in BloombergField.objects.filter(is_active=True)}

        created = 0
        updated = 0
        errors = []

        for item in serializer.validated_data:
            asset = asset_map.get(item['code_bbg'])
            field = field_map.get(item['field_name'])

            if not asset:
                errors.append(f"Unknown asset: {item['code_bbg']}")
                continue
            if not field:
                errors.append(f"Unknown field: {item['field_name']}")
                continue

            obj, was_created = BloombergDataPoint.objects.update_or_create(
                asset=asset,
                field=field,
                date=item['date'],
                date_ref=item.get('date_ref', ''),
                defaults={
                    'value': item.get('value'),
                    'value_str': item.get('value_str', ''),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors,
        }, status=status.HTTP_201_CREATED)


class FetchLogCreateView(APIView):
    """POST /api/bbg/fetch-log/ — Agent reports a fetch operation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = FetchLogCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class QuotaIncrementView(APIView):
    """POST /api/bbg/quota/increment/ — Agent increments API call counters."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QuotaIncrementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quota, _ = BloombergApiQuota.objects.get_or_create(
            date=serializer.validated_data['date'],
        )
        quota.calls_ref = F('calls_ref') + serializer.validated_data.get('calls_ref', 0)
        quota.calls_bdh = F('calls_bdh') + serializer.validated_data.get('calls_bdh', 0)
        quota.calls_total = (
            F('calls_total')
            + serializer.validated_data.get('calls_ref', 0)
            + serializer.validated_data.get('calls_bdh', 0)
        )
        quota.save()
        quota.refresh_from_db()

        return Response({
            'date': str(quota.date),
            'calls_total': quota.calls_total,
            'limit_daily': quota.limit_daily,
            'usage_pct': quota.usage_pct,
        })


class GapsView(APIView):
    """GET /api/bbg/gaps/ — Returns missing data points for backfill."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        max_age = int(request.query_params.get('max_age_days', 30))
        gaps = detect_gaps(max_age_days=max_age)
        return Response(gaps)


# =========================================================================
# Monitoring Endpoints — called by the frontend dashboard
# =========================================================================

class DataStatusView(APIView):
    """GET /api/bbg/status/ — Data freshness per field/asset_group."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        freshness = get_data_freshness()
        return Response(freshness)


class QuotaListView(APIView):
    """GET /api/bbg/quota/ — API usage stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        quotas = BloombergApiQuota.objects.all()[:days]
        serializer = BloombergApiQuotaSerializer(quotas, many=True)
        return Response(serializer.data)


class FetchLogListView(APIView):
    """GET /api/bbg/fetch-logs/ — Paginated fetch history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = int(request.query_params.get('limit', 50))
        offset = int(request.query_params.get('offset', 0))
        status_filter = request.query_params.get('status', None)

        qs = BloombergFetchLog.objects.select_related('field')
        if status_filter:
            qs = qs.filter(status=status_filter)

        total = qs.count()
        logs = qs[offset:offset + limit]
        serializer = BloombergFetchLogSerializer(logs, many=True)

        return Response({
            'total': total,
            'offset': offset,
            'limit': limit,
            'results': serializer.data,
        })


class DataPointView(APIView):
    """GET /api/bbg/data/<code_bbg>/ — Time series for a specific asset."""
    permission_classes = [IsAuthenticated]

    def get(self, request, code_bbg):
        field_name = request.query_params.get('field', None)
        days = int(request.query_params.get('days', 365))

        qs = BloombergDataPoint.objects.filter(
            asset__code_bbg=code_bbg,
        ).select_related('field')

        if field_name:
            qs = qs.filter(field__name=field_name)

        from datetime import timedelta
        cutoff = date.today() - timedelta(days=days)
        qs = qs.filter(date__gte=cutoff).order_by('date')

        serializer = BloombergDataPointSerializer(qs, many=True)
        return Response(serializer.data)


# =========================================================================
# Trade Endpoints
# =========================================================================

class TradeViewSet(viewsets.ModelViewSet):
    """CRUD for trades."""
    serializer_class = TradeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Trade.objects.select_related('asset', 'entered_by')
        fund = self.request.query_params.get('fund')
        portfolio = self.request.query_params.get('portfolio')
        trade_status = self.request.query_params.get('trade_status')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if fund:
            qs = qs.filter(fund=fund)
        if portfolio:
            qs = qs.filter(portfolio=portfolio)
        if trade_status:
            qs = qs.filter(trade_status=trade_status)
        if date_from:
            qs = qs.filter(trade_date__gte=date_from)
        if date_to:
            qs = qs.filter(trade_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        trade = serializer.save(entered_by=self.request.user)
        # If asset is not set but ticker_raw is provided, create registration request
        if not trade.asset and trade.asset_ticker_raw:
            # Check if a pending request already exists for this ticker
            existing = AssetRegistrationRequest.objects.filter(
                ticker_raw=trade.asset_ticker_raw,
                status__in=['pending', 'in_progress'],
            ).first()
            if not existing:
                AssetRegistrationRequest.objects.create(
                    ticker_raw=trade.asset_ticker_raw,
                    requested_by=self.request.user,
                    requested_from_trade=trade,
                )

    @action(detail=False, methods=['get'])
    def portfolios(self, request):
        """GET /api/bbg/trades/portfolios/ — distinct portfolio values for dropdown."""
        values = Trade.objects.exclude(portfolio='').values_list(
            'portfolio', flat=True
        ).distinct().order_by('portfolio')
        return Response(list(values))


# =========================================================================
# Asset Register Endpoints
# =========================================================================

class AssetRegisterViewSet(viewsets.ModelViewSet):
    """Full CRUD for BloombergAsset. Read for all authenticated users, write for admin only."""
    serializer_class = BloombergAssetFullSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BloombergAsset.objects.prefetch_related('risk_proxies')
        q = self.request.query_params.get('q')
        asset_group = self.request.query_params.get('asset_group')
        is_active = self.request.query_params.get('is_active')
        if q:
            from django.db.models import Q as DBQ
            qs = qs.filter(DBQ(code_bbg__icontains=q) | DBQ(name__icontains=q))
        if asset_group:
            qs = qs.filter(asset_group=asset_group)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminUser()]
        return [IsAuthenticated()]


class AssetRegistrationRequestViewSet(viewsets.ModelViewSet):
    """CRUD + complete action for asset registration requests."""
    serializer_class = AssetRegistrationRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AssetRegistrationRequest.objects.select_related(
            'asset', 'requested_by', 'completed_by', 'requested_from_trade'
        )
        req_status = self.request.query_params.get('status')
        if req_status:
            qs = qs.filter(status=req_status)
        return qs

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """POST /api/bbg/asset-requests/{id}/complete/
        Body: { asset_id: <id> }
        Links the asset to the request and to all trades with matching ticker_raw.
        """
        from django.utils import timezone
        reg_request = self.get_object()
        asset_id = request.data.get('asset_id')
        if not asset_id:
            return Response({'error': 'asset_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            asset = BloombergAsset.objects.get(pk=asset_id)
        except BloombergAsset.DoesNotExist:
            return Response({'error': 'Asset not found'}, status=status.HTTP_404_NOT_FOUND)

        # Update the registration request
        reg_request.asset = asset
        reg_request.status = 'completed'
        reg_request.completed_by = request.user
        reg_request.completed_at = timezone.now()
        reg_request.save()

        # Link all trades with this ticker_raw to the newly registered asset
        linked = Trade.objects.filter(
            asset__isnull=True,
            asset_ticker_raw=reg_request.ticker_raw,
        ).update(asset=asset)

        serializer = self.get_serializer(reg_request)
        return Response({
            **serializer.data,
            'trades_linked': linked,
        })


class AssetRiskProxyViewSet(viewsets.ModelViewSet):
    """CRUD for risk proxy configurations."""
    serializer_class = AssetRiskProxySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AssetRiskProxy.objects.select_related('asset')
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminUser()]
        return [IsAuthenticated()]


# =========================================================================
# Position Snapshot Endpoints
# =========================================================================

class PositionSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only position snapshots with filters."""
    serializer_class = PositionSnapshotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PositionSnapshot.objects.select_related('asset')
        fund = self.request.query_params.get('fund')
        dt = self.request.query_params.get('date')
        portfolio = self.request.query_params.get('portfolio')
        asset_group = self.request.query_params.get('asset_group')
        if fund:
            qs = qs.filter(fund=fund)
        if dt:
            qs = qs.filter(date=dt)
        if portfolio:
            qs = qs.filter(portfolio=portfolio)
        if asset_group:
            qs = qs.filter(asset_group=asset_group)
        return qs

    @action(detail=False, methods=['get'])
    def dates(self, request):
        """GET /api/bbg/positions/dates/ -- available snapshot dates."""
        dates = PositionSnapshot.objects.values_list('date', flat=True).distinct().order_by('-date')
        return Response(list(dates))

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """GET /api/bbg/positions/latest/ -- latest snapshot (current positions)."""
        latest_date = PositionSnapshot.objects.order_by('-date').values_list('date', flat=True).first()
        if not latest_date:
            return Response([])
        qs = PositionSnapshot.objects.filter(date=latest_date).select_related('asset')
        fund = request.query_params.get('fund')
        if fund:
            qs = qs.filter(fund=fund)
        serializer = self.get_serializer(qs, many=True)
        return Response({'date': latest_date, 'positions': serializer.data})


# =========================================================================
# Internal NAV Endpoints
# =========================================================================

class InternalNAVViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only NAV series."""
    serializer_class = InternalNAVSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = InternalNAV.objects.all()
        fund = self.request.query_params.get('fund')
        if fund:
            qs = qs.filter(fund=fund)
        return qs


class CalculateNAVView(APIView):
    """POST /api/bbg/internal-nav/calculate/ — Trigger NAV recalculation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        fund = request.data.get('fund')
        nav_date = request.data.get('date')
        total_shares = float(request.data.get('total_shares', 0))

        if not fund or not nav_date:
            return Response(
                {'error': 'fund and date are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from datetime import datetime
        nav_date = datetime.strptime(nav_date, '%Y-%m-%d').date()

        result = calculate_nav(fund, nav_date, total_shares)
        if result is None:
            return Response(
                {'error': 'No positions found for this fund/date'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Save NAV
        nav, _ = InternalNAV.objects.update_or_create(
            fund=fund,
            date=nav_date,
            defaults={
                'total_nav': result['total_nav'],
                'total_shares': result['total_shares'],
                'nav_per_share': result['nav_per_share'],
            },
        )

        return Response({
            **InternalNAVSerializer(nav).data,
            'positions': result['positions'],
        })


# =========================================================================
# Asset search for frontend autocomplete
# =========================================================================

class AssetSearchView(APIView):
    """GET /api/bbg/assets/search/?q=... — Autocomplete for asset selection."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response([])

        from django.db.models import Q as DBQ
        assets = BloombergAsset.objects.filter(
            is_active=True,
        ).filter(
            DBQ(code_bbg__icontains=q) | DBQ(name__icontains=q)
        )[:20]

        serializer = BloombergAssetSerializer(assets, many=True)
        return Response(serializer.data)
