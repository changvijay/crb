# Technical SEO Audit — crb.changtechs.com
**Audited:** 2026-09-26 | **Auditor:** Senior Technical SEO (AI-assisted code-level inspection)

---

## EXECUTIVE SUMMARY

The site is **crawlable and technically accessible** — HTTP 200, robots.txt allows all, no server-level noindex. The core indexing blockers are a cluster of **canonical URL mismatches** (pointing pages at the wrong URLs), **duplicate URL surfaces** (same content reachable at multiple paths), a **broken `Last-Modified` date** that discourages recrawl, and **dynamic-only content** on several key pages. There is no single catastrophic blocker, but the combination is enough to cause Google to either skip, demote, or consolidate these pages unfavourably.

---

## ISSUE-BY-ISSUE FINDINGS

---

### ✅ Issue 1: HTTP Status & Redirects — CLEAR

**Evidence:** All key pages return HTTP 200. Trailing-slash redirect (301) is properly implemented server-side. No redirect chains detected.  
**Impact:** None — not a blocker.  
**Confidence:** High (live curl confirmed).  
**Fix:** No action needed.

---

### ✅ Issue 2: robots.txt — LARGELY CLEAR

**Evidence:**
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /advisor-login/
Disallow: /advisor-signup/
Disallow: /advisor-profile/
Disallow: /users/
Sitemap: https://crb.changtechs.com/sitemap.xml
```
`/admin`, `/advisor-login`, `/advisor-signup` are correctly blocked. No public content pages are disallowed.  
**Impact:** None for indexable pages.  
**Confidence:** High.  
**Fix:** No action needed.

---

### ✅ Issue 3: Meta Robots / noindex — CLEAR on public pages

**Evidence:** All public pages carry `<meta name="robots" content="index, follow, ...">`. Only admin, advisor-login, advisor-signup, and 404 correctly carry `noindex`.  
**Impact:** None.  
**Confidence:** High.  
**Fix:** No action needed.

---

### 🔴 Issue 4: CANONICAL URL MISMATCHES — **CRITICAL**

Multiple pages declare canonicals that point to **different URLs** than the page itself, or to non-existent/different pages. Google will treat these pages as duplicates of their canonical targets and refuse to index them under their own URL.

| File | Page URL served at | Canonical declared | Problem |
|---|---|---|---|
| `fundamental-stock-analysis.html` | `/fundamental-stock-analysis` | `https://crb.changtechs.com/nse-data` | **Points to a completely different page** |
| `CandlestickPatterns.html` | `/CandlestickPatterns` or `/candlestickPatterns` | `https://crb.changtechs.com/CandlestickPatterns.html` | **`.html` extension in canonical — not the served URL** |
| `Nifty_Equity_Indices.html` | `/nifty-equity-indices` | `https://crb.changtechs.com/nifty-indices-explorer` | **Points to a URL that returns 404** |
| `fundamental_analysis_ratios.html` | `/fundamental_analysis_ratios` | `https://crb.changtechs.com/fundamental_analysis_ratios.html` | **`.html` extension in canonical — mismatches clean URL** |
| `crypto.html` | `/crypto` | Two canonicals declared (lines 12 and 26 — duplicate tag) | **Duplicate canonical tag** |

