import { describe, it, expect, beforeEach } from 'vitest';
import { ConvergenceAnalyzer } from '../../src/analysis/convergence';
import { InsiderTransaction, CongressTransaction, InstitutionalHolding } from '../../src/types/transactions';
import { ConvergenceSignal, StockScore } from '../../src/types/analysis';

describe('Convergence Analyzer', () => {
  let analyzer: ConvergenceAnalyzer;

  beforeEach(() => {
    analyzer = new ConvergenceAnalyzer();
  });

  describe('detectConvergence', () => {
    it('should detect when multiple insider types are buying the same stock', async () => {
      const mockInsiderTxs: InsiderTransaction[] = [
        {
          ticker: 'NVDA',
          insiderName: 'Jensen Huang',
          insiderTitle: 'CEO',
          transactionType: 'BUY',
          shares: 50000,
          pricePerShare: 500,
          transactionDate: new Date('2024-01-10'),
          filingDate: new Date('2024-01-12'),
          ownershipType: 'DIRECT',
          source: 'SEC_FORM4',
        },
        {
          ticker: 'NVDA',
          insiderName: 'Colette Kress',
          insiderTitle: 'CFO',
          transactionType: 'BUY',
          shares: 25000,
          pricePerShare: 505,
          transactionDate: new Date('2024-01-11'),
          filingDate: new Date('2024-01-13'),
          ownershipType: 'DIRECT',
          source: 'SEC_FORM4',
        },
      ];

      const mockCongressTxs: CongressTransaction[] = [
        {
          memberName: 'Nancy Pelosi',
          chamber: 'HOUSE',
          state: 'CA',
          ticker: 'NVDA',
          assetDescription: 'NVIDIA Corp',
          transactionType: 'PURCHASE',
          transactionDate: new Date('2024-01-08'),
          disclosureDate: new Date('2024-01-15'),
          amountRange: { min: 100001, max: 250000 },
          source: 'STOCK_ACT',
        },
      ];

      const mockInstitutionalHoldings: InstitutionalHolding[] = [
        {
          institutionName: 'Berkshire Hathaway',
          institutionCIK: '0001067983',
          ticker: 'NVDA',
          cusip: '67066G104',
          shares: 1000000,
          value: 500000000,
          filingDate: new Date('2024-01-20'),
          reportDate: new Date('2023-12-31'),
          changeType: 'INCREASE',
          changePercent: 25,
          source: 'SEC_13F',
        },
      ];

      const signals = await analyzer.detectConvergence({
        insiderTransactions: mockInsiderTxs,
        congressTransactions: mockCongressTxs,
        institutionalHoldings: mockInstitutionalHoldings,
        lookbackDays: 30,
      });

      expect(signals).toBeDefined();
      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThan(0);

      const nvdaSignal = signals.find(s => s.ticker === 'NVDA');
      expect(nvdaSignal).toBeDefined();
      expect(nvdaSignal?.convergenceScore).toBeGreaterThan(0);
    });

    it('should return empty array when no convergence detected', async () => {
      const signals = await analyzer.detectConvergence({
        insiderTransactions: [],
        congressTransactions: [],
        institutionalHoldings: [],
        lookbackDays: 30,
      });

      expect(signals).toEqual([]);
    });
  });

  describe('calculateConvergenceScore', () => {
    it('should weight different insider types appropriately', () => {
      // CEO/CFO trades should be weighted higher than director trades
      const ceoScore = analyzer.calculateInsiderWeight({
        insiderTitle: 'CEO',
        transactionType: 'BUY',
        shares: 10000,
        pricePerShare: 100,
      });

      const directorScore = analyzer.calculateInsiderWeight({
        insiderTitle: 'Director',
        transactionType: 'BUY',
        shares: 10000,
        pricePerShare: 100,
      });

      expect(ceoScore).toBeGreaterThan(directorScore);
    });

    it('should give higher weight to larger transactions', () => {
      const smallTxScore = analyzer.calculateInsiderWeight({
        insiderTitle: 'CFO',
        transactionType: 'BUY',
        shares: 1000,
        pricePerShare: 100,
      });

      const largeTxScore = analyzer.calculateInsiderWeight({
        insiderTitle: 'CFO',
        transactionType: 'BUY',
        shares: 100000,
        pricePerShare: 100,
      });

      expect(largeTxScore).toBeGreaterThan(smallTxScore);
    });

    it('should weight congress committee membership', () => {
      const financeCommittee = analyzer.calculateCongressWeight({
        memberName: 'Test Member',
        committees: ['Finance', 'Banking'],
        transactionType: 'PURCHASE',
        amountRange: { min: 50001, max: 100000 },
      });

      const regularMember = analyzer.calculateCongressWeight({
        memberName: 'Test Member',
        committees: ['Agriculture'],
        transactionType: 'PURCHASE',
        amountRange: { min: 50001, max: 100000 },
      });

      expect(financeCommittee).toBeGreaterThan(regularMember);
    });
  });

  describe('scoreStock', () => {
    it('should produce a score between 0 and 100', async () => {
      const score = await analyzer.scoreStock('AAPL', 30);

      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it('should include breakdown of scoring factors', async () => {
      const score = await analyzer.scoreStock('AAPL', 30);

      expect(score).toHaveProperty('insiderScore');
      expect(score).toHaveProperty('congressScore');
      expect(score).toHaveProperty('institutionalScore');
      expect(score).toHaveProperty('convergenceBonus');
      expect(score).toHaveProperty('overallScore');
    });
  });

  describe('getTopPicks', () => {
    it('should return stocks ranked by convergence score', async () => {
      const topPicks = await analyzer.getTopPicks(10, 30);

      expect(Array.isArray(topPicks)).toBe(true);

      // Should be sorted by score descending
      if (topPicks.length > 1) {
        for (let i = 1; i < topPicks.length; i++) {
          expect(topPicks[i - 1].overallScore).toBeGreaterThanOrEqual(topPicks[i].overallScore);
        }
      }
    });

    it('should only include stocks above minimum threshold', async () => {
      const minScore = 50;
      const topPicks = await analyzer.getTopPicks(10, 30, minScore);

      for (const pick of topPicks) {
        expect(pick.overallScore).toBeGreaterThanOrEqual(minScore);
      }
    });
  });
});
