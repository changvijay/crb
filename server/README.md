# Market Intelligence Dashboard

AI-powered daily stock market news analysis dashboard that collects global financial news and generates structured analysis reports.

## Features

- **One-click report generation** — Click "Generate Market Report" to get a comprehensive analysis
- **Multi-source news aggregation** — Google News RSS (free), NewsAPI (optional), Yahoo Finance
- **AI-powered analysis** — Supports Google Gemini (free tier) and OpenRouter (free models)
- **Structured event analysis** — Each event includes impact assessment, historical comparison, verification status
- **Nifty 50 technical analysis** — Support/resistance levels, trend, momentum, volatility
- **Global market snapshot** — US, Europe, Asia, commodities, currencies
- **Server-side API key handling** — Keys never exposed to the browser
- **Clean dashboard UI** — Dark-themed, responsive, professional layout

## Quick Start

### 1. Install dependencies

```bash
cd market-report-dashboard
npm install
```

### 2. Configure API keys

Edit the `.env` file and add at least one AI API key:

```env
# Option A: Google Gemini (recommended — free tier)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here

# Option B: OpenRouter (free models available)
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
```

**Get free API keys:**
- Gemini: https://aistudio.google.com/apikey
- OpenRouter: https://openrouter.ai

**Optional** (improves news coverage):
- NewsAPI: https://newsapi.org/register

### 3. Start the server

```bash
npm start
```

### 4. Open the dashboard

Navigate to **http://localhost:3000** in your browser and click **Generate Market Report**.

## Architecture

```
market-report-dashboard/
├── server.js              # Express server entry point
├── routes/
│   └── report.js          # API endpoints
├── services/
│   ├── newsService.js     # Multi-source news aggregation
│   └── aiService.js       # AI analysis (Gemini / OpenRouter)
├── public/
│   └── index.html         # Dashboard frontend (single-page)
├── .env                   # Environment variables (not committed)
├── .env.example           # Template for environment variables
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| POST | `/api/generate-report` | Generate full market analysis report |
| GET | `/api/test-news` | Preview fetched news (without AI) |

## Data Coverage

- Global markets (US, Europe, Asia)
- Indian equities and Nifty 50
- Central bank policies (Fed, RBI, ECB, BoJ)
- Corporate earnings
- Commodities (oil, gold, metals)
- Currency markets (USD/INR, DXY)
- Geopolitical developments
- Macroeconomic indicators

## Report Structure

Each report includes:
1. **Market Events** — Title, detailed summary, historical comparison, verification status, impact assessment, affected markets
2. **Overall Summary** — Intraday outlook, sentiment indicator
3. **Nifty 50 Analysis** — Support/resistance, trend, momentum, volatility
4. **Global Snapshot** — US, Europe, Asia, commodities, currencies
5. **Risks & Opportunities**
6. **Disclaimer** — Clear separation of facts vs. predictions
