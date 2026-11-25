"""
Daily ingestion for the Druck page (/druck): the indicators Stanley
Druckenmiller watches (liquidity, Fed/rates, credit, FX, commodities,
market internals, inflation, fiscal), from FRED + Yahoo Finance.

For each indicator it computes 1/3/6/12-month changes, a 3-month trend
signal adjusted by whether "up" is good for risk assets, an inflection flag
(last month against the 6-month trend) and the 10y percentile.

Uses the FRED API when FRED_API_KEY is set (CI), else the public
fredgraph.csv endpoint.

Usage:
    python backend/scripts/fetch_druck_data.py [out_path]

Default out_path: frontend/public/data/druck.json
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "frontend" / "public" / "data" / "druck.json"
START = "2013-01-01"
UA = {"User-Agent": "curl/8.4.0"}  # fredgraph resets browser-like UAs
FRED_KEY = os.environ.get("FRED_API_KEY", "").strip()

# ---------------------------------------------------------------- blocos
BLOCKS = [
    ("liq", "Liquidez",
     "A variável que ele põe acima dos lucros: quando Fed e bancos centrais injetam, os ativos sobem; quando drenam, o vento vira."),
    ("juros", "Fed e juros",
     "O preço do dinheiro e o que o mercado espera do Fed nos próximos 12 a 24 meses."),
    ("credito", "Crédito",
     "Spreads e oferta de crédito costumam virar antes das ações."),
    ("fx", "Dólar e câmbio",
     "Dólar forte aperta a liquidez global. Ele começou a carreira operando moedas."),
    ("cmd", "Commodities e ativos reais",
     "Cobre como termômetro de crescimento; ouro e bitcoin como termômetro de confiança na moeda e de liquidez."),
    ("mkt", "Leitura interna do mercado",
     "O mercado como economista: quem lidera (cíclicos, semis, construtoras, transportes) e quão ampla é a alta."),
    ("inf", "Inflação",
     "Inflação subindo amarra o Fed e encurta o ciclo de liquidez."),
    ("fiscal", "Fiscal",
     "Déficit e emissão de Treasuries pressionam o term premium e o juro longo."),
]

# unit -> modo de variação: pct (%), bp, pp, abs (US$ bi)
CHG_MODE = {"rate": "bp", "spread": "bp", "yoy": "pp", "pct_net": "pp",
            "pct_gdp": "pp", "usd_bn": "abs", "usd_tn": "pct", "px": "pct",
            "ratio": "pct"}


def I(**k):
    k.setdefault("pol", 0)
    k.setdefault("dec", 2)
    k.setdefault("pre", "")
    k.setdefault("src", "fred")
    return k


IND = [
    # Liquidez
    I(id="netliq", block="liq", name="Liquidez líquida do Fed", src="calc", unit="usd_tn", pol=1,
      why="Balanço do Fed − conta do Tesouro (TGA) − reverse repo. É o que de fato fica no sistema; a série que mais acompanha o S&P desde 2020."),
    I(id="WALCL", block="liq", name="Balanço do Fed", unit="usd_tn", scale=1e-6, pol=1,
      why="QE expande, QT contrai. A tendência importa mais que o nível."),
    I(id="RRPONTSYD", block="liq", name="Reverse repo (RRP)", unit="usd_bn", dec=0, pol=-1,
      why="Caixa estacionado no Fed. Quando cai, esse dinheiro volta ao mercado; perto de zero, o colchão acabou."),
    I(id="WTREGEN", block="liq", name="Conta do Tesouro (TGA)", unit="usd_bn", scale=1e-3, dec=0, pol=-1,
      why="Tesouro enchendo a TGA (ex.: após teto da dívida) drena reservas dos bancos."),
    I(id="M2SL", block="liq", name="M2 EUA (a/a)", unit="yoy", tf="yoy", dec=1, pol=1,
      why="Crescimento da base monetária ampla. Ele comparou M2 negativo em 2022–23 a um sinal raro de aperto."),
    I(id="g3bs", block="liq", name="Balanço Fed + BCE + BoJ", src="calc", unit="usd_tn", dec=1, pol=1,
      why="Liquidez global em dólares. Inclui o efeito câmbio: dólar forte encolhe o balanço de BCE e BoJ medido em US$."),
    # Juros
    I(id="DFF", block="juros", name="Fed funds efetivo", unit="rate", pol=-1,
      why="O juro de política. Ciclo de alta drena liquidez; de corte, devolve."),
    I(id="DGS2", block="juros", name="Treasury 2 anos", unit="rate", pol=-1,
      why="O melhor resumo do que o mercado espera do Fed. Caindo = cortes sendo precificados."),
    I(id="DFII10", block="juros", name="Juro real 10 anos (TIPS)", unit="rate", pol=-1,
      why="Juro real negativo foi o combustível de 2020–21; subida rápida de juro real é o que mais machuca múltiplos."),
    I(id="DGS10", block="juros", name="Treasury 10 anos", unit="rate",
      why="Contexto. Juro longo subindo com Fed cortando é sinal de problema fiscal ou de inflação."),
    I(id="T10Y2Y", block="juros", name="Curva 10a − 2a", unit="spread",
      why="Inversão sinaliza aperto; a reinclinação vinda de inversão costuma coincidir com a recessão, não com o fim do risco."),
    I(id="T10Y3M", block="juros", name="Curva 10a − 3m", unit="spread",
      why="A versão da curva com melhor histórico como preditor de recessão."),
    # Crédito
    I(id="BAMLH0A0HYM2", block="credito", name="Spread high yield", unit="spread", pol=-1,
      why="O alarme mais rápido. Spreads abrindo com bolsa subindo é divergência que ele não ignora."),
    I(id="BAMLC0A0CM", block="credito", name="Spread grau de investimento", unit="spread", pol=-1,
      why="Custo de financiamento das empresas grandes."),
    I(id="DRTSCILM", block="credito", name="Bancos apertando crédito (SLOOS)", unit="pct_net", dec=1, pol=-1,
      why="% líquido de bancos endurecendo crédito a empresas. Pesquisa trimestral; antecede investimento e emprego."),
    I(id="BUSLOANS", block="credito", name="Empréstimos C&I (a/a)", unit="yoy", tf="yoy", dec=1, pol=1,
      why="Se o crédito bancário está de fato chegando às empresas."),
    I(id="KRE/SPY", block="credito", name="Bancos regionais vs S&P", src="ratio", a="KRE", b="SPY", unit="ratio", dec=3, pol=1,
      why="Termômetro de estresse bancário (2023). Bancos fracos = crédito mais curto à frente."),
    # Câmbio
    I(id="DX-Y.NYB", block="fx", name="Índice do dólar (DXY)", src="yf", unit="px", dec=1, pol=-1,
      why="Dólar subindo aperta quem tem dívida em dólar e encolhe a liquidez global."),
    I(id="JPY=X", block="fx", name="USD/JPY", src="yf", unit="px", dec=1,
      why="Iene é a moeda de funding do carry trade; valorização brusca do iene (USD/JPY caindo rápido) desmonta posições alavancadas."),
    I(id="CEW", block="fx", name="Moedas emergentes (CEW)", src="yf", unit="px", dec=2, pre="US$ ", pol=1,
      why="Cesta de moedas emergentes. Subindo = dólar fraco e apetite a risco global."),
    # Commodities
    I(id="HG=F", block="cmd", name="Cobre (US$/lb)", src="yf", unit="px", dec=2, pre="US$ ", pol=1,
      why="O metal mais ligado a crescimento global e investimento."),
    I(id="cuau", block="cmd", name="Razão cobre/ouro (×1000)", src="calc", unit="ratio", dec=3, pol=1,
      why="Crescimento vs medo. Costuma andar junto com o Treasury de 10 anos; divergência entre os dois merece atenção."),
    I(id="GC=F", block="cmd", name="Ouro (US$/oz)", src="yf", unit="px", dec=0, pre="US$ ",
      why="Posição que ele já declarou. Proteção contra excesso fiscal e perda de confiança nos bancos centrais."),
    I(id="CL=F", block="cmd", name="Petróleo WTI", src="yf", unit="px", dec=1, pre="US$ ",
      why="Choque de petróleo é imposto sobre o consumo e pressão sobre a inflação."),
    I(id="BTC-USD", block="cmd", name="Bitcoin", src="yf", unit="px", dec=0, pre="US$ ", pol=1,
      why="O ativo mais sensível à liquidez marginal. Ele já disse que o vê como reserva de valor."),
    # Mercado
    I(id="SPY", block="mkt", name="S&P 500 (SPY)", src="yf", unit="px", dec=0, pre="US$ ", pol=1,
      why="O resultado. O resto do bloco diz se a alta é saudável."),
    I(id="XLY/XLP", block="mkt", name="Consumo discricionário vs básico", src="ratio", a="XLY", b="XLP", unit="ratio", dec=3, pol=1,
      why="Cíclico vs defensivo. Caindo = o mercado está se protegendo antes dos dados."),
    I(id="SMH/SPY", block="mkt", name="Semicondutores vs S&P", src="ratio", a="SMH", b="SPY", unit="ratio", dec=3, pol=1,
      why="Semis lideram o ciclo nas duas direções."),
    I(id="XHB/SPY", block="mkt", name="Construtoras vs S&P", src="ratio", a="XHB", b="SPY", unit="ratio", dec=3, pol=1,
      why="Habitação é a primeira a sentir juro e a primeira a sair da recessão."),
    I(id="IYT/SPY", block="mkt", name="Transportes vs S&P", src="ratio", a="IYT", b="SPY", unit="ratio", dec=3, pol=1,
      why="Frete e logística refletem a economia física."),
    I(id="XRT/SPY", block="mkt", name="Varejo vs S&P", src="ratio", a="XRT", b="SPY", unit="ratio", dec=3, pol=1,
      why="Saúde do consumidor médio, não só do topo da pirâmide."),
    I(id="IWM/SPY", block="mkt", name="Small caps vs S&P", src="ratio", a="IWM", b="SPY", unit="ratio", dec=3, pol=1,
      why="Small caps dependem de crédito e juro curto; são as mais sensíveis à liquidez."),
    I(id="RSP/SPY", block="mkt", name="Equal weight vs S&P (amplitude)", src="ratio", a="RSP", b="SPY", unit="ratio", dec=3, pol=1,
      why="Alta concentrada em poucos nomes é alta frágil."),
    # Inflação
    I(id="CPILFESL", block="inf", name="Core CPI (a/a)", unit="yoy", tf="yoy", pol=-1,
      why="O dado que o mercado mais negocia."),
    I(id="PCEPILFE", block="inf", name="Core PCE (a/a)", unit="yoy", tf="yoy", pol=-1,
      why="A medida que o Fed usa como meta."),
    I(id="CES0500000003", block="inf", name="Salário/hora (a/a)", unit="yoy", tf="yoy", dec=1, pol=-1,
      why="Inflação de salários é a parte persistente."),
    I(id="T5YIE", block="inf", name="Inflação implícita 5 anos", unit="rate", pol=-1,
      why="Expectativa de inflação negociada no mercado."),
    I(id="T5YIFR", block="inf", name="Inflação implícita 5a daqui a 5a", unit="rate", pol=-1,
      why="Se as expectativas de longo prazo se desancoram, o Fed perde margem."),
    # Fiscal
    # Monthly Treasury Statement (FRED) + Treasury Fiscal Data API; 12m sums smooth
    # the tax-calendar seasonality of single months.
    I(id="def12", block="fiscal", name="Resultado federal 12m (% PIB)", src="calc", unit="pct_gdp", dec=1,
      why="Déficit acumulado em 12 meses sobre o PIB nominal. Déficit grande fora de recessão é o tema que ele mais repete: injeta no curto prazo, cobra no longo."),
    I(id="rcpt12", block="fiscal", name="Receitas federais 12m (a/a)", src="calc", unit="yoy", dec=1,
      why="Arrecadação acumulada em 12 meses contra o ano anterior. Receita fraca costuma antecipar desaceleração da economia."),
    I(id="outl12", block="fiscal", name="Despesas federais 12m (a/a)", src="calc", unit="yoy", dec=1,
      why="Gasto acumulado em 12 meses contra o ano anterior. Gasto acelerando com economia cheia é o estímulo fiscal fora de hora."),
    I(id="int12", block="fiscal", name="Juros líquidos da dívida 12m", src="calc", unit="usd_tn", dec=2,
      why="Juros pagos ao mercado nos últimos 12 meses: juros da dívida pública menos o que o Tesouro credita aos próprios fundos (Social Security etc.). Fonte: MTS, tabela 5."),
    I(id="intrev", block="fiscal", name="Juros / receita federal (12m)", src="calc", unit="pct_net", dec=1, pol=-1,
      why="Quanto da arrecadação vai para juros. Subindo = dinâmica da dívida piorando e mais oferta de Treasuries à frente."),
    I(id="avgrate", block="fiscal", name="Custo médio da dívida negociável", src="calc", unit="rate",
      why="Taxa média que o Tesouro paga no estoque de títulos negociáveis. Sobe devagar conforme a dívida antiga é rolada a juros mais altos."),
    I(id="THREEFYTP10", block="fiscal", name="Term premium 10 anos", unit="rate", pol=-1,
      why="Prêmio que o mercado exige para carregar Treasury longo. Sobe com excesso de oferta e risco fiscal."),
]

EXTRA_FRED = ["ECBASSETSW", "JPNASSETS", "DEXUSEU", "DEXJPUS",
              "MTSDS133FMS", "MTSR133FMS", "MTSO133FMS", "GDP"]

TREASURY = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
# query -> (endpoint, extra filter, value field, {classification_desc: series name} or series name).
# Both MTS interest lines come in one query: the API is slow and flaky, fewer calls fare better.
TREASURY_QUERIES = {
    "mts_interest": (
        "v1/accounting/mts/mts_table_5",
        "classification_desc:in:(Total--Interest on the Public Debt,Total--Interest Received by Trust Funds)",
        "current_month_gross_outly_amt",
        {"Total--Interest on the Public Debt": "interest",
         # negative: interest the Treasury pays its own trust funds (Social Security etc.)
         "Total--Interest Received by Trust Funds": "trustint"},
    ),
    "avgrate": ("v2/accounting/od/avg_interest_rates",
                "security_desc:eq:Total Marketable", "avg_interest_rate_amt", "avgrate"),
}
EXTRA_YF = ["KRE", "XLY", "XLP", "SMH", "XHB", "IYT", "XRT", "IWM", "RSP", "SPY", "GC=F", "HG=F"]


# ---------------------------------------------------------------- fetch
def _fred_api(sid: str) -> pd.Series:
    r = requests.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={"series_id": sid, "api_key": FRED_KEY, "file_type": "json",
                "observation_start": START},
        timeout=45,
    )
    r.raise_for_status()
    obs = r.json()["observations"]
    s = pd.Series([o["value"] for o in obs], index=pd.to_datetime([o["date"] for o in obs]))
    return pd.to_numeric(s, errors="coerce")


def _fred_csv(sid: str) -> pd.Series:
    r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={START}",
                     headers=UA, timeout=45)
    r.raise_for_status()
    if not r.text.lstrip().lower().startswith(("observation_date", "date")):
        raise ValueError("response is not CSV")
    df = pd.read_csv(io.StringIO(r.text))
    s = pd.to_numeric(df.iloc[:, 1], errors="coerce")
    s.index = pd.to_datetime(df.iloc[:, 0])
    return s


def fetch_fred(sid: str) -> pd.Series | None:
    for attempt in range(3):
        try:
            s = (_fred_api if FRED_KEY else _fred_csv)(sid).dropna().sort_index()
            s.name = sid
            return s
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 * (attempt + 1))
    print(f"  FRED {sid}: FAILED ({err})", file=sys.stderr)
    return None


def fetch_treasury(query: str) -> dict[str, pd.Series]:
    """Series from one Treasury Fiscal Data API query (no key needed), all pages."""
    path, filt, field, names = TREASURY_QUERIES[query]
    split = isinstance(names, dict)
    flt = f"record_date:gte:{START}" + (f",{filt}" if filt else "")
    fields = f"record_date,{field}" + (",classification_desc" if split else "")
    err: Exception | None = None
    for attempt in range(3):
        try:
            rows, page = [], 1
            while True:
                r = requests.get(f"{TREASURY}/{path}", timeout=45, headers=UA, params={  # stalls on python-requests UA
                    "filter": flt, "fields": fields, "sort": "record_date",
                    "page[size]": 1000, "page[number]": page})
                r.raise_for_status()
                j = r.json()
                rows += j["data"]
                if page >= int(j.get("meta", {}).get("total-pages", 1) or 1):
                    break
                page += 1
            df = pd.DataFrame(rows)
            df["v"] = pd.to_numeric(df[field], errors="coerce")
            df["d"] = pd.to_datetime(df["record_date"])
            groups = ({names[k]: g for k, g in df.groupby("classification_desc") if k in names}
                      if split else {names: df})
            out = {}
            for name, g in groups.items():
                ser = g.set_index("d")["v"].dropna().sort_index()
                ser = ser[~ser.index.duplicated(keep="last")]
                if not ser.empty:
                    ser.name = name
                    out[name] = ser
            if not out:
                raise ValueError("no rows")
            return out
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(3 * (attempt + 1))
    print(f"  Treasury {query}: FAILED ({err})", file=sys.stderr)
    return {}


def monthly(s: pd.Series) -> pd.Series:
    """Index a monthly series by month start (MTS on FRED is month-start, Treasury is month-end)."""
    return s.groupby(s.index.to_period("M")).last().to_timestamp()


def _yf_close(tickers: list[str]) -> pd.DataFrame:
    import yfinance as yf
    df = yf.download(tickers, start=START, auto_adjust=True, progress=False, threads=True)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df["Close"]
    if isinstance(df, pd.Series):
        df = df.to_frame(tickers[0])
    df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    return df


def fetch_yf(tickers: list[str]) -> dict[str, pd.Series]:
    out: dict[str, pd.Series] = {}
    try:
        df = _yf_close(tickers)
    except Exception as e:  # noqa: BLE001
        print(f"  yfinance batch failed ({e})", file=sys.stderr)
        df = pd.DataFrame()
    for t in tickers:
        s = df[t].dropna() if t in df.columns else pd.Series(dtype=float)
        if s.empty:  # one retry per missing ticker
            try:
                time.sleep(1)
                d1 = _yf_close([t])
                s = d1.iloc[:, 0].dropna() if not d1.empty else s
            except Exception as e:  # noqa: BLE001
                print(f"  yfinance {t}: {e}", file=sys.stderr)
        if s.empty:
            print(f"  yfinance {t}: no data", file=sys.stderr)
            continue
        s.name = t
        out[t] = s
    return out


# ---------------------------------------------------------------- análise
def native_days(s: pd.Series) -> float:
    return float(pd.Series(s.index[-60:]).diff().dt.days.median())


def freq_class(s: pd.Series) -> str:
    d = native_days(s)
    if d <= 3: return "D"
    if d <= 8: return "W"
    if d <= 35: return "M"
    if d <= 100: return "Q"
    return "A"


PPY = {"D": 252, "W": 52, "M": 12, "Q": 4, "A": 1}
STALE_DAYS = {"D": 7, "W": 16, "M": 75, "Q": 200, "A": 800}  # anual do FRED é datado em 1º/jan
HORIZONS = {"D": [1, 3, 6, 12], "W": [1, 3, 6, 12], "M": [1, 3, 6, 12], "Q": [3, 6, 12], "A": [12]}


def change(last: float, past: float, mode: str) -> float | None:
    if past is None or np.isnan(past):
        return None
    if mode == "pct":
        return None if past == 0 else (last / past - 1) * 100
    if mode == "bp":
        return (last - past) * 100
    return last - past


def chg_at(s: pd.Series, months: int, mode: str) -> float | None:
    t = s.index[-1]
    past = s.asof(t - pd.DateOffset(months=months))
    return change(float(s.iloc[-1]), past, mode)


def chg_sigma(s: pd.Series, months: int, mode: str) -> float:
    m = s.resample("ME").last().ffill().dropna()
    m = m[m.index >= m.index[-1] - pd.DateOffset(years=10)]
    prev = m.shift(months)
    if mode == "pct":
        c = (m / prev - 1) * 100
    elif mode == "bp":
        c = (m - prev) * 100
    else:
        c = m - prev
    c = c.replace([np.inf, -np.inf], np.nan).dropna()
    return float(c.std()) if len(c) > 5 else float("nan")


def direction(c: float | None, sig: float) -> int:
    if c is None or np.isnan(sig) or sig == 0:
        return 0 if c is None else int(np.sign(c))
    return 0 if abs(c) < 0.25 * sig else int(np.sign(c))


def compact(s: pd.Series, daily: bool) -> list:
    s = s.dropna()
    s = s[s.index >= s.index[-1] - pd.DateOffset(years=10)]
    if daily:
        cut = s.index[-1] - pd.DateOffset(years=2)
        old = s[s.index < cut].resample("W-FRI").last().dropna()
        s = pd.concat([old, s[s.index >= cut]])
    days = s.index.values.astype("datetime64[D]").astype(np.int64)
    return [[int(d), float(f"{v:.5g}")] for d, v in zip(days, s.values)]


def ffill_to(s: pd.Series, idx: pd.DatetimeIndex) -> pd.Series:
    return s.reindex(s.index.union(idx)).ffill().reindex(idx)


def main(out_path: Path = DEFAULT_OUT) -> None:
    fred_ids = sorted({i["id"] for i in IND if i["src"] == "fred"} | set(EXTRA_FRED)
                      | {"WALCL", "WTREGEN", "RRPONTSYD"})
    yf_ids = sorted({i["id"] for i in IND if i["src"] == "yf"} | set(EXTRA_YF))
    print(f"Fetching {len(fred_ids)} FRED series ({'API' if FRED_KEY else 'fredgraph'}) and {len(yf_ids)} Yahoo tickers...")
    with ThreadPoolExecutor(max_workers=6) as ex:
        fred = dict(zip(fred_ids, ex.map(fetch_fred, fred_ids)))
    fred = {k: v for k, v in fred.items() if v is not None}
    yfd = fetch_yf(yf_ids)
    tsy: dict[str, pd.Series] = {}
    for q in TREASURY_QUERIES:  # one at a time: the API chokes on parallel calls
        tsy.update(fetch_treasury(q))

    raw: dict[str, pd.Series] = {}
    # séries diretas
    for ind in IND:
        if ind["src"] == "fred" and ind["id"] in fred:
            raw[ind["id"]] = fred[ind["id"]] * ind.get("scale", 1)
        elif ind["src"] == "yf" and ind["id"] in yfd:
            raw[ind["id"]] = yfd[ind["id"]]
        elif ind["src"] == "ratio" and ind["a"] in yfd and ind["b"] in yfd:
            a, b = yfd[ind["a"]], yfd[ind["b"]]
            j = pd.concat([a, b], axis=1, join="inner").dropna()
            raw[ind["id"]] = j.iloc[:, 0] / j.iloc[:, 1]
    # calculadas
    if {"WALCL", "WTREGEN", "RRPONTSYD"} <= fred.keys():
        w = fred["WALCL"]
        raw["netliq"] = (w - ffill_to(fred["WTREGEN"], w.index)
                         - ffill_to(fred["RRPONTSYD"], w.index) * 1e3) / 1e6
    if {"WALCL", "ECBASSETSW", "JPNASSETS", "DEXUSEU", "DEXJPUS"} <= fred.keys():
        w = fred["WALCL"]
        ecb = ffill_to(fred["ECBASSETSW"], w.index) * ffill_to(fred["DEXUSEU"], w.index)
        boj = ffill_to(fred["JPNASSETS"], w.index) * 100 / ffill_to(fred["DEXJPUS"], w.index)
        raw["g3bs"] = ((w + ecb + boj) / 1e6).dropna()
    if {"HG=F", "GC=F"} <= yfd.keys():
        j = pd.concat([yfd["HG=F"], yfd["GC=F"]], axis=1, join="inner").dropna()
        raw["cuau"] = j.iloc[:, 0] / j.iloc[:, 1] * 1000
    # fiscal (MTS values are US$ millions per month; GDP is US$ billions SAAR)
    sum12 = lambda s: monthly(s).rolling(12).sum().dropna()  # noqa: E731
    def yoy(s: pd.Series) -> pd.Series:  # vs last value on or before the same date a year ago
        pos = s.index.searchsorted(s.index - pd.DateOffset(years=1), side="right") - 1
        prev = np.where(pos >= 0, s.values[np.clip(pos, 0, None)], np.nan)
        return (s / prev - 1) * 100
    if {"MTSDS133FMS", "GDP"} <= fred.keys():
        d12 = sum12(fred["MTSDS133FMS"])
        raw["def12"] = (d12 / (ffill_to(fred["GDP"], d12.index) * 1e3) * 100).dropna()
    if "MTSR133FMS" in fred:
        raw["rcpt12"] = yoy(sum12(fred["MTSR133FMS"])).dropna()
    if "MTSO133FMS" in fred:
        raw["outl12"] = yoy(sum12(fred["MTSO133FMS"])).dropna()
    if {"interest", "trustint"} <= tsy.keys():
        # net of what the Treasury pays its own trust funds = interest paid to the market
        g12, t12 = sum12(tsy["interest"]), sum12(tsy["trustint"])
        i12 = (g12 + t12.reindex(g12.index)).dropna()  # US$
        raw["int12"] = i12 / 1e12
        if "MTSR133FMS" in fred:
            r12 = sum12(fred["MTSR133FMS"]) * 1e6
            j = pd.concat([i12, r12], axis=1, join="inner").dropna()
            raw["intrev"] = j.iloc[:, 0] / j.iloc[:, 1] * 100
    if "avgrate" in tsy:
        raw["avgrate"] = monthly(tsy["avgrate"])

    today = pd.Timestamp(dt.date.today())
    # Last good rows: if a source is down today, keep yesterday's row instead of dropping it.
    try:
        prev_rows = {r["id"]: r for r in json.loads(out_path.read_text(encoding="utf-8"))["rows"]}
    except Exception:  # noqa: BLE001
        prev_rows = {}
    rows, missing = [], []
    for ind in IND:
        s = raw.get(ind["id"])
        if s is None or s.dropna().empty:
            if ind["id"] in prev_rows:
                r = prev_rows[ind["id"]]
                r["stale"] = (today - pd.Timestamp(r["date"])).days > STALE_DAYS[r["freq"]]
                rows.append(r)
                print(f"  {ind['id']}: source down, kept previous row ({r['date']})", file=sys.stderr)
            else:
                missing.append(ind["name"])
            continue
        s = s.dropna().sort_index()
        fc = freq_class(s)
        if ind.get("tf") == "yoy":
            s = (s.pct_change(PPY[fc]) * 100).dropna()
        mode = CHG_MODE[ind["unit"]]
        hz = HORIZONS[fc]
        chg = {h: chg_at(s, h, mode) for h in hz}
        sig_h = 3 if 3 in hz else 12
        sigmas = {h: chg_sigma(s, h, mode) for h in hz}
        d = direction(chg[sig_h], sigmas[sig_h])
        signal = d * ind["pol"] if ind["pol"] else None
        # inflexão: curto prazo contra a tendência de 6-12m
        short_h, long_h = (1, 6) if 1 in hz else ((3, 12) if 3 in hz else (None, None))
        inflex = False
        if short_h:
            ds, dl = direction(chg[short_h], sigmas[short_h]), direction(chg[long_h], sigmas[long_h])
            inflex = ds != 0 and dl != 0 and ds != dl
        s10 = s[s.index >= s.index[-1] - pd.DateOffset(years=10)]
        pctl = float((s10 < s.iloc[-1]).mean() * 100)
        hist_years = round((s10.index[-1] - s10.index[0]).days / 365.25, 1)
        ma = None
        if ind["src"] in ("yf", "ratio") or ind["id"] == "cuau":
            ma = compact(s.rolling(200).mean().dropna(), True)
        last_date = s.index[-1]
        rows.append({
            "id": ind["id"], "block": ind["block"], "name": ind["name"], "why": ind["why"],
            "src": ind["src"], "a": ind.get("a"), "b": ind.get("b"),
            "unit": ind["unit"], "mode": mode, "dec": ind["dec"], "pre": ind["pre"], "pol": ind["pol"],
            "freq": fc, "last": float(s.iloc[-1]), "date": last_date.strftime("%Y-%m-%d"),
            "stale": (today - last_date).days > STALE_DAYS[fc],
            "chg": {str(h): chg.get(h) for h in [1, 3, 6, 12]}, "sigH": sig_h,
            "dir": d, "signal": signal, "inflex": inflex, "pctl": pctl, "histY": hist_years,
            "series": compact(s, fc == "D"), "ma": ma,
        })

    blocks = []
    for bid, bname, bdesc in BLOCKS:
        sigs = [r["signal"] for r in rows if r["block"] == bid and r["signal"] is not None]
        score = float(np.mean(sigs)) if sigs else 0.0
        blocks.append({"id": bid, "name": bname, "desc": bdesc, "score": score,
                       "pos": sum(1 for x in sigs if x > 0), "neg": sum(1 for x in sigs if x < 0),
                       "n": len(sigs)})

    if missing:
        print("No data:", ", ".join(missing))
    stale = [r["name"] for r in rows if r["stale"]]
    if stale:
        print("Stale:", ", ".join(stale))
    # A source outage should not wipe the page: keep yesterday's file instead.
    if len(rows) < 0.75 * len(IND):
        print(f"Only {len(rows)}/{len(IND)} indicators; not writing {out_path}", file=sys.stderr)
        sys.exit(1)

    payload = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
               "blocks": blocks, "rows": rows, "missing": missing}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                        encoding="utf-8")
    print(f"OK: {len(rows)} indicators -> {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT)
