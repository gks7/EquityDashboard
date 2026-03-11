from django.db import models
from django.contrib.auth.models import User


class UserEvent(models.Model):
    ACTION_LOGIN = 'login'
    ACTION_PAGE_VIEW = 'page_view'
    ACTION_CHOICES = [
        (ACTION_LOGIN, 'Login'),
        (ACTION_PAGE_VIEW, 'Page View'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='events')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    page = models.CharField(max_length=255, blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']
