from django.contrib import admin
from bloomberg.models import (
    BloombergAsset, BloombergField, BloombergFieldGroup,
    BloombergAssetException, BloombergDataPoint, BloombergFetchLog,
    BloombergApiQuota, Trade, InternalNAV, AssetRiskProxy,
    AssetRegistrationRequest, PositionSnapshot,
)


@admin.register(BloombergAsset)
class BloombergAssetAdmin(admin.ModelAdmin):
    list_display = ('code_bbg', 'name', 'asset_group', 'is_vintage', 'is_active')
    list_filter = ('asset_group', 'is_vintage', 'is_active')
    search_fields = ('code_bbg', 'name')
    list_editable = ('is_vintage', 'is_active')


@admin.register(BloombergField)
class BloombergFieldAdmin(admin.ModelAdmin):
    list_display = ('name', 'bbg_fld', 'method', 'sph', 'frequency', 'is_critical', 'is_active')
    list_filter = ('method', 'sph', 'frequency', 'is_critical', 'is_active')
    search_fields = ('name', 'bbg_fld')
    list_editable = ('is_critical', 'is_active')


@admin.register(BloombergFieldGroup)
class BloombergFieldGroupAdmin(admin.ModelAdmin):
    list_display = ('asset_group', 'field', 'start_date')
    list_filter = ('asset_group',)
    autocomplete_fields = ('field',)


@admin.register(BloombergAssetException)
class BloombergAssetExceptionAdmin(admin.ModelAdmin):
    list_display = ('asset', 'field', 'fixed_value', 'proxy_asset')
    list_filter = ('field',)
    autocomplete_fields = ('asset', 'field', 'proxy_asset', 'proxy_field')


@admin.register(BloombergDataPoint)
class BloombergDataPointAdmin(admin.ModelAdmin):
    list_display = ('asset', 'field', 'date', 'value', 'value_str', 'fetched_at')
    list_filter = ('field', 'date')
    search_fields = ('asset__code_bbg',)
    date_hierarchy = 'date'
    readonly_fields = ('fetched_at',)


@admin.register(BloombergFetchLog)
class BloombergFetchLogAdmin(admin.ModelAdmin):
    list_display = ('asset_group', 'field', 'date_requested', 'status',
                    'assets_succeeded', 'assets_failed', 'api_calls_used', 'terminal_used')
    list_filter = ('status', 'terminal_used', 'asset_group')
    date_hierarchy = 'date_requested'
    readonly_fields = ('created_at',)


@admin.register(BloombergApiQuota)
class BloombergApiQuotaAdmin(admin.ModelAdmin):
    list_display = ('date', 'calls_ref', 'calls_bdh', 'calls_total', 'limit_daily', 'usage_pct')
    date_hierarchy = 'date'
    readonly_fields = ('created_at', 'updated_at')

    def usage_pct(self, obj):
        return f"{obj.usage_pct:.1f}%"
    usage_pct.short_description = "Usage %"


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('trade_date', 'fund', 'side', 'asset', 'asset_ticker_raw', 'quantity', 'price',
                    'portfolio', 'trade_status', 'currency', 'entered_by')
    list_filter = ('fund', 'side', 'currency', 'trade_status', 'portfolio')
    search_fields = ('asset__code_bbg', 'asset__name', 'asset_ticker_raw', 'notes')
    date_hierarchy = 'trade_date'
    autocomplete_fields = ('asset',)


@admin.register(AssetRiskProxy)
class AssetRiskProxyAdmin(admin.ModelAdmin):
    list_display = ('asset', 'proxy_type', 'ticker_proxy', 'weight_or_beta')
    list_filter = ('proxy_type',)
    search_fields = ('asset__code_bbg', 'ticker_proxy')
    autocomplete_fields = ('asset',)


@admin.register(AssetRegistrationRequest)
class AssetRegistrationRequestAdmin(admin.ModelAdmin):
    list_display = ('ticker_raw', 'status', 'requested_by', 'asset', 'completed_by', 'created_at')
    list_filter = ('status',)
    search_fields = ('ticker_raw',)
    autocomplete_fields = ('asset', 'requested_from_trade')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(PositionSnapshot)
class PositionSnapshotAdmin(admin.ModelAdmin):
    list_display = ('date', 'fund', 'portfolio', 'asset_ticker', 'units_close',
                    'price_close', 'amount_close', 'pnl_total', 'currency')
    list_filter = ('fund', 'portfolio', 'asset_group', 'date')
    search_fields = ('asset_ticker',)
    date_hierarchy = 'date'
    readonly_fields = ('created_at',)


@admin.register(InternalNAV)
class InternalNAVAdmin(admin.ModelAdmin):
    list_display = ('fund', 'date', 'total_nav', 'total_shares', 'nav_per_share', 'is_official')
    list_filter = ('fund', 'is_official')
    date_hierarchy = 'date'
