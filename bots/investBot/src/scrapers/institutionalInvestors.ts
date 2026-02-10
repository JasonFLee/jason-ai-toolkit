import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  InstitutionalHolding,
  OwnershipChange,
  ChangeType,
  RawFiling,
} from '../types/transactions';

const SEC_EDGAR_BASE = 'https://www.sec.gov';
const SEC_HEADERS = {
  'User-Agent': 'InvestBot/1.0 (contact@investbot.example)',
  Accept: 'application/json, text/html, application/xml',
};

// CUSIP to ticker mapping service
const CUSIP_LOOKUP_CACHE: Record<string, string> = {};

export class InstitutionalInvestorScraper {
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // CUSIP to ticker lookup (simplified - in production would use a proper service)
  private async cusipToTicker(cusip: string): Promise<string> {
    if (CUSIP_LOOKUP_CACHE[cusip]) {
      return CUSIP_LOOKUP_CACHE[cusip];
    }

    // Common CUSIP mappings for major stocks
    const commonMappings: Record<string, string> = {
      '037833100': 'AAPL',
      '594918104': 'MSFT',
      '67066G104': 'NVDA',
      '02079K107': 'GOOG',
      '02079K305': 'GOOGL',
      '023135106': 'AMZN',
      '30303M102': 'META',
      '88160R101': 'TSLA',
      '084670702': 'BRK.B',
      '46625H100': 'JPM',
      '92826C839': 'V',
      '22160K105': 'COST',
      '58933Y105': 'MRK',
      '478160104': 'JNJ',
      '931142103': 'WMT',
      '742718109': 'PG',
      '91324P102': 'UNH',
      '585055106': 'MCD',
      '369604103': 'GE',
      '125523100': 'CRM',
    };

    if (commonMappings[cusip]) {
      CUSIP_LOOKUP_CACHE[cusip] = commonMappings[cusip];
      return commonMappings[cusip];
    }

    return cusip; // Return CUSIP if no ticker found
  }

