const { load } = require("cheerio");
const { getTickertape } = require("./TickertapeService");
const { getStockAnalysis } = require("./StockAnalysisService");

const BASE_URL = "https://www.screener.in/company";

// ── Columns (kept for reference / consistent key ordering in output) ───────
const INDICATOR_COLUMNS = [
  "Market Cap (Cr)",
  "Current Price",
  "Score (out of 10)",
  "Revenue Growth YoY (%)",
  "EPS Growth YoY (%)",
  "Revenue CAGR 3Y (%)",
  "Revenue CAGR 5Y (%)",
  "Revenue CAGR 10Y (%)",
  "Profit CAGR 3Y (%)",
  "Profit CAGR 5Y (%)",
  "Profit CAGR 10Y (%)",
  "ROCE (%)",
  "ROE (%)",
  "ROA (%)",
  "Net Profit Margin (%)",
  "Operating Margin (%)",
  "Asset Turnover (x)",
  "Debt-to-Equity",
  "Interest Coverage",
  "Current Ratio",
  "Free Cash Flow (Cr)",
  "Operating Cash Flow (Cr)",
  "FCF Yield (%)",
  "OCF / PAT (%)",
  "Dividend Payout (%)",
  "PEG Ratio",
  "P/E Ratio",
  "Earnings Yield (%)",
  "P/B Ratio",
  "Dividend Yield (%)",
];

// The "10-Minute Stock Check" columns
const TEN_MIN_CHECK = [
  "Revenue Growth YoY (%)",
  "EPS Growth YoY (%)",
  "ROCE (%)",
  "ROE (%)",
  "Free Cash Flow (Cr)",
  "OCF / PAT (%)",
  "Debt-to-Equity",
  "Interest Coverage",
  "PEG Ratio",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNum(str) {
  if (!str || str === "-" || str === "") return NaN;
  const cleaned = String(str).replace(/[,%₹\s]/g, "").trim();
  return parseFloat(cleaned);
}

function getLatest(cells) {
  if (!cells || cells.length === 0) return "";
  for (let i = cells.length - 1; i >= 0; i--) {
    const val = cells[i].trim();
    if (val && val !== "-" && val !== "") return val;
  }
  return "";
}

function getPrevious(cells) {
  if (!cells || cells.length < 2) return "";
  let found = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const val = cells[i].trim();
    if (val && val !== "-" && val !== "") {
      found++;
      if (found === 2) return val;
    }
  }
  return "";
}

// Returns the last `n` non-empty values in chronological order (oldest -> newest)
function getLastN(cells, n) {
  if (!cells || cells.length === 0) return [];
  const valid = cells.map((c) => c.trim()).filter((v) => v && v !== "-" && v !== "");
  return valid.slice(-n);
}

function calcYoYGrowth(cells) {
  const latest = parseNum(getLatest(cells));
  const prev = parseNum(getPrevious(cells));
  if (isNaN(latest) || isNaN(prev) || prev === 0) return "";
  return (((latest - prev) / Math.abs(prev)) * 100).toFixed(2);
}

// Generic QoQ (quarter-over-quarter, i.e. sequential column) growth
function calcQoQGrowth(cells) {
  return calcYoYGrowth(cells); // same mechanics: latest vs immediately-previous column
}

function calcCAGR(cells, years) {
  if (!cells || cells.length < years + 1) return "";
  const valid = cells.filter((c) => {
    const v = c.trim();
    return v && v !== "-" && v !== "";
  });
  if (valid.length < years + 1) return "";

  const latest = parseNum(valid[valid.length - 1]);
  const older = parseNum(valid[valid.length - 1 - years]);
  if (isNaN(latest) || isNaN(older) || older <= 0) return "";
  return ((Math.pow(latest / older, 1 / years) - 1) * 100).toFixed(2);
}

