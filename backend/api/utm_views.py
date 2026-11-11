"""
UTM portfolio API (page /utm). Engine and import live in finance/utm.py.

GET    /api/utm/                 — everything the page renders (?refresh=1 fetches Yahoo prices first)
POST   /api/utm/upload/          — multipart `file`: the internal UTM Excel (replaces history up to its last date)
POST   /api/utm/rebalances/      — {date, holdings: [{ticker, shares}], note} new basket
DELETE /api/utm/rebalances/?date=YYYY-MM-DD — remove a rebalance entered on the page
"""
import datetime as dt
import io
import logging

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from finance import utm
from finance.models import UtmRebalance

log = logging.getLogger(__name__)


def _date(v):
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def _refresh():
    try:
        return utm.refresh_prices()
    except Exception as e:  # Yahoo down or rate-limited: the page still renders stored data
        log.exception('UTM price refresh failed')
        return {'ok': False, 'error': f'{e.__class__.__name__}: {e}'}


class UtmView(APIView):
    def get(self, request):
        refresh = None
        if request.query_params.get('refresh'):
            refresh = _refresh()
        data = utm.compute()
        if data is None:
            return Response({'empty': True, 'refresh': refresh})
        data['refresh'] = refresh
        return Response(data)


class UtmUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        f = request.FILES.get('file') or next(iter(request.FILES.values()), None)
        if f is None:
            return Response({'error': 'Nenhum arquivo enviado.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            info = utm.import_workbook(io.BytesIO(f.read()))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            log.exception('UTM import failed')
            return Response({'error': f'Não consegui ler o arquivo ({e.__class__.__name__}: {e}).'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': True, **info, 'refresh': _refresh()})


class UtmRebalanceView(APIView):
    parser_classes = [JSONParser]

    def post(self, request):
        d = _date(request.data.get('date'))
        if d is None:
            return Response({'error': 'Data inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        if d.weekday() >= 5:
            return Response({'error': 'A data do rebalanceamento precisa ser um dia útil (data do trade).'},
                            status=status.HTTP_400_BAD_REQUEST)
        rows = request.data.get('holdings') or []
        holdings = {}
        for r in rows:
            t = utm.norm_ticker(r.get('ticker'))
            if t:
                holdings[t] = holdings.get(t, 0) + (float(r.get('shares') or 0))
        try:
            rb = utm.add_rebalance(d, holdings, request.data.get('note') or '')
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': True, 'date': rb.date.isoformat(), 'n': rb.holdings.count(), 'refresh': _refresh()})

    def delete(self, request):
        d = _date(request.query_params.get('date'))
        if d is None:
            return Response({'error': 'Data inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = UtmRebalance.objects.filter(date=d, source='manual')
        if not qs.exists():
            return Response({'error': 'Só dá para apagar rebalanceamentos lançados na página.'},
                            status=status.HTTP_400_BAD_REQUEST)
        qs.delete()
        return Response({'ok': True})
