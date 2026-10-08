import datetime
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

class Analyst(models.fields.related.OneToOneField):
    # Depending on Django version context this could be simplified,
    # but extending the User model is generally the easiest approach
    pass
    
# Instead of OneToOne, let's keep it simple for now, since User provides enough
# We will just link directly to User.

class Stock(models.Model):
    ticker = models.CharField(max_length=10, unique=True, db_index=True)
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100, blank=True, null=True)
    industry = models.CharField(max_length=100, blank=True, null=True)
    current_price = models.FloatField(blank=True, null=True) # Cached from yfinance 
    previous_close = models.FloatField(blank=True, null=True) # Previous day's close
    forward_pe = models.FloatField(blank=True, null=True) # Cached from yfinance
    financials = models.JSONField(blank=True, null=True) # Historical income statement data
    dashboard_url = models.URLField(max_length=2000, blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.ticker} - {self.company_name}"

    @property
    def consensus_target_pe(self):
        theses = self.theses.all()
        estimates = [t.estimates_5y.target_pe_multiple for t in theses if hasattr(t, 'estimates_5y')]
        return sum(estimates) / len(estimates) if estimates else 0.0

    @property
    def consensus_target_eps(self):
        theses = self.theses.all()
        estimates = [t.estimates_5y.target_eps for t in theses if hasattr(t, 'estimates_5y')]
        return sum(estimates) / len(estimates) if estimates else 0.0

    @property
    def consensus_yield(self):
        theses = self.theses.all()
        estimates = [t.estimates_5y.accumulated_dividends_5y for t in theses if hasattr(t, 'estimates_5y')]
        return sum(estimates) / len(estimates) if estimates else 0.0

class PortfolioSnapshot(models.Model):
    date = models.DateField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"Snapshot {self.date}"

