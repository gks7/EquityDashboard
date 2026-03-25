"""Business logic for Bloomberg data: gap detection, NAV calculation, status reporting."""

from datetime import date, timedelta
from django.db.models import Max, Count, Q, F
from bloomberg.models import (
    BloombergAsset, BloombergField, BloombergFieldGroup,
    BloombergDataPoint, BloombergFetchLog, BloombergApiQuota,
    Trade, InternalNAV,
)


def get_business_days(start_date: date, end_date: date) -> list[date]:
    """Return list of business days (Mon-Fri) between start and end inclusive."""
    days = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Mon=0, Fri=4
            days.append(current)
        current += timedelta(days=1)
    return days


def detect_gaps(max_age_days: int = 30) -> list[dict]:
    """Detect missing data points for active field groups.
    Returns list of {asset_group, field_name, field_id, date, method, is_recoverable}.
    Only checks bdh fields (ref fields can't be backfilled).
    """
    today = date.today()
    cutoff = today - timedelta(days=max_age_days)
    expected_dates = get_business_days(cutoff, today)

    gaps = []
    field_groups = BloombergFieldGroup.objects.filter(
        field__is_active=True
    ).select_related('field')

    for fg in field_groups:
        assets = BloombergAsset.objects.filter(
            asset_group=fg.asset_group, is_active=True
        )
        if not assets.exists():
            continue

        existing_dates = set(
            BloombergDataPoint.objects.filter(
                asset__asset_group=fg.asset_group,
                field=fg.field,
                date__gte=cutoff,
            ).values_list('date', flat=True).distinct()
        )

        for expected in expected_dates:
            if expected not in existing_dates:
                gaps.append({
                    'asset_group': fg.asset_group,
                    'field_name': fg.field.name,
                    'field_id': fg.field.id,
                    'date': expected,
                    'method': fg.field.method,
                    'is_recoverable': fg.field.method == 'bdh',
                })

    return gaps


def get_data_freshness() -> list[dict]:
    """Return freshness info: last update date per field/asset_group."""
    field_groups = BloombergFieldGroup.objects.filter(
        field__is_active=True
    ).select_related('field')

    results = []
    for fg in field_groups:
        last_point = BloombergDataPoint.objects.filter(
            asset__asset_group=fg.asset_group,
            field=fg.field,
        ).aggregate(
            last_date=Max('date'),
            last_fetched=Max('fetched_at'),
            total_points=Count('id'),
        )

        asset_count = BloombergAsset.objects.filter(
            asset_group=fg.asset_group, is_active=True
        ).count()

        results.append({
            'asset_group': fg.asset_group,
            'field_name': fg.field.name,
            'field_id': fg.field.id,
            'method': fg.field.method,
            'frequency': fg.field.frequency,
            'last_date': last_point['last_date'],
            'last_fetched': last_point['last_fetched'],
            'total_points': last_point['total_points'],
            'active_assets': asset_count,
        })

    return results


def calculate_positions(fund: str, as_of_date: date) -> list[dict]:
    """Calculate current positions for a fund by summing all trades up to as_of_date."""
    trades = Trade.objects.filter(
        fund=fund,
        trade_date__lte=as_of_date,
    ).values('asset__id', 'asset__code_bbg', 'asset__name').annotate(
        total_bought=Count('id'),  # placeholder — real aggregation below
    )

    # Manual aggregation for buy/sell netting
    positions = {}
    all_trades = Trade.objects.filter(
        fund=fund,
        trade_date__lte=as_of_date,
    ).select_related('asset').order_by('trade_date')

    for trade in all_trades:
        key = trade.asset_id
        if key not in positions:
            positions[key] = {
                'asset_id': trade.asset_id,
                'code_bbg': trade.asset.code_bbg,
                'asset_name': trade.asset.name,
                'quantity': 0.0,
                'avg_cost': 0.0,
                'total_cost': 0.0,
                'currency': trade.currency,
            }
        pos = positions[key]

        if trade.side == 'buy':
            new_qty = pos['quantity'] + trade.quantity
            if new_qty > 0:
                pos['total_cost'] = pos['total_cost'] + (trade.quantity * trade.price)
                pos['avg_cost'] = pos['total_cost'] / new_qty
            pos['quantity'] = new_qty
        else:  # sell
            pos['quantity'] -= trade.quantity
            if pos['quantity'] > 0:
                pos['total_cost'] = pos['avg_cost'] * pos['quantity']
            else:
                pos['total_cost'] = 0.0
                pos['avg_cost'] = 0.0

    # Filter out zero positions
    return [p for p in positions.values() if abs(p['quantity']) > 0.001]


def calculate_nav(fund: str, as_of_date: date, total_shares: float) -> dict | None:
    """Calculate internal NAV for a fund on a given date.
    Uses latest Bloomberg prices and current positions.
    Returns dict with nav details or None if insufficient data.
    """
    positions = calculate_positions(fund, as_of_date)
    if not positions:
        return None

    total_nav = 0.0
    position_details = []

    for pos in positions:
        # Get latest price from Bloomberg data
        price_point = BloombergDataPoint.objects.filter(
            asset_id=pos['asset_id'],
            field__name='PX_LAST',  # or whatever field holds the price
            date__lte=as_of_date,
        ).order_by('-date').first()

        current_price = price_point.value if price_point else None
        market_value = pos['quantity'] * current_price if current_price else None

        position_details.append({
            **pos,
            'current_price': current_price,
            'market_value': market_value,
        })

        if market_value:
            total_nav += market_value

    nav_per_share = total_nav / total_shares if total_shares > 0 else 0.0

    return {
        'fund': fund,
        'date': as_of_date,
        'total_nav': total_nav,
        'total_shares': total_shares,
        'nav_per_share': nav_per_share,
        'positions': position_details,
    }
