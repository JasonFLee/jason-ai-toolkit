import axios from 'axios';
import * as cheerio from 'cheerio';
import { InsiderTransaction, TransactionType, OwnershipType, RawFiling } from '../types/transactions';

const SEC_EDGAR_BASE = 'https://www.sec.gov';
const SEC_EDGAR_SEARCH = 'https://efts.sec.gov/LATEST/search-index';
const SEC_FULL_TEXT_SEARCH = 'https://efts.sec.gov/LATEST/search-index';

// SEC requires User-Agent header
const SEC_HEADERS = {
  'User-Agent': 'InvestBot/1.0 (contact@investbot.example)',
  'Accept': 'application/json, text/html, application/xml',
  'Accept-Encoding': 'gzip, deflate',
};

export class SECForm4Scraper {
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Parse transaction code to BUY/SELL/etc
  private parseTransactionCode(code: string): TransactionType {
    const buyCodees = ['P', 'A']; // Purchase, Award
    const sellCodes = ['S', 'D', 'F']; // Sale, Disposition, F is tax withholding
    const exerciseCodes = ['M', 'C']; // Exercise, Conversion
    const giftCodes = ['G', 'I', 'J']; // Gift, Discretionary

    if (buyCodees.includes(code)) return 'BUY';
    if (sellCodes.includes(code)) return 'SELL';
    if (exerciseCodes.includes(code)) return 'EXERCISE';
    if (giftCodes.includes(code)) return 'GIFT';
    return 'OTHER';
  }

