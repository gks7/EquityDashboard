from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from finance.models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, ValuationModel, PortfolioSnapshot
from .serializers import StockSerializer, InvestmentThesisSerializer, Estimate5YSerializer, PortfolioItemSerializer, PortfolioSnapshotSerializer
from finance.services import update_stock_price
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

        thesis_data = {
            'summary': request.data.get('thesis', ''),
            'bull_case': request.data.get('thesis', ''), # Using same for now
            'bear_case': '',
            'conviction': int(request.data.get('conviction', 3))
        }

        thesis, _ = InvestmentThesis.objects.update_or_create(
            stock=stock, analyst=user,
            defaults=thesis_data
        )

        Estimate5Y.objects.update_or_create(
            thesis=thesis,
            defaults={
                'target_pe_multiple': float(request.data.get('pe_multiple', 0)),
                'target_eps': float(request.data.get('eps', 0)),
                'accumulated_dividends_5y': float(request.data.get('dividends', 0))
            }
        )

        return Response({"message": "Thesis and estimates saved successfully"}, status=status.HTTP_200_OK)

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
                df = pd.read_excel(file)
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
                    clean_ticker = raw_ticker.split(' ')[0]
                    ticker = clean_ticker
                    stock, _ = Stock.objects.get_or_create(ticker=clean_ticker, defaults={'company_name': clean_ticker})
                    update_stock_price(clean_ticker)

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

from finance.models import MoatScore, MoatRanking
from .serializers import MoatScoreSerializer, MoatRankingSerializer
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
