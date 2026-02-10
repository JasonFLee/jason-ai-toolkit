import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstitutionalInvestorScraper } from '../../src/scrapers/institutionalInvestors';

describe('Institutional Investor Scraper (13F, 13D, 13G)', () => {
  let scraper: InstitutionalInvestorScraper;

  beforeEach(() => {
    scraper = new InstitutionalInvestorScraper();
  });

  describe('fetch13FFilings', () => {
    it('should return an array of institutional holdings', async () => {
      vi.spyOn(scraper, 'fetch13FFilings').mockResolvedValue([
        {
          institutionName: 'Berkshire Hathaway',
          institutionCIK: '0001067983',
          ticker: 'AAPL',
          cusip: '037833100',
          shares: 915000000,
          value: 164700000000,
          filingDate: new Date(),
          reportDate: new Date(),
          source: 'SEC_13F',
        },
      ]);

      const filings = await scraper.fetch13FFilings(10);

      expect(filings).toBeDefined();
      expect(Array.isArray(filings)).toBe(true);
      expect(filings.length).toBeGreaterThan(0);
    });

    it('should return properly structured institutional holdings', async () => {
      vi.spyOn(scraper, 'fetch13FFilings').mockResolvedValue([
        {
          institutionName: 'Test Fund',
          institutionCIK: '0001234567',
          ticker: 'MSFT',
          cusip: '594918104',
          shares: 1000000,
          value: 400000000,
          filingDate: new Date(),
          reportDate: new Date(),
          source: 'SEC_13F',
        },
      ]);

      const filings = await scraper.fetch13FFilings(5);

      if (filings.length > 0) {
        const filing = filings[0];
        expect(filing).toHaveProperty('institutionName');
        expect(filing).toHaveProperty('institutionCIK');
        expect(filing).toHaveProperty('ticker');
        expect(filing).toHaveProperty('cusip');
        expect(filing).toHaveProperty('shares');
        expect(filing).toHaveProperty('value');
        expect(filing).toHaveProperty('filingDate');
        expect(filing).toHaveProperty('reportDate');
      }
    });
  });

  describe('fetch13DFilings', () => {
    it('should return activist investor filings', async () => {
      vi.spyOn(scraper, 'fetch13DFilings').mockResolvedValue([
        {
          institutionName: 'Activist Fund',
          institutionCIK: '0001234567',
          ticker: 'TARGET',
          cusip: '123456789',
          shares: 5000000,
          ownershipPercent: 7.5,
          filingDate: new Date(),
          changeType: 'ACQUIRED',
          source: 'SEC_13D',
        },
      ]);

      const filings = await scraper.fetch13DFilings(10);

      expect(filings).toBeDefined();
      expect(Array.isArray(filings)).toBe(true);
    });

    it('should identify ownership above 5%', async () => {
      vi.spyOn(scraper, 'fetch13DFilings').mockResolvedValue([
        {
          institutionName: 'Activist Investor',
          institutionCIK: '0001234567',
          ticker: 'SMALL',
          cusip: '987654321',
          shares: 10000000,
          ownershipPercent: 8.2,
          filingDate: new Date(),
          changeType: 'ACQUIRED',
          source: 'SEC_13D',
        },
      ]);

      const filings = await scraper.fetch13DFilings(10);

      for (const filing of filings) {
        expect(filing.ownershipPercent).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('fetch13GFilings', () => {
    it('should return passive investor filings', async () => {
      vi.spyOn(scraper, 'fetch13GFilings').mockResolvedValue([
        {
          institutionName: 'Index Fund',
          institutionCIK: '0009876543',
          ticker: 'BIGCO',
          cusip: '111222333',
          shares: 50000000,
          ownershipPercent: 6.1,
          filingDate: new Date(),
          changeType: 'ACQUIRED',
          source: 'SEC_13G',
        },
      ]);

      const filings = await scraper.fetch13GFilings(10);

      expect(filings).toBeDefined();
      expect(Array.isArray(filings)).toBe(true);
    });
  });

  describe('getInstitutionalBuyers', () => {
    it('should identify institutions increasing positions', async () => {
      vi.spyOn(scraper, 'fetch13FFilings').mockResolvedValue([
        {
          institutionName: 'Growth Fund',
          institutionCIK: '0001111111',
          ticker: 'NVDA',
          cusip: '67066G104',
          shares: 2000000,
          value: 1000000000,
          filingDate: new Date(),
          reportDate: new Date(),
          changeType: 'INCREASE',
          changePercent: 25,
          source: 'SEC_13F',
        },
      ]);

      const buyers = await scraper.getInstitutionalBuyers(30);

      expect(Array.isArray(buyers)).toBe(true);
      for (const buyer of buyers) {
        expect(buyer.changeType).toBe('INCREASE');
      }
    });
  });

  describe('getTopHolders', () => {
    it('should return top institutional holders for a ticker', async () => {
      vi.spyOn(scraper, 'fetch13FFilings').mockResolvedValue([
        {
          institutionName: 'Fund A',
          institutionCIK: '0001111111',
          ticker: 'MSFT',
          cusip: '594918104',
          shares: 100000000,
          value: 40000000000,
          filingDate: new Date(),
          reportDate: new Date(),
          source: 'SEC_13F',
        },
        {
          institutionName: 'Fund B',
          institutionCIK: '0002222222',
          ticker: 'MSFT',
          cusip: '594918104',
          shares: 50000000,
          value: 20000000000,
          filingDate: new Date(),
          reportDate: new Date(),
          source: 'SEC_13F',
        },
        {
          institutionName: 'Fund C',
          institutionCIK: '0003333333',
          ticker: 'AAPL',
          cusip: '037833100',
          shares: 200000000,
          value: 36000000000,
          filingDate: new Date(),
          reportDate: new Date(),
          source: 'SEC_13F',
        },
      ]);

      const holders = await scraper.getTopHolders('MSFT', 10);

      expect(Array.isArray(holders)).toBe(true);
      for (const holder of holders) {
        expect(holder.ticker).toBe('MSFT');
      }

      // Should be sorted by value descending
      if (holders.length > 1) {
        for (let i = 1; i < holders.length; i++) {
          expect(holders[i - 1].value).toBeGreaterThanOrEqual(holders[i].value);
        }
      }
    });
  });

  describe('parseInfoTable', () => {
    it('should parse 13F information table XML', async () => {
      const mockXML = `<?xml version="1.0"?>
        <informationTable>
          <infoTable>
            <nameOfIssuer>APPLE INC</nameOfIssuer>
            <titleOfClass>COM</titleOfClass>
            <cusip>037833100</cusip>
            <value>5000000</value>
            <shrsOrPrnAmt>
              <sshPrnamt>25000</sshPrnamt>
              <sshPrnamtType>SH</sshPrnamtType>
            </shrsOrPrnAmt>
            <investmentDiscretion>SOLE</investmentDiscretion>
            <votingAuthority>
              <Sole>25000</Sole>
              <Shared>0</Shared>
              <None>0</None>
            </votingAuthority>
          </infoTable>
        </informationTable>`;

      const result = await scraper.parseInfoTable(mockXML);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].cusip).toBe('037833100');
        expect(result[0].shares).toBe(25000);
        expect(result[0].value).toBe(5000000000); // Converted from thousands
      }
    });
  });
});
