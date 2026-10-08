"""Glue between uploads, the engine and the cached PerformanceRun."""
import time
import traceback

from django.db import transaction
from django.utils import timezone

STALE_AFTER_MIN = 30


def import_statement(fileobj):
    from finance.models import AssetAlias, BankTransaction
    from .statement import AliasMatcher, parse_workbook
    matcher = AliasMatcher(list(AssetAlias.objects.values()))
    meta, rows = parse_workbook(fileobj, matcher)
    created = updated = 0
    with transaction.atomic():
        for r in rows:
            key = dict(account=r['account'], txn_no=r['txn_no'], amount=r['amount'], trade_date=r['trade_date'])
            obj = BankTransaction.objects.filter(**key).first()
            if obj:
                # keep manual overrides, refresh the parsed fields
                for k, v in r.items():
                    setattr(obj, k, v)
                obj.save()
                updated += 1
            else:
                BankTransaction.objects.create(**r)
                created += 1
    total = sum(r['amount'] for r in rows)
    check = None
    if meta.get('closing_balance') is not None and meta.get('opening_balance') is not None:
        check = round(float(meta['opening_balance']) + total - float(meta['closing_balance']), 2)
    unmapped = [dict(date=str(r['trade_date']), desc=r['desc1'][:90], amount=r['amount'])
                for r in rows if r['type'] in ('BUY', 'SELL', 'REDEMPTION', 'DIVIDEND', 'COUPON', 'AMORTIZATION') and not r['asset_id']]
    return dict(rows=len(rows), created=created, updated=updated, account=meta.get('account'),
                period=[str(meta.get('from')), str(meta.get('until'))], balance_diff=check, unmapped=unmapped)


def import_admin_report(fileobj, file_name=''):
    from finance.models import AdminNAVReport
    from .admin_report import parse_workbook
    p = parse_workbook(fileobj, file_name)
    obj, _ = AdminNAVReport.objects.update_or_create(date=p['date'], defaults=dict(
        file_name=file_name[:255], base_nav=p.get('Base NAV'), mgmt_fee=p.get('Management fee'), perf_fee=p.get('Performance fee'),
        nav=p.get('NAV'), subscriptions=p.get('Subscriptions'), redemptions=p.get('Redemptions'), nav_closing=p.get('NAV Closing'),
        prev_nav_closing=p.get('NAV Closing_prev'), prev_subscriptions=p.get('Subscriptions_prev'), total_assets=p.get('total_assets'),
        total_shares=p.get('total_shares'), lead_cota=p.get('lead_cota'), lead_table=p.get('lead_table') or {},
        series=p.get('series') or [], holdings=p.get('holdings') or []))
    return dict(date=str(obj.date), lead_cota=obj.lead_cota, nav_closing=obj.nav_closing, holdings=len(obj.holdings), series=len(obj.series))


def rebuild():
    from finance.models import PerformanceRun
    from .engine import compute
    t0 = time.time()
    try:
        payload, _ = compute()
        run = PerformanceRun.objects.create(payload=payload, duration_s=time.time() - t0, ok=True)
    except Exception as e:
        run = PerformanceRun.objects.create(payload={}, duration_s=time.time() - t0, ok=False,
                                            error=f'{e}\n{traceback.format_exc()}'[:20000])
    # keep the table small
    keep = list(PerformanceRun.objects.order_by('-created_at').values_list('id', flat=True)[:20])
    PerformanceRun.objects.exclude(id__in=keep).delete()
    return run


def latest(auto_rebuild=True):
    """Latest good run; rebuilt when older than the newest Portfolio snapshot (and > STALE_AFTER_MIN old)."""
    from finance.models import PerformanceRun, PortfolioSnapshot
    run = PerformanceRun.objects.filter(ok=True).first()
    if not auto_rebuild:
        return run
    newest = PortfolioSnapshot.objects.order_by('-created_at').values_list('created_at', flat=True).first()
    stale = run is None or (newest and newest > run.created_at and
                            (timezone.now() - run.created_at).total_seconds() > STALE_AFTER_MIN * 60)
    if stale:
        new = rebuild()
        if new.ok or run is None:
            return new
    return run
