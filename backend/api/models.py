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


class CommitteeMeeting(models.Model):
    """Minutes of the weekly investment committee: the view, the decisions taken
    and who owes what afterwards. One record per meeting, written by an analyst."""

    STATUS_DRAFT = 'draft'
    STATUS_FINAL = 'final'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_FINAL, 'Final'),
    ]

    STANCE_RISK_ON = 'risk_on'
    STANCE_NEUTRAL = 'neutral'
    STANCE_RISK_OFF = 'risk_off'
    STANCE_CHOICES = [
        (STANCE_RISK_ON, 'Risk On'),
        (STANCE_NEUTRAL, 'Neutral'),
        (STANCE_RISK_OFF, 'Risk Off'),
    ]

    date = models.DateField(db_index=True)
    title = models.CharField(max_length=200, blank=True, default='')
    attendees = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    stance = models.CharField(max_length=10, choices=STANCE_CHOICES, blank=True, default='')

    macro_view = models.TextField(blank=True, default='')
    portfolio_view = models.TextField(blank=True, default='')
    risks = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')

    # {"equities": 55, "fixed_income": 30, "cash": 10, "alternatives": 5} — target
    # weights agreed in the meeting, so the drift can be read against the snapshot.
    target_allocation = models.JSONField(blank=True, null=True)

    author = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='committee_meetings',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return self.title or f"Committee {self.date}"


class CommitteeDecision(models.Model):
    """One line of what the committee decided to do with a name or a sleeve."""

    ACTION_BUY = 'buy'
    ACTION_ADD = 'add'
    ACTION_TRIM = 'trim'
    ACTION_SELL = 'sell'
    ACTION_HOLD = 'hold'
    ACTION_HEDGE = 'hedge'
    ACTION_WATCH = 'watch'
    ACTION_RESEARCH = 'research'
    ACTION_CHOICES = [
        (ACTION_BUY, 'Buy'),
        (ACTION_ADD, 'Add'),
        (ACTION_TRIM, 'Trim'),
        (ACTION_SELL, 'Sell'),
        (ACTION_HOLD, 'Hold'),
        (ACTION_HEDGE, 'Hedge'),
        (ACTION_WATCH, 'Watch'),
        (ACTION_RESEARCH, 'Research'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_PARTIAL = 'partial'
    STATUS_EXECUTED = 'executed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PARTIAL, 'Partially executed'),
        (STATUS_EXECUTED, 'Executed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    meeting = models.ForeignKey(CommitteeMeeting, on_delete=models.CASCADE, related_name='decisions')
    asset = models.CharField(max_length=200)
    asset_class = models.CharField(max_length=50, blank=True, default='')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, default=ACTION_WATCH)
    target_weight_pct = models.FloatField(null=True, blank=True)
    limit_price = models.FloatField(null=True, blank=True)
    rationale = models.TextField(blank=True, default='')
    owner = models.CharField(max_length=100, blank=True, default='')
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.get_action_display()} {self.asset}"


class CommitteeActionItem(models.Model):
    """Follow-up that is not a portfolio decision — a study, a call, a document."""

    meeting = models.ForeignKey(CommitteeMeeting, on_delete=models.CASCADE, related_name='action_items')
    task = models.CharField(max_length=300)
    owner = models.CharField(max_length=100, blank=True, default='')
    due_date = models.DateField(null=True, blank=True)
    done = models.BooleanField(default=False)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.task
