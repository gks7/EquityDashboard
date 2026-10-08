"""Seed the asset master used by the performance engine (public identifiers only: tickers, ISINs, names)."""
from django.db import migrations

ASSETS = [
    {
        "asset_id": "AMZN",
        "name": "Amazon.com",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Consumo discricionário",
        "isin": "US0231351067",
        "statement_pattern": "Amazon",
        "tickers": "AMZN,AMZN US"
    },
    {
        "asset_id": "APO",
        "name": "Apollo Global Management",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Financeiro",
        "isin": "US03769M1062",
        "statement_pattern": "Apollo Global",
        "tickers": "APO,APO US"
    },
    {
        "asset_id": "ARGENT 0.75 07/09/30",
        "name": "ARGENT 0.75 07/09/30",
        "asset_class": "Fixed Income",
        "sub_class": "Sovereign Bond",
        "sector": "",
        "isin": "US040114HS26",
        "statement_pattern": "Argentine Republic",
        "tickers": "ARGENT 0.75 07/09/30"
    },
    {
        "asset_id": "ASML",
        "name": "ASML Holding (ADR)",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Tecnologia",
        "isin": "USN070592100",
        "statement_pattern": "ASML",
        "tickers": "ASML,ASML US"
    },
    {
        "asset_id": "AVGO",
        "name": "Broadcom",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Tecnologia",
        "isin": "US11135F1012",
        "statement_pattern": "Broadcom",
        "tickers": "AVGO,AVGO US"
    },
    {
        "asset_id": "BACR 4.836 05/09/28",
        "name": "BACR 4.836 05/09/28",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "BACR 4.836 05/09/28"
    },
    {
        "asset_id": "BANBRA 6.25 04/18/30",
        "name": "BANBRA 6.25 04/18/30",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USP2000TAB19",
        "statement_pattern": "Banco do Brasil",
        "tickers": "BANBRA 6.25 04/18/30"
    },
    {
        "asset_id": "BCRED 7.05 09/29/25",
        "name": "BCRED 7.05 09/29/25",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "BCRED 7.05 09/29/25"
    },
    {
        "asset_id": "BN",
        "name": "Brookfield Corp",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Financeiro",
        "isin": "CA11271J1075",
        "statement_pattern": "Brookfield Corp",
        "tickers": "BN,BN US"
    },
    {
        "asset_id": "BNP 4.625 Perp",
        "name": "BNP 4.625 Perp",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USF1067PAB25",
        "statement_pattern": "BNP Paribas",
        "tickers": "BNP 4.625 Perp"
    },
    {
        "asset_id": "BRK/B",
        "name": "BRK/B",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Financeiro",
        "isin": "",
        "statement_pattern": "",
        "tickers": "BRK/B,BRK/B US"
    },
    {
        "asset_id": "CHTR 6.375 09/01/29",
        "name": "CHTR 6.375 09/01/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USU12501BQ19",
        "statement_pattern": "CCO Holdings",
        "tickers": "CHTR 6.375 09/01/29"
    },
    {
        "asset_id": "CMG",
        "name": "CMG",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Consumo discricionário",
        "isin": "",
        "statement_pattern": "",
        "tickers": "CMG,CMG US"
    },
    {
        "asset_id": "COCB",
        "name": "WisdomTree AT1 CoCo Bond",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BZ0XVG69",
        "statement_pattern": "AT1 Coco Bond",
        "tickers": "COCB LN EQUITY,COCB LN"
    },
    {
        "asset_id": "CSAN",
        "name": "Cosan (ADR)",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Energia / Holding",
        "isin": "US22113B1035",
        "statement_pattern": "Cosan",
        "tickers": "CSAN,CSAN US,CSANY"
    },
    {
        "asset_id": "CSNABZ 4.625 06/10/31",
        "name": "CSNABZ 4.625 06/10/31",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USL21779AJ97",
        "statement_pattern": "CSN Resources",
        "tickers": "CSNABZ 4.625 06/10/31"
    },
    {
        "asset_id": "CSU",
        "name": "Constellation Software",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Tecnologia",
        "isin": "CA21037X1006",
        "statement_pattern": "Constellation Software",
        "tickers": "CSU.TO,CSU CN,CSU"
    },
    {
        "asset_id": "GOOGL",
        "name": "Alphabet",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Comunicação",
        "isin": "US02079K3059",
        "statement_pattern": "Alphabet",
        "tickers": "GOOGL,GOOGL US"
    },
    {
        "asset_id": "HUBB",
        "name": "Hubbell",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Industrial",
        "isin": "US4435106079",
        "statement_pattern": "Hubbell",
        "tickers": "HUBB,HUBB US"
    },
    {
        "asset_id": "HYCB",
        "name": "iShares Broad USD HY Corp",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00098G6RH2",
        "statement_pattern": "Broad USD High Yield",
        "tickers": "HYCB NA EQUITY,HYCB NA"
    },
    {
        "asset_id": "HYGU",
        "name": "iShares Euro HY Corp (USD-hedged)",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BF3NC260",
        "statement_pattern": "Euro High Yield Corp Bond UCITS ETF USD-hedged",
        "tickers": "HYGU LN EQUITY,HYGU LN"
    },
    {
        "asset_id": "HYLA",
        "name": "iShares Global HY Corp",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BYWZ0440",
        "statement_pattern": "Global High Yield Corp Bond",
        "tickers": "HYLA LN EQUITY,HYLA LN"
    },
    {
        "asset_id": "IHYA",
        "name": "iShares USD HY Corp",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BYXYYL56",
        "statement_pattern": "iShares USD High Yield Corp\\. Bond",
        "tickers": "IHYA LN EQUITY,IHYA LN"
    },
    {
        "asset_id": "ITAU 4.5 11/21/29",
        "name": "ITAU 4.5 11/21/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "ITAU 4.5 11/21/29"
    },
    {
        "asset_id": "KLAB 5.75 04/03/29",
        "name": "KLAB 5.75 04/03/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "KLAB 5.75 04/03/29"
    },
    {
        "asset_id": "LQDA",
        "name": "iShares USD Corp Bond (IG)",
        "asset_class": "Fixed Income",
        "sub_class": "IG ETF",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "LQDA"
    },
    {
        "asset_id": "LVMUY",
        "name": "LVMH (ADR)",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Consumo discricionário",
        "isin": "US5024413065",
        "statement_pattern": "LVMH",
        "tickers": "LVMUY,LVMUY US"
    },
    {
        "asset_id": "MA",
        "name": "Mastercard",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Financeiro",
        "isin": "US57636Q1040",
        "statement_pattern": "Mastercard",
        "tickers": "MA,MA US"
    },
    {
        "asset_id": "META",
        "name": "Meta Platforms",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Comunicação",
        "isin": "US30303M1027",
        "statement_pattern": "Meta Platforms",
        "tickers": "META,META US"
    },
    {
        "asset_id": "MSFT",
        "name": "Microsoft",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Tecnologia",
        "isin": "US5949181045",
        "statement_pattern": "Microsoft",
        "tickers": "MSFT,MSFT US"
    },
    {
        "asset_id": "NATURA 4.125 05/03/28",
        "name": "NATURA 4.125 05/03/28",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USP7088CAC03",
        "statement_pattern": "Natura",
        "tickers": "NATURA 4.125 05/03/28"
    },
    {
        "asset_id": "NKE",
        "name": "Nike",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Consumo discricionário",
        "isin": "US6541061031",
        "statement_pattern": "Nike",
        "tickers": "NKE,NKE US"
    },
    {
        "asset_id": "NVDA",
        "name": "NVIDIA",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Tecnologia",
        "isin": "US67066G1040",
        "statement_pattern": "NVIDIA",
        "tickers": "NVDA,NVDA US"
    },
    {
        "asset_id": "PEMEX 5.95 01/28/31",
        "name": "PEMEX 5.95 01/28/31",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "US71654QDE98",
        "statement_pattern": "PEMEX",
        "tickers": "PEMEX 5.95 01/28/31"
    },
    {
        "asset_id": "PETROBRAS 6.85 06/05/2115",
        "name": "PETROBRAS 6.85 06/05/2115",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "US71647NAN93",
        "statement_pattern": "Petrobras Global",
        "tickers": "PETROBRAS 6.85 06/05/2115"
    },
    {
        "asset_id": "POWR",
        "name": "iShares U.S. Power Infrastructure ETF",
        "asset_class": "Equity",
        "sub_class": "Thematic ETF",
        "sector": "ETF infraestrutura elétrica",
        "isin": "US4642863439",
        "statement_pattern": "U\\.S\\. Power Infrastructure",
        "tickers": "POWR,POWR US"
    },
    {
        "asset_id": "QQQ",
        "name": "Invesco QQQ (Nasdaq-100)",
        "asset_class": "Equity",
        "sub_class": "Index ETF",
        "sector": "ETF Nasdaq-100",
        "isin": "US46090E1038",
        "statement_pattern": "Invesco QQQ",
        "tickers": "QQQ,QQQ US"
    },
    {
        "asset_id": "RDEDOR 4.5 01/22/30",
        "name": "RDEDOR 4.5 01/22/30",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USL7915TAA09",
        "statement_pattern": "Rede D'Or",
        "tickers": "RDEDOR 4.5 01/22/30"
    },
    {
        "asset_id": "RRRPBZ 9.75 02/05/31",
        "name": "RRRPBZ 9.75 02/05/31",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USL9R621AA97",
        "statement_pattern": "3R LUX",
        "tickers": "RRRPBZ 9.75 02/05/31"
    },
    {
        "asset_id": "RSP",
        "name": "RSP",
        "asset_class": "Equity",
        "sub_class": "Index ETF",
        "sector": "ETF S&P 500 equal-weight",
        "isin": "",
        "statement_pattern": "",
        "tickers": "RSP,RSP US"
    },
    {
        "asset_id": "SANUSA 6.565 06/12/29",
        "name": "SANUSA 6.565 06/12/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "SANUSA 6.565 06/12/29"
    },
    {
        "asset_id": "SDHA",
        "name": "iShares USD Short Duration HY",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BZ17CN18",
        "statement_pattern": "USD Short Duration High Yield",
        "tickers": "SDHA LN EQUITY,SDHA LN"
    },
    {
        "asset_id": "SOCGEN 4.75 Perp",
        "name": "SOCGEN 4.75 Perp",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USF8500RAB80",
        "statement_pattern": "Soci.t. G.n.rale",
        "tickers": "SOCGEN 4.75 Perp"
    },
    {
        "asset_id": "SPY",
        "name": "SPDR S&P 500 ETF",
        "asset_class": "Equity",
        "sub_class": "Index ETF",
        "sector": "ETF S&P 500",
        "isin": "US78462F1030",
        "statement_pattern": "SPDR S&P 500",
        "tickers": "SPY,SPY US"
    },
    {
        "asset_id": "STYC",
        "name": "PIMCO US Short-Term HY",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "IE00BVZ6SQ11",
        "statement_pattern": "Advantage US Short-Term High Yield",
        "tickers": "STYC LN EQUITY,STYC LN"
    },
    {
        "asset_id": "SYF 4.50 07/23/25",
        "name": "SYF 4.50 07/23/25",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "SYF 4.50 07/23/25"
    },
    {
        "asset_id": "SYF 5.15 03/19/29",
        "name": "SYF 5.15 03/19/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "SYF 5.15 03/19/29"
    },
    {
        "asset_id": "T 0 12/10/26",
        "name": "T 0 12/10/26",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "US912797VG91",
        "statement_pattern": "US Treasury Bills 11\\.06\\.2026-10\\.12\\.2026",
        "tickers": "T 0 12/10/26"
    },
    {
        "asset_id": "T 4.125 02/15/36",
        "name": "T 4.125 02/15/36",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "US91282CPZ85",
        "statement_pattern": "US Treasury Notes 2026-15\\.02\\.2036",
        "tickers": "T 4.125 02/15/36"
    },
    {
        "asset_id": "T 4.125 03/31/32",
        "name": "T 4.125 03/31/32",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "US91282CMT52",
        "statement_pattern": "US Treasury Notes 2025-31\\.03\\.2032",
        "tickers": "T 4.125 03/31/32"
    },
    {
        "asset_id": "T 5 05/15/45",
        "name": "T 5 05/15/45",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "T 5 05/15/45"
    },
    {
        "asset_id": "TII 0.625 02/15/43",
        "name": "TII 0.625 02/15/43",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "TII 0.625 02/15/43"
    },
    {
        "asset_id": "Tbill 09/02/25",
        "name": "Tbill 09/02/25",
        "asset_class": "Fixed Income",
        "sub_class": "US Treasury",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "Tbill 09/02/25"
    },
    {
        "asset_id": "UBER",
        "name": "UBER",
        "asset_class": "Equity",
        "sub_class": "Stock",
        "sector": "Industrial",
        "isin": "",
        "statement_pattern": "",
        "tickers": "UBER,UBER US"
    },
    {
        "asset_id": "UBS 6.537 08/12/33",
        "name": "UBS 6.537 08/12/33",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "UBS 6.537 08/12/33"
    },
    {
        "asset_id": "UGPABZ 5.25 10/06/26",
        "name": "UGPABZ 5.25 10/06/26",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "USL9412AAA53",
        "statement_pattern": "Ultrapar",
        "tickers": "UGPABZ 5.25 10/06/26"
    },
    {
        "asset_id": "UGPABZ 5.250 06/06/29",
        "name": "UGPABZ 5.250 06/06/29",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "UGPABZ 5.250 06/06/29"
    },
    {
        "asset_id": "VALEBZ 6.125 06/12/33",
        "name": "VALEBZ 6.125 06/12/33",
        "asset_class": "Fixed Income",
        "sub_class": "Corporate Bond",
        "sector": "",
        "isin": "US91911TAR41",
        "statement_pattern": "Vale Overseas",
        "tickers": "VALEBZ 6.125 06/12/33"
    },
    {
        "asset_id": "WIAU",
        "name": "WIAU",
        "asset_class": "Fixed Income",
        "sub_class": "HY ETF",
        "sector": "",
        "isin": "",
        "statement_pattern": "",
        "tickers": "WIAU"
    }
]


def seed(apps, schema_editor):
    AssetAlias = apps.get_model('finance', 'AssetAlias')
    for row in ASSETS:
        AssetAlias.objects.update_or_create(asset_id=row['asset_id'], defaults=row)


def unseed(apps, schema_editor):
    apps.get_model('finance', 'AssetAlias').objects.filter(asset_id__in=[r['asset_id'] for r in ASSETS]).delete()


class Migration(migrations.Migration):
    dependencies = [('finance', '0023_performance_engine')]
    operations = [migrations.RunPython(seed, unseed)]
