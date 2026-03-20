from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    StockViewSet, InvestmentThesisViewSet, Estimate5YViewSet,
    PortfolioItemViewSet, PortfolioSnapshotViewSet,
    MoatScoreViewSet, MoatRankingViewSet, MeView,
    HistCashTransactionViewSet, HistIndexPriceViewSet, AssetPositionHistOfficialViewSet,
    NAVPositionViewSet, IgfTrView, AssetBreakdownView,
    TrackEventView, AdminOverviewView,
    CRMContactViewSet, CRMMeetingViewSet,
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
router.register(r'hist/nav-positions', NAVPositionViewSet, basename='hist-nav-positions')
router.register(r'crm/contacts', CRMContactViewSet, basename='crm-contacts')
router.register(r'crm/meetings', CRMMeetingViewSet, basename='crm-meetings')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('igf-tr/', IgfTrView.as_view(), name='igf-tr'),
    path('igf-tr/asset-breakdown/', AssetBreakdownView.as_view(), name='igf-tr-asset-breakdown'),
    path('admin/track/', TrackEventView.as_view(), name='admin-track'),
    path('admin/overview/', AdminOverviewView.as_view(), name='admin-overview'),
]
