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

import logging
logger = logging.getLogger(__name__)


def _apply_trade_to_position(trade):
    """Apply a confirmed trade to the PositionSnapshot for trade_date.

    Logic:
    - Get or create the position for (trade_date, fund, ticker, portfolio)
    - BUY: increase units_close, increase amount_transaction
    - SELL: decrease units_close, increase amount_transaction
    - Update avg_cost on buys using weighted average
    - Update transaction P&L fields
    """
    ticker = trade.asset.code_bbg if trade.asset else trade.asset_ticker_raw
    if not ticker:
        return

    fund = trade.fund or 'IGFWM TOTAL RETURN'
    portfolio = trade.portfolio or 'DISCRETIONARY'
    trade_date = trade.trade_date

    # Find the most recent position for this asset to get carry-forward data
    prev_position = PositionSnapshot.objects.filter(
        fund=fund,
        asset_ticker=ticker,
        portfolio=portfolio,
        date__lt=trade_date,
    ).order_by('-date').first()

    # Get or create today's position
    position, created = PositionSnapshot.objects.get_or_create(
        date=trade_date,
        fund=fund,
        asset_ticker=ticker,
        portfolio=portfolio,
        defaults={
            'asset_group': (trade.asset.asset_group if trade.asset else ''),
            'broker': trade.broker,
            'asset_market': (trade.asset.asset_market if trade.asset else ''),
            'asset': trade.asset,
            'currency': trade.currency,
            'contract_size': (trade.asset.contract_size if trade.asset else 1),
            # Carry forward from previous position
            'units_open': prev_position.units_close if prev_position else 0,
            'units_close': prev_position.units_close if prev_position else 0,
            'avg_cost': prev_position.avg_cost if prev_position else 0,
            'price_open': prev_position.price_close if prev_position else None,
            'amount_open': prev_position.amount_close if prev_position else 0,
            'units_transaction': 0,
            'amount_transaction': 0,
            'pnl_transaction': 0,
            'pnl_transaction_fee': 0,
            'pnl_total': 0,
        }
    )

    # Apply the trade
    trade_units = trade.quantity
    trade_amount = trade.amount or (trade.quantity * trade.price)
    fee = trade.fee_total or 0

    if trade.side == 'buy':
        # Weighted average cost
        old_units = position.units_close or 0
        old_cost = position.avg_cost or 0
        new_units = old_units + trade_units
        if new_units > 0:
            position.avg_cost = ((old_cost * old_units) + (trade.price * trade_units)) / new_units
        position.units_close = new_units
        position.units_transaction = (position.units_transaction or 0) + trade_units
        position.amount_transaction = (position.amount_transaction or 0) + trade_amount
    elif trade.side == 'sell':
        position.units_close = (position.units_close or 0) - trade_units
        position.units_transaction = (position.units_transaction or 0) - trade_units
        position.amount_transaction = (position.amount_transaction or 0) - trade_amount
        # Realized P&L on sell
        cost_basis = (position.avg_cost or 0) * trade_units
        position.pnl_transaction = (position.pnl_transaction or 0) + (trade_amount - cost_basis)

    # Fees
    position.pnl_transaction_fee = (position.pnl_transaction_fee or 0) - fee

    # Update amount_close (units * price, but price may not be known yet for today)
    if position.price_close and position.units_close:
        cs = position.contract_size or 1
        position.amount_close = position.units_close * position.price_close * cs

    # Recalc total P&L
    position.pnl_total = (
        (position.pnl_open_position or 0) +
        (position.pnl_transaction or 0) +
        (position.pnl_transaction_fee or 0) +
        (position.pnl_dividend or 0) +
        (position.pnl_lending or 0)
    )

    position.save()
    logger.info(f"Applied trade {trade.side} {trade_units} {ticker} to position on {trade_date}")


# =========================================================================
# BBG Agent Endpoints — called by the local Python agent
# =========================================================================

