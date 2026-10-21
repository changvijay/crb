require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const compression = require('compression');
const cron = require('node-cron');
const { auth, requiresAuth } = require('express-openid-connect');
const connectDB = require('./config/database');
const User = require('./models/User');
const { runBhavCopySync } = require('./services/bhavCopyService');
const reportRoutes = require('./routes/report');
const newsRoutes = require('./routes/news');
const nseRoutes = require('./routes/nse');
const globalIndicesRoutes = require('./routes/globalIndices');
const intradayChartsRoutes = require('./routes/intradayCharts');
const fiiDiiFlowsRoutes = require('./routes/fiiDiiFlows');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const usMarketRoutes = require('./routes/usMarket');
const cryptoRoutes    = require('./routes/crypto');
const advisorAuthRoutes      = require('./routes/advisorAuth');
const advisorRoutes          = require('./routes/advisor');
const recommendationsRoutes  = require('./routes/recommendations');
const authApiRoutes          = require('./routes/auth');
const stockRoutes             = require('./routes/StockData');

const app = express();
const PORT = process.env.PORT || 8080;
const AUTH_WIDGET_VERSION = '20260511-topnav';

// ── Auth0 config ──────────────────────────────────────────────────────────────
const auth0Config = {
  authRequired: false,   // each route opts-in via requiresAuth()
  auth0Logout:  true,    // also clears Auth0 session on /logout
  secret:          process.env.AUTH0_SECRET,
  baseURL:         process.env.AUTH0_BASE_URL,
  clientID:        process.env.AUTH0_CLIENT_ID,
  issuerBaseURL:   `https://${process.env.AUTH0_DOMAIN}`,
  routes: {
    login: false,  // handled manually below so returnTo is forwarded correctly
  },
  // After a successful Auth0 login, upsert the user into MongoDB
  afterCallback: async (_req, _res, session) => {
    try {
      const c = session?.user || session?.claims || {};
      if (!c.sub) {
        console.warn('[Auth0] DB user sync skipped: missing subject claim');
        return session;
      }

      // Ensure we always persist a unique email-like value even if provider
      // does not return an email claim.
      const normalizedEmail = (c.email || `${c.sub}@auth0.local`).toLowerCase().trim();

      await User.findOneAndUpdate(
        { auth0Id: c.sub },
        {
          auth0Id:       c.sub,
          email:         normalizedEmail,
          name:          c.name || c.nickname || '',
          picture:       c.picture || '',
          emailVerified: c.email_verified || false,
          lastLogin:     new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('[Auth0] DB user sync failed:', err.message);
    }
    return session;   // must return session (or undefined to reject login)
  },
};

// ── Helper: inject auth widget + serve a protected HTML page ─────────────────
// Reads the HTML file, injects /js/auth.js before </body>, sets no-cache.
async function sendProtectedPage(res, filePath) {
  const html = await fs.readFile(filePath, 'utf8');
  const script = `<script src="/js/auth.js?v=${AUTH_WIDGET_VERSION}" defer></script>`;
  const modified = html.includes('</body>')
    ? html.replace('</body>', `${script}\n</body>`)
    : html + script;
  const stat = await fs.stat(filePath).catch(() => null);
  const mtime = (stat && stat.mtime && stat.mtime.getFullYear() > 2000) ? stat.mtime : new Date();
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');          // don't cache authenticated pages
  res.set('Last-Modified', mtime.toUTCString());
  res.send(modified);
}

// ── Helper: Serve HTML page with valid dynamic Last-Modified header for SEO ────
async function sendHtmlPage(res, filePath) {
  try {
    const stat = await fs.stat(filePath).catch(() => null);
    const mtime = (stat && stat.mtime && stat.mtime.getFullYear() > 2000) ? stat.mtime : new Date();
    res.setHeader('Last-Modified', mtime.toUTCString());
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath, { lastModified: false });
  } catch (err) {
    res.status(500).send('Server Error');
  }
}

// ── Protected page paths (both /path and /path.html variants) ────────────────
// NOTE: nav pages (news, nse-data, crypto, learning, recommendations, us-market)
// are intentionally NOT in this set — they are served to all visitors (incl.
// search crawlers) for SEO. Client-side auth.js shows a login gate for humans
// who are not authenticated.
const PROTECTED_PATHS = new Set([
  
]);

// Connect to MongoDB
connectDB();

// ── BhavCopy: daily auto-sync at 19:00 IST (13:30 UTC), Mon–Fri ──
// Cron expression: minute hour day month weekday
// '30 13 * * 1-5' = 13:30 UTC every Monday–Friday
cron.schedule('30 13 * * 1-5', async () => {
  console.log('[BhavCopy] Scheduled daily sync starting (19:00 IST)...');
  try {
    const result = await runBhavCopySync();
    console.log(
      `[BhavCopy] Scheduled sync complete — mode: ${result.mode}, ` +
      `symbols: ${result.totalSymbols}, stored: ${result.totalStored}, ` +
      `latest: ${result.latestDate}`
    );
  } catch (err) {
    console.error('[BhavCopy] Scheduled sync failed:', err.message);
  }
}, { timezone: 'UTC' });

// ── SEO: Compression (gzip/brotli — ~40-50% smaller responses) ──
app.use(compression());

// ── SEO: Security & caching headers ──
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── SEO: Trailing slash normalization (301 redirect) ──
app.use((req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('/') && !req.path.startsWith('/api-docs')) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + query);
  }
  next();
});

