import math

from rest_framework import serializers
from finance.models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, ValuationModel, PortfolioSnapshot
from django.contrib.auth.models import User


def json_safe(value):
    """Recursively replace NaN / Infinity floats with None.

    DRF's JSONRenderer uses ``allow_nan=False``, so a single non-finite float
    anywhere in the payload raises ``ValueError: Out of range float values are
    not JSON compliant`` and the whole list endpoint returns HTTP 500. Postgres
    stores those values without complaining, so bad rows can accumulate quietly.
    This keeps one poisoned record from taking the entire response down with it.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


class JsonSafeSerializerMixin:
    """Scrubs non-finite floats out of the serialized output."""

    def to_representation(self, instance):
        return json_safe(super().to_representation(instance))

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name']

class Estimate5YSerializer(JsonSafeSerializerMixin, serializers.ModelSerializer):
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


class StockSerializer(JsonSafeSerializerMixin, serializers.ModelSerializer):
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

class PortfolioItemSerializer(JsonSafeSerializerMixin, serializers.ModelSerializer):
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


# ── Investment committee serializers ─────────────────────────────────────────

from django.db import transaction

from api.models import CommitteeMeeting, CommitteeDecision, CommitteeActionItem


class CommitteeDecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommitteeDecision
        fields = [
            'id', 'asset', 'asset_class', 'action', 'target_weight_pct',
            'limit_price', 'rationale', 'owner', 'due_date', 'status', 'order',
        ]


class CommitteeActionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommitteeActionItem
        fields = ['id', 'task', 'owner', 'due_date', 'done', 'order']


class OpenDecisionSerializer(serializers.ModelSerializer):
    """A still-open decision, carrying enough of its meeting to be actionable."""
    meeting_id = serializers.IntegerField(source='meeting.id', read_only=True)
    meeting_date = serializers.DateField(source='meeting.date', read_only=True)

    class Meta:
        model = CommitteeDecision
        fields = [
            'id', 'meeting_id', 'meeting_date', 'asset', 'asset_class', 'action',
            'target_weight_pct', 'limit_price', 'owner', 'due_date', 'status',
        ]


class CommitteeMeetingSerializer(serializers.ModelSerializer):
    decisions = CommitteeDecisionSerializer(many=True, required=False)
    action_items = CommitteeActionItemSerializer(many=True, required=False)
    author_name = serializers.SerializerMethodField()
    pending_count = serializers.SerializerMethodField()

    class Meta:
        model = CommitteeMeeting
        fields = [
            'id', 'date', 'title', 'attendees', 'status', 'stance',
            'macro_view', 'portfolio_view', 'risks', 'notes', 'target_allocation',
            'author', 'author_name', 'decisions', 'action_items', 'pending_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['author']

    def get_author_name(self, obj):
        if not obj.author:
            return ''
        full = f"{obj.author.first_name} {obj.author.last_name}".strip()
        return full or obj.author.username

    def get_pending_count(self, obj):
        open_states = (CommitteeDecision.STATUS_PENDING, CommitteeDecision.STATUS_PARTIAL)
        return sum(1 for d in obj.decisions.all() if d.status in open_states)

    def validate_target_allocation(self, value):
        if value in (None, ''):
            return None
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object of sleeve -> weight.")
        for sleeve, weight in value.items():
            if weight in (None, ''):
                continue
            try:
                float(weight)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Weight for '{sleeve}' is not a number.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        decisions = validated_data.pop('decisions', [])
        action_items = validated_data.pop('action_items', [])
        meeting = CommitteeMeeting.objects.create(**validated_data)
        self._write_children(meeting, decisions, action_items)
        return meeting

    @transaction.atomic
    def update(self, instance, validated_data):
        decisions = validated_data.pop('decisions', None)
        action_items = validated_data.pop('action_items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        self._write_children(instance, decisions, action_items)
        return instance

    @staticmethod
    def _write_children(meeting, decisions, action_items):
        # The client always PUTs the complete lists, so children are replaced
        # wholesale — a row deleted in the UI has to disappear here too. Row order
        # is taken from the payload rather than trusted from the client.
        if decisions is not None:
            meeting.decisions.all().delete()
            CommitteeDecision.objects.bulk_create([
                CommitteeDecision(meeting=meeting, **{**d, 'order': i})
                for i, d in enumerate(decisions)
            ])
        if action_items is not None:
            meeting.action_items.all().delete()
            CommitteeActionItem.objects.bulk_create([
                CommitteeActionItem(meeting=meeting, **{**a, 'order': i})
                for i, a in enumerate(action_items)
            ])
