from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from finance.models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, ValuationModel
from .serializers import StockSerializer, InvestmentThesisSerializer, Estimate5YSerializer, PortfolioItemSerializer
from finance.services import update_stock_price

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
        from django.contrib.auth.models import User
        # Use first user for now, as auth is not yet implemented
        user = User.objects.first()
        if not user:
            user = User.objects.create_user(username='analyst1', password='password')

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

class PortfolioItemViewSet(viewsets.ModelViewSet):
    queryset = PortfolioItem.objects.all().order_by('-added_at')
    serializer_class = PortfolioItemSerializer

    def create(self, request, *args, **kwargs):
        ticker = request.data.get('ticker')
        quantity = request.data.get('quantity')
        average_cost = request.data.get('average_cost')

        if not all([ticker, quantity, average_cost]):
            return Response({"error": "Ticker, quantity, and average_cost are required"}, 
                            status=status.HTTP_400_BAD_REQUEST)

        # Ensure stock exists and has latest data
        stock = update_stock_price(ticker)
        if not stock:
             return Response({"error": f"Could not find or fetch data for {ticker}"}, 
                            status=status.HTTP_400_BAD_REQUEST)

        # Create or update portfolio item
        portfolio_item, created = PortfolioItem.objects.update_or_create(
            stock=stock,
            defaults={
                'quantity': float(quantity),
                'average_cost': float(average_cost)
            }
        )

        serializer = self.get_serializer(portfolio_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
