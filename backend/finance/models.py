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

class PortfolioItem(models.Model):
    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='portfolio_entries')
    quantity = models.FloatField(validators=[MinValueValidator(0.0)])
    average_cost = models.FloatField(validators=[MinValueValidator(0.0)])
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total_cost(self):
        return self.quantity * self.average_cost

    @property
    def current_value(self):
        if self.stock.current_price:
            return self.quantity * self.stock.current_price
        return 0.0

    @property
    def unrealized_pl(self):
        return self.current_value - self.total_cost

    @property
    def unrealized_pl_pct(self):
        if self.total_cost > 0:
            return (self.unrealized_pl / self.total_cost) * 100.0
        return 0.0

    def __str__(self):
        return f"{self.quantity} shares of {self.stock.ticker}"

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
        unique_together = ('stock', 'analyst') # One active thesis per analyst per stock
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
