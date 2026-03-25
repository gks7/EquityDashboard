from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from api.views import LoggingTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include('api.urls')),
    path("api/bbg/", include('bloomberg.urls')),  # BBG data integration — remove this line to revert
    path("api/token/", LoggingTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path("api/token/refresh/", TokenRefreshView.as_view(), name='token_refresh'),
]