  async fetch13FFilings(limit: number = 50): Promise<InstitutionalHolding[]> {
    const holdings: InstitutionalHolding[] = [];

    try {
      // Fetch recent 13F filings from SEC EDGAR
      const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&company=&dateb=&owner=include&count=${limit}&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const entries = $('entry').toArray();

      for (const entry of entries.slice(0, Math.min(limit, 20))) {
        const $entry = $(entry);
        const title = $entry.find('title').text();
        const link = $entry.find('link').attr('href') || '';
        const updated = $entry.find('updated').text();

        // Extract institution name from title
        const institutionMatch = title.match(/^(.*?)\s*\(/);
        const institutionName = institutionMatch ? institutionMatch[1].trim() : 'Unknown';

        // Extract CIK from link
        const cikMatch = link.match(/CIK=(\d+)/);
        const cik = cikMatch ? cikMatch[1] : '';

        if (cik) {
          await this.delay(150);

          try {
            const filingHoldings = await this.fetch13FDetails(cik, institutionName);
            holdings.push(...filingHoldings);
          } catch (e) {
            console.error(`Failed to fetch 13F for ${institutionName}`);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching 13F filings:', error);
    }

    return holdings;
  }

  private async fetch13FDetails(
    cik: string,
    institutionName: string
  ): Promise<InstitutionalHolding[]> {
    const holdings: InstitutionalHolding[] = [];

    try {
      // Get the filing index
      const indexUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR&dateb=&owner=include&count=1&output=atom`;

      const indexResponse = await axios.get(indexUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $index = cheerio.load(indexResponse.data, { xmlMode: true });
      const filingLink = $index('entry link').first().attr('href');

      if (filingLink) {
        await this.delay(100);

        // Fetch the filing page
        const filingResponse = await axios.get(filingLink, {
          headers: SEC_HEADERS,
          timeout: 30000,
        });

        const $filing = cheerio.load(filingResponse.data);

        // Look for the information table (infotable.xml)
        const infoTableLink = $filing('a')
          .filter((_, el) => {
            const href = $filing(el).attr('href') || '';
            return (
              href.includes('infotable') ||
              href.includes('INFOTABLE') ||
              (href.includes('.xml') && !href.includes('primary'))
            );
          })
          .first()
          .attr('href');

        if (infoTableLink) {
          await this.delay(100);

          const fullUrl = infoTableLink.startsWith('http')
            ? infoTableLink
            : `${SEC_EDGAR_BASE}${infoTableLink}`;

          const tableResponse = await axios.get(fullUrl, {
            headers: SEC_HEADERS,
            timeout: 30000,
          });

          const parsedHoldings = await this.parseInfoTable(tableResponse.data);

          // Add institution info to each holding
          for (const holding of parsedHoldings) {
            holdings.push({
              ...holding,
              institutionName,
              institutionCIK: cik,
              source: 'SEC_13F',
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching 13F details for CIK ${cik}:`, error);
    }

    return holdings;
  }

  async parseInfoTable(xmlContent: string): Promise<Partial<InstitutionalHolding>[]> {
    const holdings: Partial<InstitutionalHolding>[] = [];

    try {
      const $ = cheerio.load(xmlContent, { xmlMode: true });

      // 13F Information Table format
      $('infoTable').each(async (_, table) => {
        const $table = $(table);

        const nameOfIssuer = $table.find('nameOfIssuer').text().trim();
        const cusip = $table.find('cusip').text().trim();
        const value = parseInt($table.find('value').text(), 10) || 0; // in thousands
        const shares =
          parseInt($table.find('sshPrnamt, shrsOrPrnAmt sshPrnamt').text(), 10) || 0;
        const investmentDiscretion = $table.find('investmentDiscretion').text().trim();

        const ticker = await this.cusipToTicker(cusip);

        holdings.push({
          ticker,
          companyName: nameOfIssuer,
          cusip,
          shares,
          value: value * 1000, // Convert from thousands
          filingDate: new Date(),
          reportDate: new Date(), // Would extract from filing
        });
      });
    } catch (error) {
      console.error('Error parsing info table:', error);
    }

    return holdings;
  }

  async fetch13DFilings(limit: number = 50): Promise<OwnershipChange[]> {
    const changes: OwnershipChange[] = [];

    try {
      // 13D filings indicate activist investors acquiring >5% stake
      const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013D&company=&dateb=&owner=include&count=${limit}&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const entries = $('entry').toArray();

      for (const entry of entries.slice(0, Math.min(limit, 10))) {
        const $entry = $(entry);
        const title = $entry.find('title').text();
        const link = $entry.find('link').attr('href') || '';
        const updated = $entry.find('updated').text();

        // Parse title for company and filer info
        const titleParts = title.split(' - ');
        const institutionName = titleParts[0]?.trim() || 'Unknown';

        await this.delay(150);

        try {
          const filingChanges = await this.fetch13DDetails(link, institutionName);
          changes.push(...filingChanges);
        } catch (e) {
          // Continue on error
        }
      }
    } catch (error) {
      console.error('Error fetching 13D filings:', error);
    }

    return changes;
  }

  private async fetch13DDetails(
    filingUrl: string,
    institutionName: string
  ): Promise<OwnershipChange[]> {
    const changes: OwnershipChange[] = [];

    try {
      const response = await axios.get(filingUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);

      // Extract ownership percentage from the filing
      const text = $('body').text();
      const percentMatch = text.match(/(\d+\.?\d*)\s*%/);
      const percent = percentMatch ? parseFloat(percentMatch[1]) : 5;

      // Extract ticker/CUSIP
      const cusipMatch = text.match(/CUSIP[:\s]+([0-9A-Z]{9})/i);
      const tickerMatch = text.match(/\(([A-Z]{1,5})\)/);

      const cusip = cusipMatch ? cusipMatch[1] : '';
      const ticker = tickerMatch ? tickerMatch[1] : await this.cusipToTicker(cusip);

      if (ticker && percent >= 5) {
        changes.push({
          institutionName,
          institutionCIK: '',
          ticker,
          cusip,
          shares: 0, // Would need to parse from filing
          ownershipPercent: percent,
          filingDate: new Date(),
          changeType: 'ACQUIRED',
          source: 'SEC_13D',
        });
      }
    } catch (error) {
      console.error('Error fetching 13D details:', error);
    }

    return changes;
  }

  async fetch13GFilings(limit: number = 50): Promise<OwnershipChange[]> {
    const changes: OwnershipChange[] = [];

    try {
      // 13G is for passive investors (similar to 13D but less detailed)
      const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013G&company=&dateb=&owner=include&count=${limit}&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const entries = $('entry').toArray();

      for (const entry of entries.slice(0, Math.min(limit, 10))) {
        const $entry = $(entry);
        const title = $entry.find('title').text();
        const link = $entry.find('link').attr('href') || '';

        const titleParts = title.split(' - ');
        const institutionName = titleParts[0]?.trim() || 'Unknown';

        await this.delay(150);

        try {
          const filingChanges = await this.fetch13GDetails(link, institutionName);
          changes.push(...filingChanges);
        } catch (e) {
          // Continue
        }
      }
    } catch (error) {
      console.error('Error fetching 13G filings:', error);
    }

    return changes;
  }

  private async fetch13GDetails(
    filingUrl: string,
    institutionName: string
  ): Promise<OwnershipChange[]> {
    // Similar to 13D processing
    const changes: OwnershipChange[] = [];

    try {
      const response = await axios.get(filingUrl, {
        headers: SEC_HEADERS,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      const text = $('body').text();

      const percentMatch = text.match(/(\d+\.?\d*)\s*%/);
      const percent = percentMatch ? parseFloat(percentMatch[1]) : 5;

      const cusipMatch = text.match(/CUSIP[:\s]+([0-9A-Z]{9})/i);
      const tickerMatch = text.match(/\(([A-Z]{1,5})\)/);

      const cusip = cusipMatch ? cusipMatch[1] : '';
      const ticker = tickerMatch ? tickerMatch[1] : await this.cusipToTicker(cusip);

      if (ticker && percent >= 5) {
        changes.push({
          institutionName,
          institutionCIK: '',
          ticker,
          cusip,
          shares: 0,
          ownershipPercent: percent,
          filingDate: new Date(),
          changeType: 'ACQUIRED',
          source: 'SEC_13G',
        });
      }
    } catch (error) {
      console.error('Error fetching 13G details:', error);
    }

    return changes;
  }

  async getInstitutionalBuyers(lookbackDays: number): Promise<InstitutionalHolding[]> {
    const allHoldings = await this.fetch13FFilings(100);

    // Filter for increases (would need historical comparison in production)
    return allHoldings.map((h) => ({
      ...h,
      changeType: 'INCREASE' as ChangeType,
      changePercent: 10, // Placeholder
    }));
  }

  async getTopHolders(ticker: string, limit: number): Promise<InstitutionalHolding[]> {
    const allHoldings = await this.fetch13FFilings(200);

    return allHoldings
      .filter((h) => h.ticker.toUpperCase() === ticker.toUpperCase())
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  // Get ownership changes from 13D/13G filings
  async getOwnershipChanges(days: number = 30): Promise<OwnershipChange[]> {
    const [d13Changes, g13Changes] = await Promise.all([
      this.fetch13DFilings(50),
      this.fetch13GFilings(50),
    ]);

    return [...d13Changes, ...g13Changes];
  }
}
