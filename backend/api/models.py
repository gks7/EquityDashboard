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


class CRMContact(models.Model):
    TYPE_CLIENT = 'client'
    TYPE_PROSPECT = 'prospect'
    TYPE_CHOICES = [
        (TYPE_CLIENT, 'Client'),
        (TYPE_PROSPECT, 'Prospect'),
    ]

    STAGE_LEAD = 'lead'
    STAGE_QUALIFIED = 'qualified'
    STAGE_PROPOSAL = 'proposal'
    STAGE_CLOSING = 'closing'
    STAGE_CHOICES = [
        (STAGE_LEAD, 'Lead'),
        (STAGE_QUALIFIED, 'Qualified'),
        (STAGE_PROPOSAL, 'Proposal'),
        (STAGE_CLOSING, 'Closing'),
    ]

    TEMP_HOT = 'hot'
    TEMP_WARM = 'warm'
    TEMP_NEW = 'new'
    TEMP_NONE = ''
    TEMP_CHOICES = [
        (TEMP_NONE, 'None'),
        (TEMP_HOT, 'Hot'),
        (TEMP_WARM, 'Warm'),
        (TEMP_NEW, 'New'),
    ]

    name = models.CharField(max_length=200)
    role = models.CharField(max_length=200, blank=True, default='')
    company = models.CharField(max_length=200)
    contact_type = models.CharField(max_length=10, choices=TYPE_CHOICES, db_index=True)
    stage = models.CharField(max_length=10, choices=STAGE_CHOICES, blank=True, default='')
    temperature = models.CharField(max_length=5, choices=TEMP_CHOICES, blank=True, default='')
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    health = models.IntegerField(null=True, blank=True, help_text='0-100, only for clients')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.company}) - {self.contact_type}"


class CRMMeeting(models.Model):
    TYPE_GROUP = 'group'
    TYPE_ONE_ON_ONE = 'one-on-one'
    TYPE_FOLLOW_UP = 'follow-up'
    TYPE_CHOICES = [
        (TYPE_GROUP, 'Group'),
        (TYPE_ONE_ON_ONE, 'One-on-one'),
        (TYPE_FOLLOW_UP, 'Follow-up'),
    ]

    title = models.CharField(max_length=300)
    description = models.TextField(blank=True, default='')
    date = models.DateField(db_index=True)
    time = models.TimeField()
    meeting_type = models.CharField(max_length=10, choices=TYPE_CHOICES, db_index=True)
    attendees = models.ManyToManyField(CRMContact, related_name='meetings', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-time']

    def __str__(self):
        return f"{self.title} ({self.date})"
