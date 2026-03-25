from django.db import models
from django.contrib.auth.models import User


class BloombergAsset(models.Model):
    """Registry of Bloomberg-tracked assets. Replaces SQL Server asset tables + Asset Register."""
    OPTION_TYPE_CHOICES = [('', 'None'), ('call', 'Call'), ('put', 'Put')]
    OPTION_STYLE_CHOICES = [('', 'None'), ('american', 'American'), ('european', 'European')]

    # --- Global.Asset ---
    code_bbg = models.CharField(max_length=255, unique=True, db_index=True,
                                help_text='Bloomberg ticker, e.g. "GLD US EQUITY", "/ISIN/US912810RA88"')
    name = models.CharField(max_length=255, blank=True)
    asset_group = models.CharField(max_length=100, db_index=True,
                                   help_text='Grouping key, e.g. "Stock", "Bond", "ETF"')
    code_id = models.CharField(max_length=100, blank=True, default='',
                               help_text="CNPJ, ISIN, or internal ID")
    is_active = models.BooleanField(default=True)
    is_bbg_ticker = models.BooleanField(default=True,
                                         help_text="True if code_bbg is a valid Bloomberg ticker")
    request_bbg_data = models.BooleanField(default=True,
                                           help_text="Whether to fetch data from Bloomberg")
    is_vintage = models.BooleanField(default=False,
                                     help_text="Use vintage terminal (port 50001)")
    obs = models.TextField(blank=True, default='')
    stock = models.ForeignKey('finance.Stock', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='bbg_assets',
                              help_text="Optional link to existing Stock model")

    # --- Control.AssetData ---
    asset_origin = models.CharField(max_length=100, blank=True, default='',
                                    help_text='Short ticker without security type, e.g. "GLD US"')
    currency = models.CharField(max_length=10, default='USD')
    asset_market = models.CharField(max_length=50, blank=True, default='',
                                    help_text='STOCK, BOND, ETF, FUND, etc.')
    calendar = models.CharField(max_length=10, default='US',
                                help_text="Trading calendar code")
    contract_size = models.FloatField(default=1)
    option_type = models.CharField(max_length=10, blank=True, default='', choices=OPTION_TYPE_CHOICES)
    option_style = models.CharField(max_length=10, blank=True, default='', choices=OPTION_STYLE_CHOICES)
    option_strike = models.FloatField(null=True, blank=True)
    option_expiration = models.DateField(null=True, blank=True)
    option_underlying = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL,
                                          related_name='derivatives')
    # Settlement days
    settle_cdays_out = models.IntegerField(default=0)
    settle_bdays_out = models.IntegerField(default=2)
    settle_cdays_in = models.IntegerField(default=0)
    settle_bdays_in = models.IntegerField(default=2)
    quote_cdays_out = models.IntegerField(default=0)
    quote_bdays_out = models.IntegerField(default=0)
    quote_cdays_in = models.IntegerField(default=0)
    quote_bdays_in = models.IntegerField(default=0)

    # --- PortfolioRisk ---
    security_type = models.CharField(max_length=50, blank=True, default='',
                                     help_text='Common Stock, Corp Bond, Govt Bond, etc.')
    investment_strategy = models.CharField(max_length=100, blank=True, default='')
    liquidity = models.CharField(max_length=50, blank=True, default='',
                                 help_text='0-1 day, 1-7 days, etc.')
    risk_weight = models.FloatField(default=100, help_text="Market exposure weight %")
    asset_class = models.CharField(max_length=50, blank=True, default='',
                                   help_text='Equity, Fixed Income, Commodities, etc.')
    country = models.CharField(max_length=10, blank=True, default='')
    risk_currency = models.CharField(max_length=10, blank=True, default='')
    sector = models.CharField(max_length=100, blank=True, default='')
    risk_level = models.IntegerField(null=True, blank=True, help_text="1-5 scale")
    is_discretionary = models.BooleanField(default=False)

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


class AssetRiskProxy(models.Model):
    """Risk proxy configurations: stress test scenarios, correlation matrix, VaR."""
    PROXY_TYPE_CHOICES = [
        ('stress_911', 'Stress Test - 9/11'),
        ('stress_subprime', 'Stress Test - Subprime'),
        ('stress_covid', 'Stress Test - Covid'),
        ('correlation', 'Correlation Matrix'),
        ('var', 'VaR'),
    ]
    asset = models.ForeignKey(BloombergAsset, on_delete=models.CASCADE, related_name='risk_proxies')
    proxy_type = models.CharField(max_length=20, choices=PROXY_TYPE_CHOICES)
    ticker_proxy = models.CharField(max_length=100)
    weight_or_beta = models.FloatField(default=1.0,
                                       help_text="Beta for stress tests, Weight for correlation/VaR")

    class Meta:
        unique_together = ('asset', 'proxy_type', 'ticker_proxy')
        ordering = ['asset', 'proxy_type']
        verbose_name = "Asset Risk Proxy"
        verbose_name_plural = "Asset Risk Proxies"

    def __str__(self):
        return f"{self.asset.code_bbg} / {self.get_proxy_type_display()} / {self.ticker_proxy}"