class PortfolioItem(models.Model):
    snapshot = models.ForeignKey(PortfolioSnapshot, on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    stock = models.ForeignKey(Stock, on_delete=models.SET_NULL, related_name='portfolio_entries', null=True, blank=True)
    
    # Bloomberg Source Data
    ticker = models.CharField(max_length=100, blank=True, null=True)
    isin = models.CharField(max_length=50, blank=True, null=True)
    asset_type = models.CharField(max_length=50, blank=True, null=True)
    specific_type = models.CharField(max_length=50, blank=True, null=True)
    
    quantity = models.FloatField(validators=[MinValueValidator(0.0)])
    average_cost = models.FloatField(validators=[MinValueValidator(0.0)], default=0.0)
    
    price = models.FloatField(blank=True, null=True)
    currency = models.CharField(max_length=10, blank=True, null=True)
    cross_usd = models.FloatField(blank=True, null=True, default=1.0)
    
    market_value = models.FloatField(blank=True, null=True)
    chg_pct_1d = models.FloatField(blank=True, null=True)
    pnl_1d = models.FloatField(blank=True, null=True)
    chg_pct_ytd = models.FloatField(blank=True, null=True)  # CHG_PCT_YTD, stored in percent units
    
    # Valuation
    pe_next_12_months = models.FloatField(blank=True, null=True)
    
    # Equity estimates (from Bloomberg)
    best_eps = models.FloatField(blank=True, null=True)  # BEST_FE_4QTRS
    eps_lt_growth = models.FloatField(blank=True, null=True)  # BEST_EST_LONG_TERM_GROWTH

    # Fixed Income
    rating = models.CharField(max_length=20, blank=True, null=True)  # BB_COMPOSITE
    yield_to_worst = models.FloatField(blank=True, null=True)
    duration = models.FloatField(blank=True, null=True)

    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total_cost(self):
        return self.quantity * self.average_cost

    @property
    def current_value(self):
        if self.market_value is not None:
            return self.market_value
        if self.price is not None:
            return self.quantity * self.price * self.cross_usd
        if self.stock and self.stock.current_price:
            return self.quantity * self.stock.current_price
        return 0.0

    @property
    def unrealized_pl(self):
        if self.average_cost and self.average_cost > 0:
            return self.current_value - self.total_cost
        return 0.0

    @property
    def unrealized_pl_pct(self):
        if self.total_cost > 0:
            return (self.unrealized_pl / self.total_cost) * 100.0
        return 0.0

    def __str__(self):
        return f"{self.quantity} of {self.ticker or self.stock}"

class InvestmentThesis(models.Model):
    CONVICTION_CHOICES = [
        (1, 'Low'),
        (2, 'Medium-Low'),
        (3, 'Medium'),
        (4, 'Medium-High'),
        (5, 'High'),
    ]

    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='theses')
    analyst = models.ForeignKey(User, on_delete=models.CASCADE, related_name='theses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    summary = models.TextField(help_text="A short abstract of the overall thesis.")
    bull_case = models.TextField(help_text="Markdown supported detailed bull case.")
    bear_case = models.TextField(help_text="Markdown supported detailed pre-mortem / bear case.")
    
    conviction = models.IntegerField(choices=CONVICTION_CHOICES, default=3)
    
    class Meta:
        verbose_name_plural = "Investment Theses"

    def __str__(self):
        return f"{self.analyst.username}'s Thesis on {self.stock.ticker}"

class Estimate5Y(models.Model):
    thesis = models.OneToOneField(InvestmentThesis, on_delete=models.CASCADE, related_name='estimates_5y')
    
    target_pe_multiple = models.FloatField(validators=[MinValueValidator(0.0)])
    target_eps = models.FloatField()
    accumulated_dividends_5y = models.FloatField(default=0.0, validators=[MinValueValidator(0.0)])
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def target_price(self):
        """Calculates the expected target price at the end of 5 years."""
        return self.target_pe_multiple * self.target_eps
        
    @property
    def implied_total_value(self):
        """Total value realized over 5 years (price + dividends)."""
        return self.target_price + self.accumulated_dividends_5y
        
    @property
    def implied_5y_return_pct(self):
        """Total return percentage based on current stock price."""
        if not self.thesis.stock.current_price or self.thesis.stock.current_price <= 0:
            return None
        return ((self.implied_total_value / self.thesis.stock.current_price) - 1.0) * 100.0
        
    @property
    def implied_irr(self):
        """Calculates rough 5Y CAGR / IRR."""
        if not self.thesis.stock.current_price or self.thesis.stock.current_price <= 0:
            return None
        if self.implied_total_value <= 0:
            return -100.0 # Total loss
            
        cagr = ((self.implied_total_value / self.thesis.stock.current_price) ** (1/5.0)) - 1.0
        return cagr * 100.0

    def __str__(self):
        return f"5Y Estimates for {self.thesis}"


class ThesisEditHistory(models.Model):
    """
    Tracks every edit made to an InvestmentThesis / Estimate5Y.
    Stores a snapshot of the data at the time of edit.
    """
    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='thesis_edit_history')
    edited_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='thesis_edits')
    edited_at = models.DateTimeField(auto_now_add=True)

    # Snapshot of the thesis at this point in time
    summary = models.TextField(blank=True, default='')
    conviction = models.IntegerField(default=3)
    target_pe_multiple = models.FloatField(default=0)
    target_eps = models.FloatField(default=0)
    accumulated_dividends_5y = models.FloatField(default=0)

    class Meta:
        ordering = ['-edited_at']
        verbose_name_plural = "Thesis edit histories"

    def __str__(self):
        return f"{self.edited_by.username} edited {self.stock.ticker} on {self.edited_at:%Y-%m-%d %H:%M}"


class ValuationModel(models.Model):
    """
    Stores the full SOTP valuation model for a stock as a JSON blob.
    One model per stock (upsert pattern).
    """
    stock = models.OneToOneField(Stock, on_delete=models.CASCADE, related_name='valuation_model')
    model_data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Valuation Model for {self.stock.ticker}"

class MoatScore(models.Model):
    """
    Stores 1-5 ratings across 5 categories to quantify a company's economic moat.
    Each analyst can have multiple historic entries per stock, but the latest one is their active score.
    """
    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='moat_scores')
    analyst = models.ForeignKey(User, on_delete=models.CASCADE, related_name='moat_scores')
    
    scale = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)], default=1)
    switch_costs = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)], default=1)
    physical_assets = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)], default=1)
    ip = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)], default=1)
    network_effects = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)], default=1)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        
    def __str__(self):
        return f"{self.stock.ticker} Moat by {self.analyst.username} ({self.created_at.date()})"
        
    @property
    def total_score(self):
        return self.scale + self.switch_costs + self.physical_assets + self.ip + self.network_effects

