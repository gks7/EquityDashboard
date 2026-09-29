"""S&P 500 fundamentals pipeline (SEC EDGAR -> frontend/public/data/sp500.json).

Run from the repo root:

    python -m backend.scripts.sp500.run            # full refresh
    python -m unittest discover -s backend/scripts/sp500/tests -t .

See backend/scripts/sp500/README.md for the method.
"""
