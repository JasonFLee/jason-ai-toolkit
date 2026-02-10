import axios from 'axios';
import * as cheerio from 'cheerio';

export interface InsiderTrade {
  ticker: string;
  company: string;
  insiderName: string;
  title: string;
  transactionType: 'buy' | 'sell';
  shares: number;
  value: number;
  date: Date;
  source: string;
}

export interface CongressTrade {
  politician: string;
  party: string;
  chamber: 'House' | 'Senate';
  ticker: string;
  company: string;
  transactionType: 'buy' | 'sell';
  amountMin: number;
  amountMax: number;
  tradeDate: Date;
  source: string;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.dataroma.com/',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
};

export async function scrapeDataroma(): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  try {
    // Get purchases only with ?po=1
    const response = await axios.get('https://www.dataroma.com/m/ins/ins.php?po=1', {
      headers: HEADERS,
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);

    // Parse the insider trading table - uses table#grid tbody tr
    $('table#grid tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 10) {
        // Structure: Filing, Symbol, Security, Reporting Name, Relationship, Trans Date, Purchase/Sale, Shares, Price, Amount, D/I
        const ticker = $(cells[1]).text().trim();
        const company = $(cells[2]).text().trim();
        const insider = $(cells[3]).text().trim();
        const title = $(cells[4]).text().trim();
        const transType = $(cells[6]).text().trim().toLowerCase();
        const sharesText = $(cells[7]).text().trim();
        const amountText = $(cells[9]).text().trim();

        if (ticker && ticker.length <= 5 && transType.includes('purchase')) {
          const shares = parseInt(sharesText.replace(/,/g, '')) || 0;
          const value = parseFloat(amountText.replace(/,/g, '')) || 0;
          trades.push({
            ticker: ticker.toUpperCase(),
            company,
            insiderName: insider,
            title,
            transactionType: 'buy',
            shares,
            value,
            date: new Date(),
            source: 'dataroma',
          });
        }
      }
    });
  } catch (error) {
    console.error('Error scraping Dataroma:', error);
  }

  return trades;
}

export async function scrapeSecForm4(): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  try {
    const response = await axios.get('https://www.secform4.com/all-buys', {
      headers: HEADERS,
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);

    // Parse the table rows
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const ticker = $(cells[0]).text().trim();
        const company = $(cells[1]).text().trim();
        const insider = $(cells[2]).text().trim();
        const title = $(cells[3]).text().trim();
        const valueText = $(cells[4]).text().trim();

        if (ticker && ticker.length <= 5) {
          const value = parseFloat(valueText.replace(/[$,]/g, '')) || 0;
          trades.push({
            ticker: ticker.toUpperCase(),
            company,
            insiderName: insider,
            title,
            transactionType: 'buy',
            shares: 0,
            value,
            date: new Date(),
            source: 'secform4',
          });
        }
      }
    });
  } catch (error) {
    console.error('Error scraping SecForm4:', error);
  }

  return trades;
}

export async function scrapeCapitolTrades(): Promise<CongressTrade[]> {
  const trades: CongressTrade[] = [];

  try {
    const response = await axios.get('https://www.capitoltrades.com/trades?txType=buy', {
      headers: HEADERS,
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);

    // Parse trade data from the page
    $('table tbody tr, .trade-row').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const politician = $(cells[0]).text().trim();
        const partyText = $(cells[1]).text().trim();
        const ticker = $(cells[2]).text().trim().replace(':US', '');
        const company = $(cells[3]).text().trim();
        const amountText = $(cells[4]).text().trim();

        if (politician && ticker) {
          const party = partyText.includes('Democrat') ? 'Democrat' : 'Republican';
          const chamber = partyText.includes('Senate') ? 'Senate' : 'House';

          // Parse amount range like "$1K-15K"
          const amountMatch = amountText.match(/\$?([\d.]+)K?\s*[-–]\s*\$?([\d.]+)K?/i);
          let amountMin = 0;
          let amountMax = 0;
          if (amountMatch) {
            amountMin = parseFloat(amountMatch[1]) * (amountText.includes('K') ? 1000 : 1);
            amountMax = parseFloat(amountMatch[2]) * (amountText.includes('K') ? 1000 : 1);
          }

          trades.push({
            politician,
            party: party as 'Democrat' | 'Republican',
            chamber: chamber as 'House' | 'Senate',
            ticker: ticker.toUpperCase(),
            company,
            transactionType: 'buy',
            amountMin,
            amountMax,
            tradeDate: new Date(),
            source: 'capitoltrades',
          });
        }
      }
    });
  } catch (error) {
    console.error('Error scraping Capitol Trades:', error);
  }

  return trades;
}

export async function getAllRealData(): Promise<{
  insiderTrades: InsiderTrade[];
  congressTrades: CongressTrade[];
}> {
  console.log('  Fetching real insider data from Dataroma...');
  const dataromaTrades = await scrapeDataroma();
  console.log(`    Found ${dataromaTrades.length} trades from Dataroma`);

  console.log('  Fetching real insider data from SecForm4...');
  const secForm4Trades = await scrapeSecForm4();
  console.log(`    Found ${secForm4Trades.length} trades from SecForm4`);

  console.log('  Fetching Congress trades from Capitol Trades...');
  const congressTrades = await scrapeCapitolTrades();
  console.log(`    Found ${congressTrades.length} Congress trades`);

  // Combine and dedupe insider trades
  const allInsiderTrades = [...dataromaTrades, ...secForm4Trades];
  const uniqueInsiderTrades = allInsiderTrades.filter((trade, index, self) =>
    index === self.findIndex(t => t.ticker === trade.ticker && t.insiderName === trade.insiderName)
  );

  return {
    insiderTrades: uniqueInsiderTrades,
    congressTrades,
  };
}
