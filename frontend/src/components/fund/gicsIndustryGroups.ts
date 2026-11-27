// ─── GICS Level 2 (Industry Group) ──────────────────────────────────
// The Sector Exposure panel names sectors the way Yahoo does ("Consumer Cyclical",
// "Financial Services", ...), since that is where Stock.sector comes from. The drill-down
// below each sector uses the GICS Industry Groups, filed under that Yahoo sector name.

/** S&P 500 weight (%) of each GICS Industry Group, under the panel's sector names.
 *  Built from the SPY holdings file (State Street, as of 25-Nov-2026) joined with the
 *  GICS sub-industry of each constituent; sector weights are the sums of these. */
export const SP500_INDUSTRY_GROUPS: Record<string, Record<string, number>> = {
  Technology: {
    "Semiconductors & Semiconductor Equipment": 13.39,
    "Technology Hardware & Equipment": 11.36,
    "Software & Services": 9.92,
  },
  "Financial Services": {
    "Financial Services": 7.69,
    Banks: 3.24,
    Insurance: 1.84,
  },
  Healthcare: {
    "Pharmaceuticals, Biotechnology & Life Sciences": 7.21,
    "Health Care Equipment & Services": 3.52,
  },
  "Consumer Cyclical": {
    "Consumer Discretionary Distribution & Retail": 5.6,
    "Automobiles & Components": 1.94,
    "Consumer Services": 1.69,
    "Consumer Durables & Apparel": 0.43,
  },
  "Communication Services": {
    "Media & Entertainment": 8.2,
    "Telecommunication Services": 0.72,
  },
  Industrials: {
    "Capital Goods": 6.12,
    Transportation: 1.36,
    "Commercial & Professional Services": 0.87,
  },
  "Consumer Defensive": {
    "Food, Beverage & Tobacco": 2.31,
    "Consumer Staples Distribution & Retail": 2.12,
    "Household & Personal Products": 1.0,
  },
  Energy: { Energy: 3.56 },
  Utilities: { Utilities: 2.2 },
  "Real Estate": {
    "Equity REITs": 1.84,
    "Real Estate Management & Development": 0.09,
  },
  "Basic Materials": { Materials: 1.78 },
};

/** S&P 500 sector weights (%), the sum of each sector's industry groups. */
export const SP500_SECTORS: Record<string, number> = Object.fromEntries(
  Object.entries(SP500_INDUSTRY_GROUPS).map(([sec, groups]) => [
    sec,
    Math.round(Object.values(groups).reduce((s, w) => s + w, 0) * 100) / 100,
  ])
);

export const UNCLASSIFIED = "Unclassified";

// Sectors that GICS does not split any further.
const SINGLE_GROUP: Record<string, string> = {
  Energy: "Energy",
  Utilities: "Utilities",
  "Basic Materials": "Materials",
};

