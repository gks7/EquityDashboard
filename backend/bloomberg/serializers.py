from rest_framework import serializers
from bloomberg.models import (
    BloombergAsset, BloombergField, BloombergFieldGroup,
    BloombergAssetException, BloombergDataPoint, BloombergFetchLog,
    BloombergApiQuota, Trade, InternalNAV, AssetRiskProxy,
    AssetRegistrationRequest, PositionSnapshot,
)


# --- Config serializers (used by BBG Agent) ---

class BloombergFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloombergField
        fields = '__all__'


class BloombergAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = BloombergAsset
        fields = '__all__'


class BloombergFieldGroupSerializer(serializers.ModelSerializer):
    field = BloombergFieldSerializer(read_only=True)

    class Meta:
        model = BloombergFieldGroup
        fields = '__all__'


class BloombergAssetExceptionSerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source='asset.code_bbg', read_only=True)
    proxy_asset_code = serializers.CharField(source='proxy_asset.code_bbg', read_only=True,
                                             default=None)
    field_name = serializers.CharField(source='field.name', read_only=True)
    proxy_field_bbg = serializers.CharField(source='proxy_field.bbg_fld', read_only=True,
                                            default=None)

    class Meta:
        model = BloombergAssetException
        fields = '__all__'


class AgentConfigSerializer(serializers.Serializer):
    """Full configuration payload for the BBG Agent."""
    assets = BloombergAssetSerializer(many=True)
    fields = BloombergFieldSerializer(many=True)
    field_groups = BloombergFieldGroupSerializer(many=True)
    exceptions = BloombergAssetExceptionSerializer(many=True)


# --- Data upload serializers (used by BBG Agent) ---

class DataPointBulkItemSerializer(serializers.Serializer):
    code_bbg = serializers.CharField()
    field_name = serializers.CharField()
    date = serializers.DateField()
    date_ref = serializers.CharField(required=False, default='')
    value = serializers.FloatField(required=False, allow_null=True)
    value_str = serializers.CharField(required=False, default='')


class FetchLogCreateSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(write_only=True)

    class Meta:
        model = BloombergFetchLog
        fields = ['asset_group', 'field_name', 'date_requested', 'status',
                  'assets_requested', 'assets_succeeded', 'assets_failed',
                  'error_message', 'failed_assets', 'api_calls_used',
                  'terminal_used', 'started_at', 'completed_at']

    def create(self, validated_data):
        field_name = validated_data.pop('field_name')
        field = BloombergField.objects.get(name=field_name)
        return BloombergFetchLog.objects.create(field=field, **validated_data)


class QuotaIncrementSerializer(serializers.Serializer):
    date = serializers.DateField()
    calls_ref = serializers.IntegerField(default=0)
    calls_bdh = serializers.IntegerField(default=0)


# --- Data read serializers (used by frontend) ---

class BloombergDataPointSerializer(serializers.ModelSerializer):
    code_bbg = serializers.CharField(source='asset.code_bbg', read_only=True)
    field_name = serializers.CharField(source='field.name', read_only=True)

    class Meta:
        model = BloombergDataPoint
        fields = ['id', 'code_bbg', 'field_name', 'date', 'date_ref',
                  'value', 'value_str', 'fetched_at']


class BloombergFetchLogSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source='field.name', read_only=True)

    class Meta:
        model = BloombergFetchLog
        fields = '__all__'


class BloombergApiQuotaSerializer(serializers.ModelSerializer):
    usage_pct = serializers.FloatField(read_only=True)

    class Meta:
        model = BloombergApiQuota
        fields = '__all__'


# --- Trade serializers ---

class TradeSerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source='asset.code_bbg', read_only=True, default='')
    asset_name = serializers.CharField(source='asset.name', read_only=True, default='')
    entered_by_name = serializers.CharField(source='entered_by.username', read_only=True,
                                            default=None)
    notional = serializers.FloatField(read_only=True)
    weekday = serializers.CharField(read_only=True)
    display_ticker = serializers.CharField(read_only=True)

    class Meta:
        model = Trade
        fields = ['id', 'fund', 'asset', 'asset_code', 'asset_name', 'asset_ticker_raw',
                  'side', 'quantity', 'price', 'clean_price', 'currency',
                  'trade_date', 'scheduled_date', 'settlement_date',
                  'portfolio', 'broker', 'trader',
                  'fee_per_unit', 'fee_total', 'amount', 'cash_amount',
                  'trade_status', 'cmd', 'notes',
                  'entered_by', 'entered_by_name', 'notional', 'weekday', 'display_ticker',
                  'created_at', 'updated_at']
        read_only_fields = ['entered_by', 'created_at', 'updated_at']


# --- Asset Register serializers ---

class AssetRiskProxySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetRiskProxy
        fields = '__all__'


class BloombergAssetFullSerializer(serializers.ModelSerializer):
    """Full serializer for Asset Register form with nested risk proxies."""
    risk_proxies = AssetRiskProxySerializer(many=True, read_only=True)

    class Meta:
        model = BloombergAsset
        fields = '__all__'


class AssetRegistrationRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.username', read_only=True,
                                              default=None)
    completed_by_name = serializers.CharField(source='completed_by.username', read_only=True,
                                              default=None)
    asset_code_bbg = serializers.CharField(source='asset.code_bbg', read_only=True, default=None)
    trade_display = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistrationRequest
        fields = '__all__'
        read_only_fields = ['requested_by', 'completed_by', 'completed_at', 'created_at', 'updated_at']

    def get_trade_display(self, obj):
        if obj.requested_from_trade:
            t = obj.requested_from_trade
            return f"{t.side.upper()} {t.quantity} {t.asset_ticker_raw} @ {t.price}"
        return None


# --- Position Snapshot serializers ---

class PositionSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PositionSnapshot
        fields = '__all__'


# --- Internal NAV serializers ---

class InternalNAVSerializer(serializers.ModelSerializer):
    class Meta:
        model = InternalNAV
        fields = '__all__'
