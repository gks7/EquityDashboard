from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    StockViewSet, InvestmentThesisViewSet, Estimate5YViewSet,
    PortfolioItemViewSet, PortfolioSnapshotViewSet,
    MoatScoreViewSet, MoatRankingViewSet, MeView,
    HistCashTransactionViewSet, HistIndexPriceViewSet, AssetPositionHistOfficialViewSet,
)

router = DefaultRouter()
router.register(r'stocks', StockViewSet)
router.register(r'theses', InvestmentThesisViewSet)
router.register(r'estimates', Estimate5YViewSet)
router.register(r'portfolio', PortfolioItemViewSet, basename='portfolio')
router.register(r'snapshots', PortfolioSnapshotViewSet, basename='snapshots')
router.register(r'moats/scores', MoatScoreViewSet, basename='moat-scores')
router.register(r'moats/rankings', MoatRankingViewSet, basename='moat-rankings')
router.register(r'hist/cash-transactions', HistCashTransactionViewSet, basename='hist-cash-transactions')
router.register(r'hist/index-prices', HistIndexPriceViewSet, basename='hist-index-prices')
router.register(r'hist/asset-positions', AssetPositionHistOfficialViewSet, basename='hist-asset-positions')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/me/', MeView.as_view(), name='auth-me'),
]
