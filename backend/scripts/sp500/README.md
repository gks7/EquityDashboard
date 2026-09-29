# S&P 500 fundamentals pipeline

Builds `frontend/public/data/sp500.json`, read by the **S&P 500** page
(`frontend/src/app/sp500`). Runs every night in GitHub Actions
(`.github/workflows/sp500-data-refresh.yml`, 02:15 UTC) and commits the new
file, like the Macro page does with `macro.json`.

## Sources

| What | Where |
|---|---|
| Quarterly financials | SEC EDGAR `companyfacts` API, 10-Q/10-K facts only |
| Filings not yet in companyfacts | the filing's XBRL instance (`*_htm.xml`), found via the `submissions` API |
| Index members and changes | Wikipedia, *List of S&P 500 companies* and *Historical components of the S&P 500* |
| Nominal GDP, broad dollar | FRED `GDP`, `DTWEXBGS` |

## Method

* **Point in time.** Each quarter's aggregate uses the companies in the index
  at that quarter's end, including those that later left (129 since 2019).
  Membership lives in `data/membership.json` (one bit per quarter, keyed by
  CIK). Closed quarters are frozen; the open quarter is rebuilt each day.
* **Calendar quarters.** Fiscal quarters are mapped to the calendar quarter
  they mostly cover. Q4 = fiscal year − 9 months; cash-flow YTD figures are
  differenced.
* **Growth** compares the same companies a year apart and skips base breaks
  (revenue ratio outside 1/3–3).
* **Headline quarter** is the latest quarter where 90% of members have
  reported. Later quarters show as "in progress".
* EBIT, margins, net debt and ROIC exclude Financials; net debt/EBITDA also
  excludes Real Estate. ROIC = EBIT TTM × (1 − effective tax, clamped 0–40%)
  / average (equity incl. minorities + debt − cash).
* Revenue decomposition (ex-energy): Magnificent 7, AI supply chain
  (`config.AI_CHAIN`), Financials, M&A/base effects (|growth| > 40%) and the
  core. Edit the lists in `config.py`.

## Running locally

```bash
pip install -r backend/requirements-sp500.txt
SEC_USER_AGENT="Your Company you@company.com" python -m backend.scripts.sp500.run
python -m unittest discover -s backend/scripts/sp500/tests -t .
```

A full run makes about 1,300 SEC requests (≈5 min at the SEC's 10 req/s
limit). If sanity checks fail (too many companies missing, implausible
growth) the script exits with an error and writes nothing, so the site keeps
the previous day's data and GitHub emails the repo owner.
