# Developer Documentation
## Market Intelligence Dashboard

---

## 1. Getting Started

### Prerequisites

Ensure you have the following installed on your development machine:

- **Node.js**: Version 18.x or higher ([Download](https://nodejs.org/))
- **npm**: Version 9.x or higher (comes with Node.js)
- **Git**: For version control
- **Code Editor**: VS Code recommended with extensions:
  - JavaScript (ES6) code snippets
  - REST Client (for API testing)
  - Prettier (code formatting)

### Quick Setup

1. **Clone or Navigate to Project**
   ```bash
   cd market-report-dashboard
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```

4. **Configure API Keys** (Edit `.env` file)
   ```env
   # Minimum required: At least one AI provider key
   GEMINI_API_KEY=your_actual_key_here
   # OR
   OPENROUTER_API_KEY=your_actual_key_here
   
   # Optional but recommended for better news coverage
   NEWS_API_KEY=your_newsapi_key_here
   ```

5. **Start Development Server**
   ```bash
   npm start
   ```

6. **Verify Installation**
   - Open http://localhost:3000
   - Check health endpoint: http://localhost:3000/api/health
   - Click "Generate Market Report" to test full functionality

---

## 2. Development Environment

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `AI_PROVIDER` | No | gemini | AI service provider (gemini\|openrouter) |
| `GEMINI_API_KEY` | Conditional* | - | Google Gemini API key |
| `OPENROUTER_API_KEY` | Conditional* | - | OpenRouter API key |
| `OPENROUTER_MODEL` | No | google/gemini-2.0-flash-exp:free | OpenRouter model selection |
| `NEWS_API_KEY` | No | - | NewsAPI.org key (improves news coverage) |

*At least one AI provider key is required.

### Getting API Keys

#### Google Gemini (Recommended - Free Tier Available)
1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google account
3. Click "Create API Key"
4. Copy key to `.env` file as `GEMINI_API_KEY`

#### OpenRouter (Alternative - Free Models Available)
1. Visit [OpenRouter.ai](https://openrouter.ai/keys)
2. Sign up and verify account
3. Generate API key
4. Copy key to `.env` file as `OPENROUTER_API_KEY`

#### NewsAPI (Optional - Free Tier Available)
1. Visit [NewsAPI.org](https://newsapi.org/register)
2. Sign up with email
3. Copy API key to `.env` file as `NEWS_API_KEY`

### Development Scripts

```bash
# Start development server
npm start

# Start with specific port
PORT=8080 npm start

# Start with specific AI provider
AI_PROVIDER=openrouter npm start

# Test news fetching only (no AI analysis)
curl http://localhost:3000/api/test-news
```

---

## 3. Project Structure

### Directory Layout

```
market-report-dashboard/
├── server.js                 # Main Express server entry point
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── .env                      # Your local environment (git-ignored)
├── routes/
│   └── report.js            # API route handlers
├── services/
│   ├── newsService.js       # Multi-source news aggregation
│   ├── aiService.js         # AI provider abstraction layer
│   └── technicalService.js  # Technical indicator calculations
└── public/
    └── index.html           # Frontend dashboard (SPA)
```

### Key Modules

#### `/server.js` - Application Entry Point
- Express.js server initialization
- Middleware configuration (CORS, JSON parsing)
- Route mounting and static file serving
- Server startup and error handling

#### `/routes/report.js` - API Endpoints
- **Health Check**: System status and configuration validation
- **Report Generation**: Orchestrates news fetch + AI analysis
- **News Testing**: Preview news gathering without AI processing
- Error handling with user-friendly suggestions

#### `/services/newsService.js` - News Aggregation
- Multi-source news fetching with fallback mechanisms
- Time-based filtering (last 24 hours only)
- Deduplication algorithm based on title similarity
- Live market data integration
- Error resilience and source prioritization

#### `/services/aiService.js` - AI Analysis Layer
- Provider-agnostic AI service abstraction
- Support for Google Gemini and OpenRouter
- Structured prompt engineering for financial analysis
- JSON response parsing and validation
- Rate limit handling and error recovery

#### `/services/technicalService.js` - Technical Analysis
- Real-time technical indicator calculations
- Historical data fetching from Yahoo Finance
- Option chain analysis from NSE
- Support/resistance level identification
- Trend and momentum analysis

#### `/public/index.html` - Frontend Dashboard
- Single-page application with vanilla JavaScript
- Responsive CSS with dark theme
- Real-time report generation interface
- Error handling and loading states

---

## 4. API Reference

### Development Testing

#### Health Check
```bash
curl -X GET http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "provider": "gemini",
  "hasNewsApiKey": true,
  "hasAiKey": true
}
```

#### Generate Report
```bash
curl -X POST http://localhost:3000/api/generate-report \
  -H "Content-Type: application/json"
```

#### Test News Fetch
```bash
curl -X GET http://localhost:3000/api/test-news
```

### Response Formats

All API responses follow this structure:
```json
{
  "success": boolean,
  "data": {},
  "error": "string (if success=false)",
  "meta": {
    "generationTime": "12.3s",
    "articlesAnalyzed": 45
  }
}
```

---

## 5. Development Guidelines

### Code Style & Conventions

#### JavaScript Style
- **ES6+ Features**: Use modern JavaScript (async/await, arrow functions, destructuring)
- **Semicolons**: Required at statement ends
- **Quotes**: Single quotes for strings, double quotes for JSON
- **Naming**: camelCase for variables and functions, PascalCase for classes
- **Constants**: UPPER_SNAKE_CASE for module-level constants

#### Example Code Style:
```javascript
// Good
const NewsService = require('../services/newsService');
const { generateReport } = require('./helpers');

async function handleReportGeneration(req, res) {
  try {
    const startTime = Date.now();
    const newsData = await NewsService.fetchAllNews();
    // ... rest of function
  } catch (error) {
    console.error('[Report] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Avoid
var newsService = require('../services/newsService')
function handleReportGeneration(req, res) {
  newsService.fetchAllNews().then(function(newsData) {
    // callback-style code
  }).catch(function(error) {
    // error handling
  })
}
```

### Error Handling Patterns

#### Service Layer Error Handling
```javascript
class NewsService {
  async fetchFromSource(url) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      return this.parseResponse(response.data);
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded for news source');
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('News source timeout - slow network');
      }
      throw new Error(`News fetch failed: ${error.message}`);
    }
  }
}
```

#### Route Layer Error Handling
```javascript
router.post('/generate-report', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const result = await generateFullReport();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    res.json({
      success: true,
      ...result,
      meta: { generationTime: `${duration}s` }
    });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: getSuggestion(error.message),
      meta: { generationTime: `${duration}s` }
    });
  }
});
```

### Logging Guidelines

#### Structured Logging
```javascript
// Good - Structured with context
console.log(`[${serviceName}] Fetched ${articles.length} articles from ${sourceName}`);
console.log(`[Report] Analysis complete. Found ${events.length} events.`);

// Better - With timing
const startTime = Date.now();
// ... operation
console.log(`[${serviceName}] Operation completed in ${Date.now() - startTime}ms`);

// Error logging with context
console.error(`[${serviceName}] Failed to fetch from ${source}: ${error.message}`);
```

#### Log Levels
- `console.log()`: Informational messages (data fetch success, processing steps)
- `console.error()`: Error messages with context
- `console.warn()`: Non-critical issues (fallback usage, rate limit warnings)

---

## 6. Testing Procedures

### Manual Testing

#### 1. Basic Functionality Test
```bash
# Start server
npm start

# Check health
curl http://localhost:3000/api/health

# Expected: All keys should be configured
{
  "status": "ok",
  "provider": "gemini",
  "hasNewsApiKey": true,
  "hasAiKey": true
}
```

#### 2. News Service Test
```bash
# Test news fetching
curl http://localhost:3000/api/test-news

# Expected: Array of recent articles
{
  "success": true,
  "articles": [...],
  "fetchedAt": "2026-02-24T...",
  "sources": 3
}
```

#### 3. Full Report Generation Test
```bash
# Generate complete report (takes 10-15 seconds)
curl -X POST http://localhost:3000/api/generate-report

# Expected: Complete analysis report
{
  "success": true,
  "report": {
    "events": [...],
    "overallMarketSummary": {...}
  },
  "meta": {
    "articlesAnalyzed": 45,
    "generationTime": "12.3s"
  }
}
```

### Error Scenario Testing

#### Missing API Keys
```bash
# Remove GEMINI_API_KEY from .env
npm start
curl -X POST http://localhost:3000/api/generate-report

# Expected: Error with suggestion
{
  "success": false,
  "error": "GEMINI_API_KEY is not configured...",
  "suggestion": "Get a free Gemini API key at https://aistudio.google.com/apikey"
}
```

#### Network Connectivity Issues
```bash
# Test with no internet connection
# Expected: Graceful error handling with specific error messages
```

### Performance Testing

#### Response Time Monitoring
```bash
# Time the report generation
time curl -X POST http://localhost:3000/api/generate-report

# Expected: 8-15 seconds for complete report
```

#### Concurrent Request Testing
```bash
# Test multiple simultaneous requests
for i in {1..3}; do 
  curl -X POST http://localhost:3000/api/generate-report & 
done
wait

# Monitor for rate limiting or timeout issues
```

---

## 7. Debugging

### Common Issues & Solutions

#### 1. "Empty response from AI API"
**Cause**: AI service returns malformed or empty response
**Debug Steps**:
```javascript
// Add debugging to aiService.js
console.log('AI Response Raw:', response.data);
console.log('Extracted Text:', text);
```

**Solutions**:
- Check API key validity
- Verify prompt length (not exceeding token limits)
- Check AI provider status page

#### 2. "Could not fetch news from any source"
**Cause**: All news sources failing
**Debug Steps**:
```javascript
// Add debugging to newsService.js
console.log('Trying NewsAPI:', this.newsApiKey ? 'configured' : 'missing');
console.log('Google News RSS response:', response.status);
```

**Solutions**:
- Check internet connectivity
- Verify NewsAPI key if configured
- Check Google News RSS availability

#### 3. "Rate limit exceeded"
**Cause**: Too many requests to external APIs
**Debug Steps**:
- Check API usage on provider dashboards
- Monitor request frequency in logs

**Solutions**:
- Wait for rate limit reset
- Use alternative AI provider
- Implement request queuing

#### 4. Technical Analysis Errors
**Cause**: Insufficient historical data or API issues
**Debug Steps**:
```javascript
// Add debugging to technicalService.js
console.log('Historical data points:', closes.length);
console.log('Current calculation inputs:', { high, low, close });
```

**Solutions**:
- Verify Yahoo Finance API availability
- Check data sufficiency (minimum 20 data points)
- Implement graceful degradation

### Development Debugging Tools

#### Live Reload Setup
```bash
# Install nodemon for development
npm install -g nodemon

# Start with auto-reload
nodemon server.js

# Or add to package.json
"scripts": {
  "dev": "nodemon server.js"
}
```

#### Request Debugging
```javascript
// Add request logging middleware in server.js
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});
```

#### Environment Debugging
```bash
# Debug environment configuration
node -e "
require('dotenv').config();
console.log('Environment check:');
console.log('AI Provider:', process.env.AI_PROVIDER);
console.log('Has Gemini Key:', !!process.env.GEMINI_API_KEY);
console.log('Has News Key:', !!process.env.NEWS_API_KEY);
"
```

---

## 8. Extending Functionality

### Adding New News Sources

#### 1. Create Source Function
```javascript
// In services/newsService.js
async fetchFromNewSource() {
  try {
    const response = await axios.get('https://api.newsource.com/finance', {
      params: { category: 'finance', limit: 20 },
      headers: { 'Authorization': `Bearer ${process.env.NEW_API_KEY}` }
    });

    return response.data.articles.map(article => ({
      title: article.headline,
      description: article.summary,
      source: 'NewSource',
      publishedAt: article.published_date,
      category: 'Finance'
    }));
  } catch (error) {
    throw new Error(`NewSource API error: ${error.message}`);
  }
}
```

#### 2. Integrate in Main Fetch
```javascript
// In fetchAllNews() method
try {
  const newSourceResults = await this.fetchFromNewSource();
  results.push(...newSourceResults);
} catch (err) {
  errors.push(`NewSource: ${err.message}`);
}
```

#### 3. Add Environment Variable
```bash
# In .env.example
NEW_SOURCE_API_KEY=your_new_source_key_here
```

### Adding New AI Providers

#### 1. Implement Provider Method
```javascript
// In services/aiService.js
async callNewAIProvider(prompt) {
  const apiKey = process.env.NEW_AI_API_KEY;
  if (!apiKey) {
    throw new Error('NEW_AI_API_KEY is not configured');
  }

  try {
    const response = await axios.post('/api/v1/generate', {
      prompt: prompt,
      max_tokens: 8192,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return this.parseAIResponse(response.data.generated_text);
  } catch (error) {
    throw new Error(`New AI Provider error: ${error.message}`);
  }
}
```

#### 2. Add to Provider Switch
```javascript
// In analyzeNews() method
switch (this.provider) {
  case 'gemini':
    return await this.callGemini(prompt);
  case 'openrouter':
    return await this.callOpenRouter(prompt);
  case 'newprovider':
    return await this.callNewAIProvider(prompt);
  default:
    throw new Error(`Unknown AI provider: ${this.provider}`);
}
```

### Adding New Technical Indicators

#### 1. Implement Calculation Function
```javascript
// In services/technicalService.js
calculateNewIndicator(prices, period = 14) {
  if (prices.length < period) return null;
  
  // Implement your indicator calculation
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += prices[i];
  }
  
  return sum / period;
}
```

#### 2. Add to Analysis Results
```javascript
// In getFullAnalysis() method
const newIndicator = this.calculateNewIndicator(closes, 14);

results.nifty50.indicators.newIndicator = {
  value: round(newIndicator, 2),
  signal: newIndicator > someThreshold ? 'Bullish' : 'Bearish'
};
```

### Adding New API Endpoints

#### 1. Create Route Handler
```javascript
// In routes/report.js
router.get('/new-endpoint', async (req, res) => {
  try {
    const result = await someService.performOperation();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
```

#### 2. Add Route Documentation
Update this documentation to include new endpoint specifications.

---

## 9. Maintenance

### Regular Maintenance Tasks

#### 1. Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Audit for security vulnerabilities
npm audit
npm audit fix
```

#### 2. API Key Rotation
- Generate new API keys from provider dashboards
- Update `.env` file with new keys
- Test functionality after key updates
- Remove old keys from provider accounts

#### 3. Performance Monitoring
- Monitor average response times
- Check external API rate limits and usage
- Review error rates and common failure points
- Analyze news source reliability

#### 4. Code Quality Maintenance
```bash
# Format code (if using Prettier)
npx prettier --write **/*.js

# Check for unused dependencies
npx depcheck

# Scan for potential security issues
npm audit
```

### Version Control Workflows

#### Git Best Practices
```bash
# Feature development workflow
git checkout -b feature/new-news-source
git commit -m "feat: add reuters news source integration"
git push origin feature/new-news-source

# Hotfix workflow
git checkout -b hotfix/api-key-validation
git commit -m "fix: improve api key validation error messages"
git push origin hotfix/api-key-validation
```

#### Commit Message Convention
- `feat:` New feature or functionality
- `fix:` Bug fix or issue resolution
- `docs:` Documentation updates
- `refactor:` Code refactoring without behavior change
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Maintenance tasks, dependency updates

### Deployment Considerations

#### Pre-deployment Checklist
- [ ] All environment variables configured
- [ ] Dependencies installed and audit clean
- [ ] API keys valid and within rate limits
- [ ] Health endpoint returning success
- [ ] Error handling tested for common scenarios
- [ ] Performance acceptable under expected load

#### Production Environment Setup
1. **Server Configuration**
   ```bash
   # Install PM2 for process management
   npm install -g pm2
   
   # Start application with PM2
   pm2 start server.js --name "market-dashboard"
   
   # Configure auto-restart
   pm2 startup
   pm2 save
   ```

2. **Environment Variables**
   ```bash
   # Production .env setup
   PORT=3000
   NODE_ENV=production
   GEMINI_API_KEY=prod_key_here
   NEWS_API_KEY=prod_key_here
   ```

3. **Reverse Proxy (Nginx)**
   ```nginx
   server {
     listen 80;
     server_name yourdomain.com;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```

---

This developer documentation provides comprehensive guidance for working with the Market Intelligence Dashboard codebase, from initial setup through advanced customization and maintenance procedures.