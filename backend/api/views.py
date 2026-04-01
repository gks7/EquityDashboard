from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from finance.models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, ValuationModel, PortfolioSnapshot, HistCashTransaction, HistIndexPrice, AssetPositionHistOfficial, NAVPosition, ThesisEditHistory
from .serializers import StockSerializer, InvestmentThesisSerializer, Estimate5YSerializer, PortfolioItemSerializer, PortfolioSnapshotSerializer
from finance.services import update_stock_price, bloomberg_to_yfinance
import pandas as pd
from datetime import datetime


class MeView(APIView):
    """Return the authenticated user's profile info."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'is_staff': user.is_staff,
        })

class StockViewSet(viewsets.ModelViewSet):
    queryset = Stock.objects.all()
    serializer_class = StockSerializer
    lookup_field = 'ticker'
    lookup_value_regex = '[^/]+'
    
    @action(detail=False, methods=['post'], url_path='add_ticker')
    def add_ticker(self, request):
        """Allows front end to easily add a ticker and immediately fetch its data"""
        ticker = request.data.get('ticker')
        if not ticker:
            return Response({"error": "Ticker is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        stock = update_stock_price(ticker)
        if stock:
            serializer = self.get_serializer(stock)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response({"error": "Failed to fetch stock from Yahoo Finance"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='save_thesis', lookup_field='ticker')
    def save_thesis(self, request, ticker=None):
        stock = self.get_object()
        user = request.user

        summary = request.data.get('thesis', '')
        conviction_val = int(request.data.get('conviction', 3))
        pe_multiple = float(request.data.get('pe_multiple', 0))
        eps_val = float(request.data.get('eps', 0))
        dividends_val = float(request.data.get('dividends', 0))

        thesis_data = {
            'summary': summary,
            'bull_case': summary,
            'bear_case': '',
            'conviction': conviction_val,
            'analyst': user,
        }

        # Use a single shared thesis per stock (get or create the first one)
        thesis = InvestmentThesis.objects.filter(stock=stock).first()
        if thesis:
            thesis.summary = summary
            thesis.bull_case = summary
            thesis.conviction = conviction_val
            thesis.analyst = user  # Track who last edited
            thesis.save()
        else:
            thesis = InvestmentThesis.objects.create(stock=stock, **thesis_data)

        Estimate5Y.objects.update_or_create(
            thesis=thesis,
            defaults={
                'target_pe_multiple': pe_multiple,
                'target_eps': eps_val,
                'accumulated_dividends_5y': dividends_val
            }
        )

        # Log edit history
        ThesisEditHistory.objects.create(
            stock=stock,
            edited_by=user,
            summary=summary,
            conviction=conviction_val,
            target_pe_multiple=pe_multiple,
            target_eps=eps_val,
            accumulated_dividends_5y=dividends_val,
        )

        return Response({"message": "Thesis and estimates saved successfully"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='thesis_history', lookup_field='ticker')
    def thesis_history(self, request, ticker=None):
        """GET /api/stocks/{ticker}/thesis_history/ — Return edit history for this stock's thesis."""
        stock = self.get_object()
        history = ThesisEditHistory.objects.filter(stock=stock).select_related('edited_by')[:50]
        data = [
            {
                'id': h.id,
                'edited_by': {
                    'id': h.edited_by.id,
                    'username': h.edited_by.username,
                    'first_name': h.edited_by.first_name,
                    'last_name': h.edited_by.last_name,
                },
                'edited_at': h.edited_at.isoformat(),
                'summary': h.summary,
                'conviction': h.conviction,
                'target_pe_multiple': h.target_pe_multiple,
                'target_eps': h.target_eps,
                'accumulated_dividends_5y': h.accumulated_dividends_5y,
            }
            for h in history
        ]
        return Response(data)

    @action(detail=True, methods=['get'], url_path='get_model', lookup_field='ticker')
    def get_model(self, request, ticker=None):
        """Return the saved SOTP model state for this stock."""
        stock = self.get_object()
        try:
            model = stock.valuation_model
            return Response({'model_data': model.model_data, 'updated_at': model.updated_at})
        except ValuationModel.DoesNotExist:
            return Response({'model_data': None}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='save_model', lookup_field='ticker')
    def save_model(self, request, ticker=None):
        """Upsert the full SOTP model state for this stock."""
        stock = self.get_object()
        model_data = request.data.get('model_data')
        if model_data is None:
            return Response({'error': 'model_data is required'}, status=status.HTTP_400_BAD_REQUEST)
        ValuationModel.objects.update_or_create(
            stock=stock,
            defaults={'model_data': model_data}
        )
        return Response({'message': 'Model saved successfully'}, status=status.HTTP_200_OK)

