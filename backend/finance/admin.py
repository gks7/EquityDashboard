from django.contrib import admin
from .models import Stock, InvestmentThesis, Estimate5Y, PortfolioItem, FundConfig, DailyCash, ManualFundFlow

admin.site.register(Stock)
admin.site.register(InvestmentThesis)
admin.site.register(Estimate5Y)
admin.site.register(PortfolioItem)
admin.site.register(FundConfig)
admin.site.register(DailyCash)
admin.site.register(ManualFundFlow)
