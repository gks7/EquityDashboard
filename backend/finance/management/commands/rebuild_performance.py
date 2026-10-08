"""python manage.py rebuild_performance [--statement FILE ...] [--admin FILE ...]

Imports bank statements / administrator NAV reports from disk (optional) and recomputes the cached
performance payload shown on /performance."""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Import statement/admin files (optional) and rebuild the IGF TR performance cache'

    def add_arguments(self, parser):
        parser.add_argument('--statement', nargs='*', default=[])
        parser.add_argument('--admin', nargs='*', default=[])

    def handle(self, *args, **opts):
        from finance.perf import service
        import os
        for p in opts['statement']:
            self.stdout.write(f"extrato {p}: {service.import_statement(p)}")
        for p in opts['admin']:
            self.stdout.write(f"administrador {p}: {service.import_admin_report(p, os.path.basename(p))}")
        run = service.rebuild()
        if run.ok:
            k = run.payload['kpi']
            self.stdout.write(self.style.SUCCESS(f"ok em {run.duration_s:.1f}s — cota {k['cota']:.6f} em {k['date']} (ano {k['ytd']*100:+.2f}%)"))
            for c in run.payload['checks']:
                self.stdout.write(f"  [{c['status']}] {c['title']}: {c['detail']}")
        else:
            self.stderr.write(run.error)
