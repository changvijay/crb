const axios = require('axios');

/**
 * Fetches financial news from multiple sources.
 * Uses NewsAPI as the primary source, with fallback to free RSS-based sources.
 */
class NewsService {
  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY;
  }

  /**
   * Main method: gathers news from all available sources
   */
  async fetchAllNews() {
    const results = [];
    const errors = [];

    // Strategy 1: NewsAPI (if key provided)
    if (this.newsApiKey && this.newsApiKey !== 'your_newsapi_key_here') {
      try {
        const newsApiResults = await this.fetchFromNewsAPI();
        results.push(...newsApiResults);
      } catch (err) {
        errors.push(`NewsAPI: ${err.message}`);
      }
    }

    // Strategy 2: Free Google News RSS (always available)
    try {
      const googleResults = await this.fetchFromGoogleNewsRSS();
      results.push(...googleResults);
    } catch (err) {
      errors.push(`Google News RSS: ${err.message}`);
    }

    // Strategy 3: Free financial data from public APIs
    try {
      const marketResults = await this.fetchMarketData();
      results.push(...marketResults);
    } catch (err) {
      errors.push(`Market Data: ${err.message}`);
    }

    if (results.length === 0) {
      throw new Error(
        'Could not fetch news from any source. Errors: ' + errors.join('; ')
      );
    }

    // STRICT: Filter out any articles older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOnly = results.filter((a) => {
      if (!a.publishedAt) return true; // keep if no date (will rely on source freshness)
      const pubDate = new Date(a.publishedAt);
      return pubDate >= twentyFourHoursAgo;
    });

    // Deduplicate by title similarity
    const deduplicated = this.deduplicateNews(recentOnly.length > 0 ? recentOnly : results);

    // Fetch live market data for indices
    let liveMarketData = null;
    try {
      liveMarketData = await this.fetchLiveIndexData();
    } catch (err) {
      errors.push(`Live Index Data: ${err.message}`);
    }

    return {
      articles: deduplicated.slice(0, 50), // Limit to top 50
      liveMarketData,
      fetchedAt: new Date().toISOString(),
      sources: results.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Fetch from NewsAPI.org
   */
  async fetchFromNewsAPI() {
    const queries = [
      'stock market OR equity market OR Nifty OR Sensex',
      'Federal Reserve OR RBI OR central bank OR interest rate',
      'crude oil OR gold price OR commodity'
      ];

    // Only fetch news from the last 24 hours
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const allArticles = [];

    for (const query of queries) {
      try {
        const response = await axios.get('https://newsapi.org/v2/everything', {
          params: {
            q: query,
            language: 'en',
            sortBy: 'publishedAt',
            from: fromDate,
            pageSize: 10, // Reduced from 15 to 10 for faster processing
            apiKey: this.newsApiKey,
          },
          timeout: 8000, // Reduced from 10s to 8s
        });

        if (response.data.articles) {
          allArticles.push(
            ...response.data.articles.map((a) => ({
              title: a.title,
              description: a.description || '',
              source: a.source?.name || 'Unknown',
              url: a.url,
              publishedAt: a.publishedAt,
              category: this.categorizeArticle(a.title + ' ' + (a.description || '')),
            }))
          );
        }
      } catch (err) {
        // Continue with other queries
      }
    }

    return allArticles;
  }

  /**
   * Fetch from Google News RSS (free, no API key needed)
   */
  async fetchFromGoogleNewsRSS() {
    const topics = [
      { query: 'stock+market+today', label: 'Stock Market' },
      { query: 'Indian+stock+market+Nifty+Sensex', label: 'Indian Markets' },
      { query: 'US+stock+market+S%26P+500+Nasdaq', label: 'US Markets' },
      { query: 'Federal+Reserve+ECB+RBI+interest+rate', label: 'Central Banks' },
      { query: 'crude+oil+gold+commodity+prices', label: 'Commodities' },
      { query: 'geopolitical+trade+war+sanctions', label: 'Geopolitics' },
    ];

    const allArticles = [];

    const fetchPromises = topics.map(async (topic) => {
      try {
        const url = `https://news.google.com/rss/search?q=${topic.query}+when:1d&hl=en-IN&gl=IN&ceid=IN:en`;
        const response = await axios.get(url, { timeout: 8000 }); // Reduced from 10s to 8s
        const articles = this.parseRSS(response.data, topic.label);
        return articles;
      } catch {
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    results.forEach((r) => {
      if (r.status === 'fulfilled') allArticles.push(...r.value);
    });

    return allArticles;
  }

  /**
   * Minimal RSS XML parser (avoids needing xml2js dependency)
   */
  parseRSS(xml, category) {
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link');
      const pubDate = this.extractTag(itemXml, 'pubDate');
      const source = this.extractTag(itemXml, 'source') || 'Google News';

      if (title) {
        articles.push({
          title: this.cleanHtml(title),
          description: '',
          source: this.cleanHtml(source),
          url: link || '',
          publishedAt: pubDate || new Date().toISOString(),
          category,
        });
      }
    }

    return articles;
  }

  extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const m = xml.match(regex);
    return m ? (m[1] || m[2] || '').trim() : null;
  }

  cleanHtml(text) {
    return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /**
   * Fetch LIVE index data (Nifty 50, Sensex, S&P 500, etc.)
   * This provides real-time prices for accurate technical analysis.
   */
  async fetchLiveIndexData() {
    const indices = [
      { symbol: '^NSEI', name: 'Nifty 50' },
      { symbol: '^BSESN', name: 'Sensex' },
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: '^DJI', name: 'Dow Jones' },
      { symbol: '^IXIC', name: 'NASDAQ' },
      { symbol: '^FTSE', name: 'FTSE 100' },
      { symbol: '^N225', name: 'Nikkei 225' },
      { symbol: 'GC=F', name: 'Gold Futures' },
      { symbol: 'CL=F', name: 'Crude Oil WTI' },
      { symbol: 'USDINR=X', name: 'USD/INR' },
    ];

    const results = {};

    const fetchPromises = indices.map(async (idx) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?interval=1d&range=5d`;
        const response = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        const meta = response.data?.chart?.result?.[0]?.meta;
        const quotes = response.data?.chart?.result?.[0]?.indicators?.quote?.[0];
        if (meta) {
          const closes = quotes?.close?.filter(c => c != null) || [];
          results[idx.name] = {
            symbol: idx.symbol,
            price: meta.regularMarketPrice,
            dayHigh: meta.regularMarketDayHigh,
            dayLow: meta.regularMarketDayLow,
            previousClose: meta.chartPreviousClose,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            recentCloses: closes.slice(-5),
          };
        }
      } catch {
        // Non-critical
      }
    });

    await Promise.allSettled(fetchPromises);
    return Object.keys(results).length > 0 ? results : null;
  }

  /**
   * Fetch basic market data from free APIs
   */
  async fetchMarketData() {
    const articles = [];

    try {
      // Yahoo Finance trending tickers (public endpoint)
      const response = await axios.get(
        'https://query1.finance.yahoo.com/v1/finance/trending/IN',
        {
          params: { count: 10 },
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }
      );

      if (response.data?.finance?.result?.[0]?.quotes) {
        const tickers = response.data.finance.result[0].quotes
          .map((q) => q.symbol)
          .join(', ');
        articles.push({
          title: `Trending tickers in Indian market: ${tickers}`,
          description: `These are currently trending stocks in the Indian market.`,
          source: 'Yahoo Finance',
          url: 'https://finance.yahoo.com',
          publishedAt: new Date().toISOString(),
          category: 'Indian Markets',
        });
      }
    } catch {
      // Non-critical, continue
    }

    return articles;
  }

  /**
   * Categorize an article based on its content
   */
  categorizeArticle(text) {
    const lower = text.toLowerCase();
    if (/nifty|sensex|bse|nse|indian.*(market|stock)|india.*equit/i.test(lower)) return 'Indian Markets';
    if (/s&p|nasdaq|dow|wall street|us market|nyse/i.test(lower)) return 'US Markets';
    if (/europe|ftse|dax|cac|stoxx/i.test(lower)) return 'European Markets';
    if (/china|hang seng|shanghai|nikkei|asia.*market|kospi/i.test(lower)) return 'Asian Markets';
    if (/fed|rbi|ecb|boj|interest rate|monetary policy|central bank/i.test(lower)) return 'Central Banks';
    if (/oil|gold|silver|copper|commodity|natural gas/i.test(lower)) return 'Commodities';
    if (/dollar|rupee|euro|yen|forex|currency|exchange rate/i.test(lower)) return 'Currency';
    if (/earning|revenue|profit|quarterly|guidance|eps/i.test(lower)) return 'Earnings';
    if (/geopolit|war|sanction|tariff|trade|conflict|tension/i.test(lower)) return 'Geopolitics';
    if (/gdp|inflation|unemployment|cpi|pmi|macro/i.test(lower)) return 'Macroeconomic';
    return 'General Market';
  }

  /**
   * Remove near-duplicate articles by title similarity
   */
  deduplicateNews(articles) {
    const seen = new Set();
    return articles.filter((a) => {
      const key = a.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

module.exports = new NewsService();
