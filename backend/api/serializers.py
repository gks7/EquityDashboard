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

from finance.models import MoatScore, MoatRanking, HistCashTransaction, HistIndexPrice, AssetPositionHistOfficial, NAVPosition


class NAVPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NAVPosition
        fields = '__all__'


class HistCashTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistCashTransaction
        fields = '__all__'


class HistIndexPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistIndexPrice
        fields = '__all__'


class AssetPositionHistOfficialSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetPositionHistOfficial
        fields = '__all__'


class MoatScoreSerializer(serializers.ModelSerializer):
    analyst_name = serializers.CharField(source='analyst.username', read_only=True)
    total_score = serializers.ReadOnlyField()

    class Meta:
        model = MoatScore
        fields = '__all__'

class MoatRankingSerializer(serializers.ModelSerializer):
    analyst_name = serializers.CharField(source='analyst.username', read_only=True)

    class Meta:
        model = MoatRanking
        fields = '__all__'


# ── CRM Serializers ──────────────────────────────────────────────────────────

from api.models import CRMContact, CRMMeeting


class CRMContactSerializer(serializers.ModelSerializer):
    last_meeting = serializers.SerializerMethodField()
    next_meeting = serializers.SerializerMethodField()

    class Meta:
        model = CRMContact
        fields = [
            'id', 'name', 'role', 'company', 'contact_type', 'stage',
            'temperature', 'value', 'health', 'created_at', 'updated_at',
            'last_meeting', 'next_meeting',
        ]

    def get_last_meeting(self, obj):
        from datetime import date
        meeting = obj.meetings.filter(date__lte=date.today()).order_by('-date', '-time').first()
        return meeting.date.isoformat() if meeting else None

    def get_next_meeting(self, obj):
        from datetime import date
        meeting = obj.meetings.filter(date__gt=date.today()).order_by('date', 'time').first()
        return meeting.date.isoformat() if meeting else None


class CRMMeetingSerializer(serializers.ModelSerializer):
    attendee_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=CRMContact.objects.all(),
        source='attendees', write_only=True, required=False,
    )
    attendees_detail = CRMContactSerializer(source='attendees', many=True, read_only=True)

    class Meta:
        model = CRMMeeting
        fields = [
            'id', 'title', 'description', 'date', 'time', 'meeting_type',
            'attendee_ids', 'attendees_detail', 'created_at', 'updated_at',
        ]

    def create(self, validated_data):
        attendees = validated_data.pop('attendees', [])
        meeting = CRMMeeting.objects.create(**validated_data)
        meeting.attendees.set(attendees)
        return meeting

    def update(self, instance, validated_data):
        attendees = validated_data.pop('attendees', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if attendees is not None:
            instance.attendees.set(attendees)
        return instance