class NAVPosition(models.Model):
    """Daily NAV, share count and cash flow data per fund — from RefTableAuxNAVPosition."""
    fund = models.CharField(max_length=255, blank=True, null=True)
    date = models.DateField(blank=True, null=True)
    nav = models.FloatField(blank=True, null=True)
    shares = models.FloatField(blank=True, null=True)
    nav_per_share = models.FloatField(blank=True, null=True)
    subscription_d0 = models.FloatField(blank=True, null=True)
    redemption_d0 = models.FloatField(blank=True, null=True)
    redemption_d1 = models.FloatField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f"NAV {self.fund} {self.date}"


class HistCashTransaction(models.Model):
    excel_id = models.IntegerField(blank=True, null=True)
    date = models.DateField(blank=True, null=True)
    settlement_date = models.DateField(blank=True, null=True)
    fund = models.CharField(max_length=255, blank=True, null=True)
    cash_account = models.CharField(max_length=255, blank=True, null=True)
    amount = models.FloatField(blank=True, null=True)
    type = models.CharField(max_length=100, blank=True, null=True)
    counterparty_account = models.CharField(max_length=255, blank=True, null=True)
    is_manual = models.BooleanField(blank=True, null=True)
    obs = models.TextField(blank=True, null=True)
    cmd = models.CharField(max_length=100, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"CashTx {self.date} {self.fund} {self.amount}"


class HistIndexPrice(models.Model):
    pk_asset_info_id = models.IntegerField(blank=True, null=True)
    date = models.DateField(blank=True, null=True)
    fund = models.CharField(max_length=255, blank=True, null=True)
    asset = models.CharField(max_length=255, blank=True, null=True)
    info = models.CharField(max_length=255, blank=True, null=True)
    st_value = models.CharField(max_length=255, blank=True, null=True)
    flt_value = models.FloatField(blank=True, null=True)
    bln_value = models.BooleanField(blank=True, null=True)
    dte_value = models.DateField(blank=True, null=True)
    column1 = models.TextField(blank=True, null=True)
    column2 = models.TextField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"IndexPrice {self.date} {self.asset}"


class AssetPositionHistOfficial(models.Model):
    date = models.DateField(blank=True, null=True)
    fund = models.CharField(max_length=255, blank=True, null=True)
    portfolio = models.CharField(max_length=255, blank=True, null=True)
    asset_group = models.CharField(max_length=255, blank=True, null=True)
    broker = models.CharField(max_length=255, blank=True, null=True)
    asset_market = models.CharField(max_length=255, blank=True, null=True)
    asset = models.CharField(max_length=255, blank=True, null=True)
    is_leveraged_product = models.BooleanField(blank=True, null=True)
    units_open = models.FloatField(blank=True, null=True)
    units_close = models.FloatField(blank=True, null=True)
    units_transaction = models.FloatField(blank=True, null=True)
    units_lending = models.FloatField(blank=True, null=True)
    units_margin = models.FloatField(blank=True, null=True)
    currency = models.CharField(max_length=10, blank=True, null=True)
    avg_cost = models.FloatField(blank=True, null=True)
    price_open = models.FloatField(blank=True, null=True)
    price_close = models.FloatField(blank=True, null=True)
    price_open_source = models.CharField(max_length=100, blank=True, null=True)
    price_close_source = models.CharField(max_length=100, blank=True, null=True)
    price_open_date = models.DateField(blank=True, null=True)
    price_close_date = models.DateField(blank=True, null=True)
    price_opens_official = models.FloatField(blank=True, null=True)
    price_closes_official = models.FloatField(blank=True, null=True)
    delta_open = models.FloatField(blank=True, null=True)
    delta_close = models.FloatField(blank=True, null=True)
    underlying_price_open = models.FloatField(blank=True, null=True)
    underlying_price_close = models.FloatField(blank=True, null=True)
    contract_size = models.FloatField(blank=True, null=True)
    avg_price_transaction = models.FloatField(blank=True, null=True)
    amount_open = models.FloatField(blank=True, null=True)
    amount_close = models.FloatField(blank=True, null=True)
    amount_transaction = models.FloatField(blank=True, null=True)
    pnl_open_position = models.FloatField(blank=True, null=True)
    pnl_transaction = models.FloatField(blank=True, null=True)
    pnl_transaction_fee = models.FloatField(blank=True, null=True)
    pnl_dividend = models.FloatField(blank=True, null=True)
    pnl_lending = models.FloatField(blank=True, null=True)
    pnl_total = models.FloatField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Position {self.date} {self.fund} {self.asset}"


class AlphaDataPoint(models.Model):
    """
    Daily Price + P/E + Forward Return observations per stock, used for the Alpha
    (P/E-band forward-return) analysis dashboard. Forward returns are recomputed
    on the fly from the price series so any lookahead window is supported; the
    column is kept for the 1Y value carried over from the source spreadsheet.
    """
    stock = models.CharField(max_length=20, db_index=True)
    date = models.DateField()
    price = models.FloatField()
    pe = models.FloatField(blank=True, null=True)
    forward_return = models.FloatField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('stock', 'date')
        ordering = ['stock', 'date']
        indexes = [models.Index(fields=['stock', 'date'])]

    def __str__(self):
        return f"{self.stock} {self.date} P={self.price} PE={self.pe}"


class FundConfig(models.Model):
    """
    Singleton configuration for the calculated-NAV / cota engine.

    The website computes its own daily NAV/cota estimate from the prices uploaded
    on the Portfolio page (latest PortfolioSnapshot) plus a cash balance, then
    deducts an accrued management fee and a performance-fee provision.

    All parameters are editable from the IGF TR dashboard so they can be adjusted
    without a code change (e.g. bumping the high-water mark at each crystallization).
    """
    fund = models.CharField(max_length=255, default='IGF TR')

    shares = models.FloatField(default=32_435_667)            # cotas outstanding
    mgmt_fee_rate = models.FloatField(default=0.01)           # 1% per annum
    trading_days = models.IntegerField(default=255)          # days used to pro-rate the annual fee
    perf_fee_rate = models.FloatField(default=0.10)          # 10% above the high-water mark
    high_water_mark = models.FloatField(default=1.1364)      # cota level (fixed; bumped at crystallization)

    # Period-start net cotas used as the MTD/YTD return base while the uploaded
    # history doesn't yet reach the start of the month / year. Once the series spans
    # the period, the series-derived base takes over automatically.
    mtd_base_cota = models.FloatField(blank=True, null=True, default=1.14324)
    ytd_base_cota = models.FloatField(blank=True, null=True, default=1.10964)

    # Management fee accrues daily and is paid out periodically. Days strictly after
    # this date contribute to the accrued (unpaid) management-fee liability.
    mgmt_fee_paid_through = models.DateField(blank=True, null=True)
    # Performance fee crystallizes bi-annually (end of May / end of November).
    perf_fee_paid_through = models.DateField(blank=True, null=True)

    # Price at which a ManualFundFlow is converted into shares. Funds differ on this,
    # so it is a setting rather than a hard-coded rule:
    #   PREV_COTA — the previous day's closing cota (D0 priced at D-1)
    #   SAME_COTA — the event's own day cota, measured excluding the flow itself
    FLOW_PREV_COTA = 'prev_cota'
    FLOW_SAME_COTA = 'same_cota'
    FLOW_CONVENTION_CHOICES = [
        (FLOW_PREV_COTA, "Cota do dia anterior (D0 pela cota de D-1)"),
        (FLOW_SAME_COTA, "Cota do próprio dia (ex-fluxo)"),
    ]
    flow_share_convention = models.CharField(
        max_length=20, choices=FLOW_CONVENTION_CHOICES, default=FLOW_PREV_COTA,
    )

    # Performance engine: last day of the old per-asset position history (bloomberg.PositionSnapshot).
    # After it, positions are rebuilt from the bank statement + Bloomberg snapshots.
    perf_cutover_date = models.DateField(blank=True, null=True, default=datetime.date(2026, 3, 24))

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fund configuration"
        verbose_name_plural = "Fund configuration"

    def __str__(self):
        return f"FundConfig({self.fund})"

    @classmethod
    def get_solo(cls):
        """Return the single configuration row, creating it with defaults if missing."""
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj


class DailyCash(models.Model):
    """
    Cash balance (in the fund base currency, R$) entered per day. Added on top of
    the portfolio positions' market value to form the gross asset value used by the
    calculated-NAV engine. If a day has no entry the most recent prior value is
    carried forward.
    """
    date = models.DateField(unique=True, db_index=True)
    cash = models.FloatField(default=0.0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']
        verbose_name_plural = "Daily cash balances"

    def __str__(self):
        return f"Cash {self.date}: {self.cash}"


class ManualFundFlow(models.Model):
    """
    Subscription / redemption entered by hand for a single day, in the fund base
    currency.

    Official flows arrive with the administrator's `NAVPosition` upload, which stopped
    being refreshed — so for dates past that upload there is no flow data at all. These
    entries fill that gap and feed `services.compute_unified_fund_series`, where they do
    two things for the estimated period:

      * strip the flow out of the day's return, so money moving in or out is not
        mistaken for investment performance;
      * issue/cancel shares at that day's cota, so the share count (and therefore the
        total NAV) tracks capital events instead of being frozen at `FundConfig.shares`.

    Amounts are positive magnitudes: `subscription` is money in, `redemption` money out.

    NOTE: the cash itself must *also* be reflected in the portfolio for that day —
    either in `DailyCash` or already invested into positions. The gross asset value is
    built from those sources, so an entry here without the matching cash would
    understate the day's return.
    """
    date = models.DateField(unique=True, db_index=True)
    subscription = models.FloatField(default=0.0)   # money in (positive)
    redemption = models.FloatField(default=0.0)     # money out (positive)
    note = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']
        verbose_name_plural = "Manual fund flows"

    @property
    def net_flow(self):
        """Signed cash movement for the day: positive in, negative out."""
        return (self.subscription or 0.0) - (self.redemption or 0.0)

    def __str__(self):
        return f"Flow {self.date}: +{self.subscription} / -{self.redemption}"


class MoatRanking(models.Model):
    """
    Stores an ordered ranking (1 to N) of stocks by moat strength, as determined by an analyst.
    Multiple entries per analyst represent history; the latest is the active ranking.
    """
    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='moat_rankings')
    analyst = models.ForeignKey(User, on_delete=models.CASCADE, related_name='moat_rankings')
    
    rank = models.IntegerField(validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at', 'rank']
        
    def __str__(self):
        return f"#{self.rank} {self.stock.ticker} by {self.analyst.username}"


# ─────────────────────────────────────────────────────────────────────────────
# Performance engine (cota + per-asset performance)
#
# Inputs uploaded from the IGF TR "Performance" page:
#   * BankTransaction    – custodian cash statement (UBS export), one row per booking
#   * AdminNAVReport     – administrator month-end "NAV Calculation" workbook
#   * ManualLedgerEntry  – trades/income booked outside the statement account
#                          (CAD sub-account, CSWML account, corrections)
#   * AssetAlias         – maps statement / Bloomberg / position tickers to one asset id
# Output:
#   * PerformanceRun     – the computed dashboard payload, cached (see finance/perf/engine.py)
# ─────────────────────────────────────────────────────────────────────────────

class AssetAlias(models.Model):
    """One instrument, and every name it goes by in the different sources."""
    CLASS_CHOICES = [('Equity', 'Equity'), ('Fixed Income', 'Fixed Income'), ('Other', 'Other')]
    asset_id = models.CharField(max_length=64, unique=True,
                                help_text='Internal id, e.g. "QQQ" or "PEMEX 5.95 01/28/31"')
    name = models.CharField(max_length=255, blank=True, default='')
    asset_class = models.CharField(max_length=20, choices=CLASS_CHOICES, default='Equity')
    sub_class = models.CharField(max_length=40, blank=True, default='Stock',
                                 help_text='Stock, Index ETF, Thematic ETF, HY ETF, Corporate Bond, Sovereign Bond, US Treasury')
    sector = models.CharField(max_length=60, blank=True, default='')
    isin = models.CharField(max_length=20, blank=True, default='', db_index=True)
    statement_pattern = models.CharField(max_length=255, blank=True, default='',
                                         help_text='Regex matched against the bank statement description (used when the ISIN is absent)')
    tickers = models.CharField(max_length=255, blank=True, default='',
                               help_text='Comma-separated aliases used by Bloomberg snapshots / position history, e.g. "SDHA LN EQUITY,SDHA LN"')

    class Meta:
        ordering = ['asset_class', 'asset_id']

    def __str__(self):
        return self.asset_id


class BankTransaction(models.Model):
    """A row of the custodian cash statement, classified."""
    TYPE_CHOICES = [(t, t) for t in (
        'BUY', 'SELL', 'REDEMPTION', 'AMORTIZATION', 'DIVIDEND', 'COUPON', 'SUBSCRIPTION', 'REDEMPTION_PAID',
        'MGMT_FEE', 'MGMT_PERF_FEE', 'EXPENSE', 'BANK_FEE', 'BANK_INTEREST', 'TRANSFER', 'OTHER_INCOME', 'OTHER')]
    account = models.CharField(max_length=64, default='', db_index=True)
    trade_date = models.DateField(db_index=True)
    trade_time = models.CharField(max_length=16, blank=True, default='')
    booking_date = models.DateField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=8, default='USD')
    amount = models.FloatField()                       # signed: + cash in, - cash out
    balance = models.FloatField(null=True, blank=True)
    txn_no = models.CharField(max_length=64, blank=True, default='')
    desc1 = models.TextField(blank=True, default='')
    desc2 = models.TextField(blank=True, default='')
    desc3 = models.TextField(blank=True, default='')
    # classification (re-derived on every upload; `type_override` wins when set)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='OTHER')
    type_override = models.CharField(max_length=20, choices=TYPE_CHOICES, blank=True, default='')
    asset_id = models.CharField(max_length=64, blank=True, default='')
    units = models.FloatField(default=0.0)
    price = models.FloatField(null=True, blank=True)
    accrued = models.FloatField(null=True, blank=True)
    is_reversal = models.BooleanField(default=False)
    counterparty = models.CharField(max_length=255, blank=True, default='')
    note = models.CharField(max_length=255, blank=True, default='')
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['trade_date', 'id']
        constraints = [models.UniqueConstraint(fields=['account', 'txn_no', 'amount', 'trade_date'], name='uniq_bank_txn')]

    @property
    def effective_type(self):
        return self.type_override or self.type

    def __str__(self):
        return f"{self.trade_date} {self.effective_type} {self.asset_id} {self.amount}"


class ManualLedgerEntry(models.Model):
    """Trade or cash event that never appears in the uploaded statement (other sub-accounts, corrections)."""
    TYPE_CHOICES = [(t, t) for t in ('BUY', 'SELL', 'DIVIDEND', 'COUPON', 'REDEMPTION', 'EXPENSE', 'OTHER_INCOME')]
    trade_date = models.DateField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    asset_id = models.CharField(max_length=64, blank=True, default='')
    units = models.FloatField(default=0.0, help_text='+ bought / - sold')
    amount = models.FloatField(help_text='Cash in USD, signed: + received, - paid')
    note = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['trade_date', 'id']

    def __str__(self):
        return f"{self.trade_date} {self.type} {self.asset_id} {self.amount}"


class AdminNAVReport(models.Model):
    """Administrator month-end NAV Calculation workbook, parsed."""
    date = models.DateField(unique=True)
    file_name = models.CharField(max_length=255, blank=True, default='')
    base_nav = models.FloatField(null=True, blank=True)
    mgmt_fee = models.FloatField(null=True, blank=True)
    perf_fee = models.FloatField(null=True, blank=True)
    nav = models.FloatField(null=True, blank=True)
    subscriptions = models.FloatField(null=True, blank=True)
    redemptions = models.FloatField(null=True, blank=True)
    nav_closing = models.FloatField(null=True, blank=True)
    prev_nav_closing = models.FloatField(null=True, blank=True)
    prev_subscriptions = models.FloatField(null=True, blank=True)
    total_assets = models.FloatField(null=True, blank=True)
    total_shares = models.FloatField(null=True, blank=True)
    lead_cota = models.FloatField(null=True, blank=True)
    lead_table = models.JSONField(default=dict, blank=True)   # {"2026": [jan, feb, ...], "2025": [...]}
    series = models.JSONField(default=list, blank=True)       # [{series, shares, nav_per_share, nav, sub_amount}]
    holdings = models.JSONField(default=list, blank=True)     # [{section, name, isin, qty, cost, value, price, accrued}]
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f"Admin NAV {self.date}"


class PerformanceRun(models.Model):
    """Cached output of finance.perf.engine.compute() — what the Performance page renders."""
    created_at = models.DateTimeField(auto_now_add=True)
    duration_s = models.FloatField(default=0.0)
    ok = models.BooleanField(default=True)
    error = models.TextField(blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
