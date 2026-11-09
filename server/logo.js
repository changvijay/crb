const https = require('https');
const fs = require('fs');

const companies = [
  // IT
  { symbol: 'tcs', slug: 'tata-consultancy-services' },
  { symbol: 'infy', slug: 'infosys' },
  { symbol: 'wipro', slug: 'wipro' },
  { symbol: 'techm', slug: 'tech-mahindra' },
  { symbol: 'hcltech', slug: 'hcl-technologies' },
  { symbol: 'lti', slug: 'ltimindtree' },
  { symbol: 'mphasis', slug: 'mphasis' },

  // Banking
  { symbol: 'hdfcbank', slug: 'hdfc-bank' },
  { symbol: 'icicibank', slug: 'icici-bank' },
  { symbol: 'axisbank', slug: 'axis-bank' },
  { symbol: 'kotakbank', slug: 'kotak-mahindra-bank' },
  { symbol: 'sbin', slug: 'state-bank-of-india' },
  { symbol: 'indusindbk', slug: 'indusind-bank' },
  { symbol: 'federalbnk', slug: 'federal-bank' },

  // Financial
  { symbol: 'bajfinance', slug: 'bajaj-finance' },
  { symbol: 'hdfclife', slug: 'hdfc-life' },
  { symbol: 'sbilife', slug: 'sbi-life-insurance' },

  // Energy
  { symbol: 'reliance', slug: 'reliance-industries' },
  { symbol: 'ongc', slug: 'oil-and-natural-gas-corporation' },
  { symbol: 'ioc', slug: 'indian-oil-corporation' },
  { symbol: 'bpcl', slug: 'bharat-petroleum' },
  { symbol: 'adanigreen', slug: 'adani-green-energy' },
  { symbol: 'powergrid', slug: 'power-grid-corporation-of-india' },
  { symbol: 'ntpc', slug: 'ntpc' },

  // Auto
  { symbol: 'maruti', slug: 'maruti-suzuki' },
  { symbol: 'tatamotors', slug: 'tata-motors' },
  { symbol: 'mm', slug: 'mahindra-and-mahindra' },
  { symbol: 'bajajauto', slug: 'bajaj-auto' },
  { symbol: 'heromotoco', slug: 'hero-motocorp' },
  { symbol: 'eichermot', slug: 'eicher-motors' },
  { symbol: 'tvsmotor', slug: 'tvs-motor-company' },

  // Pharma
  { symbol: 'sunpharma', slug: 'sun-pharmaceutical' },
  { symbol: 'drreddy', slug: 'dr-reddys-laboratories' },
  { symbol: 'cipla', slug: 'cipla' },
  { symbol: 'divislab', slug: 'divis-laboratories' },
  { symbol: 'biocon', slug: 'biocon' },
  { symbol: 'lupin', slug: 'lupin' },
  { symbol: 'cadilahc', slug: 'zydus-lifesciences' },

  // FMCG
  { symbol: 'hindunilvr', slug: 'hindustan-unilever' },
  { symbol: 'itc', slug: 'itc' },
  { symbol: 'nestle', slug: 'nestle-india' },
  { symbol: 'britannia', slug: 'britannia-industries' },
  { symbol: 'dabur', slug: 'dabur-india' },
  { symbol: 'marico', slug: 'marico' },
  { symbol: 'colpal', slug: 'colgate-palmolive-india' },

  // Infra
  { symbol: 'lt', slug: 'larsen-and-toubro' },
  { symbol: 'ultracemco', slug: 'ultratech-cement' },
  { symbol: 'grasim', slug: 'grasim-industries' },
  { symbol: 'acc', slug: 'acc' },
  { symbol: 'adaniports', slug: 'adani-ports' },
  { symbol: 'hindpetro', slug: 'hindustan-petroleum' },

  // Metals
  { symbol: 'tatasteel', slug: 'tata-steel' },
  { symbol: 'jswsteel', slug: 'jsw-steel' },
  { symbol: 'hindalco', slug: 'hindalco-industries' },
  { symbol: 'vedl', slug: 'vedanta' },
  { symbol: 'coalindia', slug: 'coal-india' },
  { symbol: 'sail', slug: 'steel-authority-of-india' },

  // Telecom
  { symbol: 'airtel', slug: 'bharti-airtel' },
  { symbol: 'idea', slug: 'vodafone-idea' },

  // Others
  { symbol: 'asianpaints', slug: 'asian-paints' },
  { symbol: 'titan', slug: 'titan-company' },
  { symbol: 'adanienterpr', slug: 'adani-enterprises' },
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(file);
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject();
      res.pipe(stream);
      stream.on('finish', () => resolve());
    }).on('error', reject);
  });
}

fs.mkdirSync('./public/logos', { recursive: true });

(async () => {
  for (const c of companies) {
    try {
      const html = await fetchPage(`https://companieslogo.com/${c.slug}/logo/`);

      const match = html.match(/https:\/\/companieslogo\.com\/img\/orig\/[^"]+\.png/);

      if (!match) {
        console.log(`❌ not found: ${c.symbol}`);
        continue;
      }

      const imgUrl = match[0];
      const file = `./public/logos/${c.symbol}.png`;

      await download(imgUrl, file);

      console.log(`/logos/${c.symbol}.png`);
    } catch {
      console.log(`❌ failed: ${c.symbol}`);
    }
  }

  console.log('\n🔥 ALL DONE');
})();