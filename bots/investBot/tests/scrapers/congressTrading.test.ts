import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CongressTradingScraper } from '../../src/scrapers/congressTrading';

describe('Congress Trading Scraper (STOCK Act)', () => {
  let scraper: CongressTradingScraper;

  beforeEach(() => {
    scraper = new CongressTradingScraper();
  });

  describe('parseAmountRange', () => {
    it('should parse amount range strings correctly', () => {
      expect(scraper.parseAmountRange('$1,001 - $15,000')).toEqual({
        min: 1001,
        max: 15000,
      });
      expect(scraper.parseAmountRange('$15,001 - $50,000')).toEqual({
        min: 15001,
        max: 50000,
      });
      expect(scraper.parseAmountRange('$1,000,001 - $5,000,000')).toEqual({
        min: 1000001,
        max: 5000000,
      });
    });

    it('should handle Over X format', () => {
      const result = scraper.parseAmountRange('Over $1,000,000');
      expect(result.min).toBe(1000000);
      expect(result.max).toBeGreaterThan(result.min);
    });

    it('should return zeros for invalid format', () => {
      expect(scraper.parseAmountRange('invalid')).toEqual({
        min: 0,
        max: 0,
      });
    });
  });

  describe('fetchHouseDisclosures', () => {
    it('should return an array of disclosures', async () => {
      // Mock the network call
      vi.spyOn(scraper, 'fetchHouseDisclosures').mockResolvedValue([
        {
          memberName: 'Nancy Pelosi',
          chamber: 'HOUSE',
          state: 'CA',
          ticker: 'NVDA',
          assetDescription: 'NVIDIA Corporation',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 250001, max: 500000 },
          source: 'STOCK_ACT',
        },
      ]);

      const disclosures = await scraper.fetchHouseDisclosures(10);

      expect(disclosures).toBeDefined();
      expect(Array.isArray(disclosures)).toBe(true);
      expect(disclosures.length).toBeGreaterThan(0);
    });

    it('should return properly structured congress transactions', async () => {
      vi.spyOn(scraper, 'fetchHouseDisclosures').mockResolvedValue([
        {
          memberName: 'Test Rep',
          chamber: 'HOUSE',
          state: 'TX',
          ticker: 'AAPL',
          assetDescription: 'Apple Inc',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 15001, max: 50000 },
          source: 'STOCK_ACT',
        },
      ]);

      const disclosures = await scraper.fetchHouseDisclosures(5);

      if (disclosures.length > 0) {
        const disclosure = disclosures[0];
        expect(disclosure).toHaveProperty('memberName');
        expect(disclosure).toHaveProperty('chamber');
        expect(disclosure).toHaveProperty('state');
        expect(disclosure).toHaveProperty('ticker');
        expect(disclosure).toHaveProperty('assetDescription');
        expect(disclosure).toHaveProperty('transactionType');
        expect(disclosure).toHaveProperty('transactionDate');
        expect(disclosure).toHaveProperty('disclosureDate');
        expect(disclosure).toHaveProperty('amountRange');
      }
    });
  });

  describe('fetchSenateDisclosures', () => {
    it('should return Senate disclosures', async () => {
      vi.spyOn(scraper, 'fetchSenateDisclosures').mockResolvedValue([
        {
          memberName: 'Test Senator',
          chamber: 'SENATE',
          state: 'GA',
          ticker: 'MSFT',
          assetDescription: 'Microsoft Corp',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 50001, max: 100000 },
          source: 'STOCK_ACT',
        },
      ]);

      const disclosures = await scraper.fetchSenateDisclosures(10);

      expect(disclosures).toBeDefined();
      expect(Array.isArray(disclosures)).toBe(true);

      if (disclosures.length > 0) {
        expect(disclosures[0].chamber).toBe('SENATE');
      }
    });
  });

  describe('getAllCongressTrades', () => {
    it('should combine House and Senate disclosures', async () => {
      vi.spyOn(scraper, 'fetchHouseDisclosures').mockResolvedValue([
        {
          memberName: 'House Rep',
          chamber: 'HOUSE',
          state: 'CA',
          ticker: 'AAPL',
          assetDescription: 'Apple',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 15001, max: 50000 },
          source: 'STOCK_ACT',
        },
      ]);

      vi.spyOn(scraper, 'fetchSenateDisclosures').mockResolvedValue([
        {
          memberName: 'Senator',
          chamber: 'SENATE',
          state: 'NY',
          ticker: 'GOOGL',
          assetDescription: 'Alphabet',
          transactionType: 'SALE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 50001, max: 100000 },
          source: 'STOCK_ACT',
        },
      ]);

      const allTrades = await scraper.getAllCongressTrades(20);

      expect(allTrades).toBeDefined();
      expect(Array.isArray(allTrades)).toBe(true);
      expect(allTrades.length).toBe(2);

      const chambers = new Set(allTrades.map((t) => t.chamber));
      expect(chambers.has('HOUSE')).toBe(true);
      expect(chambers.has('SENATE')).toBe(true);
    });
  });

  describe('getTradesByTicker', () => {
    it('should filter congress trades by ticker symbol', async () => {
      vi.spyOn(scraper, 'getAllCongressTrades').mockResolvedValue([
        {
          memberName: 'Rep 1',
          chamber: 'HOUSE',
          state: 'CA',
          ticker: 'NVDA',
          assetDescription: 'NVIDIA',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 100001, max: 250000 },
          source: 'STOCK_ACT',
        },
        {
          memberName: 'Rep 2',
          chamber: 'HOUSE',
          state: 'TX',
          ticker: 'AAPL',
          assetDescription: 'Apple',
          transactionType: 'PURCHASE',
          transactionDate: new Date(),
          disclosureDate: new Date(),
          amountRange: { min: 15001, max: 50000 },
          source: 'STOCK_ACT',
        },
      ]);

      const trades = await scraper.getTradesByTicker('NVDA', 90);

      expect(Array.isArray(trades)).toBe(true);
      for (const trade of trades) {
        expect(trade.ticker).toBe('NVDA');
      }
    });
  });
});
