const { existsSync, mkdirSync, writeFileSync } = require("fs");
const { load } = require("cheerio");
const path = require("path");

// ── Configuration ──────────────────────────────────────────────────────────
const BASE_URL = "https://www.screener.in/company";
const PREFERRED_REPORT_TYPE = "consolidated"; // tried first; falls back to "standalone" automatically
const DELAY_MS = 1500; // delay between requests to avoid rate-limiting

// ── CSV Column Order ───────────────────────────────────────────────────────
const CSV_COLUMNS = [
  // Identity
  "Symbol",
  "Company",
  "Report Type", // NEW: tells you whether consolidated or standalone data was used
  "Market Cap (Cr)",
  "Current Price",
  "Score (out of 10)",

  // Growth (⚡ = 10-min check)
  "Revenue Growth YoY (%)",       // ⚡
  "EPS Growth YoY (%)",           // ⚡
  "Revenue CAGR 5Y (%)",
  "Profit CAGR 5Y (%)",

  // Profitability
  "ROCE (%)",                     // ⚡
  "ROE (%)",                      // ⚡
  "Net Profit Margin (%)",
  "Operating Margin (%)",

  // Financial Health
  "Debt-to-Equity",               // ⚡
  "Interest Coverage",            // ⚡
  "Current Ratio",

  // Cash Flow
  "Free Cash Flow (Cr)",          // ⚡
  "Operating Cash Flow (Cr)",
  "FCF Yield (%)",
  "OCF / PAT (%)",                // ⚡

  // Valuation
  "PEG Ratio",                    // ⚡
  "P/E Ratio",
  "Earnings Yield (%)",
  "P/B Ratio",
  "Dividend Yield (%)",

  // Qualitative
  "Pros",
  "Cons",

  // Meta
  "Error",
];

// ── The "10-Minute Stock Check" columns ─────────────────────────────────
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
  // "Economic Moat" — qualitative, see Pros/Cons
];

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a number string like "1,23,456" or "-3,456" or "38%" into a float */
function parseNum(str) {
  if (!str || str === "-" || str === "") return NaN;
  const cleaned = str.replace(/[,%₹\s]/g, "").trim();
  return parseFloat(cleaned);
}

/** Get latest value (last non-empty cell) from a row array */
function getLatest(cells) {
  if (!cells || cells.length === 0) return "";
  for (let i = cells.length - 1; i >= 0; i--) {
    const val = cells[i].trim();
    if (val && val !== "-" && val !== "") return val;
  }
  return "";
}

/** Get second-to-latest value for YoY comparison */
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

/** Calculate YoY growth */
function calcYoYGrowth(cells) {
  const latest = parseNum(getLatest(cells));
  const prev = parseNum(getPrevious(cells));
  if (isNaN(latest) || isNaN(prev) || prev === 0) return "";
  return (((latest - prev) / Math.abs(prev)) * 100).toFixed(2);
}

