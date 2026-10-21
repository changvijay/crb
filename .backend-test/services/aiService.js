const axios = require('axios');

/**
 * AI Analysis Service
 * Supports: Google Gemini (free), OpenRouter (free models)
 * All API keys are handled server-side only.
 */
class AIService {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'gemini';
  }

  /**
   * Analyze collected news articles and produce a structured market report
   */
  async analyzeNews(newsData, technicalData = null) {
    const prompt = this.buildPrompt(newsData, technicalData);

    switch (this.provider) {
      case 'gemini':
        return await this.callGemini(prompt);
      case 'openrouter':
        return await this.callOpenRouter(prompt);
      default:
        throw new Error(`Unknown AI provider: ${this.provider}. Use "gemini" or "openrouter".`);
    }
  }

  /**
   * Build the analysis prompt — YouTube script style, simple English
   */
  buildPrompt(newsData, technicalData) {
    const articleSummaries = newsData.articles
      .map((a, i) => `${i + 1}. [${a.category || 'General'}] ${a.title}\n   Source: ${a.source} | Published: ${a.publishedAt}\n   ${a.description || ''}`)
      .join('\n\n');

    // Build live market data section
    let liveDataSection = '';
    if (newsData.liveMarketData) {
      const lines = [];
      for (const [name, data] of Object.entries(newsData.liveMarketData)) {
        const change = data.previousClose ? ((data.price - data.previousClose) / data.previousClose * 100).toFixed(2) : 'N/A';
        const changeSign = change > 0 ? '+' : '';
        lines.push(`${name}: ${data.price} (${changeSign}${change}%) | Day Range: ${data.dayLow} - ${data.dayHigh} | Prev Close: ${data.previousClose}`);
      }
      liveDataSection = `\n=== LIVE MARKET DATA (REAL-TIME — USE THESE EXACT NUMBERS) ===\n${lines.join('\n')}\n=== END OF LIVE DATA ===\n`;
    }

    // Build technical indicators section
    let technicalSection = '';
    if (technicalData?.nifty50) {
      const t = technicalData.nifty50;
      const ind = t.indicators;
      const piv = t.pivotPoints;
      technicalSection = `
=== REAL NIFTY 50 TECHNICAL INDICATORS (CALCULATED FROM ACTUAL DATA — USE THESE EXACT VALUES) ===
Current Price: ${t.currentPrice} | Day: ${t.dayLow} - ${t.dayHigh} | Change: ${t.dayChange} (${t.dayChangePct}%)
Week Change: ${t.weekChange} (${t.weekChangePct}%)

RSI (14): ${ind.rsi14} — ${ind.rsiSignal}
Stochastic RSI: ${ind.stochasticRSI} — ${ind.stochSignal}

Moving Averages:
  SMA 5: ${ind.sma5} | SMA 10: ${ind.sma10} | SMA 20: ${ind.sma20} | SMA 50: ${ind.sma50}
  EMA 9: ${ind.ema9} | EMA 21: ${ind.ema21}
  MA Summary Signal: ${t.movingAverageSummary}

MACD (12,26,9): Line=${ind.macd.macdLine} | Signal=${ind.macd.signalLine} | Histogram=${ind.macd.histogram} — ${ind.macd.signal}

Bollinger Bands (20,2): Upper=${ind.bollingerBands.upper} | Middle=${ind.bollingerBands.middle} | Lower=${ind.bollingerBands.lower}
  Bandwidth: ${ind.bollingerBands.bandwidth}% | Position: ${ind.bollingerBands.position}

ATR (14): ${ind.atr14}

Pivot Points (Classic):
  R3: ${piv.r3} | R2: ${piv.r2} | R1: ${piv.r1}
  Pivot: ${piv.pivot}
  S1: ${piv.s1} | S2: ${piv.s2} | S3: ${piv.s3}

Overall Signal: ${t.overallSignal}
=== END OF NIFTY 50 TECHNICAL DATA ===`;
    }

    // Build Bank Nifty technical section
    let bankNiftySection = '';
    if (technicalData?.bankNifty) {
      const b = technicalData.bankNifty;
      const bi = b.indicators;
      const bp = b.pivotPoints;
      bankNiftySection = `
=== REAL BANK NIFTY TECHNICAL INDICATORS (CALCULATED FROM ACTUAL DATA — USE THESE EXACT VALUES) ===
Current Price: ${b.currentPrice} | Day: ${b.dayLow} - ${b.dayHigh} | Change: ${b.dayChange} (${b.dayChangePct}%)
Week Change: ${b.weekChange} (${b.weekChangePct}%)

RSI (14): ${bi.rsi14} — ${bi.rsiSignal}
Stochastic RSI: ${bi.stochasticRSI} — ${bi.stochSignal}

Moving Averages:
  SMA 5: ${bi.sma5} | SMA 10: ${bi.sma10} | SMA 20: ${bi.sma20} | SMA 50: ${bi.sma50}
  EMA 9: ${bi.ema9} | EMA 21: ${bi.ema21}
  MA Summary Signal: ${b.movingAverageSummary}

MACD (12,26,9): Line=${bi.macd.macdLine} | Signal=${bi.macd.signalLine} | Histogram=${bi.macd.histogram} — ${bi.macd.signal}

Bollinger Bands (20,2): Upper=${bi.bollingerBands.upper} | Middle=${bi.bollingerBands.middle} | Lower=${bi.bollingerBands.lower}
  Bandwidth: ${bi.bollingerBands.bandwidth}% | Position: ${bi.bollingerBands.position}

ATR (14): ${bi.atr14}

Pivot Points (Classic):
  R3: ${bp.r3} | R2: ${bp.r2} | R1: ${bp.r1}
  Pivot: ${bp.pivot}
  S1: ${bp.s1} | S2: ${bp.s2} | S3: ${bp.s3}

Overall Signal: ${b.overallSignal}
=== END OF BANK NIFTY TECHNICAL DATA ===`;
    }

    // Build Sensex technical section
    let sensexSection = '';
    if (technicalData?.sensex) {
      const s = technicalData.sensex;
      const si = s.indicators;
      const sp = s.pivotPoints;
      sensexSection = `
=== REAL SENSEX TECHNICAL INDICATORS (CALCULATED FROM ACTUAL DATA — USE THESE EXACT VALUES) ===
Current Price: ${s.currentPrice} | Day: ${s.dayLow} - ${s.dayHigh} | Change: ${s.dayChange} (${s.dayChangePct}%)
Week Change: ${s.weekChange} (${s.weekChangePct}%)

RSI (14): ${si.rsi14} — ${si.rsiSignal}
Stochastic RSI: ${si.stochasticRSI} — ${si.stochSignal}

Moving Averages:
  SMA 5: ${si.sma5} | SMA 10: ${si.sma10} | SMA 20: ${si.sma20} | SMA 50: ${si.sma50}
  EMA 9: ${si.ema9} | EMA 21: ${si.ema21}
  MA Summary Signal: ${s.movingAverageSummary}

MACD (12,26,9): Line=${si.macd.macdLine} | Signal=${si.macd.signalLine} | Histogram=${si.macd.histogram} — ${si.macd.signal}

Bollinger Bands (20,2): Upper=${si.bollingerBands.upper} | Middle=${si.bollingerBands.middle} | Lower=${si.bollingerBands.lower}
  Bandwidth: ${si.bollingerBands.bandwidth}% | Position: ${si.bollingerBands.position}

ATR (14): ${si.atr14}

Pivot Points (Classic):
  R3: ${sp.r3} | R2: ${sp.r2} | R1: ${sp.r1}
  Pivot: ${sp.pivot}
  S1: ${sp.s1} | S2: ${sp.s2} | S3: ${sp.s3}

Overall Signal: ${s.overallSignal}
=== END OF SENSEX TECHNICAL DATA ===`;
    }

    // Build option chain section
    let optionChainSection = '';
    if (technicalData?.optionChain) {
      const oc = technicalData.optionChain;
      optionChainSection = `
=== NIFTY OPTION CHAIN DATA (REAL NSE DATA) ===
Spot Price: ${oc.spotPrice} | Nearest Expiry: ${oc.nearestExpiry}
Put-Call Ratio (PCR): ${oc.pcr} — ${oc.pcrSignal}
Total Call OI: ${oc.totalCallOI?.toLocaleString()} | Total Put OI: ${oc.totalPutOI?.toLocaleString()}
Max Call OI at Strike: ${oc.maxCallOIStrike} (OI: ${oc.maxCallOI?.toLocaleString()}) — This is RESISTANCE
Max Put OI at Strike: ${oc.maxPutOIStrike} (OI: ${oc.maxPutOI?.toLocaleString()}) — This is SUPPORT
Max Call OI Change at: ${oc.maxCallOIChangeStrike} | Max Put OI Change at: ${oc.maxPutOIChangeStrike}
IV Signal: ${oc.ivSignal || 'N/A'}
=== END OF OPTION CHAIN DATA ===`;
    }

    return `You are a popular Indian stock market YouTuber who explains complex financial news in SIMPLE, EASY-TO-UNDERSTAND language. Think of yourself like a friendly expert talking to regular people — not Wall Street bankers.

Today's date is ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

YOUR STYLE:
- Write like you're explaining to a friend who is new to the stock market
- Use simple English, short sentences
- Avoid heavy jargon — when you must use technical terms, explain them in brackets
- Be conversational and engaging, like a YouTube script
- Use phrases like "Here's the thing...", "Now pay attention to this...", "This is important because...", "In simple words...", "Let me break this down..."
- Make it interesting to read, not boring
- BUT keep the analysis accurate and data-driven

CRITICAL RULES:
- All news is from the LAST 24 HOURS ONLY. Only analyze today's news.
- For ALL numbers (Nifty levels, RSI, support, resistance etc.), use the EXACT real data provided below. Do NOT make up any numbers.
- Support levels MUST be BELOW current price. Resistance MUST be ABOVE current price.
${liveDataSection}
${technicalSection}
${bankNiftySection}
${sensexSection}
${optionChainSection}

=== TODAY'S NEWS ARTICLES (Last 24 Hours) ===
${articleSummaries}
=== END OF ARTICLES ===

You are a senior Indian share market analyst with 20+ years of experience in equity research, technical analysis, fundamental analysis, and macroeconomic interpretation across NSE and BSE markets.

You will be given raw market data for the current trading day. Based on this data, generate a comprehensive daily market report.

STRICT OUTPUT RULE: Respond with ONLY valid JSON. Do NOT include markdown code blocks (no json), explanations, preambles, or any text outside the JSON object. Your entire response must be parseable by JSON.parse()
Strict Requirements:
Maintain the exact JSON schema and field names as provided.
Do not remove, rename, or restructure any existing fields.
You may enrich content inside existing fields, but the structure must remain unchanged.
Expand the Nifty's technical section to include THREE support levels and THREE resistance levels (all must be real levels based on current live market data).
Add additional relevant technical insights inside the "nifty50Analysis, bankniftyAnalysis, sensexAnalysis" object without breaking the structure or removing any existing keys.
Use real, up-to-date live market data for prices, RSI, ATR, pivot points, commodities, currencies, and global indices.
All numerical values must be realistic, internally consistent, and logically aligned.
Generate at least 5 to 8 major market events. Each event must be informative, neutral, and data-driven. Avoid sensationalism or clickbait style.
Do NOT repeat any event in the "events" section if it is already covered in the "overallMarketSummary" or "globalMarketSnapshot" sections. Avoid duplication across sections.
In the "events" section, do not mention global market movements already covered like Gold, oil prices (commodities) and currencies Dollar-Rupee.

The writing tone must be professional, factual, and analytical — similar to a financial newspaper or equity research desk report. Avoid YouTube-style narration. Use clear, simple English that is easy for a common investor to understand.

Content Guidelines:

Event summaries must be informative, neutral, and data-driven.
Avoid conversational hooks like “What does this mean for your money?” or exaggerated phrases.
Keep explanations structured, clear, and professional.
Ensure macro, global, domestic, sectoral, and policy events are balanced.
Each event must clearly explain: what happened, why it matters, and its likely market impact — in simple but professional language.
Ensure that any global market movements mentioned in "globalMarketSnapshot" are NOT repeated as standalone events in the "events" array.

Enhanced JSON Structure (Do Not Modify This Structure):
{
  "reportTitle": "Market Report - [Today's Date]",
  "generatedAt": "${new Date().toISOString()}",
  "events": [
    {
      "eventNumber": 1,
      "title": "Short catchy title (like a YouTube video title)",
      "detailedSummary": "Explain this event in simple English like a YouTube script. 4-6 sentences. What happened? Why does it matter? How does it affect YOUR money? Use conversational tone.",
      "historicalComparison": "Has something like this happened before? What happened to the market then? Keep it simple. Say 'Nothing similar recently' if none.",
      "verificationStatus": "Confirmed | Official Source | Market Rumor | Assumption",
      "expectedImpact": "Positive | Negative | Neutral",
      "impactSeverity": "Low | Moderate | High",
      "estimatedImpactPercent": "e.g., '0.5-1.0%' or 'Hard to predict exactly'",
      "affectedMarkets": ["Nifty 50", "Bank Nifty", "IT Sector", "etc."],
      "sourceReliability": "High | Medium | Low",
      "category": "Category",
      "newsDate": "The date/time this news was published, e.g. '23 Feb 2026, 10:30 AM' — pick it from the article's Published date"
    }
  ],
  "overallMarketSummary": {
    "intradayOutlook": "Simple 3-4 sentence outlook. Tell people what to expect today in plain language. Like: 'Market is likely to open flat because...'",
    "sentimentIndicator": "Bullish | Mildly Bullish | Neutral | Mildly Bearish | Bearish",
    "nifty50Analysis": {
      "currentPrice": "USE THE EXACT PRICE FROM LIVE DATA",
      "supportLevels": ["Support 1 (nearest)","Support 2","Support 3 (strongest)"],
      "resistanceLevels": ["Resistance 1 (nearest)", "Resistance 2", "Resistance 3 (strongest)"],
      "trend": "Uptrend | Downtrend | Sideways | Consolidation",
      "momentum": "Strong | Moderate | Weak",
      "volatilityExpectation": "Low | Moderate | High",
      "rsi": "USE EXACT RSI VALUE FROM TECHNICAL DATA",
      "rsiSignal": "What RSI tells us in simple words",
      "macdSignal": "What MACD tells us in simple words",
      "movingAverages": "Where is price vs SMA 20, EMA 9, EMA 21 — explain simply",
      "bollingerBandPosition": "Where is price in the Bollinger Band — explain simply",
      "pivotPoint": "Today's pivot point level",
      "atr": "ATR value — explain what this means for today's expected range"
    },
    "bankniftyAnalysis":{
      "currentPrice": "USE THE EXACT PRICE FROM BANK NIFTY TECHNICAL DATA",
      "supportLevels": ["Support 1 (nearest)","Support 2","Support 3 (strongest)"],
      "resistanceLevels": ["Resistance 1 (nearest)", "Resistance 2", "Resistance 3 (strongest)"],
      "trend": "Uptrend | Downtrend | Sideways | Consolidation",
      "momentum": "Strong | Moderate | Weak",
      "volatilityExpectation": "Low | Moderate | High",
      "rsi": "USE EXACT RSI VALUE FROM BANK NIFTY TECHNICAL DATA",
      "rsiSignal": "What RSI tells us in simple words",
      "macdSignal": "What MACD tells us in simple words",
      "movingAverages": "Where is price vs SMA 20, EMA 9, EMA 21 — explain simply",
      "bollingerBandPosition": "Where is price in the Bollinger Band — explain simply",
      "pivotPoint": "Today's pivot point level",
      "atr": "ATR value — explain what this means for today's expected range"
    },
    "sensexAnalysis":{
      "currentPrice": "USE THE EXACT PRICE FROM SENSEX TECHNICAL DATA",
      "supportLevels": ["Support 1 (nearest)","Support 2","Support 3 (strongest)"],
      "resistanceLevels": ["Resistance 1 (nearest)", "Resistance 2", "Resistance 3 (strongest)"],
      "trend": "Uptrend | Downtrend | Sideways | Consolidation",
      "momentum": "Strong | Moderate | Weak",
      "volatilityExpectation": "Low | Moderate | High",
      "rsi": "USE EXACT RSI VALUE FROM SENSEX TECHNICAL DATA",
      "rsiSignal": "What RSI tells us in simple words",
      "macdSignal": "What MACD tells us in simple words",
      "movingAverages": "Where is price vs SMA 20, EMA 9, EMA 21 — explain simply",
      "bollingerBandPosition": "Where is price in the Bollinger Band — explain simply",
      "pivotPoint": "Today's pivot point level",
      "atr": "ATR value — explain what this means for today's expected range"
    },
    "technicalAnalysis": "2-3 sentences explaining the technical picture in SIMPLE language. Like: 'RSI is at 55 which means the market is neither too hot nor too cold. MACD is showing bullish momentum which means buyers are in control right now.'",
    "optionChainAnalysis": "2-3 sentences about what the option chain data tells us. Like: 'The PCR is 1.2 which means more people are selling puts — this is a bullish sign. Maximum call OI is at 25800 which acts as resistance, and maximum put OI is at 25500 which acts as support.'",
    "keyRisks": ["Risk in simple words", "Another risk"],
    "keyOpportunities": ["Opportunity in simple words", "Another opportunity"]
  },
  "globalMarketSnapshot": {
    "usMarkets": "What happened in US markets — explain simply with actual numbers from live data",
    "europeanMarkets": "European market summary in simple words",
    "asianMarkets": "Asian markets summary in simple words",
    "commodities": "Gold, oil prices — use actual numbers from live data",
    "currencies": "Dollar-Rupee and other currency movements — use actual numbers from live data"
  },
  "disclaimer": "Hey, this report is made by Chang Research Base to help you understand the market better. This is NOT financial advice — please do your own research before investing. Always check with a certified financial advisor. The analysis mixes facts with predictions, and predictions can go wrong!"
}

Generate AT LEAST 5-8 events. Make it informative but fun to read — like the best stock market YouTube channels!`;
  }

  /**
   * Call Google Gemini API
   */
  async callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured. Add it to your .env file.');
    }

    try {
      const startTime = Date.now();

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
          },
        },
        {
          timeout: 120000, // 120s
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      return this.parseAIResponse(text);
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        throw new Error('Gemini API timeout after 120 seconds - try again with shorter prompt or check network connection');
      }
      if (err.response?.status === 429) {
        throw new Error(`Gemini API error: ${err}`);
      }
      if (err.response?.status === 403) {
        throw new Error('Gemini API key is invalid or doesn\'t have access. Check your API key.');
      }
      throw new Error(`Gemini API error: ${err.message}`);
    }
  }

  /**
   * Call OpenRouter API (supports free models)
   */
  async callOpenRouter(prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
      throw new Error('OPENROUTER_API_KEY is not configured. Add it to your .env file.');
    }

    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

    try {
      const startTime = Date.now();
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert financial analyst. Always respond with valid JSON only, no markdown formatting.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        },
        {
          timeout: 120000, // 120s
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Market Report Dashboard',
          },
        }
      );
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Empty response from OpenRouter API');
      }

      return this.parseAIResponse(text);
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        throw new Error('OpenRouter API timeout after 120 seconds - try again or check network connection');
      }
      if (err.response?.status === 429) {
        throw new Error('OpenRouter rate limit exceeded. Wait a moment and retry.');
      }
      if (err.response?.status === 401) {
        throw new Error('OpenRouter API key is invalid. Check your API key.');
      }
      throw new Error(`OpenRouter API error: ${err.message}`);
    }
  }

  /**
   * Parse and validate AI response JSON
   */
  parseAIResponse(text) {
    // Strip markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
      const parsed = JSON.parse(cleaned);
      // Validate basic structure
      if (!parsed.events || !Array.isArray(parsed.events)) {
        throw new Error('Missing events array in response');
      }
      if (!parsed.overallMarketSummary) {
        throw new Error('Missing overallMarketSummary in response');
      }
      return parsed;
    } catch (parseErr) {
      throw new Error(`Failed to parse AI response as JSON: ${parseErr.message}. Raw start: ${cleaned.substring(0, 200)}...`);
    }
  }
}

module.exports = new AIService();
