import axios from 'axios';
import * as cheerio from 'cheerio';
import { CongressTransaction, Chamber, AmountRange } from '../types/transactions';

// House disclosure clerk website
const HOUSE_DISCLOSURES_URL = 'https://disclosures-clerk.house.gov/FinancialDisclosure';
// Senate financial disclosures
const SENATE_DISCLOSURES_URL = 'https://efdsearch.senate.gov/search/';
// Alternative: Capitol Trades aggregates this data
const CAPITOL_TRADES_API = 'https://www.capitoltrades.com/api/trades';
// Quiver Quant also provides this data
const QUIVER_CONGRESS_URL = 'https://www.quiverquant.com/congresstrading';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export class CongressTradingScraper {
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  parseAmountRange(rangeStr: string): AmountRange {
    // Parse strings like "$1,001 - $15,000" or "$1,000,001 - $5,000,000"
    const cleaned = rangeStr.replace(/[\$,]/g, '');
    const match = cleaned.match(/(\d+)\s*-\s*(\d+)/);

    if (match) {
      return {
        min: parseInt(match[1], 10),
        max: parseInt(match[2], 10),
      };
    }

    // Handle single values or "Over $X" formats
    const overMatch = cleaned.match(/[Oo]ver\s*(\d+)/);
    if (overMatch) {
      const val = parseInt(overMatch[1], 10);
      return { min: val, max: val * 2 };
    }

    return { min: 0, max: 0 };
  }

  async fetchHouseDisclosures(limit: number = 100): Promise<CongressTransaction[]> {
    const transactions: CongressTransaction[] = [];

    try {
      // Fetch the main disclosures page
      const response = await axios.get(
        `${HOUSE_DISCLOSURES_URL}/Search`,
        {
          headers: HEADERS,
          timeout: 30000,
        }
      );

      const $ = cheerio.load(response.data);

      // Find the periodic transaction reports (PTRs)
      // These are filed within 45 days of a transaction
      const reportLinks = $('a[href*="PTR"]').toArray();

      for (const link of reportLinks.slice(0, limit)) {
        const href = $(link).attr('href');
        if (href) {
          await this.delay(200);

          try {
            const ptrData = await this.fetchHousePTR(href);
            transactions.push(...ptrData);
          } catch (e) {
            // Continue on error
          }
        }
      }
    } catch (error) {
      console.error('Error fetching House disclosures:', error);
    }

    return transactions;
  }

  private async fetchHousePTR(ptrUrl: string): Promise<CongressTransaction[]> {
    const transactions: CongressTransaction[] = [];

    try {
      const fullUrl = ptrUrl.startsWith('http')
        ? ptrUrl
        : `${HOUSE_DISCLOSURES_URL}${ptrUrl}`;

      const response = await axios.get(fullUrl, {
        headers: HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);

      // Parse the PTR document structure
      const memberName = $('h2, .member-name').first().text().trim();
      const state =
        $('[data-state], .state')
          .first()
          .text()
          .trim()
          .match(/([A-Z]{2})/)?.[1] || '';

      // Find transaction rows
      $('tr, .transaction-row').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td, .cell').toArray();

        if (cells.length >= 4) {
          const assetDesc = $(cells[0]).text().trim();
          const txType = $(cells[1]).text().trim().toUpperCase();
          const dateStr = $(cells[2]).text().trim();
          const amount = $(cells[3]).text().trim();

          // Try to extract ticker from asset description
          const tickerMatch = assetDesc.match(
            /\b([A-Z]{1,5})\b(?:\s*[-:]\s*|\s+(?:Inc|Corp|Ltd|LLC))/
          );
          const ticker = tickerMatch ? tickerMatch[1] : '';

          if (ticker && (txType.includes('PURCHASE') || txType.includes('SALE'))) {
            transactions.push({
              memberName,
              chamber: 'HOUSE',
              state,
              ticker,
              assetDescription: assetDesc,
              transactionType: txType.includes('PURCHASE') ? 'PURCHASE' : 'SALE',
              transactionDate: new Date(dateStr || Date.now()),
              disclosureDate: new Date(),
              amountRange: this.parseAmountRange(amount),
              source: 'STOCK_ACT',
              disclosureUrl: fullUrl,
            });
          }
        }
      });
    } catch (error) {
      console.error('Error fetching House PTR:', error);
    }

    return transactions;
  }

  async fetchSenateDisclosures(limit: number = 100): Promise<CongressTransaction[]> {
    const transactions: CongressTransaction[] = [];

    try {
      // Senate EFD search page requires POST request
      const response = await axios.post(
        SENATE_DISCLOSURES_URL,
        new URLSearchParams({
          first_name: '',
          last_name: '',
          senator_state: '',
          report_type: 'ptr', // Periodic Transaction Reports
        }),
        {
          headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      const $ = cheerio.load(response.data);

      // Parse the results table
      $('table tbody tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td').toArray();

        if (cells.length >= 5) {
          const memberName = $(cells[0]).text().trim();
          const office = $(cells[1]).text().trim();
          const reportType = $(cells[2]).text().trim();
          const dateStr = $(cells[3]).text().trim();
          const reportLink = $row.find('a[href*="pdf"], a[href*="view"]').attr('href');

          // State extraction from office
          const stateMatch = office.match(/\b([A-Z]{2})\b/);
          const state = stateMatch ? stateMatch[1] : '';

          // Would need to fetch individual reports to get transaction details
          // For now, create placeholder entries
        }
      });
    } catch (error) {
      console.error('Error fetching Senate disclosures:', error);
    }

    return transactions.map((tx) => ({ ...tx, chamber: 'SENATE' as Chamber }));
  }

  async getAllCongressTrades(limit: number = 100): Promise<CongressTransaction[]> {
    const [houseTrades, senateTrades] = await Promise.all([
      this.fetchHouseDisclosures(Math.floor(limit / 2)),
      this.fetchSenateDisclosures(Math.floor(limit / 2)),
    ]);

    return [...houseTrades, ...senateTrades];
  }

  async getTradesByTicker(ticker: string, lookbackDays: number): Promise<CongressTransaction[]> {
    const allTrades = await this.getAllCongressTrades(200);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return allTrades.filter(
      (t) =>
        t.ticker.toUpperCase() === ticker.toUpperCase() &&
        new Date(t.transactionDate) >= cutoffDate
    );
  }

  // Alternative: Use public APIs that aggregate this data
  async fetchFromCapitolTrades(limit: number = 100): Promise<CongressTransaction[]> {
    const transactions: CongressTransaction[] = [];

    try {
      // Capitol Trades provides a cleaner API
      const response = await axios.get(`https://www.capitoltrades.com/trades`, {
        headers: HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);

      // Parse the trades table
      $('table.trades-table tbody tr, .trade-row').each((i, row) => {
        if (i >= limit) return false;

        const $row = $(row);

        // Extract trade data from the row
        const politician = $row.find('.politician, [data-politician]').text().trim();
        const ticker = $row.find('.ticker, [data-ticker]').text().trim().toUpperCase();
        const chamber = $row.find('.chamber, [data-chamber]').text().trim();
        const txType = $row.find('.type, [data-type]').text().trim();
        const amount = $row.find('.amount, [data-amount]').text().trim();
        const dateStr = $row.find('.date, [data-date]').text().trim();

        if (politician && ticker) {
          transactions.push({
            memberName: politician,
            chamber: chamber.toUpperCase().includes('SENATE') ? 'SENATE' : 'HOUSE',
            state: '', // Would need additional lookup
            ticker,
            assetDescription: ticker,
            transactionType: txType.toUpperCase().includes('BUY') ? 'PURCHASE' : 'SALE',
            transactionDate: new Date(dateStr || Date.now()),
            disclosureDate: new Date(),
            amountRange: this.parseAmountRange(amount),
            source: 'STOCK_ACT',
          });
        }
      });
    } catch (error) {
      console.error('Error fetching from Capitol Trades:', error);
    }

    return transactions;
  }

  // Use QuiverQuant as another source
  async fetchFromQuiverQuant(limit: number = 100): Promise<CongressTransaction[]> {
    const transactions: CongressTransaction[] = [];

    try {
      const response = await axios.get(QUIVER_CONGRESS_URL, {
        headers: HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);

      // Parse their trade display format
      $('[data-trade], .trade-entry').each((i, entry) => {
        if (i >= limit) return false;

        const $entry = $(entry);

        const name = $entry.find('[data-name], .name').text().trim();
        const ticker = $entry.find('[data-ticker], .ticker').text().trim().toUpperCase();
        const type = $entry.find('[data-type], .type').text().trim();
        const amount = $entry.find('[data-amount], .amount').text().trim();
        const date = $entry.find('[data-date], .date').text().trim();
        const chamber = $entry.find('[data-chamber], .chamber').text().trim();
        const state = $entry.find('[data-state], .state').text().trim();

        if (name && ticker) {
          transactions.push({
            memberName: name,
            chamber: chamber.toUpperCase() as Chamber || 'HOUSE',
            state: state.substring(0, 2).toUpperCase(),
            ticker,
            assetDescription: ticker,
            transactionType: type.toUpperCase().includes('BUY') ? 'PURCHASE' : 'SALE',
            transactionDate: new Date(date || Date.now()),
            disclosureDate: new Date(),
            amountRange: this.parseAmountRange(amount),
            source: 'STOCK_ACT',
          });
        }
      });
    } catch (error) {
      console.error('Error fetching from QuiverQuant:', error);
    }

    return transactions;
  }
}