// ── SEO: Canonical 301 URL normalization (removes .html & standardizes duplicate paths) ──
const CANONICAL_URL_MAP = {
  '/candlestickPatterns': '/CandlestickPatterns',
  '/candlestickPatterns.html': '/CandlestickPatterns',
  '/CandlestickPatterns.html': '/CandlestickPatterns',
  '/fundamental_analysis_ratios.html': '/fundamental_analysis_ratios',
  '/nse-data.html': '/nse-data',
  '/news.html': '/news',
  '/us-market.html': '/us-market',
  '/crypto.html': '/crypto',
  '/learning.html': '/learning',
  '/recommendations.html': '/recommendations',
  '/fundamental-stock-analysis.html': '/fundamental-stock-analysis',
  '/Nifty_Equity_Indices.html': '/nifty-equity-indices',
  '/nifty_equity_indices.html': '/nifty-equity-indices',
  '/nifty-equity-indices.html': '/nifty-equity-indices',
  '/nifty-indices-explorer': '/nifty-equity-indices',
  '/technical-analysis-guide.html': '/technical-analysis-guide',
  '/fundamentalIndicators.html': '/fundamentalIndicators',
  '/PriceAction.html': '/price-action',
  '/price-action.html': '/price-action',
  '/understanding-crypto-complete-guide.html': '/understanding-crypto-complete-guide',
};

app.use((req, res, next) => {
  const targetPath = CANONICAL_URL_MAP[req.path];
  if (targetPath) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, targetPath + query);
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json());

// ── Auth0 OIDC middleware ─────────────────────────────────────────────────────
// Provides req.oidc, handles /logout, /callback automatically.
// /login is handled manually to ensure returnTo is forwarded correctly.
app.use(auth(auth0Config));

// ── Custom /login — forwards returnTo so the user lands back on the same page
app.get('/login', (req, res) => {
  const returnTo = req.query.returnTo || '/';
  res.oidc.login({ returnTo });
});

