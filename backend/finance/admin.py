from django.contrib import admin
from .models import (Stock, InvestmentThesis, Estimate5Y, PortfolioItem, FundConfig, DailyCash, ManualFundFlow,
                     AssetAlias, BankTransaction, ManualLedgerEntry, AdminNAVReport, PerformanceRun)

admin.site.register(Stock)
admin.site.register(InvestmentThesis)
admin.site.register(Estimate5Y)
admin.site.register(PortfolioItem)
admin.site.register(FundConfig)
admin.site.register(DailyCash)
admin.site.register(ManualFundFlow)


@admin.register(AssetAlias)
class AssetAliasAdmin(admin.ModelAdmin):
    list_display = ('asset_id', 'name', 'asset_class', 'sub_class', 'sector', 'isin', 'tickers')
    search_fields = ('asset_id', 'name', 'isin', 'tickers')
    list_filter = ('asset_class', 'sub_class')


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('trade_date', 'type', 'type_override', 'asset_id', 'units', 'amount', 'counterparty', 'txn_no')
    list_filter = ('type', 'type_override', 'account')
    search_fields = ('desc1', 'desc2', 'desc3', 'asset_id', 'txn_no')
    list_editable = ('type_override', 'asset_id')
    date_hierarchy = 'trade_date'


@admin.register(ManualLedgerEntry)
class ManualLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('trade_date', 'type', 'asset_id', 'units', 'amount', 'note')


@admin.register(AdminNAVReport)
class AdminNAVReportAdmin(admin.ModelAdmin):
    list_display = ('date', 'lead_cota', 'nav_closing', 'total_shares', 'subscriptions', 'file_name')


@admin.register(PerformanceRun)
class PerformanceRunAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'ok', 'duration_s')
    readonly_fields = ('payload', 'error')
