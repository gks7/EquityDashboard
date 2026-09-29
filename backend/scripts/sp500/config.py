"""Static configuration: XBRL tags, metric families, company groups."""

from __future__ import annotations

import datetime as dt

# First quarter of the series. The last quarter is the calendar quarter
# containing "today", so the series grows by itself.
FIRST_QUARTER = (2019, 1)

# Facts ending before this date are ignored (we need a year of history
# before FIRST_QUARTER to compute YoY and TTM figures).
MIN_FACT_END = 20180101

# Filings whose facts we trust. Amendments are included so "latest" values
# reflect restatements; 8-K facts (earnings releases) are excluded.
FORM_PREFIXES = ("10-Q", "10-K")

# A quarter counts as "reported" for the headline series once this share of
# its members has revenue. Earlier than that it is shown as in progress.
COMPLETE_COVERAGE = 0.90

# Revenue ratio bounds used to drop base breaks (spin-offs, mergers booked
# as a new registrant, tag switches) from growth aggregates.
RATIO_LO, RATIO_HI = 1 / 3, 3

MAG7 = {"AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"}

# AI hardware / infrastructure supply chain outside the Magnificent 7.
# Used only by the revenue-growth decomposition; edit freely.
AI_CHAIN = {
    "AVGO", "DELL", "MU", "AMD", "ANET", "SMCI", "ORCL", "SNDK", "WDC", "STX",
    "VRT", "LRCX", "AMAT", "KLAC", "APH", "GLW", "HPE", "CSCO", "CEG", "VST",
    "PWR", "ETN", "GEV", "COHR", "LITE", "CIEN", "TER", "PLTR",
}

# A run fails rather than publish headline numbers without these members.
LARGEST = {
    "AAPL", "AMZN", "BRK.B", "CAH", "CI", "CNC", "COR", "COST", "CVS", "CVX", "ELV", "GM",
    "GOOGL", "HD", "JPM", "MCK", "META", "MPC", "MSFT", "NVDA", "PSX", "UNH", "WMT", "XOM",
}

# Companies whose revenue moved more than this YoY (and are not in another
# group) are treated as M&A / base effects in the decomposition.
OUTLIER_GROWTH = 0.40

SECTORS = [
    "Communication Services", "Consumer Discretionary", "Consumer Staples",
    "Energy", "Financials", "Health Care", "Industrials",
    "Information Technology", "Materials", "Real Estate", "Utilities",
]

REV = [
    "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet",
    "RegulatedAndUnregulatedOperatingRevenue", "ElectricUtilityRevenue",
    "ElectricAndGasUtilityRevenue", "HealthCareOrganizationRevenue",
    "RealEstateRevenueNet", "FinancialServicesRevenue", "OilAndGasRevenue",
    "RevenueMineralSales", "OperatingLeasesIncomeStatementLeaseRevenue",
    "OperatingLeaseLeaseIncome",
]
COGS = [
    "CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
]
DA = [
    "DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization", "DepreciationAmortizationAndOther",
]
INT = ["InterestExpenseNonoperating", "InterestExpense", "InterestExpenseDebt"]
CAPEX = [
    "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets",
    "PaymentsToAcquireOilAndGasPropertyAndEquipment",
]
PRETAX = [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
]
BUYBACK = ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"]
DIVIDEND = ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends"]
DEBT_ISS = [
    "ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromIssuanceOfDebt",
    "ProceedsFromIssuanceOfSeniorLongTermDebt", "ProceedsFromIssuanceOfUnsecuredDebt",
    "ProceedsFromDebtNetOfIssuanceCosts", "ProceedsFromIssuanceOfLongTermDebtAndCapitalSecuritiesNet",
]
DEBT_ISS_PARTS = [
    "ProceedsFromConvertibleDebt", "ProceedsFromIssuanceOfSecuredDebt", "ProceedsFromNotesPayable",
    "ProceedsFromBankDebt", "ProceedsFromLinesOfCredit", "ProceedsFromIssuanceOfSubordinatedLongTermDebt",
    "ProceedsFromFederalHomeLoanBankBorrowings", "ProceedsFromShortTermDebtMaturingInMoreThanThreeMonths",
]
DEBT_REP = [
    "RepaymentsOfLongTermDebt", "RepaymentsOfDebt", "RepaymentsOfSeniorDebt",
    "RepaymentsOfUnsecuredDebt", "RepaymentsOfDebtAndCapitalLeaseObligations",
    "RepaymentsOfLongTermDebtAndCapitalSecurities",
]
DEBT_REP_PARTS = [
    "RepaymentsOfConvertibleDebt", "RepaymentsOfSecuredDebt", "RepaymentsOfNotesPayable",
    "RepaymentsOfBankDebt", "RepaymentsOfLinesOfCredit", "RepaymentsOfSubordinatedDebt",
    "RepaymentsOfFederalHomeLoanBankBorrowings", "RepaymentsOfShortTermDebtMaturingInMoreThanThreeMonths",
]
DEBT_NET_ST = [
    "ProceedsFromRepaymentsOfCommercialPaper", "ProceedsFromRepaymentsOfShortTermDebt",
    "ProceedsFromRepaymentsOfLinesOfCredit", "ProceedsFromRepaymentsOfBankOverdrafts",
    "ProceedsFromRepaymentsOfShortTermDebtMaturingInThreeMonthsOrLess",
]
# Balance-sheet (instant) tags.
INSTANT = [
    "LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "DebtCurrent",
    "ShortTermBorrowings", "CommercialPaper", "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtAndCapitalLeaseObligationsCurrent", "DebtLongtermAndShorttermCombinedAmount",
    "OtherShortTermBorrowings", "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash",
    "ShortTermInvestments", "MarketableSecuritiesCurrent", "CommonStockSharesOutstanding",
    "StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "Assets",
]
SHARE_AVG = ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"]

