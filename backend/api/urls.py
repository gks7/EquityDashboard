from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import StockViewSet, InvestmentThesisViewSet, Estimate5YViewSet, PortfolioItemViewSet, PortfolioSnapshotViewSet

router = DefaultRouter()
router.register(r'stocks', StockViewSet)
router.register(r'theses', InvestmentThesisViewSet)
router.register(r'estimates', Estimate5YViewSet)
router.register(r'portfolio', PortfolioItemViewSet, basename='portfolio')
router.register(r'snapshots', PortfolioSnapshotViewSet, basename='snapshots')

urlpatterns = [
    path('', include(router.urls)),
]
