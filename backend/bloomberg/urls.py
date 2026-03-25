from django.urls import path, include
from rest_framework.routers import DefaultRouter
from bloomberg.views import (
    AgentConfigView, DataBulkUploadView, FetchLogCreateView,
    QuotaIncrementView, GapsView,
    DataStatusView, QuotaListView, FetchLogListView, DataPointView,
    TradeViewSet, InternalNAVViewSet, CalculateNAVView, AssetSearchView,
    AssetRegisterViewSet, AssetRegistrationRequestViewSet, AssetRiskProxyViewSet,
    PositionSnapshotViewSet,
)

router = DefaultRouter()
router.register(r'trades', TradeViewSet, basename='bbg-trades')
router.register(r'internal-nav', InternalNAVViewSet, basename='bbg-internal-nav')
router.register(r'assets', AssetRegisterViewSet, basename='bbg-assets')
router.register(r'asset-requests', AssetRegistrationRequestViewSet, basename='bbg-asset-requests')
router.register(r'risk-proxies', AssetRiskProxyViewSet, basename='bbg-risk-proxies')
router.register(r'positions', PositionSnapshotViewSet, basename='bbg-positions')

urlpatterns = [
    # Asset search must come before router to avoid conflict with assets/ ViewSet
    path('assets/search/', AssetSearchView.as_view(), name='bbg-asset-search'),

    # ViewSet routes
    path('', include(router.urls)),

    # Agent endpoints
    path('config/', AgentConfigView.as_view(), name='bbg-config'),
    path('data/bulk/', DataBulkUploadView.as_view(), name='bbg-data-bulk'),
    path('fetch-log/', FetchLogCreateView.as_view(), name='bbg-fetch-log'),
    path('quota/increment/', QuotaIncrementView.as_view(), name='bbg-quota-increment'),
    path('gaps/', GapsView.as_view(), name='bbg-gaps'),

    # Monitoring endpoints
    path('status/', DataStatusView.as_view(), name='bbg-status'),
    path('quota/', QuotaListView.as_view(), name='bbg-quota'),
    path('fetch-logs/', FetchLogListView.as_view(), name='bbg-fetch-logs'),
    path('data/<str:code_bbg>/', DataPointView.as_view(), name='bbg-data-point'),

    # NAV calculation
    path('internal-nav/calculate/', CalculateNAVView.as_view(), name='bbg-nav-calculate'),
]
