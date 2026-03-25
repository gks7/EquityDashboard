from django.db import models
from django.contrib.auth.models import User


class BloombergAsset(models.Model):
    """Registry of Bloomberg-tracked assets. Replaces SQL Server asset tables."""
    code_bbg = models.CharField(max_length=255, unique=True, db_index=True,
                                help_text='Bloomberg ticker, e.g. "SPX Index", "/ISIN/US912810RA88"')
    name = models.CharField(max_length=255, blank=True)
    asset_group = models.CharField(max_length=100, db_index=True,
                                   help_text='Grouping key, e.g. "Equity", "FixedIncome"')
    is_vintage = models.BooleanField(default=False,
                                     help_text="Use vintage terminal (port 50001) instead of main (port 50000)")
    is_active = models.BooleanField(default=True)
    stock = models.ForeignKey('finance.Stock', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='bbg_assets',
                              help_text="Optional link to existing Stock model")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['asset_group', 'code_bbg']
        verbose_name = "Bloomberg Asset"

    def __str__(self):
        return f"{self.code_bbg} ({self.asset_group})"


class BloombergField(models.Model):
    """Configuration for a Bloomberg field/mnemonic. Replaces QueryBBG_Update stored procedure."""
    METHOD_CHOICES = [('ref', 'Reference (snapshot)'), ('bdh', 'Historical (time series)')]
    SPH_CHOICES = [('Hist', 'Historical'), ('Set', 'Static/Setting')]

    name = models.CharField(max_length=100, unique=True,
                            help_text='Internal name, e.g. "YieldToWorst"')
    bbg_fld = models.CharField(max_length=100,
                               help_text='Bloomberg mnemonic, e.g. "INDEX_YIELD_TO_WORST"')
    method = models.CharField(max_length=3, choices=METHOD_CHOICES)
    sph = models.CharField(max_length=4, choices=SPH_CHOICES,
                           help_text="Hist = time series rows, Set = single current value")
    frequency = models.CharField(max_length=5, blank=True, default='1D',
                                 help_text='Update frequency: "1D", "1W", "1M", "1Q", "1S", "1Y"')
    overrides = models.JSONField(default=list, blank=True,
                                 help_text='BBG overrides as list of [field, value] pairs')
    elements = models.JSONField(default=list, blank=True,
                                help_text='BBG elements as list of [key, value] pairs')
    offset_date_ref = models.IntegerField(default=0,
                                          help_text="Business day offset for date reference")
    ref_period = models.CharField(max_length=5, blank=True, default='',
                                  help_text='Period format: "W", "M", "Q", "S", "Y" or empty')
    factor = models.FloatField(null=True, blank=True,
                               help_text="Multiplication factor for values (e.g. 100 for pct conversion)")
    is_critical = models.BooleanField(default=False,
                                      help_text="Critical fields (prices) are fetched even at high quota usage")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = "Bloomberg Field"

    def __str__(self):
        return f"{self.name} ({self.bbg_fld})"


class BloombergFieldGroup(models.Model):
    """Maps which fields apply to which asset groups."""
    asset_group = models.CharField(max_length=100, db_index=True)
    field = models.ForeignKey(BloombergField, on_delete=models.CASCADE, related_name='field_groups')
    start_date = models.DateField(null=True, blank=True,
                                  help_text="Start date for initial historical backfill (bdh)")

    class Meta:
        unique_together = ('asset_group', 'field')
        ordering = ['asset_group', 'field__name']
        verbose_name = "Field-Group Mapping"

    def __str__(self):
        return f"{self.asset_group} -> {self.field.name}"


class BloombergAssetException(models.Model):
    """Per-asset field overrides (e.g. perpetual bonds with hardcoded duration/yield).
    Replaces hardcoded ISINs in the old script."""
    asset = models.ForeignKey(BloombergAsset, on_delete=models.CASCADE, related_name='exceptions')
    field = models.ForeignKey(BloombergField, on_delete=models.CASCADE, related_name='exceptions')
    fixed_value = models.FloatField(null=True, blank=True,
                                    help_text="Use this fixed value instead of fetching from BBG")
    proxy_asset = models.ForeignKey(BloombergAsset, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='proxy_for',
                                    help_text="Fetch this field from a proxy asset instead")
    proxy_field = models.ForeignKey(BloombergField, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='proxy_for',
                                    help_text="Use this BBG field on the proxy asset")
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('asset', 'field')
        verbose_name = "Asset Field Exception"

    def __str__(self):
        return f"{self.asset.code_bbg} / {self.field.name} exception"