  async fetchRecentFilings(limit: number = 100): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];

    try {
      // Use SEC EDGAR full-text search API for Form 4 filings
      const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=${limit}&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      // Parse the Atom feed
      const $ = cheerio.load(response.data, { xmlMode: true });

      const entries = $('entry').toArray();

      for (const entry of entries.slice(0, limit)) {
        const $entry = $(entry);
        const title = $entry.find('title').text();
        const link = $entry.find('link').attr('href') || '';
        const updated = $entry.find('updated').text();

        // Extract CIK and accession number from link
        const linkMatch = link.match(/\/cgi-bin\/browse-edgar\?action=getcompany&CIK=(\d+)/);

        if (linkMatch) {
          // Fetch the filing details
          await this.delay(100); // Rate limiting for SEC

          try {
            const filingData = await this.fetchFilingDetails(link);
            if (filingData) {
              transactions.push(...filingData);
            }
          } catch (e) {
            // Skip failed filings but continue
            console.error(`Failed to fetch filing: ${link}`);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Form 4 filings:', error);
    }

    return transactions;
  }

  async fetchFilingDetails(filingUrl: string): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];

    try {
      const response = await axios.get(filingUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      // Look for XML filing link
      const $ = cheerio.load(response.data);
      const xmlLink = $('a[href*=".xml"]')
        .filter((_, el) => {
          const href = $(el).attr('href') || '';
          return href.includes('primary_doc') || !href.includes('index');
        })
        .first()
        .attr('href');

      if (xmlLink) {
        const fullXmlUrl = xmlLink.startsWith('http')
          ? xmlLink
          : `${SEC_EDGAR_BASE}${xmlLink}`;

        await this.delay(100);
        const xmlResponse = await axios.get(fullXmlUrl, {
          headers: SEC_HEADERS,
          timeout: 30000,
        });

        const parsed = await this.parseForm4XML(xmlResponse.data);
        if (parsed) {
          transactions.push(parsed);
        }
      }
    } catch (error) {
      console.error('Error fetching filing details:', error);
    }

    return transactions;
  }

  async parseForm4XML(xmlContent: string): Promise<InsiderTransaction | null> {
    try {
      const $ = cheerio.load(xmlContent, { xmlMode: true });

      // Extract issuer info
      const ticker = $('issuerTradingSymbol').text().trim().toUpperCase();
      const companyName = $('issuerName').text().trim();

      if (!ticker) return null;

      // Extract reporting owner info
      const insiderName = $('rptOwnerName').text().trim();
      const isDirector = $('isDirector').text().toLowerCase() === 'true';
      const isOfficer = $('isOfficer').text().toLowerCase() === 'true';
      const isTenPercentOwner = $('isTenPercentOwner').text().toLowerCase() === 'true';
      let insiderTitle = $('officerTitle').text().trim();

      if (!insiderTitle) {
        if (isOfficer) insiderTitle = 'Officer';
        else if (isDirector) insiderTitle = 'Director';
        else if (isTenPercentOwner) insiderTitle = '10% Owner';
        else insiderTitle = 'Other';
      }

      // Extract transaction info from non-derivative table
      const nonDerivTx = $('nonDerivativeTransaction').first();
      if (nonDerivTx.length === 0) {
        // Try derivative transactions
        const derivTx = $('derivativeTransaction').first();
        if (derivTx.length === 0) return null;
      }

      const txCode = nonDerivTx.find('transactionCode').text().trim() || 'P';
      const shares = parseFloat(nonDerivTx.find('transactionShares value').text()) || 0;
      const pricePerShare =
        parseFloat(nonDerivTx.find('transactionPricePerShare value').text()) || 0;
      const txDateStr = nonDerivTx.find('transactionDate value').text().trim();
      const ownershipNature = nonDerivTx
        .find('directOrIndirectOwnership value')
        .text()
        .trim();

      // Parse filing date from document or use current
      const filingDateStr = $('periodOfReport').text().trim() || new Date().toISOString();

      return {
        ticker,
        companyName,
        insiderName,
        insiderTitle,
        transactionType: this.parseTransactionCode(txCode),
        shares: Math.abs(shares),
        pricePerShare,
        totalValue: Math.abs(shares * pricePerShare),
        transactionDate: new Date(txDateStr || filingDateStr),
        filingDate: new Date(filingDateStr),
        ownershipType: ownershipNature === 'D' ? 'DIRECT' : 'INDIRECT',
        source: 'SEC_FORM4',
      };
    } catch (error) {
      console.error('Error parsing Form 4 XML:', error);
      return null;
    }
  }

  async getInsidersByTicker(ticker: string, lookbackDays: number): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];

    try {
      // Search for Form 4 filings for specific ticker
      const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=4&dateb=&owner=include&count=100&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const entries = $('entry').toArray();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

      for (const entry of entries) {
        const $entry = $(entry);
        const updated = new Date($entry.find('updated').text());

        if (updated < cutoffDate) continue;

        const link = $entry.find('link').attr('href');
        if (link) {
          await this.delay(100);
          const filings = await this.fetchFilingDetails(link);
          transactions.push(
            ...filings.filter((f) => f.ticker.toUpperCase() === ticker.toUpperCase())
          );
        }
      }
    } catch (error) {
      console.error(`Error fetching insider transactions for ${ticker}:`, error);
    }

    return transactions;
  }

  // Alternative method using SEC's full-text search API
  async searchForm4Filings(query: string, days: number = 30): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const searchParams = {
        q: query,
        dateRange: 'custom',
        startdt: startDate.toISOString().split('T')[0],
        enddt: endDate.toISOString().split('T')[0],
        forms: '4',
      };

      const response = await axios.get(
        `${SEC_EDGAR_BASE}/cgi-bin/srch-ia`,
        {
          params: searchParams,
          headers: SEC_HEADERS,
          timeout: 30000,
        }
      );

      // Parse results
      const $ = cheerio.load(response.data);
      // Process results...
    } catch (error) {
      console.error('Error searching Form 4 filings:', error);
    }

    return transactions;
  }

  // Fetch recent filings using SEC's RSS feed
  async fetchFromRSSFeed(count: number = 100): Promise<InsiderTransaction[]> {
    const transactions: InsiderTransaction[] = [];

    try {
      // SEC provides RSS feeds for various filing types
      const rssUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=${count}&output=atom`;

      const response = await axios.get(rssUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });

      const entries = $('entry').toArray();

      for (const entry of entries) {
        const $entry = $(entry);
        const summary = $entry.find('summary').text();
        const link = $entry.find('link').attr('href');
        const updated = $entry.find('updated').text();

        // Extract company info from summary
        const companyMatch = summary.match(/^(.*?)\s+\(/);
        const tickerMatch = summary.match(/\(([A-Z]+)\)/);

        if (tickerMatch && link) {
          await this.delay(150); // Rate limiting

          try {
            const filings = await this.fetchFilingDetails(link);
            transactions.push(...filings);
          } catch (e) {
            // Continue on error
          }
        }
      }
    } catch (error) {
      console.error('Error fetching from RSS feed:', error);
    }

    return transactions;
  }
}