# Every us-gaap tag the pipeline downloads.
TAGS = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
    "RegulatedAndUnregulatedOperatingRevenue",
    "ElectricUtilityRevenue",
    "ElectricAndGasUtilityRevenue",
    "HealthCareOrganizationRevenue",
    "RealEstateRevenueNet",
    "FinancialServicesRevenue",
    "OilAndGasRevenue",
    "RevenueMineralSales",
    "OperatingLeasesIncomeStatementLeaseRevenue",
    "OperatingLeaseLeaseIncome",
    "RevenuesNetOfInterestExpense",
    "InterestIncomeExpenseNet",
    "NoninterestIncome",
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
    "CostOfServices",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
    "GrossProfit",
    "OperatingIncomeLoss",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "InterestExpense",
    "InterestExpenseNonoperating",
    "InterestExpenseDebt",
    "InterestIncomeExpenseNonoperatingNet",
    "InterestPaidNet",
    "IncomeTaxExpenseBenefit",
    "NetIncomeLoss",
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
    "Depreciation",
    "AmortizationOfIntangibleAssets",
    "DepreciationAmortizationAndOther",
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PaymentsForCapitalImprovements",
    "PaymentsToAcquireOilAndGasPropertyAndEquipment",
    "PaymentsToAcquireOtherPropertyPlantAndEquipment",
    "LongTermDebt",
    "LongTermDebtNoncurrent",
    "LongTermDebtCurrent",
    "DebtCurrent",
    "ShortTermBorrowings",
    "CommercialPaper",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "DebtLongtermAndShorttermCombinedAmount",
    "OtherShortTermBorrowings",
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "Cash",
    "ShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "PaymentsForRepurchaseOfCommonStock",
    "PaymentsForRepurchaseOfEquity",
    "PaymentsOfDividends",
    "PaymentsOfDividendsCommonStock",
    "PaymentsOfOrdinaryDividends",
    "ProceedsFromIssuanceOfLongTermDebt",
    "ProceedsFromIssuanceOfDebt",
    "ProceedsFromIssuanceOfSeniorLongTermDebt",
    "ProceedsFromIssuanceOfUnsecuredDebt",
    "ProceedsFromDebtNetOfIssuanceCosts",
    "RepaymentsOfLongTermDebt",
    "RepaymentsOfDebt",
    "RepaymentsOfSeniorDebt",
    "RepaymentsOfUnsecuredDebt",
    "ProceedsFromRepaymentsOfCommercialPaper",
    "ProceedsFromRepaymentsOfShortTermDebt",
    "ProceedsFromShortTermDebt",
    "RepaymentsOfShortTermDebt",
    "ProceedsFromRepaymentsOfDebt",
    "ProceedsFromIssuanceOfCommonStock",
    "ProceedsFromStockOptionsExercised",
    "ShareBasedCompensation",
    "AllocatedShareBasedCompensationExpense",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "CommonStockSharesOutstanding",
    "EarningsPerShareDiluted",
    "EarningsPerShareBasic",
    "RepaymentsOfDebtAndCapitalLeaseObligations",
    "RepaymentsOfLongTermDebtAndCapitalSecurities",
    "ProceedsFromIssuanceOfLongTermDebtAndCapitalSecuritiesNet",
    "ProceedsFromRepaymentsOfLongTermDebtAndCapitalSecurities",
    "RepaymentsOfConvertibleDebt",
    "ProceedsFromConvertibleDebt",
    "RepaymentsOfSecuredDebt",
    "ProceedsFromIssuanceOfSecuredDebt",
    "RepaymentsOfNotesPayable",
    "ProceedsFromNotesPayable",
    "ProceedsFromBankDebt",
    "RepaymentsOfBankDebt",
    "ProceedsFromLinesOfCredit",
    "RepaymentsOfLinesOfCredit",
    "ProceedsFromRepaymentsOfLinesOfCredit",
    "ProceedsFromRepaymentsOfBankOverdrafts",
    "ProceedsFromRepaymentsOfShortTermDebtMaturingInThreeMonthsOrLess",
    "ProceedsFromShortTermDebtMaturingInMoreThanThreeMonths",
    "RepaymentsOfShortTermDebtMaturingInMoreThanThreeMonths",
    "ProceedsFromIssuanceOfSubordinatedLongTermDebt",
    "RepaymentsOfSubordinatedDebt",
    "ProceedsFromFederalHomeLoanBankBorrowings",
    "RepaymentsOfFederalHomeLoanBankBorrowings",
    "PaymentsForRepurchaseOfCommonStockForEmployeeTaxWithholdingObligations",
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "Assets",
    "OperatingLeaseLiability",
    "Liabilities",
]


def quarter_list(today: dt.date | None = None) -> list[tuple[int, int]]:
    """Calendar quarters from FIRST_QUARTER through the one containing today."""
    today = today or dt.date.today()
    last = (today.year, (today.month - 1) // 3 + 1)
    out, (y, q) = [], FIRST_QUARTER
    while (y, q) <= last:
        out.append((y, q))
        y, q = (y + 1, 1) if q == 4 else (y, q + 1)
    return out


def qlabel(yq: tuple[int, int]) -> str:
    """(2026, 2) -> '2Q26'."""
    return f"{yq[1]}Q{str(yq[0])[2:]}"


def quarter_end(yq: tuple[int, int]) -> dt.date:
    y, q = yq
    m = 3 * q
    return dt.date(y, m, 31 if m in (3, 12) else 30)