**Evidence (live HTTP verification):**
- `GET /nifty-equity-indices` → HTTP 200 ✅ (content loads)
- `GET /nifty-indices-explorer` → HTTP 404 ❌ (the canonical target doesn't exist)
- `GET /CandlestickPatterns` → HTTP 200 ✅ (but canonical says `.html`)
- `GET /fundamental-stock-analysis` → HTTP 200 ✅ (but canonical says `/nse-data`)

**Impact:** **CRITICAL.** Google will not index `/fundamental-stock-analysis` as its own page — it defers indexing authority to `/nse-data`. `/nifty-equity-indices` points its canonical to a 404 — Google will likely drop it entirely. Pages with `.html` in canonical may be indexed under the wrong URL.  
**Confidence:** High — verified in source code and confirmed with live HTTP checks.  
**Fix:**
1. `fundamental-stock-analysis.html` → change canonical to `https://crb.changtechs.com/fundamental-stock-analysis`
2. `CandlestickPatterns.html` → change canonical to `https://crb.changtechs.com/CandlestickPatterns` (no `.html`)
3. `Nifty_Equity_Indices.html` → change canonical to `https://crb.changtechs.com/nifty-equity-indices` (the actual served route)
4. `fundamental_analysis_ratios.html` → change canonical to `https://crb.changtechs.com/fundamental_analysis_ratios` (no `.html`)
5. `crypto.html` → remove the duplicate canonical on line 12, keep only the self-referencing one on line 26

---

### 🔴 Issue 5: DUPLICATE URL SURFACES — HIGH IMPACT

Several pages are reachable at multiple URLs simultaneously, creating duplicate content that dilutes crawl equity.

| Content | URL 1 | URL 2 | Status |
|---|---|---|---|
| CandlestickPatterns | `/CandlestickPatterns` (HTTP 200) | `/candlestickPatterns` (HTTP 200) | Both return identical 162,112-byte content |
| Fundamental Ratios | `/fundamental_analysis_ratios` (HTTP 200) | `/fundamental_analysis_ratios.html` (HTTP 200) | Both return identical 342,566-byte content |
| NSE Data | `/nse-data` (HTTP 200) | Static fallback via Express static middleware | Could surface as `/nse-data.html` |

**Evidence:** Live curl shows identical `etag: W/"27940-49773873e8"` for both `/CandlestickPatterns` and `/candlestickPatterns`. Same for the ratios page — identical etag at both `.html` and clean URL.  
**Impact:** High. Google must choose which version to index. Without a definitive canonical, it may index neither, or index the wrong one.  
**Confidence:** High — confirmed live.  
**Fix:**
- Add a 301 redirect from `/CandlestickPatterns` → `/candlestickPatterns` (match the server route)
- Add a 301 redirect from `/fundamental_analysis_ratios.html` → `/fundamental_analysis_ratios`
- Set correct self-referencing canonicals on all pages (see Issue 4)

---

### 🔴 Issue 6: BROKEN `Last-Modified` DATE — HIGH IMPACT

**Evidence:** Every page returns `Last-Modified: Tue, 01 Jan 1980 00:00:01 GMT` — a Unix epoch artifact from the file system (files packaged with epoch timestamp, likely via Docker/Vercel build).  
```
last-modified: Tue, 01 Jan 1980 00:00:01 GMT
```
This applies to ALL pages: `/`, `/nse-data`, `/news`, `/sitemap.xml`, `/robots.txt`, etc.

**Impact:** High. Googlebot uses `Last-Modified` as a freshness signal to schedule recrawls. A 1980 date tells Googlebot the content is ancient and not worth frequent recrawling. For a daily market data site, this is especially damaging — Google may crawl once and then deprioritize. It also means conditional GET (`If-Modified-Since`) always returns 200 (never 304), wasting crawl budget.  
**Confidence:** High — confirmed across all pages via live curl.  
**Fix:** In `server.js`, set a proper `Last-Modified` header dynamically for HTML pages:
```javascript
// In the static middleware setHeaders callback:
if (filePath.endsWith('.html')) {
  res.setHeader('Last-Modified', new Date().toUTCString()); // or use fs.stat()
  res.setHeader('Cache-Control', 'public, max-age=3600');
}
```
Or use `fs.stat()` to serve the actual file modification time. For API-driven pages, set it to the last data update time.

---

### 🟡 Issue 7: DYNAMIC / JS-RENDERED CONTENT ON KEY PAGES — MEDIUM IMPACT

**Evidence:** The pages with the highest commercial value (News `/news`, NSE Data `/nse-data`, Crypto `/crypto`, US Market `/us-market`) load their **actual content entirely via JavaScript API calls** to `/api/*`. What Googlebot receives without JS execution is an **empty shell** — navigation, CSS, and placeholder elements only.

For example, `news.html` renders news cards via:
```javascript
// Fetches from /api/news, then builds cards dynamically
grid.innerHTML = blogs.map((b) => `<article>...</article>`).join('');
```
The static HTML shipped to the crawler has **zero news articles** in it.

Googlebot (WRS — Web Rendering Service) does render JavaScript, but:
- It renders asynchronously, sometimes days after initial crawl
- If the API is slow or rate-limited during rendering, content appears empty
- Dynamic data (live stock prices, news) may not be "meaningful" enough for Google to index if it changes constantly without stable text anchors

**Impact:** Medium-High. Pages that look empty at crawl time may be assessed as thin/low-quality content. The `/news` page in particular has zero static textual content for Googlebot to evaluate.  
**Confidence:** Medium (confirmed empty shell in static HTML; rendering behavior depends on Googlebot's WRS timing).  
**Fix:**
- Add **static fallback content** (last 5-10 news headlines) server-side rendered into the HTML for Googlebot
- Or implement **server-side rendering (SSR)** for the above-the-fold content area
- At minimum, add descriptive static `<section>` text explaining what the page does

---

### 🟡 Issue 8: SITEMAP URL MISMATCHES — MEDIUM IMPACT

**Evidence:** The sitemap references URLs that do not match the actual route structure:

| Sitemap URL | Actual server route | Status |
|---|---|---|
| `https://crb.changtechs.com/CandlestickPatterns` | `/candlestickPatterns` (lowercase c) | Case mismatch — both 200 but canonical confusion |
| `https://crb.changtechs.com/Nifty_Equity_Indices` | `/nifty-equity-indices` | Sitemap URL returns **HTTP 404** |
| `https://crb.changtechs.com/fundamentalIndicators` | `/fundamentalIndicators` | ✅ OK |
| `https://crb.changtechs.com/fundamental_analysis_ratios` | `/fundamental_analysis_ratios` | ✅ OK (returns 200) |

**Impact:** Medium. Googlebot will attempt to crawl `https://crb.changtechs.com/Nifty_Equity_Indices` from the sitemap, get a 404, and flag it as a sitemap error in Search Console. This wastes crawl budget and signals poor site maintenance.  
**Confidence:** High — confirmed via live HTTP check (`/Nifty_Equity_Indices` → 404).  
**Fix:**
- Change sitemap entry from `/Nifty_Equity_Indices` → `/nifty-equity-indices`
- Change sitemap entry from `/CandlestickPatterns` → `/candlestickPatterns` (match the Express route)
- Always test every sitemap URL returns 200 before submitting

---

### 🟡 Issue 9: TITLE TOO SHORT / GENERIC ON HOMEPAGE — LOW-MEDIUM IMPACT

**Evidence:** `<title>Chang Research Base (CRB)</title>` — 28 characters. No primary keyword (e.g., "stock market analysis", "Nifty technical analysis", "pre-market report India") in the title.  
**Impact:** Low-Medium. Google may rewrite it in SERPs, and the page may rank poorly for primary keywords.  
**Confidence:** High.  
**Fix:** Expand to include the primary value proposition, e.g.:
```html
<title>Chang Research Base (CRB) — Daily Market Pre-Reports & Nifty Technical Analysis</title>
```

---

### 🟡 Issue 10: OG:DESCRIPTION MISSING ON HOMEPAGE — LOW IMPACT

**Evidence:** `index.html` is missing `<meta property="og:description">`. It has `og:title` and `og:image` but no description.  
**Impact:** Low — affects social sharing quality, not direct indexing.  
**Fix:** Add `<meta property="og:description" content="...">` to `index.html`.

---

### 🟡 Issue 11: `X-Powered-By: Express` HEADER LEAKING — LOW IMPACT

**Evidence:** All responses include `x-powered-by: Express`. This is a minor security exposure and not an SEO signal.  
**Impact:** Negligible for SEO, minor security concern.  
**Fix:** Add `app.disable('x-powered-by');` to `server.js`.

---

### ℹ️ Issue 12: SITE AGE / AUTHORITY — CANNOT CONFIRM

**Evidence:** The domain `crb.changtechs.com` is a **subdomain**. Subdomains are treated by Google as separate sites from the root domain. It gets zero authority inheritance from `changtechs.com`.  
**Impact:** This alone could explain why new content takes much longer to index — the subdomain has to build its own authority from scratch.  
**Confidence:** Medium (cannot confirm backlink profile or domain age without GSC data).  
**Fix:** Consider whether migrating to `changtechs.com/crb/` or a dedicated root domain (e.g., `changresearchbase.com`) is feasible. A subdomain with zero external backlinks may take 3–6 months to gain meaningful indexing.

---

### ℹ️ Issue 13: GOOGLE SEARCH CONSOLE DATA — NOT PROVIDED

No GSC data was provided. The following **cannot be determined** without it:
- Which pages are "Crawled but not indexed" vs "Discovered but not crawled"
- Whether there are manual actions or security flags
- Actual crawl error rates
- Index coverage report status
- Whether the verification tag (`VuhAaH8s-...`) is accepted

**Fix:** Check GSC → Coverage → "Excluded" tab. The specific reason codes will instantly confirm which of the above issues is causing each URL to be excluded.

---

## ROOT CAUSE

> **The #1 root cause is the cluster of broken canonical URLs, especially `fundamental-stock-analysis.html` pointing its canonical to `/nse-data` and `Nifty_Equity_Indices.html` pointing its canonical to a 404 URL (`/nifty-indices-explorer`).** Google will never independently index these pages because the canonical explicitly instructs it to defer to a different URL. This is a self-inflicted "soft noindex."

---

## SECONDARY ISSUES

1. **Duplicate URL surfaces** — Same content at 2+ URLs without definitive 301 redirects
2. **Epoch `Last-Modified` date (1980)** — Suppresses recrawl frequency for a daily-update site
3. **Sitemap references a 404 URL** (`/Nifty_Equity_Indices`) — Wastes crawl budget
4. **JS-only content** on high-value pages — Risk of thin content assessment by Googlebot's WRS
5. **Subdomain authority gap** — New subdomain with no external backlinks = slow trust build

---

## FIX — EXACT ACTIONS (PRIORITY ORDER)

### 🔴 P1 — Fix today (canonicals & sitemap)

1. **`public/fundamental-stock-analysis.html` line 13** — Change:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/nse-data" />
   ```
   To:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/fundamental-stock-analysis" />
   ```

2. **`public/Nifty_Equity_Indices.html` line 32** — Change:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/nifty-indices-explorer">
   ```
   To:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/nifty-equity-indices">
   ```

3. **`public/CandlestickPatterns.html` line 13** — Change:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/CandlestickPatterns.html">
   ```
   To:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/candlestickPatterns">
   ```

4. **`public/fundamental_analysis_ratios.html` line 15** — Change:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/fundamental_analysis_ratios.html" />
   ```
   To:
   ```html
   <link rel="canonical" href="https://crb.changtechs.com/fundamental_analysis_ratios" />
   ```

5. **`public/crypto.html` line 12** — Remove the first duplicate canonical (keep only line 26).

6. **`public/sitemap.xml`** — Fix 2 broken entries:
   - `/Nifty_Equity_Indices` → `/nifty-equity-indices`
   - `/CandlestickPatterns` → `/candlestickPatterns`

7. **`server.js`** — Add 301 redirect for case-sensitive duplicate:
   ```javascript
   app.get('/CandlestickPatterns', (req, res) => res.redirect(301, '/candlestickPatterns'));
   app.get('/fundamental_analysis_ratios.html', (req, res) => res.redirect(301, '/fundamental_analysis_ratios'));
   ```

### 🟡 P2 — Fix this week (freshness & content)

8. **`server.js`** — Fix epoch Last-Modified by using real timestamps:
   ```javascript
   // In static middleware setHeaders:
   const stat = await fs.stat(filePath);
   res.setHeader('Last-Modified', stat.mtime.toUTCString());
   ```

9. **`index.html`** — Add `og:description` and expand the title tag.

10. **News/NSE/Crypto pages** — Add minimal static above-the-fold content (e.g., a static 150-word intro paragraph) so Googlebot can assess relevance even before JS executes.

### 🟢 P3 — Monitor

11. **Google Search Console** — Submit updated sitemap, request indexing for all corrected URLs via URL Inspection tool.
12. **Monitor Coverage report** — Look for "Alternate page with proper canonical tag" exclusion reason, which will confirm canonical fixes worked.

---

## VERDICT

| Category | Status |
|---|---|
| Technical indexing blocker | ✅ **YES** — Broken canonicals are actively blocking specific pages |
| Google choosing not to index | ⚠️ **POSSIBLE** — Dynamic-only pages may be assessed as thin content |
| Canonical/duplicate issue | ✅ **YES** — Multiple confirmed |
| Content-quality issue | ⚠️ **POSSIBLE** — JS-only pages have no static content for Googlebot |
| No confirmed problem | ❌ Not applicable — multiple confirmed problems exist |

**Primary verdict: Canonical/duplicate issue + technical indexing blocker**