// ── Protect .html direct-file requests before static middleware ───────────────
// e.g. /news.html accessed directly still requires login.
app.use((req, res, next) => {
  if (PROTECTED_PATHS.has(req.path)) {
    return requiresAuth()(req, res, async () => {
      const fileName = req.path.replace(/^\//, '') || '';
      const filePath = path.join(__dirname, 'public', fileName.endsWith('.html') ? fileName : `${fileName}.html`);
      try {
        await sendProtectedPage(res, filePath);
      } catch (err) {
        next(err);
      }
    });
  }
  next();
});

// ── SEO: Static files with cache headers ──
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: (res, filePath, stat) => {
    if (filePath.endsWith(path.join('public', 'js', 'auth.js'))) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (filePath.endsWith('.html') || filePath.endsWith('.xml') || filePath.endsWith('.txt')) {
      const mtime = (stat && stat.mtime && stat.mtime.getFullYear() > 2000) ? stat.mtime : new Date();
      res.setHeader('Last-Modified', mtime.toUTCString());
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// API Routes
app.use('/api', reportRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/nse', nseRoutes);
app.use('/api/global-indices', globalIndicesRoutes);
app.use('/api/intraday-charts', intradayChartsRoutes);
app.use('/api/fii-dii-flows', fiiDiiFlowsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/us-market', usMarketRoutes);
app.use('/api/crypto',    cryptoRoutes);
// Mount auth before profile so /api/advisor/auth/* resolves correctly
app.use('/api/advisor/auth', advisorAuthRoutes);
app.use('/api/advisor',      advisorRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/auth', authApiRoutes);
app.use('/api/stock', stockRoutes);

// ── Public pages ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  sendHtmlPage(res, path.join(__dirname, 'public', 'index.html'));
});

// Serve the Admin Panel (has its own password auth — stays public)
app.get('/admin', (req, res) => {
  sendHtmlPage(res, path.join(__dirname, 'public', 'admin.html'));
});

// Advisor pages: all served directly (each has its own auth system)
app.get('/advisor-signup', (req, res) => {
  sendHtmlPage(res, path.join(__dirname, 'public', 'advisor-signup.html'));
});
app.get('/advisor-login', (req, res) => {
  sendHtmlPage(res, path.join(__dirname, 'public', 'advisor-login.html'));
});

// ── Auth0-protected pages ──────────────────────────────────────────────────────
// Only hard-protected pages remain here. News, NSE, US, Crypto, Learning, and
// Recommendations are served as plain HTML (client-side auth.js handles gating).
app.get('/technical-analysis-guide', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'technical-analysis-guide.html')));

app.get('/fundamentalIndicators', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'fundamentalIndicators.html')));

app.get('/fundamental_analysis_ratios', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'fundamental_analysis_ratios.html')));

// advisor-profile is public (profile viewing) — JWT auth is handled client-side
app.get('/advisor-profile', (req, res) =>
  sendProtectedPage(res, path.join(__dirname, 'public', 'advisor-profile.html')));


app.get('/CandlestickPatterns', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'CandlestickPatterns.html')));

app.get('/price-action', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'PriceAction.html')));

app.get('/understanding-crypto-complete-guide', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'understanding-crypto-complete-guide.html')));

app.get('/fundamental-stock-analysis', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'fundamental-stock-analysis.html')));


app.get('/nifty-equity-indices', (req, res) =>
  sendHtmlPage(res, path.join(__dirname, 'public', 'Nifty_Equity_Indices.html')));

// ── SEO-friendly public pages (full HTML served; client-side auth gate only) ──
const publicPages = [
  ['/news',            'news.html'],
  ['/nse-data',        'nse-data.html'],
  ['/us-market',       'us-market.html'],
  ['/crypto',          'crypto.html'],
  ['/learning',        'learning.html'],
  ['/recommendations', 'recommendations.html'],
  ['/fundamentalIndicators', 'fundamentalIndicators.html'],
  ['/fundamental_analysis_ratios', 'fundamental_analysis_ratios.html'],
  ['/technical-analysis-guide', 'technical-analysis-guide.html'],
  ['/CandlestickPatterns', 'CandlestickPatterns.html'],
  ['/nifty-equity-indices', 'Nifty_Equity_Indices.html'],
];
publicPages.forEach(([route, file]) => {
  app.get(route, (req, res) =>
    sendHtmlPage(res, path.join(__dirname, 'public', file)));
});


// ── SEO: 404 handler (must be after all routes) ──
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) {
      res.status(404).send('<html><head><title>404 - Page Not Found | Chang Research Base</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>404 - Page Not Found</h1><p>The page you are looking for does not exist.</p><a href="/">Return to Dashboard</a></body></html>');
    }
  });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Market Report Dashboard running on port ${PORT}`);
  });
}

module.exports = app;