class InvestmentThesisViewSet(viewsets.ModelViewSet):
    queryset = InvestmentThesis.objects.all()
    serializer_class = InvestmentThesisSerializer

class Estimate5YViewSet(viewsets.ModelViewSet):
    queryset = Estimate5Y.objects.all()
    serializer_class = Estimate5YSerializer

class PortfolioSnapshotViewSet(viewsets.ModelViewSet):
    queryset = PortfolioSnapshot.objects.all()
    serializer_class = PortfolioSnapshotSerializer

    @action(detail=False, methods=['post'], url_path='upload_excel', permission_classes=[AllowAny])
    def upload_excel(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            import traceback
            try:
                # Try reading the "Data" sheet first (where Bloomberg data lives)
                xl = pd.ExcelFile(file)
                sheet = "Data" if "Data" in xl.sheet_names else xl.sheet_names[0]
                df = xl.parse(sheet)
            except Exception as e:
                # Fallback: VBA might send it with a weird mimetype or encoding
                return Response({"error": f"Failed to read file as Excel. {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Remove any empty rows
            df = df.dropna(how='all')

            snapshot = PortfolioSnapshot.objects.create(date=datetime.now().date())
            
            # Carry over average costs
            prev_snapshot = PortfolioSnapshot.objects.exclude(id=snapshot.id).first()
            prev_items = {}
            if prev_snapshot:
                for item in prev_snapshot.items.all():
                    key = item.ticker or item.isin
                    if key:
                        prev_items[key] = item.average_cost
            
            items_to_create = []
            
            for index, row in df.iterrows():
                def get_val(col):
                    if col in df.columns and pd.notna(row[col]):
                        # If the value is a string, strip it. Ohterwise return as string
                        return str(row[col]).strip() if isinstance(row[col], str) else str(row[col])
                    return None

                def get_float(col):
                    if col in df.columns and pd.notna(row[col]):
                        try:
                            val = str(row[col]).strip().upper()
                            if val in ['#N/A', '#N/A N/A', '-', '']:
                                return 0.0
                            val = val.replace('%', '').replace(',', '')
                            return float(val)
                        except:
                            return 0.0
                    return 0.0

                raw_ticker = get_val('Ticker') 
                isin = get_val('ISIN')
                asset_type = get_val('Type')
                specific_type = get_val('Specific type')
                currency = get_val('Currency')
                
                quantity = get_float('Quantity')
                if quantity == 0 and not raw_ticker and not isin:
                    continue # only skip if it's completely blank
                    
                price = get_float('PX_LAST') or get_float('PX_dirty_MID')
                cross_usd = get_float('Cross USD') or 1.0
                market_value = get_float('Market Value')
                
                chg_pct_1d = get_float('CHG_PCT_1D')
                # If chg_pct represents percentage as 0.01 = 1%, convert string like "0.59%" 
                if chg_pct_1d and '%' not in str(row.get('CHG_PCT_1D', '')) and chg_pct_1d < 1:
                    chg_pct_1d = chg_pct_1d * 100 # converting decimal to percent format for display
                
                pnl_1d = get_float('1 day PnL')
                pe_next_12_months = get_float('BEST_EST_PE_4QTRS') or get_float('P/E Next 12 Quarters')
                yield_to_worst = get_float('INDEX_YIELD_TO_WORST') or get_float('YIELD_TO_WORST') 
                duration = get_float('DUR_ADJ_OAS_MID') or get_float('Duration')
                rating = get_val('BB_COMPSTE_RATING_IG_HY_INDCTR')
                best_eps = get_float('BEST_EST_LONG_TERM_GROWTH')
                eps_lt_growth = get_float('BEST_EST_LONG_TERM_GROWTH')

                stock = None
                ticker = raw_ticker
                
                if asset_type == 'Equity' and raw_ticker:
                    yf_ticker = bloomberg_to_yfinance(raw_ticker)
                    ticker = yf_ticker
                    stock, _ = Stock.objects.get_or_create(ticker=yf_ticker, defaults={'company_name': yf_ticker})

                # Carried over average cost
                key = ticker or isin
                avg_cost = prev_items.get(key, price)

                item = PortfolioItem(
                    snapshot=snapshot,
                    stock=stock,
                    ticker=ticker,
                    isin=isin,
                    asset_type=asset_type,
                    specific_type=specific_type,
                    quantity=quantity,
                    average_cost=avg_cost,
                    price=price,
                    currency=currency,
                    cross_usd=cross_usd,
                    market_value=market_value,
                    chg_pct_1d=chg_pct_1d,
                    pnl_1d=pnl_1d,
                    pe_next_12_months=pe_next_12_months,
                    yield_to_worst=yield_to_worst,
                    duration=duration,
                    rating=rating if rating else None,
                    best_eps=best_eps if best_eps else None,
                    eps_lt_growth=eps_lt_growth if eps_lt_growth else None
                )
                items_to_create.append(item)
                
            PortfolioItem.objects.bulk_create(items_to_create)

            # Update stock prices in background (best-effort, don't block the response)
            equity_tickers = list({item.ticker for item in items_to_create if item.asset_type == 'Equity' and item.ticker})
            import threading
            def _update_prices(tickers):
                for t in tickers:
                    try:
                        update_stock_price(t)
                    except Exception:
                        pass
            threading.Thread(target=_update_prices, args=(equity_tickers,), daemon=True).start()

            return Response({
                "message": f"Portfolio uploaded successfully. {len(items_to_create)} items created.",
                "snapshot_id": snapshot.id,
                "columns_detected": df.columns.tolist(),
                "items_created": len(items_to_create)
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            error_details = traceback.format_exc()
            print("EXCEL UPLOAD ERROR:", error_details)
            return Response({"error": str(e), "traceback": error_details}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PortfolioItemViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        snapshot_id = self.request.query_params.get('snapshot_id')
        if snapshot_id:
            return PortfolioItem.objects.filter(snapshot_id=snapshot_id).order_by('-market_value')
        
        latest_snapshot = PortfolioSnapshot.objects.first()
        if latest_snapshot:
            return PortfolioItem.objects.filter(snapshot=latest_snapshot).order_by('-market_value')
            
        return PortfolioItem.objects.none()

    def create(self, request, *args, **kwargs):
        return Response({"error": "Manual creation is disabled; please upload a snapshot"}, status=status.HTTP_400_BAD_REQUEST)

from finance.models import MoatScore, MoatRanking, HistCashTransaction, HistIndexPrice, AssetPositionHistOfficial
from .serializers import MoatScoreSerializer, MoatRankingSerializer, HistCashTransactionSerializer, HistIndexPriceSerializer, AssetPositionHistOfficialSerializer
from django.contrib.auth.models import User

class MoatScoreViewSet(viewsets.ModelViewSet):
    queryset = MoatScore.objects.all()
    serializer_class = MoatScoreSerializer

    def get_queryset(self):
        queryset = MoatScore.objects.all()
        ticker = self.request.query_params.get('ticker', None)
        if ticker:
            queryset = queryset.filter(stock__ticker=ticker)
        return queryset

    @action(detail=False, methods=['post'], url_path='save_score')
    def save_score(self, request):
        ticker = request.data.get('ticker')
        analyst_name = request.data.get('analyst')
        scores = request.data.get('scores', {})

        if not ticker or not scores:
            return Response({'error': 'ticker and scores are required'}, status=status.HTTP_400_BAD_REQUEST)

        stock = Stock.objects.filter(ticker=ticker).first()
        if not stock:
            return Response({'error': 'Stock not found'}, status=status.HTTP_404_NOT_FOUND)

        analyst = request.user

        moat_score = MoatScore.objects.create(
            stock=stock,
            analyst=analyst,
            scale=scores.get('scale', 1),
            switch_costs=scores.get('switchCosts', 1),
            physical_assets=scores.get('physicalAssets', 1),
            ip=scores.get('ip', 1),
            network_effects=scores.get('networkEffects', 1)
        )

        serializer = self.get_serializer(moat_score)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class MoatRankingViewSet(viewsets.ModelViewSet):
    queryset = MoatRanking.objects.all()
    serializer_class = MoatRankingSerializer

    def get_queryset(self):
        queryset = MoatRanking.objects.all()
        analyst = self.request.query_params.get('analyst', None)
        if analyst:
            queryset = queryset.filter(analyst__username=analyst)
        return queryset

    @action(detail=False, methods=['post'], url_path='save_ranking')
    def save_ranking(self, request):
        analyst_name = request.data.get('analyst')
        rankings = request.data.get('rankings') # list of {ticker, rank}

        if not isinstance(rankings, list):
            return Response({'error': 'rankings array is required'}, status=status.HTTP_400_BAD_REQUEST)

        analyst = request.user

        # Clear old rankings for this analyst
        MoatRanking.objects.filter(analyst=analyst).delete()

        created_rankings = []
        for r in rankings:
            ticker = r.get('ticker')
            rank = r.get('rank')
            stock = Stock.objects.filter(ticker=ticker).first()
            if stock and rank:
                mr = MoatRanking(stock=stock, analyst=analyst, rank=rank)
                created_rankings.append(mr)

        MoatRanking.objects.bulk_create(created_rankings)
        return Response({'message': f'Saved {len(created_rankings)} rankings'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete'], url_path='clear_ranking')
    def clear_ranking(self, request):
        deleted, _ = MoatRanking.objects.filter(analyst=request.user).delete()
        return Response({'message': f'Cleared {deleted} rankings'}, status=status.HTTP_200_OK)


def _parse_date(val):
    """Try to parse a date value from various formats. Returns None on failure."""
    if not val or (isinstance(val, float) and val != val):  # NaN check
        return None
    import re
    s = str(val).strip()
    if not s or s in ('nan', 'None', ''):
        return None
    # Try common formats
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y%m%d'):
        try:
            from datetime import datetime
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def _safe_float(val):
    if val is None:
        return None
    try:
        s = str(val).strip()
        if s in ('', 'nan', 'None', '#N/A', '-'):
            return None
        return float(s.replace(',', ''))
    except (ValueError, AttributeError):
        return None


def _safe_bool(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ('true', '1', 'yes'):
        return True
    if s in ('false', '0', 'no'):
        return False
    return None


class HistCashTransactionViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        import traceback
        try:
            data = request.data.get('rows')
            if not data or not isinstance(data, list):
                return Response({'error': 'Expected {"rows": [...]}'}, status=status.HTTP_400_BAD_REQUEST)

            if request.query_params.get('append') != '1':
                HistCashTransaction.objects.all().delete()
            objs = []
            for row in data:
                objs.append(HistCashTransaction(
                    excel_id=row.get('ID'),
                    date=_parse_date(row.get('Date')),
                    settlement_date=_parse_date(row.get('SettlementDate')),
                    fund=row.get('Fund') or None,
                    cash_account=row.get('Cash Account') or None,
                    amount=_safe_float(row.get('Amount')),
                    type=row.get('Type') or None,
                    counterparty_account=row.get('Counterparty Account') or None,
                    is_manual=_safe_bool(row.get('IsManual')),
                    obs=row.get('Obs') or None,
                    cmd=row.get('CMD') or None,
                ))
            HistCashTransaction.objects.bulk_create(objs)
            return Response({'message': f'{len(objs)} cash transactions uploaded.'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HistIndexPriceViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        import traceback
        try:
            data = request.data.get('rows')
            if not data or not isinstance(data, list):
                return Response({'error': 'Expected {"rows": [...]}'}, status=status.HTTP_400_BAD_REQUEST)

            if request.query_params.get('append') != '1':
                HistIndexPrice.objects.all().delete()
            objs = []
            for row in data:
                objs.append(HistIndexPrice(
                    pk_asset_info_id=row.get('pk_AssetInfoID'),
                    date=_parse_date(row.get('Date')),
                    fund=row.get('Fund') or None,
                    asset=row.get('Asset') or None,
                    info=row.get('Info') or None,
                    st_value=row.get('st_Value') or None,
                    flt_value=_safe_float(row.get('flt_Value')),
                    bln_value=_safe_bool(row.get('bln_Value')),
                    dte_value=_parse_date(row.get('dte_Value')),
                    column1=row.get('Column1') or None,
                    column2=row.get('Column2') or None,
                ))
            HistIndexPrice.objects.bulk_create(objs)
            return Response({'message': f'{len(objs)} index prices uploaded.'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AssetPositionHistOfficialViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        import traceback
        try:
            data = request.data.get('rows')
            if not data or not isinstance(data, list):
                return Response({'error': 'Expected {"rows": [...]}'}, status=status.HTTP_400_BAD_REQUEST)

            if request.query_params.get('append') != '1':
                AssetPositionHistOfficial.objects.all().delete()
            objs = []
            for row in data:
                objs.append(AssetPositionHistOfficial(
                    date=_parse_date(row.get('Date')),
                    fund=row.get('Fund') or None,
                    portfolio=row.get('Portfolio') or None,
                    asset_group=row.get('AssetGroup') or None,
                    broker=row.get('Broker') or None,
                    asset_market=row.get('AssetMarket') or None,
                    asset=row.get('Asset') or None,
                    is_leveraged_product=_safe_bool(row.get('IsLeveragedProduct')),
                    units_open=_safe_float(row.get('UnitsOpen')),
                    units_close=_safe_float(row.get('UnitsClose')),
                    units_transaction=_safe_float(row.get('Units Transaction')),
                    units_lending=_safe_float(row.get('Units Lending')),
                    units_margin=_safe_float(row.get('Units Margin')),
                    currency=row.get('Currency') or None,
                    avg_cost=_safe_float(row.get('AvgCost')),
                    price_open=_safe_float(row.get('PriceOpen')),
                    price_close=_safe_float(row.get('PriceClose')),
                    price_open_source=row.get('PriceOpenSource') or None,
                    price_close_source=row.get('PriceCloseSource') or None,
                    price_open_date=_parse_date(row.get('PriceOpenDate')),
                    price_close_date=_parse_date(row.get('PriceCloseDate')),
                    price_opens_official=_safe_float(row.get('PriceOpensOfficial')),
                    price_closes_official=_safe_float(row.get('PriceCloselsOfficial')),
                    delta_open=_safe_float(row.get('DeltaOpen')),
                    delta_close=_safe_float(row.get('DeltaClose')),
                    underlying_price_open=_safe_float(row.get('UnderlyingPriceOpen')),
                    underlying_price_close=_safe_float(row.get('UnderlyingPriceClose')),
                    contract_size=_safe_float(row.get('ContractSize')),
                    avg_price_transaction=_safe_float(row.get('Avg PriceTransaction')),
                    amount_open=_safe_float(row.get('AmountOpen')),
                    amount_close=_safe_float(row.get('AmountClose')),
                    amount_transaction=_safe_float(row.get('AmountTransaction')),
                    pnl_open_position=_safe_float(row.get('Pnl OpenPosition')),
                    pnl_transaction=_safe_float(row.get('Pnl Transaction')),
                    pnl_transaction_fee=_safe_float(row.get('PnlTransactionFee')),
                    pnl_dividend=_safe_float(row.get('Pnl Dividend')),
                    pnl_lending=_safe_float(row.get('Pnl Lending')),
                    pnl_total=_safe_float(row.get('Pnl Total')),
                ))
            AssetPositionHistOfficial.objects.bulk_create(objs)
            return Response({'message': f'{len(objs)} asset positions uploaded.'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NAVPositionViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        import traceback
        try:
            data = request.data.get('rows')
            if not data or not isinstance(data, list):
                return Response({'error': 'Expected {"rows": [...]}'}, status=status.HTTP_400_BAD_REQUEST)

            if request.query_params.get('append') != '1':
                NAVPosition.objects.all().delete()

            objs = []
            for row in data:
                objs.append(NAVPosition(
                    fund=row.get('Fund') or None,
                    date=_parse_date(row.get('Date')),
                    nav=_safe_float(row.get('NAV')),
                    shares=_safe_float(row.get('Shares')),
                    nav_per_share=_safe_float(row.get('NAV/Shares')),
                    subscription_d0=_safe_float(row.get('Subscription D0')),
                    redemption_d0=_safe_float(row.get('Redemption D0')),
                    redemption_d1=_safe_float(row.get('Redemption D1')),
                ))
            NAVPosition.objects.bulk_create(objs)
            return Response({'message': f'{len(objs)} NAV positions uploaded.'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class IgfTrView(APIView):
    """
    GET /api/igf-tr/
    Returns all data needed for the IGF TR dashboard.
    Primary data source is NAVPosition; HistIndexPrice supplies benchmark comparison series.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        fund_filter = request.query_params.get('fund', None)

        nav_qs = NAVPosition.objects.order_by('date')
        ip_qs = HistIndexPrice.objects.filter(flt_value__isnull=False).order_by('date')

        if fund_filter:
            nav_qs = nav_qs.filter(fund__icontains=fund_filter)
            ip_qs = ip_qs.filter(fund__icontains=fund_filter)

        nav_positions = list(nav_qs.values(
            'date', 'fund', 'nav', 'shares', 'nav_per_share',
            'subscription_d0', 'redemption_d0', 'redemption_d1',
        ))
        for row in nav_positions:
            if row['date']:
                row['date'] = row['date'].isoformat()

        index_prices = list(ip_qs.values('date', 'fund', 'asset', 'info', 'flt_value'))
        for row in index_prices:
            if row['date']:
                row['date'] = row['date'].isoformat()

        available_funds = sorted(
            NAVPosition.objects.exclude(fund=None).values_list('fund', flat=True).distinct()
        )
        available_assets = sorted(
            HistIndexPrice.objects.exclude(asset=None).values_list('asset', flat=True).distinct()
        )
        available_infos = sorted(
            HistIndexPrice.objects.exclude(info=None).values_list('info', flat=True).distinct()
        )

        return Response({
            'nav_positions': nav_positions,
            'index_prices': index_prices,
            'available_funds': available_funds,
            'available_assets': available_assets,
            'available_infos': available_infos,
        })


class AssetBreakdownView(APIView):
    """
    GET /api/igf-tr/asset-breakdown/

    Groups finance_assetpositionhistofficial by (date, asset_market) and returns:
      - allocation_history : daily % of portfolio per asset_market
      - synthetic_cotas    : time-weighted return index (base=100) per asset_market
      - available_groups   : sorted list of distinct asset_market values

    "global bond" and "treasury" asset_market values are normalised to "Fixed Income".

    TWR per group:
        daily_return_t = pnl_total_t / amount_open_t
        index_t        = index_{t-1} * (1 + daily_return_t)
    """
    permission_classes = [AllowAny]

    # asset_market values that should be merged into "Fixed Income"
    FIXED_INCOME_MARKETS = {'global bond', 'treasury'}

    def _normalise_market(self, raw: str) -> str:
        if raw.lower() in self.FIXED_INCOME_MARKETS:
            return 'Fixed Income'
        return raw

    def get(self, request):
        from django.db.models import Sum

        fund_filter = request.query_params.get('fund', None)

        qs = AssetPositionHistOfficial.objects.filter(
            asset_market__isnull=False,
        ).exclude(asset_market='').order_by('date')

        if fund_filter:
            qs = qs.filter(fund__icontains=fund_filter)

        daily = (
            qs.values('date', 'asset_market')
            .annotate(
                amt_close=Sum('amount_close'),
                amt_open=Sum('amount_open'),
                pnl=Sum('pnl_total'),
            )
            .order_by('date', 'asset_market')
        )

        # Organise into {date: {market: {amt_close, amt_open, pnl}}}
        # Rows sharing the same normalised market are summed together.
        by_date: dict = {}
        for row in daily:
            d = row['date'].isoformat() if row['date'] else None
            if not d:
                continue
            market = self._normalise_market(row['asset_market'])
            bucket = by_date.setdefault(d, {}).setdefault(market, {
                'amt_close': 0.0,
                'amt_open':  0.0,
                'pnl':       0.0,
            })
            bucket['amt_close'] += row['amt_close'] or 0.0
            bucket['amt_open']  += row['amt_open']  or 0.0
            bucket['pnl']       += row['pnl']       or 0.0

        sorted_dates = sorted(by_date.keys())
        all_groups = sorted({g for d in by_date.values() for g in d})

        # ── 1. Allocation history (% of total amt_close) ───────────────────────
        allocation_history = []
        for date in sorted_dates:
            groups = by_date[date]
            total = sum(abs(v['amt_close']) for v in groups.values())
            entry: dict = {'date': date, 'total': round(sum(v['amt_close'] for v in groups.values()), 2)}
            for g in all_groups:
                val = groups.get(g, {}).get('amt_close', 0.0)
                entry[g] = round((abs(val) / total * 100) if total else 0.0, 2)
            allocation_history.append(entry)

        # ── 2. Synthetic TWR cota indices (base = 100) ────────────────────────
        cota_idx = {g: 100.0 for g in all_groups}
        synthetic_cotas = []
        for date in sorted_dates:
            groups = by_date[date]
            entry = {'date': date}
            for g in all_groups:
                if g in groups:
                    amt_open = groups[g]['amt_open']
                    pnl      = groups[g]['pnl']
                    if amt_open and abs(amt_open) > 1e-9:
                        daily_ret = pnl / amt_open
                        # Clamp extreme daily returns (likely data errors)
                        daily_ret = max(-0.5, min(0.5, daily_ret))
                        cota_idx[g] = round(cota_idx[g] * (1.0 + daily_ret), 4)
                entry[g] = cota_idx[g]
            synthetic_cotas.append(entry)

        return Response({
            'allocation_history': allocation_history,
            'synthetic_cotas':    synthetic_cotas,
            'available_groups':   all_groups,
        })


# ── Admin / tracking views ─────────────────────────────────────────────────────

ADMIN_EMAIL = 'gabriel@igfwm.com'


from rest_framework_simplejwt.views import TokenObtainPairView


class LoggingTokenObtainPairView(TokenObtainPairView):
    """JWT login endpoint that records a UserEvent on successful authentication."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            from .models import UserEvent
            username = request.data.get('username', '')
            try:
                user_obj = User.objects.get(username=username)
                ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR'))
                if ip:
                    ip = ip.split(',')[0].strip()
                UserEvent.objects.create(
                    user=user_obj,
                    action=UserEvent.ACTION_LOGIN,
                    page='',
                    ip_address=ip or None,
                )
            except User.DoesNotExist:
                pass
        return response


class TrackEventView(APIView):
    """POST /api/admin/track/ — record a page-view event for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import UserEvent
        page = request.data.get('page', '')
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR'))
        if ip:
            ip = ip.split(',')[0].strip()
        UserEvent.objects.create(
            user=request.user,
            action=UserEvent.ACTION_PAGE_VIEW,
            page=page,
            ip_address=ip or None,
        )
        return Response({'ok': True})


class AdminOverviewView(APIView):
    """GET /api/admin/overview/ — site-wide usage stats. Only for ADMIN_EMAIL."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.email != ADMIN_EMAIL:
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

        from .models import UserEvent
        from django.db.models import Count

        all_users = User.objects.all().order_by('username')

        user_data = []
        for u in all_users:
            events = list(
                UserEvent.objects.filter(user=u).order_by('-timestamp').values(
                    'action', 'page', 'timestamp', 'ip_address'
                )[:200]
            )
            login_count = sum(1 for e in events if e['action'] == 'login')
            pv_events = [e for e in events if e['action'] == 'page_view']
            last_event = events[0] if events else None

            # Page view counts
            page_counts: dict = {}
            for e in pv_events:
                pg = e['page'] or '/'
                page_counts[pg] = page_counts.get(pg, 0) + 1

            user_data.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': f'{u.first_name} {u.last_name}'.strip() or u.username,
                'is_active': u.is_active,
                'date_joined': u.date_joined.isoformat() if u.date_joined else None,
                'last_activity': last_event['timestamp'].isoformat() if last_event else None,
                'last_action': last_event['action'] if last_event else None,
                'last_page': last_event['page'] if last_event and last_event['action'] == 'page_view' else (
                    next((e['page'] for e in events if e['action'] == 'page_view'), None)
                ),
                'login_count': login_count,
                'page_view_count': len(pv_events),
                'page_counts': page_counts,
            })

        # Last 100 events across all users
        recent_activity = []
        for ev in UserEvent.objects.select_related('user').order_by('-timestamp')[:100]:
            recent_activity.append({
                'user': ev.user.username,
                'full_name': f'{ev.user.first_name} {ev.user.last_name}'.strip() or ev.user.username,
                'action': ev.action,
                'page': ev.page,
                'timestamp': ev.timestamp.isoformat(),
                'ip_address': ev.ip_address,
            })

        return Response({
            'users': user_data,
            'recent_activity': recent_activity,
        })


# ── CRM Views ────────────────────────────────────────────────────────────────

from api.models import CRMContact, CRMMeeting
from api.serializers import CRMContactSerializer, CRMMeetingSerializer


class CRMContactViewSet(viewsets.ModelViewSet):
    queryset = CRMContact.objects.all()
    serializer_class = CRMContactSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        contact_type = self.request.query_params.get('type')
        if contact_type in ('client', 'prospect'):
            qs = qs.filter(contact_type=contact_type)
        temperature = self.request.query_params.get('temperature')
        if temperature:
            qs = qs.filter(temperature=temperature)
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(company__icontains=search) |
                Q(role__icontains=search)
            )
        return qs


class CRMMeetingViewSet(viewsets.ModelViewSet):
    queryset = CRMMeeting.objects.all()
    serializer_class = CRMMeetingSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        meeting_type = self.request.query_params.get('type')
        if meeting_type in ('group', 'one-on-one', 'follow-up'):
            qs = qs.filter(meeting_type=meeting_type)
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search)
            )
        return qs
