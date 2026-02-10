import axios from 'axios';
import * as cheerio from 'cheerio';

interface CongressTrade {
  politician: string;
  party: string;
  chamber: string;
  ticker: string;
  company: string;
  amountRange: string;
  tradeDate: string;
  disclosureDate: string;
  tradeType: 'buy' | 'sell';
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// Scrape House periodic transaction reports
async function scrapeHouseDisclosures(): Promise<CongressTrade[]> {
  const trades: CongressTrade[] = [];

  try {
    // House Financial Disclosure search - last 90 days of periodic transaction reports
    const searchUrl = 'https://disclosures-clerk.house.gov/FinancialDisclosure/ViewMemberSearchResult';

    const response = await axios.get(
      'https://disclosures-clerk.house.gov/FinancialDisclosure',
      { headers: HEADERS, timeout: 30000 }
    );

    // Parse the main page to find recent filings
    const $ = cheerio.load(response.data);

    // Look for PTR (Periodic Transaction Report) links
    $('a[href*="PTR"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      console.log(`Found PTR: ${text} - ${href}`);
    });

  } catch (error: any) {
    console.error('Error scraping House disclosures:', error.message);
  }

  return trades;
}

// Scrape Quiver Quant public data (free tier)
async function scrapeQuiverQuant(): Promise<CongressTrade[]> {
  const trades: CongressTrade[] = [];

  try {
    const response = await axios.get(
      'https://www.quiverquant.com/congresstrading/',
      { headers: HEADERS, timeout: 30000 }
    );

    const $ = cheerio.load(response.data);

    // Find trade table rows
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const politician = $(cells[0]).text().trim();
        const ticker = $(cells[1]).text().trim();
        const tradeType = $(cells[2]).text().trim().toLowerCase();
        const amount = $(cells[3]).text().trim();
        const date = $(cells[4]).text().trim();

        if (ticker && ticker.length <= 5 && tradeType.includes('buy')) {
          trades.push({
            politician,
            party: 'Unknown',
            chamber: 'Unknown',
            ticker: ticker.toUpperCase(),
            company: '',
            amountRange: amount,
            tradeDate: date,
            disclosureDate: date,
            tradeType: 'buy',
          });
        }
      }
    });

  } catch (error: any) {
    console.error('Error scraping Quiver Quant:', error.message);
  }

  return trades;
}

// Scrape Capitol Trades RSS/recent trades
async function scrapeCapitolTrades(): Promise<CongressTrade[]> {
  const trades: CongressTrade[] = [];

  try {
    // Try to get their sitemap or recent trades page
    const response = await axios.get(
      'https://www.capitoltrades.com/sitemap.xml',
      { headers: HEADERS, timeout: 30000 }
    );

    // Parse sitemap for recent trade URLs
    const $ = cheerio.load(response.data, { xmlMode: true });

    $('url loc').each((i, el) => {
      const url = $(el).text();
      if (url.includes('/trades/')) {
        console.log(`Found trade URL: ${url}`);
      }
    });

  } catch (error: any) {
    console.error('Capitol Trades scrape failed:', error.message);
  }

  return trades;
}

// Scrape Senate eFD (electronic Financial Disclosure)
async function scrapeSenateDisclosures(): Promise<CongressTrade[]> {
  const trades: CongressTrade[] = [];

  try {
    // Senate requires agreement to terms, so we check for recent filings
    const response = await axios.get(
      'https://efdsearch.senate.gov/search/home/',
      {
        headers: {
          ...HEADERS,
          'Referer': 'https://efdsearch.senate.gov/',
        },
        timeout: 30000,
      }
    );

    console.log('Senate eFD response length:', response.data.length);

  } catch (error: any) {
    console.error('Error scraping Senate eFD:', error.message);
  }

  return trades;
}

// Main function to get all Congress trades
export async function getCongressTrades(): Promise<CongressTrade[]> {
  console.log('Fetching live Congress trades...');

  // Try multiple sources
  const [quiverTrades] = await Promise.all([
    scrapeQuiverQuant(),
  ]);

  const allTrades = [...quiverTrades];

  console.log(`Found ${allTrades.length} Congress trades`);
  return allTrades;
}

// Get trades for a specific politician
export async function getPoliticianTrades(name: string): Promise<CongressTrade[]> {
  const allTrades = await getCongressTrades();
  return allTrades.filter(t =>
    t.politician.toLowerCase().includes(name.toLowerCase())
  );
}

// Test the scraper
if (import.meta.url === `file://${process.argv[1]}`) {
  getCongressTrades().then(trades => {
    console.log('\nCongress Trades:');
    trades.slice(0, 10).forEach(t => {
      console.log(`  ${t.politician}: ${t.tradeType.toUpperCase()} ${t.ticker} (${t.amountRange})`);
    });
  });
}