class AgentConfigView(APIView):
    """GET /api/bbg/config/ — Agent pulls its full configuration."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            'assets': BloombergAsset.objects.filter(
                is_active=True, is_bbg_ticker=True, request_bbg_data=True
            ),
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
        # Apply trade to position snapshot
        if trade.trade_status == 'confirmed':
            _apply_trade_to_position(trade)

    def perform_update(self, serializer):
        old_status = self.get_object().trade_status
        trade = serializer.save()
        # If trade just became confirmed, apply to position
        if trade.trade_status == 'confirmed' and old_status != 'confirmed':
            _apply_trade_to_position(trade)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """POST /api/bbg/trades/{id}/confirm/ — confirm trade and apply to position."""
        trade = self.get_object()
        if trade.trade_status == 'confirmed':
            return Response({'detail': 'Trade already confirmed.'}, status=status.HTTP_400_BAD_REQUEST)
        trade.trade_status = 'confirmed'
        trade.save(update_fields=['trade_status', 'updated_at'])
        _apply_trade_to_position(trade)
        return Response(TradeSerializer(trade).data)

    @action(detail=False, methods=['get'])
    def portfolios(self, request):
        """GET /api/bbg/trades/portfolios/ — distinct portfolio values for dropdown."""
        values = Trade.objects.exclude(portfolio='').values_list(
            'portfolio', flat=True
        ).distinct().order_by('portfolio')
        return Response(list(values))

    @action(detail=False, methods=['post'])
    def roll_positions(self, request):
        """POST /api/bbg/trades/roll_positions/ — Roll yesterday's positions to today.
        Called once per day (can be automated or triggered manually).
        Copies the latest position snapshot to today's date, then applies
        all confirmed trades for today."""
        today = date.today()
        # Find the most recent position date
        latest_date = PositionSnapshot.objects.order_by('-date').values_list('date', flat=True).first()
        if not latest_date:
            return Response({'detail': 'No positions exist yet.'}, status=status.HTTP_400_BAD_REQUEST)
        if latest_date >= today:
            return Response({'detail': f'Positions already exist for {today}.'}, status=status.HTTP_400_BAD_REQUEST)

        # Copy all positions from latest_date to today
        latest_positions = PositionSnapshot.objects.filter(date=latest_date)
        created = 0
        for pos in latest_positions:
            PositionSnapshot.objects.update_or_create(
                date=today,
                fund=pos.fund,
                asset_ticker=pos.asset_ticker,
                portfolio=pos.portfolio,
                defaults={
                    'asset_group': pos.asset_group,
                    'broker': pos.broker,
                    'asset_market': pos.asset_market,
                    'asset': pos.asset,
                    'is_leveraged': pos.is_leveraged,
                    'units_open': pos.units_close,  # yesterday's close = today's open
                    'units_close': pos.units_close,  # same until trades modify it
                    'units_transaction': 0,
                    'units_lending': pos.units_lending,
                    'units_margin': pos.units_margin,
                    'currency': pos.currency,
                    'avg_cost': pos.avg_cost,
                    'price_open': pos.price_close,  # yesterday's close = today's open
                    'price_close': None,  # not known yet
                    'contract_size': pos.contract_size,
                    'amount_open': pos.amount_close,
                    'amount_close': None,
                    'amount_transaction': 0,
                    'pnl_open_position': 0,
                    'pnl_transaction': 0,
                    'pnl_transaction_fee': 0,
                    'pnl_dividend': 0,
                    'pnl_lending': 0,
                    'pnl_total': 0,
                }
            )
            created += 1

        # Now apply all confirmed trades for today
        todays_trades = Trade.objects.filter(trade_date=today, trade_status='confirmed')
        applied = 0
        for trade in todays_trades:
            _apply_trade_to_position(trade)
            applied += 1

        return Response({
            'rolled_from': str(latest_date),
            'rolled_to': str(today),
            'positions_rolled': created,
            'trades_applied': applied,
        })


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

    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        """GET /api/bbg/asset-requests/pending_count/ -- count of pending requests."""
        count = AssetRegistrationRequest.objects.filter(
            status__in=['pending', 'in_progress']
        ).count()
        return Response({'count': count})

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

    @action(detail=False, methods=['post'])
    def bulk_upload(self, request):
        """POST /api/bbg/positions/bulk_upload/
        Upload position snapshots from external source (e.g., Bloomberg_upload.xlsm).
        Body: [{ "date": "2026-03-25", "fund": "...", "portfolio": "...", ... }, ...]
        Uses update_or_create keyed on (date, fund, asset_ticker, portfolio).
        """
        rows = request.data
        if not isinstance(rows, list):
            return Response({'error': 'Expected a list of position objects'}, status=400)

        # Build asset lookup: code_bbg -> BloombergAsset
        asset_lookup = {}
        for a in BloombergAsset.objects.filter(is_active=True):
            asset_lookup[a.code_bbg] = a

        created = 0
        updated = 0
        errors = []

        for row in rows:
            try:
                ticker = row.get('asset_ticker', '')
                key = {
                    'date': row['date'],
                    'fund': row['fund'],
                    'asset_ticker': ticker,
                    'portfolio': row.get('portfolio', ''),
                }
                defaults = {
                    'asset_group': row.get('asset_group', ''),
                    'broker': row.get('broker', ''),
                    'asset_market': row.get('asset_market', ''),
                    'asset': asset_lookup.get(ticker),
                    'is_leveraged': row.get('is_leveraged', False),
                    'units_open': row.get('units_open', 0),
                    'units_close': row.get('units_close', 0),
                    'units_transaction': row.get('units_transaction', 0),
                    'units_lending': row.get('units_lending', 0),
                    'units_margin': row.get('units_margin', 0),
                    'currency': row.get('currency', 'USD'),
                    'avg_cost': row.get('avg_cost'),
                    'price_open': row.get('price_open'),
                    'price_close': row.get('price_close'),
                    'price_open_source': row.get('price_open_source', ''),
                    'price_close_source': row.get('price_close_source', ''),
                    'price_open_date': row.get('price_open_date') or None,
                    'price_close_date': row.get('price_close_date') or None,
                    'price_open_official': row.get('price_open_official', True),
                    'price_close_official': row.get('price_close_official', True),
                    'delta_open': row.get('delta_open'),
                    'delta_close': row.get('delta_close'),
                    'underlying_price_open': row.get('underlying_price_open'),
                    'underlying_price_close': row.get('underlying_price_close'),
                    'contract_size': row.get('contract_size', 1),
                    'avg_price_transaction': row.get('avg_price_transaction'),
                    'amount_open': row.get('amount_open'),
                    'amount_close': row.get('amount_close'),
                    'amount_transaction': row.get('amount_transaction'),
                    'pnl_open_position': row.get('pnl_open_position'),
                    'pnl_transaction': row.get('pnl_transaction'),
                    'pnl_transaction_fee': row.get('pnl_transaction_fee'),
                    'pnl_dividend': row.get('pnl_dividend'),
                    'pnl_lending': row.get('pnl_lending'),
                    'pnl_total': row.get('pnl_total'),
                }
                obj, was_created = PositionSnapshot.objects.update_or_create(
                    **key, defaults=defaults
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                errors.append(f"{row.get('asset_ticker', '?')}: {str(e)}")

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors[:20],
        })

    @action(detail=False, methods=['post'])
    def update_prices(self, request):
        """POST /api/bbg/positions/update_prices/
        Updates position prices from BloombergDataPoint and recalculates P&L.
        Body: { "date": "2026-03-25" }
        """
        target_date = request.data.get('date', str(date.today()))

        positions = PositionSnapshot.objects.filter(date=target_date).select_related('asset')
        if not positions.exists():
            return Response({'date': target_date, 'updated': 0, 'skipped': 0,
                             'error': 'No positions found for this date'})

        # Pre-fetch PxClose prices for all assets on this date
        px_field = BloombergField.objects.filter(name='PxClose').first()
        idx_field = BloombergField.objects.filter(name='IndexPxClose1D').first()

        price_map = {}  # asset_id -> (value, date)
        if px_field:
            for dp in BloombergDataPoint.objects.filter(field=px_field, date=target_date):
                price_map[dp.asset_id] = (dp.value, dp.date)
        if idx_field:
            for dp in BloombergDataPoint.objects.filter(field=idx_field, date=target_date):
                if dp.asset_id not in price_map:
                    price_map[dp.asset_id] = (dp.value, dp.date)

        updated = 0
        skipped = 0

        for pos in positions:
            if not pos.asset_id:
                skipped += 1
                continue

            price_info = price_map.get(pos.asset_id)

            # Fallback: most recent price before target_date
            if not price_info:
                fallback_fields = [f for f in [px_field, idx_field] if f]
                latest_dp = BloombergDataPoint.objects.filter(
                    asset_id=pos.asset_id,
                    field__in=fallback_fields,
                    date__lte=target_date,
                    value__isnull=False,
                ).order_by('-date').first()
                if latest_dp:
                    price_info = (latest_dp.value, latest_dp.date)

            if not price_info or price_info[0] is None:
                skipped += 1
                continue

            price_val, price_dt = price_info
            pos.price_close = price_val
            pos.price_close_source = 'BLOOMBERG'
            pos.price_close_date = price_dt

            contract = pos.contract_size or 1
            units = pos.units_close or 0
            avg_cost = pos.avg_cost or 0

            pos.amount_close = units * price_val * contract
            pos.pnl_open_position = (price_val - avg_cost) * units * contract
            pos.pnl_total = (
                (pos.pnl_open_position or 0) +
                (pos.pnl_transaction or 0) +
                (pos.pnl_transaction_fee or 0) +
                (pos.pnl_dividend or 0) +
                (pos.pnl_lending or 0)
            )
            pos.save()
            updated += 1

        return Response({'date': target_date, 'updated': updated, 'skipped': skipped})


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

class FieldUpdateFrequenciesView(APIView):
    """POST /api/bbg/fields/update_frequencies/ — Bulk update field frequencies."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updates = request.data.get('updates', [])
        if not updates:
            return Response({'error': 'updates list is required'}, status=status.HTTP_400_BAD_REQUEST)

        count = 0
        for item in updates:
            field_id = item.get('field_id')
            frequency = item.get('frequency')
            if not field_id or frequency is None:
                continue
            defaults = {'frequency': frequency}
            if 'is_critical' in item:
                defaults['is_critical'] = item['is_critical']
            updated = BloombergField.objects.filter(pk=field_id).update(**defaults)
            count += updated

        return Response({'updated': count})


class FieldGroupTrimView(APIView):
    """POST /api/bbg/field-groups/trim/ — Delete field groups not in keep list.

    Body: { "asset_group": "Stock", "keep_field_names": ["PxClose", "NetChg", ...] }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        asset_group = request.data.get('asset_group')
        keep_names = request.data.get('keep_field_names', [])
        if not asset_group or not keep_names:
            return Response(
                {'error': 'asset_group and keep_field_names are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_delete = BloombergFieldGroup.objects.filter(
            asset_group=asset_group,
        ).exclude(
            field__name__in=keep_names,
        )
        count = to_delete.count()
        to_delete.delete()

        remaining = BloombergFieldGroup.objects.filter(asset_group=asset_group).count()
        return Response({
            'deleted': count,
            'remaining': remaining,
            'asset_group': asset_group,
        })


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
