import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Backtester } from '../../src/backtest/backtester';
import { BacktestConfig } from '../../src/types/backtest';

describe('Backtester', () => {
  let backtester: Backtester;

  beforeEach(() => {
    backtester = new Backtester();
  });

  describe('loadHistoricalPrices', () => {
    it('should return an array of historical prices', async () => {
      // Mock the price fetching
      vi.spyOn(backtester, 'loadHistoricalPrices').mockResolvedValue([
        {
          date: new Date('2024-01-02'),
          open: 185.0,
          high: 187.5,
          low: 184.0,
          close: 186.5,
          adjustedClose: 186.5,
          volume: 50000000,
        },
        {
          date: new Date('2024-01-03'),
          open: 186.5,
          high: 188.0,
          low: 185.5,
          close: 187.0,
          adjustedClose: 187.0,
          volume: 45000000,
        },
      ]);

      const prices = await backtester.loadHistoricalPrices('AAPL', {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-31'),
      });

      expect(Array.isArray(prices)).toBe(true);
      if (prices.length > 0) {
        expect(prices[0]).toHaveProperty('date');
        expect(prices[0]).toHaveProperty('open');
        expect(prices[0]).toHaveProperty('high');
        expect(prices[0]).toHaveProperty('low');
        expect(prices[0]).toHaveProperty('close');
        expect(prices[0]).toHaveProperty('volume');
      }
    });
  });

  describe('loadHistoricalSignals', () => {
    it('should return an array of convergence signals', async () => {
      vi.spyOn(backtester, 'loadHistoricalSignals').mockResolvedValue([
        {
          ticker: 'NVDA',
          date: new Date('2024-01-15'),
          convergenceScore: 85,
          insiderScore: 90,
          congressScore: 75,
          institutionalScore: 80,
          convergenceBonus: 20,
          signals: { insiderBuys: 3, congressBuys: 2, institutionalIncreases: 5 },
          recentBuyers: [],
        },
      ]);

      const signals = await backtester.loadHistoricalSignals(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('runBacktest', () => {
    it('should run backtest and return results', async () => {
      // Mock all the dependent methods
      vi.spyOn(backtester, 'loadHistoricalPrices').mockResolvedValue([
        { date: new Date('2024-01-02'), open: 100, high: 105, low: 99, close: 103, adjustedClose: 103, volume: 1000000 },
        { date: new Date('2024-02-01'), open: 103, high: 108, low: 102, close: 107, adjustedClose: 107, volume: 1200000 },
      ]);

      vi.spyOn(backtester, 'loadHistoricalSignals').mockResolvedValue([]);

      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        initialCapital: 100000,
        minConvergenceScore: 60,
        maxPositions: 5,
        holdingPeriodDays: 30,
      };

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('finalCapital');
    });

    it('should calculate performance metrics correctly', async () => {
      vi.spyOn(backtester, 'loadHistoricalPrices').mockResolvedValue([]);
      vi.spyOn(backtester, 'loadHistoricalSignals').mockResolvedValue([]);

      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-30'),
        initialCapital: 100000,
        minConvergenceScore: 60,
        maxPositions: 5,
        holdingPeriodDays: 30,
      };

      const result = await backtester.runBacktest(config);

      // Win rate should be between 0 and 1
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);

      // Max drawdown should be negative or zero
      expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    });
  });

  describe('compareToSPY', () => {
    it('should compare strategy returns to SPY benchmark', async () => {
      vi.spyOn(backtester, 'loadHistoricalPrices').mockResolvedValue([
        { date: new Date('2024-01-02'), open: 450, high: 455, low: 448, close: 453, adjustedClose: 453, volume: 80000000 },
        { date: new Date('2024-06-28'), open: 530, high: 535, low: 528, close: 533, adjustedClose: 533, volume: 75000000 },
      ]);

      const mockResult = {
        config: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-30'),
          initialCapital: 100000,
          minConvergenceScore: 60,
          maxPositions: 5,
          holdingPeriodDays: 30,
        },
        period: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-30'),
        },
        trades: [],
        totalReturn: 15.5,
        totalReturnDollars: 15500,
        finalCapital: 115500,
        winRate: 0.6,
        avgWin: 8,
        avgLoss: -4,
        maxDrawdown: -5,
        totalTrades: 10,
        winningTrades: 6,
        losingTrades: 4,
        avgHoldingPeriod: 25,
      };

      const comparison = await backtester.compareToSPY(mockResult);

      expect(comparison).toHaveProperty('strategyReturn');
      expect(comparison).toHaveProperty('spyReturn');
      expect(comparison).toHaveProperty('alpha');
      expect(comparison).toHaveProperty('outperformed');
    });
  });

  describe('runMultiplePeriods', () => {
    it('should run backtests across multiple time periods', async () => {
      vi.spyOn(backtester, 'runBacktest').mockResolvedValue({
        config: {} as BacktestConfig,
        period: { startDate: new Date(), endDate: new Date() },
        trades: [],
        totalReturn: 10,
        totalReturnDollars: 10000,
        finalCapital: 110000,
        winRate: 0.55,
        avgWin: 5,
        avgLoss: -3,
        maxDrawdown: -8,
        totalTrades: 20,
        winningTrades: 11,
        losingTrades: 9,
        avgHoldingPeriod: 28,
      });

      const periods = [
        { startDate: new Date('2023-01-01'), endDate: new Date('2023-06-30') },
        { startDate: new Date('2023-07-01'), endDate: new Date('2023-12-31') },
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-06-30') },
      ];

      const results = await backtester.runMultiplePeriods({
        periods,
        initialCapital: 100000,
        minConvergenceScore: 60,
        maxPositions: 5,
        holdingPeriodDays: 30,
      });

      expect(results.length).toBe(periods.length);

      for (const result of results) {
        expect(result).toHaveProperty('period');
        expect(result).toHaveProperty('totalReturn');
        expect(result).toHaveProperty('trades');
      }
    });
  });

  describe('calculateAggregateStats', () => {
    it('should calculate aggregate statistics across periods', async () => {
      const mockResults = [
        {
          config: {} as BacktestConfig,
          period: { startDate: new Date('2023-01-01'), endDate: new Date('2023-06-30') },
          trades: [],
          totalReturn: 12,
          totalReturnDollars: 12000,
          finalCapital: 112000,
          winRate: 0.6,
          avgWin: 5,
          avgLoss: -3,
          maxDrawdown: -5,
          totalTrades: 15,
          winningTrades: 9,
          losingTrades: 6,
          avgHoldingPeriod: 25,
        },
        {
          config: {} as BacktestConfig,
          period: { startDate: new Date('2023-07-01'), endDate: new Date('2023-12-31') },
          trades: [],
          totalReturn: -3,
          totalReturnDollars: -3000,
          finalCapital: 97000,
          winRate: 0.4,
          avgWin: 4,
          avgLoss: -5,
          maxDrawdown: -12,
          totalTrades: 10,
          winningTrades: 4,
          losingTrades: 6,
          avgHoldingPeriod: 30,
        },
      ];

      // Mock compareToSPY to return predictable values
      vi.spyOn(backtester, 'compareToSPY').mockResolvedValue({
        strategyReturn: 10,
        spyReturn: 8,
        alpha: 2,
        outperformed: true,
        strategyFinalValue: 110000,
        spyFinalValue: 108000,
      });

      const aggregate = await backtester.calculateAggregateStats(mockResults);

      expect(aggregate).toHaveProperty('averageReturn');
      expect(aggregate).toHaveProperty('totalTrades');
      expect(aggregate).toHaveProperty('overallWinRate');
      expect(aggregate).toHaveProperty('bestPeriod');
      expect(aggregate).toHaveProperty('worstPeriod');
      expect(aggregate).toHaveProperty('consistencyScore');

      // Average return should be (12 + -3) / 2 = 4.5
      expect(aggregate.averageReturn).toBe(4.5);

      // Total trades should be 15 + 10 = 25
      expect(aggregate.totalTrades).toBe(25);

      // Best period should be the first one with 12% return
      expect(aggregate.bestPeriod.return).toBe(12);

      // Worst period should be the second one with -3% return
      expect(aggregate.worstPeriod.return).toBe(-3);
    });
  });
});