class BloombergDataPoint(models.Model):
    """Stores all fetched Bloomberg values. Replaces DataHist + DataSet tables."""
    asset = models.ForeignKey(BloombergAsset, on_delete=models.CASCADE, related_name='data_points',
                              db_index=True)
    field = models.ForeignKey(BloombergField, on_delete=models.CASCADE, related_name='data_points',
                              db_index=True)
    date = models.DateField(db_index=True)
    date_ref = models.CharField(max_length=20, blank=True, default='',
                                help_text='Period reference: "2026M03", "2026Q01", etc.')
    value = models.FloatField(null=True, blank=True)
    value_str = models.CharField(max_length=255, blank=True, default='',
                                 help_text="For non-numeric values like credit ratings")
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('asset', 'field', 'date', 'date_ref')
        indexes = [
            models.Index(fields=['asset', 'field', 'date']),
            models.Index(fields=['date', 'field']),
        ]
        verbose_name = "Data Point"

    def __str__(self):
        return f"{self.asset.code_bbg} / {self.field.name} @ {self.date}: {self.value}"


class BloombergFetchLog(models.Model):
    """Audit log for every fetch operation. Enables gap detection and error tracking."""
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('partial', 'Partial (some assets failed)'),
        ('error', 'Error'),
        ('skipped', 'Skipped (not due yet)'),
    ]

    asset_group = models.CharField(max_length=100, db_index=True)
    field = models.ForeignKey(BloombergField, on_delete=models.CASCADE, related_name='fetch_logs')
    date_requested = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    assets_requested = models.IntegerField(default=0)
    assets_succeeded = models.IntegerField(default=0)
    assets_failed = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, default='')
    failed_assets = models.JSONField(default=list, blank=True,
                                     help_text="List of code_bbg tickers that failed")
    api_calls_used = models.IntegerField(default=0)
    terminal_used = models.CharField(max_length=10, default='main',
                                     help_text='"main" or "vintage"')
    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_requested', '-started_at']
        verbose_name = "Fetch Log"

    def __str__(self):
        return f"{self.asset_group}/{self.field.name} @ {self.date_requested} [{self.status}]"


class BloombergApiQuota(models.Model):
    """Daily API call tracking and limits."""
    date = models.DateField(unique=True, db_index=True)
    calls_ref = models.IntegerField(default=0)
    calls_bdh = models.IntegerField(default=0)
    calls_total = models.IntegerField(default=0)
    limit_daily = models.IntegerField(default=50000,
                                      help_text="Max API calls per day")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        verbose_name = "API Quota"
        verbose_name_plural = "API Quotas"

    def __str__(self):
        return f"{self.date}: {self.calls_total}/{self.limit_daily}"

    @property
    def usage_pct(self):
        if self.limit_daily <= 0:
            return 100.0
        return (self.calls_total / self.limit_daily) * 100.0


class Trade(models.Model):
    """Manual trade entries by the portfolio manager."""
    SIDE_CHOICES = [('buy', 'Buy'), ('sell', 'Sell')]

    fund = models.CharField(max_length=255, db_index=True)
    asset = models.ForeignKey(BloombergAsset, on_delete=models.CASCADE, related_name='trades')
    side = models.CharField(max_length=4, choices=SIDE_CHOICES)
    quantity = models.FloatField()
    price = models.FloatField()
    currency = models.CharField(max_length=10, default='USD')
    trade_date = models.DateField(db_index=True)
    settlement_date = models.DateField(null=True, blank=True)
    broker = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    entered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                   related_name='bbg_trades')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-trade_date', '-created_at']
        verbose_name = "Trade"

    def __str__(self):
        return f"{self.side.upper()} {self.quantity} {self.asset.code_bbg} @ {self.price}"

    @property
    def notional(self):
        return self.quantity * self.price


class InternalNAV(models.Model):
    """Daily internal fund NAV computed from positions + Bloomberg prices."""
    fund = models.CharField(max_length=255, db_index=True)
    date = models.DateField(db_index=True)
    total_nav = models.FloatField()
    total_shares = models.FloatField()
    nav_per_share = models.FloatField()
    is_official = models.BooleanField(default=False,
                                      help_text="True if this is the official/audited NAV")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('fund', 'date')
        ordering = ['-date']
        verbose_name = "Internal NAV"
        verbose_name_plural = "Internal NAVs"

    def __str__(self):
        return f"{self.fund} @ {self.date}: {self.nav_per_share:.4f}"