class Trade(models.Model):
    """Trade entries by the portfolio manager (Manager View)."""
    SIDE_CHOICES = [('buy', 'Buy'), ('sell', 'Sell')]
    TRADE_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('checked', 'Checked'),
        ('cancelled', 'Cancelled'),
    ]

    fund = models.CharField(max_length=255, db_index=True)
    asset = models.ForeignKey(BloombergAsset, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='trades',
                              help_text="Null if asset not yet registered")
    asset_ticker_raw = models.CharField(max_length=255, blank=True, default='',
                                        help_text="Ticker as typed by PM (used when asset not registered)")
    side = models.CharField(max_length=4, choices=SIDE_CHOICES)
    quantity = models.FloatField()
    price = models.FloatField()
    currency = models.CharField(max_length=10, default='USD')
    trade_date = models.DateField(db_index=True)
    scheduled_date = models.DateField(null=True, blank=True)
    settlement_date = models.DateField(null=True, blank=True)
    portfolio = models.CharField(max_length=100, blank=True, default='',
                                 help_text='Investment book: DISCRETIONARY, ETF FI Book, etc.')
    broker = models.CharField(max_length=255, blank=True, default='')
    clean_price = models.FloatField(null=True, blank=True,
                                    help_text="Clean price for bonds")
    fee_per_unit = models.FloatField(null=True, blank=True, default=0)
    fee_total = models.FloatField(null=True, blank=True, default=0)
    amount = models.FloatField(null=True, blank=True,
                               help_text="Trade notional amount")
    cash_amount = models.FloatField(null=True, blank=True,
                                    help_text="Actual cash impact including fees (signed)")
    trader = models.CharField(max_length=100, blank=True, default='',
                              help_text="Who placed the trade (distinct from entered_by)")
    trade_status = models.CharField(max_length=20, choices=TRADE_STATUS_CHOICES, default='pending')
    cmd = models.CharField(max_length=20, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    entered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                   related_name='bbg_trades')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-trade_date', '-created_at']
        verbose_name = "Trade"

    def __str__(self):
        ticker = self.asset.code_bbg if self.asset else self.asset_ticker_raw
        return f"{self.side.upper()} {self.quantity} {ticker} @ {self.price}"

    @property
    def notional(self):
        return self.quantity * self.price

    @property
    def weekday(self):
        return self.trade_date.strftime('%a') if self.trade_date else ''

    @property
    def display_ticker(self):
        return self.asset.code_bbg if self.asset else self.asset_ticker_raw


class AssetRegistrationRequest(models.Model):
    """Pipeline for registering new assets: PM enters trade with unknown ticker,
    backoffice registers the asset, system triggers Bloomberg data pull."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
    ]
    ticker_raw = models.CharField(max_length=255,
                                  help_text="Ticker as entered by the PM")
    asset = models.ForeignKey(BloombergAsset, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='registration_requests',
                              help_text="Set once backoffice creates the asset")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                     related_name='asset_requests')
    requested_from_trade = models.ForeignKey(Trade, null=True, blank=True, on_delete=models.SET_NULL,
                                             related_name='registration_requests')
    notes = models.TextField(blank=True, default='')
    completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='asset_completions')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Asset Registration Request"

    def __str__(self):
        return f"{self.ticker_raw} [{self.status}]"


class PositionSnapshot(models.Model):
    """Daily position snapshot — current and historical portfolio holdings."""
    date = models.DateField(db_index=True)
    fund = models.CharField(max_length=255, db_index=True)
    portfolio = models.CharField(max_length=100, blank=True, default='')
    asset_group = models.CharField(max_length=100, blank=True, default='')
    broker = models.CharField(max_length=255, blank=True, default='')
    asset_market = models.CharField(max_length=50, blank=True, default='')
    asset_ticker = models.CharField(max_length=255, db_index=True)
    asset = models.ForeignKey(BloombergAsset, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='position_snapshots')
    is_leveraged = models.BooleanField(default=False)
    units_open = models.FloatField(default=0)
    units_close = models.FloatField(default=0)
    units_transaction = models.FloatField(default=0)
    units_lending = models.FloatField(default=0)
    units_margin = models.FloatField(default=0)
    currency = models.CharField(max_length=10, default='USD')
    avg_cost = models.FloatField(null=True, blank=True)
    price_open = models.FloatField(null=True, blank=True)
    price_close = models.FloatField(null=True, blank=True)
    price_open_source = models.CharField(max_length=50, blank=True, default='')
    price_close_source = models.CharField(max_length=50, blank=True, default='')
    price_open_date = models.DateField(null=True, blank=True)
    price_close_date = models.DateField(null=True, blank=True)
    price_open_official = models.BooleanField(default=True)
    price_close_official = models.BooleanField(default=True)
    delta_open = models.FloatField(null=True, blank=True)
    delta_close = models.FloatField(null=True, blank=True)
    underlying_price_open = models.FloatField(null=True, blank=True)
    underlying_price_close = models.FloatField(null=True, blank=True)
    contract_size = models.FloatField(default=1)
    avg_price_transaction = models.FloatField(null=True, blank=True)
    amount_open = models.FloatField(null=True, blank=True)
    amount_close = models.FloatField(null=True, blank=True)
    amount_transaction = models.FloatField(null=True, blank=True)
    pnl_open_position = models.FloatField(null=True, blank=True)
    pnl_transaction = models.FloatField(null=True, blank=True)
    pnl_transaction_fee = models.FloatField(null=True, blank=True)
    pnl_dividend = models.FloatField(null=True, blank=True)
    pnl_lending = models.FloatField(null=True, blank=True)
    pnl_total = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('date', 'fund', 'asset_ticker', 'portfolio')
        ordering = ['-date', 'fund', 'asset_ticker']
        indexes = [
            models.Index(fields=['date', 'fund']),
            models.Index(fields=['asset_ticker']),
        ]
        verbose_name = "Position Snapshot"

    def __str__(self):
        return f"{self.date} | {self.fund} | {self.asset_ticker} | {self.units_close} units"


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