async function fetchPage(symbol, reportType) {
  const finalUrl =
    reportType === "consolidated"
      ? `${BASE_URL}/${symbol}/`
      : `${BASE_URL}/${symbol}/`;

  const res = await fetch(finalUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${symbol} (${finalUrl})`);
  }

  return { html: await res.text(), url: res.url || finalUrl };
}

function pageHasData($) {
  const plRows = $("#profit-loss table.data-table tbody tr").length;
  const bsRows = $("#balance-sheet table.data-table tbody tr").length;
  const cfRows = $("#cash-flow table.data-table tbody tr").length;
  return plRows > 0 && bsRows > 0 && cfRows > 0;
}

/**
 * Try consolidated first (or whatever preferred type is passed); if the page
 * has no real data tables, fall back to standalone automatically.
 */
async function fetchBestAvailablePage(symbol, preferredReportType) {
  if (preferredReportType === "consolidated") {
    try {
      const { html } = await fetchPage(symbol, "consolidated");
      const $ = load(html);
      if (pageHasData($)) {
        return { html, reportTypeUsed: "consolidated" };
      }
    } catch (e) {
      // consolidated URL failed outright -> fall back
    }

    const { html: standaloneHtml } = await fetchPage(symbol, "standalone");
    return { html: standaloneHtml, reportTypeUsed: "standalone" };
  } else {
    const { html } = await fetchPage(symbol, "standalone");
    return { html, reportTypeUsed: "standalone" };
  }
}

function parseTable($, sectionId) {
  const section = $(`#${sectionId}`);
  const table = section.find("table.data-table").first();
  const rows = {};
  const headers = [];

  table
    .find("thead th")
    .each((_i, th) => {
      const h = $(th).text().trim();
      if (h) headers.push(h);
    });

  table.find("tbody tr").each((_i, tr) => {
    const rawLabel = $(tr).find("td.text").text().trim().replace(/\s+/g, " ");
    const label = rawLabel.replace(/\s*\+\s*$/, "").trim();
    if (!label) return;

    const cells = [];
    $(tr)
      .find("td:not(.text)")
      .each((_j, td) => {
        cells.push($(td).text().trim());
      });

    if (cells.length > 0) {
      rows[label] = cells;
    }
  });

  return { rows, headers };
}

// ── Quarterly results ───────────────────────────────────────────────────────
function parseQuarters($) {
  const result = {
    lastFourQuarters: [],
    qoq: {},
  };
  try {
    const { rows, headers } = parseTable($, "quarters");

    const salesRow = rows["Sales"] || [];
    const profitRow = rows["Net Profit"] || [];
    const epsRow = rows["EPS in Rs"] || [];
    const opmRow = rows["OPM %"] || [];

    result.qoq["Sales QoQ Growth (%)"] = calcQoQGrowth(salesRow);
    result.qoq["Net Profit QoQ Growth (%)"] = calcQoQGrowth(profitRow);
    result.qoq["EPS QoQ Growth (%)"] = calcQoQGrowth(epsRow);

    const n = 4;
    const qLabels = headers.slice(-n);
    const qSales = getLastN(salesRow, n);
    const qProfit = getLastN(profitRow, n);
    const qEps = getLastN(epsRow, n);
    const qOpm = getLastN(opmRow, n);

    for (let i = 0; i < qSales.length; i++) {
      result.lastFourQuarters.push({
        quarter: qLabels[qLabels.length - qSales.length + i] || `Q-${qSales.length - i}`,
        sales: qSales[i] ?? null,
        netProfit: qProfit[i] ?? null,
        eps: qEps[i] ?? null,
        opm: qOpm[i] ?? null,
      });
    }
  } catch {
    // leave defaults
  }
  return result;
}

// ── Shareholding pattern ────────────────────────────────────────────────────
function parseShareholding($) {
  const shareholding = {
    latest: {},
    trend: {},
    pledgePercent: null,
    numShareholders: null,
  };

  try {
    // screener.in renders shareholding under #shareholding, typically with a
    // quarterly view table.data-table (yearly view also exists behind a tab)
    const section = $("#shareholding");
    const table = section.find("table.data-table").first();
    if (table.length === 0) return shareholding;

    const rowsMap = {};
    table.find("tbody tr").each((_i, tr) => {
      const rawLabel = $(tr).find("td.text").text().trim().replace(/\s+/g, " ");
      const label = rawLabel.replace(/\s*\+\s*$/, "").trim();
      if (!label) return;
      const cells = [];
      $(tr)
        .find("td:not(.text)")
        .each((_j, td) => cells.push($(td).text().trim()));
      rowsMap[label] = cells;
    });

    const categories = ["Promoters", "FIIs", "DIIs", "Government", "Public", "Others"];
    categories.forEach((cat) => {
      const cells = rowsMap[cat];
      if (!cells) return;
      const latest = parseNum(getLatest(cells));
      const prev = parseNum(getPrevious(cells));
      shareholding.latest[cat] = isNaN(latest) ? null : latest;
      if (!isNaN(latest) && !isNaN(prev)) {
        const change = +(latest - prev).toFixed(2);
        shareholding.trend[cat] = {
          changeQoQ: change,
          direction: change > 0 ? "increasing" : change < 0 ? "decreasing" : "flat",
        };
      }
    });

    const pledgeRow =
      rowsMap["Pledged percentage"] || rowsMap["Promoter Pledge (%)"] || null;
    if (pledgeRow) {
      const latestPledge = parseNum(getLatest(pledgeRow));
      shareholding.pledgePercent = isNaN(latestPledge) ? 0 : latestPledge;
    }

    const shareholdersRow = rowsMap["No. of Shareholders"];
    if (shareholdersRow) {
      shareholding.numShareholders = getLatest(shareholdersRow) || null;
    }
  } catch {
    // leave defaults
  }

  return shareholding;
}

// ── Peer comparison ──────────────────────────────────────────────────────────
function parsePeers($) {
  const peers = [];
  try {
    const table = $("#peers table.data-table").first();
    if (table.length === 0) return peers;

    const headers = [];
    table.find("thead th").each((_i, th) => {
      headers.push($(th).text().trim());
    });

    table.find("tbody tr").each((_i, tr) => {
      const cells = [];
      $(tr)
        .find("td")
        .each((_j, td) => cells.push($(td).text().trim()));
      if (cells.length === 0) return;

      const entry = {};
      headers.forEach((h, idx) => {
        if (h) entry[h] = cells[idx] !== undefined ? cells[idx] : null;
      });
      // Skip the row that is the current company's own aggregate/footer if unnamed
      if (Object.keys(entry).length > 0) peers.push(entry);
    });
  } catch {
    // leave empty
  }
  return peers.slice(0, 10);
}

// ── Documents (annual reports / concalls / credit ratings) ─────────────────
function parseDocuments($) {
  const documents = { annualReports: [], concalls: [], creditRatings: [], announcements: [] };
  try {
    const docSection = $("#documents");

    docSection.find("a").each((_i, a) => {
      const text = $(a).text().trim().replace(/\s+/g, " ");
      const href = $(a).attr("href");
      if (!text || !href) return;

      const lower = text.toLowerCase();
      const item = { title: text, link: href.startsWith("http") ? href : `https://www.screener.in${href}` };

      if (lower.includes("transcript") || lower.includes("concall") || lower.includes("ppt")) {
        documents.concalls.push(item);
      } else if (lower.includes("annual report")) {
        documents.annualReports.push(item);
      } else if (lower.includes("credit rating")) {
        documents.creditRatings.push(item);
      } else {
        documents.announcements.push(item);
      }
    });

    // Trim to keep payload light — most recent few of each
    documents.annualReports = documents.annualReports.slice(0, 5);
    documents.concalls = documents.concalls.slice(0, 5);
    documents.creditRatings = documents.creditRatings.slice(0, 5);
    documents.announcements = documents.announcements.slice(0, 10);
  } catch {
    // leave defaults
  }
  return documents;
}

function parseAllData(html, symbol, reportTypeUsed) {
  const $ = load(html);
  const data = {};
  const errors = [];

  data["Symbol"] = symbol;
  data["Report Type"] = reportTypeUsed;

  // Company name
  try {
    data["Company"] = $("h1").first().text().trim() || "";
  } catch {
    data["Company"] = "";
    errors.push("company_name");
  }

  // Industry / sector (best-effort — layout varies)
  try {
    const sub = $(".company-info .sub, .company-links .sub").first().text().trim();
    data["Industry"] = sub || "";
  } catch {
    data["Industry"] = "";
  }

  // Top ratios
  let currentPrice = NaN;
  let bookValue = NaN;
  let pe = NaN;
  let marketCap = NaN;
  let faceValue = NaN;

  try {
    const ratios = {};
    $("#top-ratios li").each((_i, li) => {
      const name = $(li).find(".name").text().trim();
      if (!name) return;
      const numbers = [];
      $(li)
        .find(".number")
        .each((_j, numEl) => {
          numbers.push($(numEl).text().trim());
        });
      ratios[name] = numbers.length === 1 ? numbers[0] : numbers;
    });

    data["Market Cap (Cr)"] = ratios["Market Cap"] || "";
    data["Current Price"] = ratios["Current Price"] || "";
    data["ROCE (%)"] = ratios["ROCE"] || "";
    data["ROE (%)"] = ratios["ROE"] || "";
    data["P/E Ratio"] = ratios["Stock P/E"] || "";
    data["Dividend Yield (%)"] = ratios["Dividend Yield"] || "";
    data["Face Value"] = ratios["Face Value"] || "";
    data["Book Value"] = ratios["Book Value"] || "";
    data["High / Low"] = ratios["High / Low"] || "";

    currentPrice = parseNum(ratios["Current Price"]);
    bookValue = parseNum(ratios["Book Value"]);
    pe = parseNum(ratios["Stock P/E"]);
    marketCap = parseNum(ratios["Market Cap"]);
    faceValue = parseNum(ratios["Face Value"]);

    if (!isNaN(currentPrice) && !isNaN(bookValue) && bookValue > 0) {
      data["P/B Ratio"] = (currentPrice / bookValue).toFixed(2);
    } else {
      data["P/B Ratio"] = "";
    }

    if (!isNaN(pe) && pe > 0) {
      data["Earnings Yield (%)"] = ((1 / pe) * 100).toFixed(2);
    } else {
      data["Earnings Yield (%)"] = "";
    }
  } catch {
    errors.push("top_ratios");
  }

  // Profit & Loss
  let epsGrowthVal = NaN;
  let latestSales = NaN;
  let latestProfit = NaN;
  let prevProfit = NaN;
  let latestDividendPerShare = NaN;
  let latestEps = NaN;

  try {
    const { rows: pl } = parseTable($, "profit-loss");

    const salesRow = pl["Sales"] || [];
    const profitRow = pl["Net Profit"] || [];
    const epsRow = pl["EPS in Rs"] || [];
    const opmRow = pl["OPM %"] || [];
    const opRow = pl["Operating Profit"] || [];
    const intRow = pl["Interest"] || [];
    const divPayoutRow = pl["Dividend Payout %"] || [];

    data["Revenue Growth YoY (%)"] = calcYoYGrowth(salesRow);
    data["EPS Growth YoY (%)"] = calcYoYGrowth(epsRow);
    epsGrowthVal = parseFloat(data["EPS Growth YoY (%)"]);
    latestEps = parseNum(getLatest(epsRow));

    data["Revenue CAGR 3Y (%)"] = calcCAGR(salesRow, 3);
    data["Revenue CAGR 5Y (%)"] = calcCAGR(salesRow, 5);
    data["Revenue CAGR 10Y (%)"] = calcCAGR(salesRow, 10);
    data["Profit CAGR 3Y (%)"] = calcCAGR(profitRow, 3);
    data["Profit CAGR 5Y (%)"] = calcCAGR(profitRow, 5);
    data["Profit CAGR 10Y (%)"] = calcCAGR(profitRow, 10);

    data["Operating Margin (%)"] = getLatest(opmRow);

    latestSales = parseNum(getLatest(salesRow));
    latestProfit = parseNum(getLatest(profitRow));
    prevProfit = parseNum(getPrevious(profitRow));

    if (!isNaN(latestSales) && !isNaN(latestProfit) && latestSales > 0) {
      data["Net Profit Margin (%)"] = ((latestProfit / latestSales) * 100).toFixed(2);
    } else {
      data["Net Profit Margin (%)"] = "";
    }

    const latestOP = parseNum(getLatest(opRow));
    const latestInt = parseNum(getLatest(intRow));
    if (!isNaN(latestOP) && !isNaN(latestInt) && latestInt > 0) {
      data["Interest Coverage"] = (latestOP / latestInt).toFixed(2);
    } else if (!isNaN(latestOP) && (isNaN(latestInt) || latestInt === 0)) {
      data["Interest Coverage"] = "Debt-free";
    } else {
      data["Interest Coverage"] = "";
    }

    data["Dividend Payout (%)"] = getLatest(divPayoutRow);
    if (data["Dividend Payout (%)"] === "" && !isNaN(latestEps) && latestEps > 0) {
      // Approximate from dividend yield * price / eps if the explicit row isn't present
      if (!isNaN(currentPrice)) {
        const dyPct = parseNum(data["Dividend Yield (%)"]);
        if (!isNaN(dyPct)) {
          latestDividendPerShare = (dyPct / 100) * currentPrice;
          data["Dividend Payout (%)"] = ((latestDividendPerShare / latestEps) * 100).toFixed(2);
        }
      }
    }
  } catch {
    errors.push("profit_loss");
  }

  // PEG Ratio
  if (!isNaN(pe) && !isNaN(epsGrowthVal) && epsGrowthVal > 0) {
    data["PEG Ratio"] = (pe / epsGrowthVal).toFixed(2);
  } else if (!isNaN(pe) && !isNaN(epsGrowthVal) && epsGrowthVal <= 0) {
    data["PEG Ratio"] = "N/A (negative growth)";
  } else {
    data["PEG Ratio"] = "";
  }

  // Balance Sheet
  let latestBorrowings = NaN;
  let prevBorrowings = NaN;
  let totalEquity = NaN;
  let totalAssets = NaN;

  try {
    const { rows: bs } = parseTable($, "balance-sheet");

    const borrowingsRow = bs["Borrowings"] || [];
    const equityRow = bs["Equity Capital"] || [];
    const reservesRow = bs["Reserves"] || [];
    const otherAssetsRow = bs["Other Assets"] || [];
    const otherLiabRow = bs["Other Liabilities"] || [];
    const fixedAssetsRow = bs["Fixed Assets"] || [];
    const investmentsRow = bs["Investments"] || [];
    const totalLiabRow = bs["Total Liabilities"] || [];

    latestBorrowings = parseNum(getLatest(borrowingsRow));
    prevBorrowings = parseNum(getPrevious(borrowingsRow));
    const latestEquity = parseNum(getLatest(equityRow));
    const latestReserves = parseNum(getLatest(reservesRow));
    totalEquity =
      (isNaN(latestEquity) ? 0 : latestEquity) +
      (isNaN(latestReserves) ? 0 : latestReserves);

    if (!isNaN(latestBorrowings) && totalEquity > 0) {
      data["Debt-to-Equity"] = (latestBorrowings / totalEquity).toFixed(2);
    } else {
      data["Debt-to-Equity"] = "";
    }

    const latestOA = parseNum(getLatest(otherAssetsRow));
    const latestOL = parseNum(getLatest(otherLiabRow));

    if (!isNaN(latestOA) && !isNaN(latestOL) && latestOL > 0) {
      data["Current Ratio"] = (latestOA / latestOL).toFixed(2);
    } else {
      data["Current Ratio"] = "";
    }

    // Total Assets == Total Liabilities (balance sheet identity on screener.in)
    totalAssets = parseNum(getLatest(totalLiabRow));
    data["Total Assets (Cr)"] = isNaN(totalAssets) ? "" : totalAssets;

    const fixedAssets = parseNum(getLatest(fixedAssetsRow));
    const investments = parseNum(getLatest(investmentsRow));
    data["Fixed Assets (Cr)"] = isNaN(fixedAssets) ? "" : fixedAssets;
    data["Investments (Cr)"] = isNaN(investments) ? "" : investments;

    if (!isNaN(latestOA) && !isNaN(latestOL)) {
      data["Working Capital (Cr)"] = (latestOA - latestOL).toFixed(2);
    } else {
      data["Working Capital (Cr)"] = "";
    }

    if (!isNaN(totalAssets) && totalAssets > 0 && !isNaN(latestSales)) {
      data["Asset Turnover (x)"] = (latestSales / totalAssets).toFixed(2);
    } else {
      data["Asset Turnover (x)"] = "";
    }

    if (!isNaN(totalAssets) && totalAssets > 0 && !isNaN(latestProfit)) {
      data["ROA (%)"] = ((latestProfit / totalAssets) * 100).toFixed(2);
    } else {
      data["ROA (%)"] = "";
    }
  } catch {
    errors.push("balance_sheet");
  }

  // Cash Flow
  try {
    const { rows: cf } = parseTable($, "cash-flow");

    const ocfRow = cf["Cash from Operating Activity"] || [];
    const ocfVal = getLatest(ocfRow);
    data["Operating Cash Flow (Cr)"] = ocfVal;

    const fcfRow = cf["Free Cash Flow"] || [];
    const fcfVal = getLatest(fcfRow);
    data["Free Cash Flow (Cr)"] = fcfVal;

    const fcfNum = parseNum(fcfVal);
    if (!isNaN(fcfNum) && !isNaN(marketCap) && marketCap > 0) {
      data["FCF Yield (%)"] = ((fcfNum / marketCap) * 100).toFixed(2);
    } else {
      data["FCF Yield (%)"] = "";
    }

    // Cash conversion = operating cash flow ÷ net profit. (Screener's "CFO/OP" row is CFO ÷ operating profit —
    // a different ratio — so it is no longer used under this label.) Undefined for loss-making companies.
    const ocfNum = parseNum(ocfVal);
    data["OCF / PAT (%)"] = !isNaN(ocfNum) && !isNaN(latestProfit) && latestProfit > 0 ? ((ocfNum / latestProfit) * 100).toFixed(2) : "";
  } catch {
    errors.push("cash_flow");
  }

  // Pros & Cons
  try {
    const pros = [];
    $("#analysis .pros li").each((_i, li) => {
      pros.push($(li).text().trim());
    });
    data["Pros"] = pros;

    const cons = [];
    $("#analysis .cons li").each((_i, li) => {
      cons.push($(li).text().trim());
    });
    data["Cons"] = cons;
  } catch {
    errors.push("pros_cons");
    data["Pros"] = [];
    data["Cons"] = [];
  }

  // Quarterly, shareholding, peers, documents
  data["_quarters"] = parseQuarters($);
  data["_shareholding"] = parseShareholding($);
  data["_peers"] = parsePeers($);
  data["_documents"] = parseDocuments($);

  // Stash a few raw numbers for red-flag analysis downstream
  data["_raw"] = {
    latestBorrowings,
    prevBorrowings,
    latestProfit,
    prevProfit,
    totalEquity,
  };

  data["Error"] = errors.length > 0 ? errors.join("; ") : null;

  return data;
}

/**
 * Fill figures Screener left EMPTY from other sources, in priority order (each entry: { name, data } where data has
 * status + derived). The first source that has the figure wins; the source name is recorded in `filled`.
 * An explicit Screener "N/A (…)" verdict (e.g. PEG on falling earnings) is respected, not overridden.
 */
function mergeGaps(data, sources) {
  const filled = {};
  for (const r of SCORE_RULES) {
    const raw = data[r.key];
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    const isMissing = text === "" || text === "-" || (Number.isNaN(parseNum(text)) && !/^n\/a/i.test(text) && text.toLowerCase() !== "debt-free");
    if (!isMissing) continue;
    for (const src of sources) {
      const alt = src.data && src.data.status === "ok" && src.data.derived ? src.data.derived[r.key] : undefined;
      if (alt !== undefined && alt !== null) {
        data[r.key] = alt;
        filled[r.key] = src.name;
        break;
      }
    }
  }
  return filled;
}

/**
 * Analyst-style quality score, 0–10.
 *
 *  • Each metric earns a graded 0–1 credit (linear between a "poor" and a "great" level) instead of a pass/fail cliff,
 *    multiplied by its weight. Weights: Profitability 3.0, Growth 2.5, Financial strength 2.0, Cash flow 1.5, Valuation 1.0.
 *  • Strict data rule: every input below must be present and numeric. If ANY is missing the score is 0 and
 *    scoreStatus is "unavailable" (with the missing inputs listed) — a partial score would be misleading.
 *  • Red flags (see detectRedFlags) then subtract 0.5 each, capped at −2, so a stock that looks good on ratios but
 *    has pledged shares / rising debt on falling profit / weak cash conversion cannot score high.
 */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Linear credit: 0 at `bad`, 1 at `good` (works whichever way round the two are, e.g. lower-is-better ratios).
const ramp = (v, bad, good) => clamp01((v - bad) / (good - bad));

const SCORE_RULES = [
  // Profitability — how well the business earns on capital
  { key: "ROCE (%)", label: "Return on capital (ROCE)", cat: "Profitability", w: 1.2, grade: (v) => ramp(v, 5, 25), note: "0 at 5%, full at 25%" },
  { key: "ROE (%)", label: "Return on equity (ROE)", cat: "Profitability", w: 1.0, grade: (v) => ramp(v, 5, 22), note: "0 at 5%, full at 22%" },
  { key: "Net Profit Margin (%)", label: "Net profit margin", cat: "Profitability", w: 0.8, grade: (v) => ramp(v, 2, 18), note: "0 at 2%, full at 18%" },
  // Growth — is the business compounding
  { key: "Revenue Growth YoY (%)", label: "Revenue growth YoY", cat: "Growth", w: 0.6, grade: (v) => ramp(v, 0, 15), note: "0 at 0%, full at 15%" },
  { key: "EPS Growth YoY (%)", label: "EPS growth YoY", cat: "Growth", w: 0.6, grade: (v) => ramp(v, 0, 18), note: "0 at 0%, full at 18%" },
  { key: "Revenue CAGR 3Y (%)", label: "Revenue CAGR (3Y)", cat: "Growth", w: 0.6, grade: (v) => ramp(v, 3, 15), note: "0 at 3%, full at 15%" },
  { key: "Profit CAGR 3Y (%)", label: "Profit CAGR (3Y)", cat: "Growth", w: 0.7, grade: (v) => ramp(v, 0, 18), note: "0 at 0%, full at 18%" },
  // Financial strength — can it survive a bad year
  { key: "Debt-to-Equity", label: "Debt-to-equity", cat: "Financial strength", w: 1.0, grade: (v) => ramp(v, 2, 0.3), note: "full at ≤0.3, 0 at ≥2" },
  { key: "Interest Coverage", label: "Interest coverage", cat: "Financial strength", w: 0.6, grade: (v) => ramp(v, 1.5, 8), note: "0 at 1.5x, full at 8x (debt-free = full)", debtFree: true },
  { key: "Current Ratio", label: "Current ratio", cat: "Financial strength", w: 0.4, grade: (v) => ramp(v, 0.7, 1.5), note: "0 at 0.7, full at 1.5" },
  // Cash flow — are profits real
  { key: "Free Cash Flow (Cr)", label: "Free cash flow", cat: "Cash flow", w: 0.5, grade: (v) => (v > 0 ? 1 : 0), note: "positive = full" },
  { key: "OCF / PAT (%)", label: "Cash conversion (OCF/PAT)", cat: "Cash flow", w: 1.0, grade: (v) => ramp(v, 40, 100), note: "0 at 40%, full at 100%" },
  // Valuation — are you overpaying
  { key: "PEG Ratio", label: "PEG ratio", cat: "Valuation", w: 0.5, grade: (v) => (v <= 0 ? 0 : ramp(v, 3, 1)), note: "full at ≤1, 0 at ≥3, ≤0 = 0" },
  { key: "P/E Ratio", label: "P/E ratio", cat: "Valuation", w: 0.5, grade: (v) => (v <= 0 ? 0 : ramp(v, 60, 15)), note: "full at ≤15, 0 at ≥60, ≤0 = 0" },
];

const RATING = [[8, "Excellent"], [6.5, "Good"], [5, "Average"], [3, "Weak"], [0, "Poor"]];

function calculateScore(data, redFlags = [], filled = {}) {
  const readings = SCORE_RULES.map((r) => {
    const raw = data[r.key];
    const isDebtFree = r.debtFree && String(raw).trim().toLowerCase() === "debt-free";
    const value = isDebtFree ? Infinity : parseNum(raw);
    return { r, raw, value, missing: !isDebtFree && !Number.isFinite(value) };
  });

  const missing = readings.filter((x) => x.missing).map((x) => (/^n\/a/i.test(String(x.raw || "").trim()) ? `${x.r.label} (${String(x.raw).replace(/^n\/a\s*/i, "").replace(/[()]/g, "") || "not meaningful"})` : x.r.label));
  if (missing.length) {
    return {
      total: 0,
      status: "unavailable",
      reason: `Score not available — ${missing.length} required figure${missing.length > 1 ? "s" : ""} missing from Screener, StockAnalysis and Tickertape.`,
      missing,
      rating: null,
      penalty: 0,
      breakdown: readings.map((x) => ({ label: x.r.label, category: x.r.cat, points: 0, max: x.r.w, met: false, value: x.missing ? null : x.raw, missing: x.missing, source: filled[x.r.key] || "screener" })),
    };
  }

  const breakdown = readings.map(({ r, raw, value }) => {
    const credit = value === Infinity ? 1 : r.grade(value);
    const points = Math.round(credit * r.w * 100) / 100;
    return { label: r.label, category: r.cat, points, max: r.w, met: credit >= 0.6, value: raw, rule: r.note, source: filled[r.key] || "screener" };
  });
  const base = breakdown.reduce((a, b) => a + b.points, 0);
  const penalty = Math.min(2, 0.5 * redFlags.length);
  const total = Math.max(0, Math.round((base - penalty) * 10) / 10);
  const rating = RATING.find(([min]) => total >= min)[1];
  return { total, status: "ok", reason: null, missing: [], rating, penalty, baseScore: Math.round(base * 10) / 10, breakdown };
}

// ── Automated red-flag detection ────────────────────────────────────────────
function detectRedFlags(data) {
  const flags = [];
  const raw = data["_raw"] || {};
  const shareholding = data["_shareholding"] || {};

  // Promoter holding trending down
  const promoterTrend = shareholding.trend && shareholding.trend["Promoters"];
  if (promoterTrend && promoterTrend.direction === "decreasing") {
    flags.push(
      `Promoter shareholding decreased by ${Math.abs(promoterTrend.changeQoQ)}% over the last period`
    );
  }

  // Pledged shares
  if (shareholding.pledgePercent && shareholding.pledgePercent > 0) {
    flags.push(`Promoters have pledged ${shareholding.pledgePercent}% of their holding`);
  }

  // Rising debt while profit is falling
  if (
    !isNaN(raw.latestBorrowings) &&
    !isNaN(raw.prevBorrowings) &&
    raw.latestBorrowings > raw.prevBorrowings &&
    !isNaN(raw.latestProfit) &&
    !isNaN(raw.prevProfit) &&
    raw.latestProfit < raw.prevProfit
  ) {
    flags.push("Borrowings increased while net profit declined year-on-year");
  }

  // High leverage
  const de = parseNum(data["Debt-to-Equity"]);
  if (!isNaN(de) && de > 2) {
    flags.push(`High Debt-to-Equity ratio (${de})`);
  }

  // Weak interest coverage
  const intCov = parseNum(data["Interest Coverage"]);
  if (data["Interest Coverage"] !== "Debt-free" && !isNaN(intCov) && intCov < 1.5) {
    flags.push(`Weak Interest Coverage (${intCov}x) — may struggle to service debt`);
  }

  // Negative or shrinking free cash flow despite profit
  const fcf = parseNum(data["Free Cash Flow (Cr)"]);
  const netProfitMargin = parseNum(data["Net Profit Margin (%)"]);
  if (!isNaN(fcf) && fcf < 0 && !isNaN(netProfitMargin) && netProfitMargin > 0) {
    flags.push("Company is profitable on paper but Free Cash Flow is negative");
  }

  // Earnings not backed by cash
  const ocfPat = parseNum(data["OCF / PAT (%)"]);
  if (!isNaN(ocfPat) && ocfPat < 60) {
    flags.push(`Low OCF/PAT (${ocfPat}%) — earnings may not be converting to real cash`);
  }

  // Expensive relative to growth
  const peg = parseNum(data["PEG Ratio"]);
  if (!isNaN(peg) && peg > 3) {
    flags.push(`High PEG ratio (${peg}) — valuation looks stretched relative to growth`);
  }

  // Declining margins YoY (approximate via revenue vs profit growth divergence)
  const revGrowth = parseNum(data["Revenue Growth YoY (%)"]);
  const epsGrowth = parseNum(data["EPS Growth YoY (%)"]);
  if (!isNaN(revGrowth) && !isNaN(epsGrowth) && revGrowth > 0 && epsGrowth < 0) {
    flags.push("Revenue grew but EPS declined YoY — margin pressure or dilution likely");
  }

  return flags;
}

function buildQuickCheck(data) {
  const quickCheck = {};
  TEN_MIN_CHECK.forEach((key) => {
    quickCheck[key] = data[key] !== undefined && data[key] !== "" ? data[key] : null;
  });
  return quickCheck;
}

/**
 * Core function: given a symbol, fetch + parse + score. Reused by the route handler.
 */
async function getStockData(symbol, preferredReportType) {
  // Screener and Tickertape are fetched concurrently; Tickertape failing never affects the Screener result.
  const settled = (r, name) => (r.status === "fulfilled" ? r.value : { status: "unavailable", reason: `${name} request failed` });
  const [pageRes, ttRes, saRes] = await Promise.allSettled([fetchBestAvailablePage(symbol, preferredReportType), getTickertape(symbol), getStockAnalysis(symbol)]);
  if (pageRes.status === "rejected") throw pageRes.reason;
  const { html, reportTypeUsed } = pageRes.value;
  const tickertape = settled(ttRes, "Tickertape");
  const stockanalysis = settled(saRes, "StockAnalysis");
  const data = parseAllData(html, symbol, reportTypeUsed);
  // Priority: StockAnalysis (published S&P Global ratios) first, then Tickertape (figures we derive from its statements).
  const filled = mergeGaps(data, [{ name: "stockanalysis", data: stockanalysis }, { name: "tickertape", data: tickertape }]);
  const redFlags = detectRedFlags(data);
  const scoreResult = calculateScore(data, redFlags, filled);
  data["Score (out of 10)"] = scoreResult.total;

  const filledCount = INDICATOR_COLUMNS.filter(
    (c) => data[c] !== undefined && data[c] !== "" && data[c] !== null
  ).length;

  return {
    symbol,
    company: data["Company"],
    industry: data["Industry"] || null,
    reportType: data["Report Type"],
    fellBackToStandalone: reportTypeUsed !== preferredReportType,
    score: scoreResult.total,
    scoreMax: 10,
    scoreStatus: scoreResult.status,
    scoreReason: scoreResult.reason,
    scoreMissing: scoreResult.missing,
    scoreRating: scoreResult.rating,
    scorePenalty: scoreResult.penalty,
    scoreBreakdown: scoreResult.breakdown,
    scoreFilled: SCORE_RULES.filter((r) => filled[r.key]).map((r) => ({ label: r.label, key: r.key, source: filled[r.key] })),
    indicatorSources: { ...filled },
    stockanalysis,
    tickertape,
    indicatorsFilled: `${filledCount}/${INDICATOR_COLUMNS.length}`,
    quickCheck: buildQuickCheck(data),
    indicators: {
      growth: {
        "Revenue Growth YoY (%)": data["Revenue Growth YoY (%)"] || null,
        "EPS Growth YoY (%)": data["EPS Growth YoY (%)"] || null,
        "Revenue CAGR 3Y (%)": data["Revenue CAGR 3Y (%)"] || null,
        "Revenue CAGR 5Y (%)": data["Revenue CAGR 5Y (%)"] || null,
        "Revenue CAGR 10Y (%)": data["Revenue CAGR 10Y (%)"] || null,
        "Profit CAGR 3Y (%)": data["Profit CAGR 3Y (%)"] || null,
        "Profit CAGR 5Y (%)": data["Profit CAGR 5Y (%)"] || null,
        "Profit CAGR 10Y (%)": data["Profit CAGR 10Y (%)"] || null,
      },
      profitability: {
        "ROCE (%)": data["ROCE (%)"] || null,
        "ROE (%)": data["ROE (%)"] || null,
        "ROA (%)": data["ROA (%)"] || null,
        "Net Profit Margin (%)": data["Net Profit Margin (%)"] || null,
        "Operating Margin (%)": data["Operating Margin (%)"] || null,
        "Asset Turnover (x)": data["Asset Turnover (x)"] || null,
      },
      financialHealth: {
        "Debt-to-Equity": data["Debt-to-Equity"] || null,
        "Interest Coverage": data["Interest Coverage"] || null,
        "Current Ratio": data["Current Ratio"] || null,
        "Total Assets (Cr)": data["Total Assets (Cr)"] || null,
        "Fixed Assets (Cr)": data["Fixed Assets (Cr)"] || null,
        "Investments (Cr)": data["Investments (Cr)"] || null,
        "Working Capital (Cr)": data["Working Capital (Cr)"] || null,
      },
      cashFlow: {
        "Free Cash Flow (Cr)": data["Free Cash Flow (Cr)"] || null,
        "Operating Cash Flow (Cr)": data["Operating Cash Flow (Cr)"] || null,
        "FCF Yield (%)": data["FCF Yield (%)"] || null,
        "OCF / PAT (%)": data["OCF / PAT (%)"] || null,
      },
      valuation: {
        "PEG Ratio": data["PEG Ratio"] || null,
        "P/E Ratio": data["P/E Ratio"] || null,
        "Earnings Yield (%)": data["Earnings Yield (%)"] || null,
        "P/B Ratio": data["P/B Ratio"] || null,
        "Dividend Yield (%)": data["Dividend Yield (%)"] || null,
        "Dividend Payout (%)": data["Dividend Payout (%)"] || null,
      },
      marketData: {
        "Market Cap (Cr)": data["Market Cap (Cr)"] || null,
        "Current Price": data["Current Price"] || null,
        "Book Value": data["Book Value"] || null,
        "Face Value": data["Face Value"] || null,
        "52W High / Low": data["High / Low"] || null,
      },
    },
    quarterlyResults: data["_quarters"],
    shareholding: data["_shareholding"],
    peers: data["_peers"],
    documents: data["_documents"],
    redFlags,
    pros: data["Pros"],
    cons: data["Cons"],
    error: data["Error"],
  };
}

module.exports = {
  getStockData,
  calculateScore,
  INDICATOR_COLUMNS,
  TEN_MIN_CHECK,
};
