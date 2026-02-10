import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../src/db/database';
import { InsiderTransaction, CongressTransaction, InstitutionalHolding } from '../../src/types/transactions';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Initialization', () => {
    it('should create all required tables', async () => {
      const tables = await db.getTables();

      expect(tables).toContain('insider_transactions');
      expect(tables).toContain('congress_transactions');
      expect(tables).toContain('institutional_holdings');
      expect(tables).toContain('convergence_signals');
      expect(tables).toContain('stock_prices');
    });
  });

  describe('Insider Transactions', () => {
    it('should save and retrieve insider transactions', async () => {
      const transaction: InsiderTransaction = {
        ticker: 'AAPL',
        insiderName: 'Tim Cook',
        insiderTitle: 'CEO',
        transactionType: 'BUY',
        shares: 10000,
        pricePerShare: 180.50,
        transactionDate: new Date(),
        filingDate: new Date(),
        ownershipType: 'DIRECT',
        source: 'SEC_FORM4',
      };

      await db.saveInsiderTransaction(transaction);
      const retrieved = await db.getInsiderTransactions('AAPL', 30);

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].ticker).toBe('AAPL');
      expect(retrieved[0].insiderName).toBe('Tim Cook');
      expect(retrieved[0].shares).toBe(10000);
    });

    it('should prevent duplicate transactions', async () => {
      const transaction: InsiderTransaction = {
        ticker: 'AAPL',
        insiderName: 'Tim Cook',
        insiderTitle: 'CEO',
        transactionType: 'BUY',
        shares: 10000,
        pricePerShare: 180.50,
        transactionDate: new Date(),
        filingDate: new Date(),
        ownershipType: 'DIRECT',
        source: 'SEC_FORM4',
      };

      await db.saveInsiderTransaction(transaction);
      await db.saveInsiderTransaction(transaction); // Duplicate

      const retrieved = await db.getInsiderTransactions('AAPL', 30);
      expect(retrieved.length).toBe(1);
    });
  });

  describe('Congress Transactions', () => {
    it('should save and retrieve congress transactions', async () => {
      const transaction: CongressTransaction = {
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
      };

      await db.saveCongressTransaction(transaction);
      const retrieved = await db.getCongressTransactions('NVDA', 30);

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].memberName).toBe('Nancy Pelosi');
      expect(retrieved[0].amountRange.min).toBe(250001);
    });
  });

  describe('Institutional Holdings', () => {
    it('should save and retrieve institutional holdings', async () => {
      const holding: InstitutionalHolding = {
        institutionName: 'Berkshire Hathaway',
        institutionCIK: '0001067983',
        ticker: 'AAPL',
        cusip: '037833100',
        shares: 915000000,
        value: 164700000000,
        filingDate: new Date(),
        reportDate: new Date(),
        changeType: 'INCREASE',
        changePercent: 5.2,
        source: 'SEC_13F',
      };

      await db.saveInstitutionalHolding(holding);
      const retrieved = await db.getInstitutionalHoldings('AAPL', 90);

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].institutionName).toBe('Berkshire Hathaway');
      expect(retrieved[0].shares).toBe(915000000);
    });
  });

  describe('Convergence Signals', () => {
    it('should save and retrieve convergence signals', async () => {
      const signal = {
        ticker: 'NVDA',
        date: new Date(),
        convergenceScore: 85,
        insiderScore: 90,
        congressScore: 75,
        institutionalScore: 80,
        convergenceBonus: 15,
        signals: {
          insiderBuys: 3,
          congressBuys: 2,
          institutionalIncreases: 5,
        },
        recentBuyers: [],
      };

      await db.saveConvergenceSignal(signal);
      const retrieved = await db.getConvergenceSignals(30);

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].ticker).toBe('NVDA');
      expect(retrieved[0].convergenceScore).toBe(85);
    });
  });

  describe('Querying', () => {
    it('should find all transactions for a ticker across all sources', async () => {
      await db.saveInsiderTransaction({
        ticker: 'TSLA',
        insiderName: 'Elon Musk',
        insiderTitle: 'CEO',
        transactionType: 'BUY',
        shares: 1000000,
        pricePerShare: 200,
        transactionDate: new Date(),
        filingDate: new Date(),
        ownershipType: 'DIRECT',
        source: 'SEC_FORM4',
      });

      await db.saveCongressTransaction({
        memberName: 'Test Senator',
        chamber: 'SENATE',
        state: 'TX',
        ticker: 'TSLA',
        assetDescription: 'Tesla Inc',
        transactionType: 'PURCHASE',
        transactionDate: new Date(),
        disclosureDate: new Date(),
        amountRange: { min: 15001, max: 50000 },
        source: 'STOCK_ACT',
      });

      const allActivity = await db.getAllActivityForTicker('TSLA', 30);

      expect(allActivity.insiderTransactions.length).toBe(1);
      expect(allActivity.congressTransactions.length).toBe(1);
    });

    it('should get top stocks by activity', async () => {
      // Add multiple transactions for different stocks
      const stocks = ['AAPL', 'NVDA', 'MSFT', 'GOOGL'];

      for (let i = 0; i < stocks.length; i++) {
        for (let j = 0; j <= i; j++) {
          await db.saveInsiderTransaction({
            ticker: stocks[i],
            insiderName: `Insider ${i}-${j}`,
            insiderTitle: 'Officer',
            transactionType: 'BUY',
            shares: 1000,
            pricePerShare: 100,
            transactionDate: new Date(),
            filingDate: new Date(),
            ownershipType: 'DIRECT',
            source: 'SEC_FORM4',
          });
        }
      }

      const topStocks = await db.getTopStocksByActivity(3, 30);

      expect(topStocks.length).toBe(3);
      // GOOGL should be first (4 transactions)
      expect(topStocks[0].ticker).toBe('GOOGL');
    });
  });
});
