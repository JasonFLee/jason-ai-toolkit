import axios from 'axios';
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  SPYComparison,
  MultiPeriodConfig,
  AggregateStats,
  HistoricalPrice,
  PriceRange,
} from '../types/backtest';
import { ConvergenceSignal } from '../types/analysis';
import { Database } from '../db/database';
import { ConvergenceAnalyzer } from '../analysis/convergence';

// Yahoo Finance API for historical prices (free tier)
const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export class Backtester {
  private db: Database | null = null;
  private analyzer: ConvergenceAnalyzer;
  private priceCache: Map<string, HistoricalPrice[]> = new Map();

  constructor(db?: Database) {
    this.db = db || null;
    this.analyzer = new ConvergenceAnalyzer(db);
  }

  async setDatabase(db: Database): Promise<void> {
    this.db = db;
    await this.analyzer.setDatabase(db);
  }

  async loadHistoricalPrices(
    ticker: string,
    range: PriceRange
  ): Promise<HistoricalPrice[]> {
    const cacheKey = `${ticker}-${range.start.toISOString()}-${range.end.toISOString()}`;

    if (this.priceCache.has(cacheKey)) {
      return this.priceCache.get(cacheKey)!;
    }

    try {
      const period1 = Math.floor(range.start.getTime() / 1000);
      const period2 = Math.floor(range.end.getTime() / 1000);

      const response = await axios.get(`${YAHOO_FINANCE_URL}/${ticker}`, {
        params: {
          period1,
          period2,
          interval: '1d',
          includePrePost: false,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 30000,
      });

      const result = response.data.chart.result?.[0];
      if (!result) {
        return [];
      }

      const timestamps = result.timestamp || [];
      const quotes = result.indicators.quote?.[0] || {};
      const adjClose = result.indicators.adjclose?.[0]?.adjclose || quotes.close;

      const prices: HistoricalPrice[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        if (quotes.open[i] != null) {
          prices.push({
            date: new Date(timestamps[i] * 1000),
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
            adjustedClose: adjClose?.[i] || quotes.close[i],
            volume: quotes.volume[i],
          });
        }
      }

      this.priceCache.set(cacheKey, prices);
      return prices;
    } catch (error) {
      console.error(`Error fetching prices for ${ticker}:`, error);
      return [];
    }
  }

  async loadHistoricalSignals(
    startDate: Date,
    endDate: Date
  ): Promise<ConvergenceSignal[]> {
    if (!this.db) {
      return [];
    }

    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return this.db.getConvergenceSignals(daysDiff);
  }

  private getPriceOnDate(
    prices: HistoricalPrice[],
    targetDate: Date
  ): HistoricalPrice | null {
    // Find the closest trading day
    const target = targetDate.getTime();

    for (let i = 0; i < prices.length; i++) {
      const priceDate = new Date(prices[i].date).getTime();
      if (priceDate >= target) {
        return prices[i];
      }
    }

    // Return last price if target is after all dates
    return prices[prices.length - 1] || null;
  }

  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const {
      startDate,
      endDate,
      initialCapital,
      minConvergenceScore,
      maxPositions,
      holdingPeriodDays,
      stopLoss,
      takeProfit,
    } = config;

    const trades: BacktestTrade[] = [];
    let capital = initialCapital;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownDate: Date | undefined;

    // Generate or load signals for the period
    const signals = await this.generateSignalsForPeriod(startDate, endDate);

    // Filter signals by minimum score
    const qualifiedSignals = signals.filter(
      (s) => s.convergenceScore >= minConvergenceScore
    );

    // Track open positions
    const openPositions: Map<
      string,
      {
        signal: ConvergenceSignal;
        entryDate: Date;
        entryPrice: number;
        shares: number;
      }
    > = new Map();

    // Simulate day by day
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Check for new signals on this date
      const daySignals = qualifiedSignals.filter((s) => {
        const signalDate = new Date(s.date);
        return (
          signalDate.toDateString() === currentDate.toDateString() &&
          !openPositions.has(s.ticker)
        );
      });

      // Open new positions if we have capacity
      for (const signal of daySignals.slice(0, maxPositions - openPositions.size)) {
        const prices = await this.loadHistoricalPrices(signal.ticker, {
          start: new Date(currentDate),
          end: new Date(endDate.getTime() + holdingPeriodDays * 24 * 60 * 60 * 1000),
        });

        const entryPrice = this.getPriceOnDate(prices, currentDate);

        if (entryPrice && capital > 0) {
          const positionSize = capital / (maxPositions - openPositions.size);
          const shares = Math.floor(positionSize / entryPrice.close);

          if (shares > 0) {
            openPositions.set(signal.ticker, {
              signal,
              entryDate: currentDate,
              entryPrice: entryPrice.close,
              shares,
            });

            capital -= shares * entryPrice.close;
          }
        }
      }

      // Check for exits (holding period, stop loss, take profit)
      for (const [ticker, position] of openPositions.entries()) {
        const daysSinceEntry = Math.floor(
          (currentDate.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const prices = await this.loadHistoricalPrices(ticker, {
          start: position.entryDate,
          end: currentDate,
        });

        const currentPrice = this.getPriceOnDate(prices, currentDate);

        if (!currentPrice) continue;

        const returnPercent =
          ((currentPrice.close - position.entryPrice) / position.entryPrice) * 100;

        let shouldExit = false;
        let exitReason: BacktestTrade['exitReason'] = 'holding_period';

        // Check stop loss
        if (stopLoss && returnPercent <= -stopLoss) {
          shouldExit = true;
          exitReason = 'stop_loss';
        }

        // Check take profit
        if (takeProfit && returnPercent >= takeProfit) {
          shouldExit = true;
          exitReason = 'take_profit';
        }

        // Check holding period
        if (daysSinceEntry >= holdingPeriodDays) {
          shouldExit = true;
          exitReason = 'holding_period';
        }

        // Check end of test
        if (currentDate >= endDate) {
          shouldExit = true;
          exitReason = 'end_of_test';
        }

        if (shouldExit) {
          const returnDollars = position.shares * (currentPrice.close - position.entryPrice);

          trades.push({
            ticker,
            entryDate: position.entryDate,
            entryPrice: position.entryPrice,
            exitDate: currentDate,
            exitPrice: currentPrice.close,
            shares: position.shares,
            positionValue: position.shares * position.entryPrice,
            returnPercent,
            returnDollars,
            convergenceScoreAtEntry: position.signal.convergenceScore,
            holdingDays: daysSinceEntry,
            exitReason,
          });

          capital += position.shares * currentPrice.close;
          openPositions.delete(ticker);
        }
      }

      // Track drawdown
      const totalValue =
        capital +
        Array.from(openPositions.values()).reduce((sum, pos) => {
          return sum + pos.shares * pos.entryPrice; // Simplified - would use current price
        }, 0);

      maxCapital = Math.max(maxCapital, totalValue);
      const currentDrawdown = ((totalValue - maxCapital) / maxCapital) * 100;

      if (currentDrawdown < maxDrawdown) {
        maxDrawdown = currentDrawdown;
        maxDrawdownDate = new Date(currentDate);
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate final metrics
    const winningTrades = trades.filter((t) => t.returnPercent > 0);
    const losingTrades = trades.filter((t) => t.returnPercent <= 0);

    const totalReturn = ((capital - initialCapital) / initialCapital) * 100;
    const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;

    const avgWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.returnPercent, 0) / winningTrades.length
        : 0;

    const avgLoss =
      losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + t.returnPercent, 0) / losingTrades.length
        : 0;

    const avgHoldingPeriod =
      trades.length > 0
        ? trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length
        : 0;

    return {
      config,
      period: { startDate, endDate },
      trades,
      totalReturn,
      totalReturnDollars: capital - initialCapital,
      finalCapital: capital,
      winRate,
      avgWin,
      avgLoss,
      maxDrawdown,
      maxDrawdownDate,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgHoldingPeriod,
      bestTrade: trades.reduce(
        (best, t) => (t.returnPercent > (best?.returnPercent || -Infinity) ? t : best),
        undefined as BacktestTrade | undefined
      ),
      worstTrade: trades.reduce(
        (worst, t) => (t.returnPercent < (worst?.returnPercent || Infinity) ? t : worst),
        undefined as BacktestTrade | undefined
      ),
    };
  }

  async compareToSPY(result: BacktestResult): Promise<SPYComparison> {
    const { period, config } = result;

    if (!period) {
      return {
        strategyReturn: result.totalReturn,
        spyReturn: 0,
        alpha: result.totalReturn,
        outperformed: true,
        strategyFinalValue: result.finalCapital,
        spyFinalValue: config.initialCapital,
      };
    }

    const spyPrices = await this.loadHistoricalPrices('SPY', {
      start: period.startDate,
      end: period.endDate,
    });

    if (spyPrices.length < 2) {
      return {
        strategyReturn: result.totalReturn,
        spyReturn: 0,
        alpha: result.totalReturn,
        outperformed: true,
        strategyFinalValue: result.finalCapital,
        spyFinalValue: config.initialCapital,
      };
    }

    const spyStartPrice = spyPrices[0].close;
    const spyEndPrice = spyPrices[spyPrices.length - 1].close;
    const spyReturn = ((spyEndPrice - spyStartPrice) / spyStartPrice) * 100;

    const alpha = result.totalReturn - spyReturn;

    return {
      strategyReturn: result.totalReturn,
      spyReturn,
      alpha,
      outperformed: result.totalReturn > spyReturn,
      strategyFinalValue: result.finalCapital,
      spyFinalValue: config.initialCapital * (1 + spyReturn / 100),
    };
  }

  async runMultiplePeriods(
    config: MultiPeriodConfig
  ): Promise<(BacktestResult & { period: { startDate: Date; endDate: Date } })[]> {
    const results: (BacktestResult & { period: { startDate: Date; endDate: Date } })[] = [];

    for (const period of config.periods) {
      const result = await this.runBacktest({
        startDate: period.startDate,
        endDate: period.endDate,
        initialCapital: config.initialCapital,
        minConvergenceScore: config.minConvergenceScore,
        maxPositions: config.maxPositions,
        holdingPeriodDays: config.holdingPeriodDays,
      });

      results.push({
        ...result,
        period,
      });
    }

    return results;
  }

  async calculateAggregateStats(
    results: (BacktestResult & { period: { startDate: Date; endDate: Date } })[]
  ): Promise<AggregateStats> {
    const returns = results.map((r) => r.totalReturn).sort((a, b) => a - b);

    const averageReturn =
      returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;

    const medianReturn =
      returns.length > 0
        ? returns.length % 2 === 0
          ? (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2
          : returns[Math.floor(returns.length / 2)]
        : 0;

    const totalTrades = results.reduce((sum, r) => sum + r.totalTrades, 0);

    const totalWins = results.reduce((sum, r) => sum + r.winningTrades, 0);
    const overallWinRate = totalTrades > 0 ? totalWins / totalTrades : 0;

    const bestPeriodResult = results.reduce(
      (best, r) => (r.totalReturn > (best?.totalReturn || -Infinity) ? r : best),
      undefined as (typeof results)[0] | undefined
    );

    const worstPeriodResult = results.reduce(
      (worst, r) => (r.totalReturn < (worst?.totalReturn || Infinity) ? r : worst),
      undefined as (typeof results)[0] | undefined
    );

    const positiveReturns = results.filter((r) => r.totalReturn > 0).length;
    const consistencyScore = results.length > 0 ? positiveReturns / results.length : 0;

    // Calculate average alpha
    let totalAlpha = 0;
    for (const result of results) {
      const comparison = await this.compareToSPY(result);
      totalAlpha += comparison.alpha;
    }
    const averageAlpha = results.length > 0 ? totalAlpha / results.length : 0;

    return {
      averageReturn,
      medianReturn,
      totalTrades,
      overallWinRate,
      bestPeriod: bestPeriodResult
        ? { period: bestPeriodResult.period, return: bestPeriodResult.totalReturn }
        : { period: { startDate: new Date(), endDate: new Date() }, return: 0 },
      worstPeriod: worstPeriodResult
        ? { period: worstPeriodResult.period, return: worstPeriodResult.totalReturn }
        : { period: { startDate: new Date(), endDate: new Date() }, return: 0 },
      consistencyScore,
      averageAlpha,
    };
  }

  private async generateSignalsForPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<ConvergenceSignal[]> {
    // In a real implementation, this would:
    // 1. Load historical filing data for the period
    // 2. Generate signals based on that historical data
    // For now, we'll return signals from the database if available

    if (this.db) {
      const daysDiff = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return this.db.getConvergenceSignals(daysDiff);
    }

    return [];
  }
}