// Yahoo industry → GICS Industry Group. Keys are normalised by `norm` below.
const BY_INDUSTRY: Record<string, string[]> = {
  "Software & Services": [
    "Software - Application", "Software - Infrastructure", "Information Technology Services",
  ],
  "Technology Hardware & Equipment": [
    "Consumer Electronics", "Computer Hardware", "Communication Equipment", "Electronic Components",
    "Scientific & Technical Instruments", "Electronics & Computer Distribution",
  ],
  "Semiconductors & Semiconductor Equipment": [
    "Semiconductors", "Semiconductor Equipment & Materials", "Solar",
  ],
  "Media & Entertainment": [
    "Internet Content & Information", "Entertainment", "Electronic Gaming & Multimedia",
    "Advertising Agencies", "Broadcasting", "Publishing",
  ],
  "Telecommunication Services": ["Telecom Services"],
  "Consumer Discretionary Distribution & Retail": [
    "Internet Retail", "Specialty Retail", "Home Improvement Retail", "Apparel Retail",
    "Department Stores", "Auto & Truck Dealerships",
  ],
  "Automobiles & Components": ["Auto Manufacturers", "Auto Parts", "Recreational Vehicles"],
  "Consumer Durables & Apparel": [
    "Apparel Manufacturing", "Footwear & Accessories", "Furnishings, Fixtures & Appliances",
    "Residential Construction", "Textile Manufacturing", "Luxury Goods", "Leisure",
  ],
  "Consumer Services": [
    "Restaurants", "Lodging", "Resorts & Casinos", "Gambling", "Travel Services",
    "Personal Services", "Education & Training Services",
  ],
  "Consumer Staples Distribution & Retail": [
    "Discount Stores", "Grocery Stores", "Food Distribution", "Pharmaceutical Retailers",
  ],
  "Food, Beverage & Tobacco": [
    "Beverages - Non-Alcoholic", "Beverages - Brewers", "Beverages - Wineries & Distilleries",
    "Confectioners", "Packaged Foods", "Farm Products", "Tobacco",
  ],
  "Household & Personal Products": ["Household & Personal Products"],
  "Pharmaceuticals, Biotechnology & Life Sciences": [
    "Drug Manufacturers - General", "Drug Manufacturers - Specialty & Generic", "Biotechnology",
    "Diagnostics & Research",
  ],
  "Health Care Equipment & Services": [
    "Medical Devices", "Medical Instruments & Supplies", "Healthcare Plans", "Medical Care Facilities",
    "Medical Distribution", "Health Information Services",
  ],
  Banks: ["Banks - Diversified", "Banks - Regional"],
  Insurance: [
    "Insurance - Life", "Insurance - Property & Casualty", "Insurance - Diversified",
    "Insurance - Reinsurance", "Insurance - Specialty", "Insurance Brokers",
  ],
  "Financial Services": [
    "Credit Services", "Asset Management", "Capital Markets", "Financial Data & Stock Exchanges",
    "Financial Conglomerates", "Mortgage Finance", "Shell Companies",
  ],
  "Capital Goods": [
    "Aerospace & Defense", "Specialty Industrial Machinery", "Farm & Heavy Construction Machinery",
    "Building Products & Equipment", "Engineering & Construction", "Electrical Equipment & Parts",
    "Conglomerates", "Industrial Distribution", "Tools & Accessories", "Metal Fabrication",
    "Pollution & Treatment Controls", "Rental & Leasing Services", "Infrastructure Operations",
  ],
  "Commercial & Professional Services": [
    "Specialty Business Services", "Consulting Services", "Staffing & Employment Services",
    "Waste Management", "Security & Protection Services", "Business Equipment & Supplies",
  ],
  Transportation: [
    "Integrated Freight & Logistics", "Airlines", "Railroads", "Trucking", "Marine Shipping",
    "Airports & Air Services",
  ],
  Materials: ["Packaging & Containers"],
};

// Where Yahoo's industry and GICS disagree for a name we care about.
const BY_TICKER: Record<string, string> = {
  BRK: "Financial Services", // Yahoo: Insurance - Diversified; GICS: Multi-Sector Holdings
};

// Yahoo has written these with an em dash ("Software—Infrastructure") and with " - ".
const norm = (s: string) => s.toLowerCase().replace(/\s*[-–—]\s*/g, " - ").replace(/\s+/g, " ").trim();

const INDUSTRY_TO_GROUP: Record<string, string> = Object.fromEntries(
  Object.entries(BY_INDUSTRY).flatMap(([group, inds]) => inds.map((i) => [norm(i), group]))
);

/** GICS Industry Group of a stock, from its Yahoo sector/industry (and ticker overrides). */
export function industryGroupOf(sector: string, industry: string | null | undefined, ticker: string): string {
  if (BY_TICKER[ticker]) return BY_TICKER[ticker];
  if (SINGLE_GROUP[sector]) return SINGLE_GROUP[sector];
  const ind = industry || "";
  if (sector === "Real Estate") {
    return /reit/i.test(ind) ? "Equity REITs" : ind ? "Real Estate Management & Development" : UNCLASSIFIED;
  }
  return INDUSTRY_TO_GROUP[norm(ind)] || UNCLASSIFIED;
}