/** Calculate CAGR over N years (from the row of annual data) */
function calcCAGR(cells, years = 5) {
  if (!cells || cells.length < years + 1) return "";
  // Filter non-empty cells
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
  const url = `${BASE_URL}/${symbol}/${reportType === "standalone" ? "" : reportType + "/"}`;
  // Note: screener.in standalone-only companies serve their default data at
  // /company/SYMBOL/ (no suffix) OR redirect /consolidated/ -> default automatically.
  // We still explicitly try both shapes below in fetchBestAvailablePage().
  const finalUrl =
    reportType === "consolidated"
      ? `${BASE_URL}/${symbol}/consolidated/`
      : `${BASE_URL}/${symbol}/`;

  const res = await fetch(finalUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${symbol} (${finalUrl})`);
  }

  return { html: await res.text(), url: res.url || finalUrl };
}

/**
 * Checks whether a parsed page actually has usable financial data.
 * Some companies (e.g. HINDCOPPER, NMDC, COALINDIA, SAIL — PSUs with no
 * subsidiaries to consolidate) have NO consolidated financials at all.
 * Screener.in either 404s, redirects, or renders the section shells empty
 * for /consolidated/ on these. We detect that and fall back to standalone.
 */
function pageHasData($) {
  const plRows = $("#profit-loss table.data-table tbody tr").length;
  const bsRows = $("#balance-sheet table.data-table tbody tr").length;
  const cfRows = $("#cash-flow table.data-table tbody tr").length;
  return plRows > 0 && bsRows > 0 && cfRows > 0;
}

/**
 * Try consolidated first; if the page has no real data tables, fall back
 * to standalone automatically. Returns { html, reportTypeUsed }.
 */
async function fetchBestAvailablePage(symbol) {
  if (PREFERRED_REPORT_TYPE === "consolidated") {
    try {
      const { html } = await fetchPage(symbol, "consolidated");
      const $ = load(html);
      if (pageHasData($)) {
        return { html, reportTypeUsed: "consolidated" };
      }
      // Consolidated page loaded but has no real tables -> fall back.
    } catch (e) {
      // Consolidated URL failed outright (e.g. 404) -> fall back.
    }

    const { html: standaloneHtml } = await fetchPage(symbol, "standalone");
    return { html: standaloneHtml, reportTypeUsed: "standalone" };
  } else {
    const { html } = await fetchPage(symbol, "standalone");
    return { html, reportTypeUsed: "standalone" };
  }
}

/**
 * Generic table parser: returns { "Row Label": ["val1", "val2", ...], ... }
 */
function parseTable($, sectionId) {
  const section = $(`#${sectionId}`);
  const table = section.find("table.data-table").first();
  const rows = {};

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

  return rows;
}

/**
 * Parse all indicators from a screener.in company page.
 */
function parseAllData(html, symbol, reportTypeUsed) {
  const $ = load(html);
  const data = {};
  const errors = [];

  data["Report Type"] = reportTypeUsed;

  // ═══════════════════════════════════════════════════════════════════════
  // 1. COMPANY NAME
  // ═══════════════════════════════════════════════════════════════════════
  try {
    data["Company"] = $("h1").first().text().trim() || "";
  } catch {
    data["Company"] = "";
    errors.push("company_name");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. TOP RATIOS — ROE, ROCE, P/E, Book Value, Market Cap, Price, Div Yield
  // ═══════════════════════════════════════════════════════════════════════
  let currentPrice = NaN;
  let bookValue = NaN;
  let pe = NaN;
  let marketCap = NaN;

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

    // Direct
    data["Market Cap (Cr)"] = ratios["Market Cap"] || "";
    data["Current Price"] = ratios["Current Price"] || "";
    data["ROCE (%)"] = ratios["ROCE"] || "";
    data["ROE (%)"] = ratios["ROE"] || "";
    data["P/E Ratio"] = ratios["Stock P/E"] || "";
    data["Dividend Yield (%)"] = ratios["Dividend Yield"] || "";

    // Parse for derived calcs
    currentPrice = parseNum(ratios["Current Price"]);
    bookValue = parseNum(ratios["Book Value"]);
    pe = parseNum(ratios["Stock P/E"]);
    marketCap = parseNum(ratios["Market Cap"]);

    // P/B = Current Price / Book Value
    if (!isNaN(currentPrice) && !isNaN(bookValue) && bookValue > 0) {
      data["P/B Ratio"] = (currentPrice / bookValue).toFixed(2);
    } else {
      data["P/B Ratio"] = "";
    }

    // Earnings Yield = (1 / P/E) × 100
    if (!isNaN(pe) && pe > 0) {
      data["Earnings Yield (%)"] = ((1 / pe) * 100).toFixed(2);
    } else {
      data["Earnings Yield (%)"] = "";
    }
  } catch {
    errors.push("top_ratios");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. PROFIT & LOSS — Revenue/EPS Growth, OPM, NPM, Interest Coverage
  // ═══════════════════════════════════════════════════════════════════════
  let epsGrowthVal = NaN;

  try {
    const pl = parseTable($, "profit-loss");

    // Sales / Revenue
    const salesRow = pl["Sales"] || [];
    const profitRow = pl["Net Profit"] || [];
    const epsRow = pl["EPS in Rs"] || [];
    const opmRow = pl["OPM %"] || [];
    const opRow = pl["Operating Profit"] || [];
    const intRow = pl["Interest"] || [];

    // ── Growth ──
    data["Revenue Growth YoY (%)"] = calcYoYGrowth(salesRow);
    data["EPS Growth YoY (%)"] = calcYoYGrowth(epsRow);
    epsGrowthVal = parseFloat(data["EPS Growth YoY (%)"]);

    // ── CAGR 5Y ──
    data["Revenue CAGR 5Y (%)"] = calcCAGR(salesRow, 5);
    data["Profit CAGR 5Y (%)"] = calcCAGR(profitRow, 5);

    // ── Operating Margin (latest) ──
    data["Operating Margin (%)"] = getLatest(opmRow);

    // ── Net Profit Margin = (Net Profit / Sales) × 100 ──
    const latestSales = parseNum(getLatest(salesRow));
    const latestProfit = parseNum(getLatest(profitRow));
    if (!isNaN(latestSales) && !isNaN(latestProfit) && latestSales > 0) {
      data["Net Profit Margin (%)"] = ((latestProfit / latestSales) * 100).toFixed(2);
    } else {
      data["Net Profit Margin (%)"] = "";
    }

    // ── Interest Coverage = Operating Profit / Interest ──
    const latestOP = parseNum(getLatest(opRow));
    const latestInt = parseNum(getLatest(intRow));
    if (!isNaN(latestOP) && !isNaN(latestInt) && latestInt > 0) {
      data["Interest Coverage"] = (latestOP / latestInt).toFixed(2);
    } else if (!isNaN(latestOP) && (isNaN(latestInt) || latestInt === 0)) {
      data["Interest Coverage"] = "Debt-free";
    } else {
      data["Interest Coverage"] = "";
    }
  } catch {
    errors.push("profit_loss");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. PEG Ratio = P/E / EPS Growth
  // ═══════════════════════════════════════════════════════════════════════
  if (!isNaN(pe) && !isNaN(epsGrowthVal) && epsGrowthVal > 0) {
    data["PEG Ratio"] = (pe / epsGrowthVal).toFixed(2);
  } else if (!isNaN(pe) && !isNaN(epsGrowthVal) && epsGrowthVal <= 0) {
    data["PEG Ratio"] = "N/A (negative growth)";
  } else {
    data["PEG Ratio"] = "";
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. BALANCE SHEET — Debt-to-Equity, Current Ratio
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const bs = parseTable($, "balance-sheet");

    // Debt-to-Equity = Borrowings / (Equity Capital + Reserves)
    const borrowingsRow = bs["Borrowings"] || [];
    const equityRow = bs["Equity Capital"] || [];
    const reservesRow = bs["Reserves"] || [];

    const latestBorrowings = parseNum(getLatest(borrowingsRow));
    const latestEquity = parseNum(getLatest(equityRow));
    const latestReserves = parseNum(getLatest(reservesRow));
    const totalEquity =
      (isNaN(latestEquity) ? 0 : latestEquity) +
      (isNaN(latestReserves) ? 0 : latestReserves);

    if (!isNaN(latestBorrowings) && totalEquity > 0) {
      const de = (latestBorrowings / totalEquity).toFixed(2);
      data["Debt-to-Equity"] = de;
    } else {
      data["Debt-to-Equity"] = "";
    }

    // Current Ratio ≈ Other Assets / Other Liabilities
    // (Screener lumps current assets into "Other Assets" and
    //  current liabilities into "Other Liabilities")
    const otherAssetsRow = bs["Other Assets"] || [];
    const otherLiabRow = bs["Other Liabilities"] || [];
    const latestOA = parseNum(getLatest(otherAssetsRow));
    const latestOL = parseNum(getLatest(otherLiabRow));

    if (!isNaN(latestOA) && !isNaN(latestOL) && latestOL > 0) {
      data["Current Ratio"] = (latestOA / latestOL).toFixed(2);
    } else {
      data["Current Ratio"] = "";
    }
  } catch {
    errors.push("balance_sheet");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. CASH FLOWS — FCF, OCF, FCF Yield, OCF/PAT
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const cf = parseTable($, "cash-flow");

    // Operating Cash Flow
    const ocfRow = cf["Cash from Operating Activity"] || [];
    const ocfVal = getLatest(ocfRow);
    data["Operating Cash Flow (Cr)"] = ocfVal;

    // Free Cash Flow
    const fcfRow = cf["Free Cash Flow"] || [];
    const fcfVal = getLatest(fcfRow);
    data["Free Cash Flow (Cr)"] = fcfVal;

    // FCF Yield = (FCF / Market Cap) × 100
    const fcfNum = parseNum(fcfVal);
    if (!isNaN(fcfNum) && !isNaN(marketCap) && marketCap > 0) {
      data["FCF Yield (%)"] = ((fcfNum / marketCap) * 100).toFixed(2);
    } else {
      data["FCF Yield (%)"] = "";
    }

    // OCF / PAT — screener has "CFO/OP" row (same concept)
    const cfoOpRow = cf["CFO/OP"] || [];
    data["OCF / PAT (%)"] = getLatest(cfoOpRow);
  } catch {
    errors.push("cash_flow");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. PROS & CONS (qualitative — proxy for Moat / Governance / Quality)
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const pros = [];
    $("#analysis .pros li").each((_i, li) => {
      pros.push($(li).text().trim());
    });
    data["Pros"] = pros.join(" | ") || "";

    const cons = [];
    $("#analysis .cons li").each((_i, li) => {
      cons.push($(li).text().trim());
    });
    data["Cons"] = cons.join(" | ") || "";
  } catch {
    errors.push("pros_cons");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. ERROR COLUMN
  // ═══════════════════════════════════════════════════════════════════════
  data["Error"] = errors.length > 0 ? errors.join("; ") : "";

  return data;
}

/**
 * Converts results array to CSV string.
 */
function toCSV(results) {
  if (results.length === 0) return "";

  const header = CSV_COLUMNS.join(",");
  const rows = results.map((r) => {
    return CSV_COLUMNS.map((col) => {
      if (col === "Symbol") return `"${r.symbol}"`;
      const val = (r.data[col] || r.data[col] === 0 ? r.data[col] : "").toString().replace(/"/g, '""');
      return `"${val}"`;
    }).join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Calculate a score out of 10 based on the 10-Minute Stock Check.
 */
function calculateScore(data) {
  let score = 0;

  const revGrowth = parseNum(data["Revenue Growth YoY (%)"]);
  if (!isNaN(revGrowth) && revGrowth > 10) score += 1;

  const epsGrowth = parseNum(data["EPS Growth YoY (%)"]);
  if (!isNaN(epsGrowth) && epsGrowth > 10) score += 1;

  const roce = parseNum(data["ROCE (%)"]);
  if (!isNaN(roce) && roce > 15) score += 1.5;

  const roe = parseNum(data["ROE (%)"]);
  if (!isNaN(roe) && roe > 15) score += 1.5;

  const fcf = parseNum(data["Free Cash Flow (Cr)"]);
  if (!isNaN(fcf) && fcf > 0) score += 1;

  const ocfPat = parseNum(data["OCF / PAT (%)"]);
  if (!isNaN(ocfPat) && ocfPat >= 100) score += 1;

  const de = parseNum(data["Debt-to-Equity"]);
  if (!isNaN(de) && de < 1) score += 1;

  const intCov = parseNum(data["Interest Coverage"]);
  if (data["Interest Coverage"] === "Debt-free" || (!isNaN(intCov) && intCov > 5)) score += 1;

  const peg = parseNum(data["PEG Ratio"]);
  if (!isNaN(peg) && peg < 1.5 && peg > 0) score += 1;

  return score;
}

/**
 * Print "10-Minute Stock Check" summary for a single stock.
 */
function printQuickCheck(r) {
  const d = r.data;
  const label = (s) => s.padEnd(26);

  console.log(`\n  ┌──────────────────────────────────────────────────┐`);
  console.log(`  │  🚀 10-MINUTE STOCK CHECK: ${(r.symbol + "").padEnd(20)} │`);
  console.log(`  │     (${d["Report Type"] || "?"} figures)`.padEnd(53) + `│`);
  console.log(`  ├──────────────────────────────────────────────────┤`);
  console.log(`  │  ${label("⭐ SCORE (out of 10)")} ${(d["Score (out of 10)"] + "/10").padStart(20)} │`);
  console.log(`  ├──────────────────────────────────────────────────┤`);
  console.log(`  │  ${label("⚡ Revenue Growth")} ${(d["Revenue Growth YoY (%)"] ? d["Revenue Growth YoY (%)"] + "%" : "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ EPS Growth")} ${(d["EPS Growth YoY (%)"] ? d["EPS Growth YoY (%)"] + "%" : "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ ROCE")} ${(d["ROCE (%)"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ ROE")} ${(d["ROE (%)"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ Free Cash Flow")} ${(d["Free Cash Flow (Cr)"] ? "₹" + d["Free Cash Flow (Cr)"] + " Cr" : "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ OCF vs PAT")} ${(d["OCF / PAT (%)"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ Debt-to-Equity")} ${(d["Debt-to-Equity"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ Interest Coverage")} ${(d["Interest Coverage"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("⚡ PEG Ratio")} ${(d["PEG Ratio"] || "N/A").padStart(20)} │`);
  console.log(`  │  ${label("🔍 Moat (see Pros/Cons)")} ${("↓ below").padStart(20)} │`);
  console.log(`  └──────────────────────────────────────────────────┘`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).length
    ? process.argv.slice(2)
    : 
    
    [
      "ABREL","ANANTRAJ","BRIGADE","DLF","GODREJPROP","LODHA","OBEROIRLTY","PHOENIXLTD","PRESTIGE","SOBHA"
    ];

  if (args.length === 0) {
    console.log("\n📊 Screener.in Fundamental Indicators Scraper");
    console.log("═══════════════════════════════════════════════\n");
    console.log("Usage: node scrape-screener.js SYMBOL1 SYMBOL2 ...\n");
    console.log("Examples:");
    console.log("  node scrape-screener.js ITC");
    console.log("  node scrape-screener.js ITC RELIANCE TCS INFY HDFCBANK\n");
    console.log("Indicators scraped: 20+ quantitative + Pros/Cons");
    console.log("Output: screener_IT_fundamentals.csv\n");
    process.exit(1);
  }

  const symbols = args.map((s) => s.toUpperCase());

  console.log(`\n📊 Screener.in Fundamental Indicators Scraper`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`   Stocks:  ${symbols.join(", ")}`);
  console.log(`   Columns: ${CSV_COLUMNS.length} (${CSV_COLUMNS.length - 4} indicators + identity + error)`);
  console.log(`   Mode:    ${PREFERRED_REPORT_TYPE} → auto-fallback to standalone if unavailable`);

  const results = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;

    try {
      process.stdout.write(`${progress} Fetching ${symbol} ... `);
      const { html, reportTypeUsed } = await fetchBestAvailablePage(symbol);
      const data = parseAllData(html, symbol, reportTypeUsed);

      data["Score (out of 10)"] = calculateScore(data);

      // Count filled indicator fields
      const indicatorCols = CSV_COLUMNS.filter(
        (c) => !["Symbol", "Company", "Report Type", "Error", "Pros", "Cons"].includes(c)
      );
      const filled = indicatorCols.filter(
        (c) => data[c] && data[c] !== ""
      ).length;

      const fallbackNote = reportTypeUsed !== PREFERRED_REPORT_TYPE ? ` [fell back to ${reportTypeUsed}]` : "";

      if (data["Error"]) {
        console.log(`⚠️  ${filled}/${indicatorCols.length} indicators (${data["Error"]})${fallbackNote}`);
      } else {
        console.log(`✅ ${filled}/${indicatorCols.length} indicators${fallbackNote}`);
      }

      results.push({ symbol, data });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      const data = {};
      CSV_COLUMNS.forEach((col) => (data[col] = ""));
      data["Error"] = err.message;
      results.push({ symbol, data });
    }

    // Rate-limit
    if (i < symbols.length - 1) {
      await sleep(DELAY_MS);
    }
  }


  const outputFolder = path.join(process.cwd(), "output");

  if (!existsSync(outputFolder)) {
      mkdirSync(outputFolder, { recursive: true });
  }

  const OUTPUT_FILE = path.join(outputFolder, "results.csv");
  console.log(`\n✅ Saved ${results.length} stock(s) → ${OUTPUT_FILE}`);
  // Write CSV
  const csv = toCSV(results);
  writeFileSync(OUTPUT_FILE, csv, "utf-8");


  // ── Print 10-Minute Stock Check for each stock ──
  console.log(`\n${"═".repeat(54)}`);
  console.log(`  🚀 10-MINUTE STOCK CHECK RESULTS`);
  console.log(`${"═".repeat(54)}`);

  for (const r of results) {
    if (r.data["Error"] && !r.data["Company"]) {
      console.log(`\n  ❌ ${r.symbol}: ${r.data["Error"]}`);
      continue;
    }

    printQuickCheck(r);

    // Print Pros/Cons summary (proxy for Moat / Quality)
    if (r.data["Pros"]) {
      console.log(`\n  ✅ Pros:`);
      r.data["Pros"].split(" | ").forEach((p) => {
        console.log(`     • ${p}`);
      });
    }
    if (r.data["Cons"]) {
      console.log(`  ❌ Cons:`);
      r.data["Cons"].split(" | ").forEach((c) => {
        console.log(`     • ${c}`);
      });
    }
  }

  // ── Full data table ──
  console.log(`\n${"═".repeat(54)}`);
  console.log(`  📋 FULL INDICATOR TABLE`);
  console.log(`${"═".repeat(54)}`);

  for (const r of results) {
    if (!r.data["Company"]) continue;

    console.log(`\n  📊 ${r.symbol} — ${r.data["Company"]} (${r.data["Report Type"]})`);
    console.log(`  ${"─".repeat(50)}`);

    const sections = {
      "GROWTH": ["Revenue Growth YoY (%)", "EPS Growth YoY (%)", "Revenue CAGR 5Y (%)", "Profit CAGR 5Y (%)"],
      "PROFITABILITY": ["ROCE (%)", "ROE (%)", "Net Profit Margin (%)", "Operating Margin (%)"],
      "FINANCIAL HEALTH": ["Debt-to-Equity", "Interest Coverage", "Current Ratio"],
      "CASH FLOW": ["Free Cash Flow (Cr)", "Operating Cash Flow (Cr)", "FCF Yield (%)", "OCF / PAT (%)"],
      "VALUATION": ["PEG Ratio", "P/E Ratio", "Earnings Yield (%)", "P/B Ratio", "Dividend Yield (%)"],
    };

    for (const [sectionName, cols] of Object.entries(sections)) {
      console.log(`\n  ${sectionName}`);
      for (const col of cols) {
        const val = r.data[col] || "N/A";
        const isTenMin = TEN_MIN_CHECK.includes(col) ? " ⚡" : "";
        console.log(`    ${col.padEnd(28)} ${val}${isTenMin}`);
      }
    }
  }

  console.log(`\n${"═".repeat(54)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});