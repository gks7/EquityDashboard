from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import StockViewSet, InvestmentThesisViewSet, Estimate5YViewSet, PortfolioItemViewSet, PortfolioSnapshotViewSet, MoatScoreViewSet, MoatRankingViewSet, MeView

router = DefaultRouter()
router.register(r'stocks', StockViewSet)
router.register(r'theses', InvestmentThesisViewSet)
router.register(r'estimates', Estimate5YViewSet)
router.register(r'portfolio', PortfolioItemViewSet, basename='portfolio')
router.register(r'snapshots', PortfolioSnapshotViewSet, basename='snapshots')
router.register(r'moats/scores', MoatScoreViewSet, basename='moat-scores')
router.register(r'moats/rankings', MoatRankingViewSet, basename='moat-rankings')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/me/', MeView.as_view(), name='auth-me'),
]
