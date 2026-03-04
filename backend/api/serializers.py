from rest_framework import serializers
from finance.models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, ValuationModel, PortfolioSnapshot
from django.contrib.auth.models import User

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name']

class Estimate5YSerializer(serializers.ModelSerializer):
    target_price = serializers.ReadOnlyField()
    implied_total_value = serializers.ReadOnlyField()
    implied_5y_return_pct = serializers.ReadOnlyField()
    implied_irr = serializers.ReadOnlyField()

    class Meta:
        model = Estimate5Y
        fields = '__all__'

class InvestmentThesisSerializer(serializers.ModelSerializer):
    analyst = UserSerializer(read_only=True)
    analyst_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='analyst', write_only=True
    )
    estimates_5y = Estimate5YSerializer(read_only=True)

    class Meta:
        model = InvestmentThesis
        fields = '__all__'

class ValuationModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValuationModel
        fields = ['model_data', 'updated_at']


class StockSerializer(serializers.ModelSerializer):
    theses = InvestmentThesisSerializer(many=True, read_only=True)
    valuation_model = ValuationModelSerializer(read_only=True)
    consensus_target_pe = serializers.ReadOnlyField()
    consensus_target_eps = serializers.ReadOnlyField()
    consensus_yield = serializers.ReadOnlyField()
    
    class Meta:
        model = Stock
        fields = '__all__'

class PortfolioSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioSnapshot
        fields = '__all__'

class PortfolioItemSerializer(serializers.ModelSerializer):
    stock_details = StockSerializer(source='stock', read_only=True)
    stock_id = serializers.PrimaryKeyRelatedField(
        queryset=Stock.objects.all(), source='stock', write_only=True, required=False, allow_null=True
    )
    total_cost = serializers.ReadOnlyField()
    current_value = serializers.ReadOnlyField()
    unrealized_pl = serializers.ReadOnlyField()
    unrealized_pl_pct = serializers.ReadOnlyField()

    class Meta:
        model = PortfolioItem
        fields = '__all__'
