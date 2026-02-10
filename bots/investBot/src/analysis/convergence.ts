import {
  InsiderTransaction,
  CongressTransaction,
  InstitutionalHolding,
} from '../types/transactions';
import {
  ConvergenceSignal,
  StockScore,
  SignalDetails,
  RecentBuyer,
  InsiderWeightInput,
  CongressWeightInput,
  ConvergenceInput,
  INSIDER_WEIGHTS,
  CONGRESS_COMMITTEE_WEIGHTS,
  TRANSACTION_SIZE_MULTIPLIERS,
} from '../types/analysis';
import { Database } from '../db/database';

export class ConvergenceAnalyzer {
  private db: Database | null = null;

  constructor(db?: Database) {
    this.db = db || null;
  }

  async setDatabase(db: Database): Promise<void> {
    this.db = db;
  }

  calculateInsiderWeight(input: InsiderWeightInput): number {
    const { insiderTitle, transactionType, shares, pricePerShare } = input;

    // Base weight from title
    let baseWeight = 3; // Default
    const titleUpper = insiderTitle.toUpperCase();

    for (const [title, weight] of Object.entries(INSIDER_WEIGHTS)) {
      if (titleUpper.includes(title.toUpperCase())) {
        baseWeight = Math.max(baseWeight, weight);
      }
    }

    // Transaction type multiplier
    const txMultiplier = transactionType === 'BUY' ? 1.5 : transactionType === 'SELL' ? 0.3 : 1;

    // Size multiplier based on total value
    const totalValue = shares * pricePerShare;
    let sizeMultiplier = TRANSACTION_SIZE_MULTIPLIERS.small;

    if (totalValue >= 5000000) {
      sizeMultiplier = TRANSACTION_SIZE_MULTIPLIERS.mega;
    } else if (totalValue >= 1000000) {
      sizeMultiplier = TRANSACTION_SIZE_MULTIPLIERS.xlarge;
    } else if (totalValue >= 250000) {
      sizeMultiplier = TRANSACTION_SIZE_MULTIPLIERS.large;
    } else if (totalValue >= 50000) {
      sizeMultiplier = TRANSACTION_SIZE_MULTIPLIERS.medium;
    }

    return baseWeight * txMultiplier * sizeMultiplier;
  }

  calculateCongressWeight(input: CongressWeightInput): number {
    const { committees = [], transactionType, amountRange } = input;

    // Base weight
    let baseWeight = 5;

    // Committee bonus
    let committeeBonus = 0;
    for (const committee of committees) {
      for (const [name, weight] of Object.entries(CONGRESS_COMMITTEE_WEIGHTS)) {
        if (committee.toLowerCase().includes(name.toLowerCase())) {
          committeeBonus = Math.max(committeeBonus, weight);
        }
      }
    }

    // Transaction type multiplier
    const txMultiplier = transactionType === 'PURCHASE' ? 1.5 : 0.5;

    // Amount multiplier
    const avgAmount = (amountRange.min + amountRange.max) / 2;
    let amountMultiplier = 1;

    if (avgAmount >= 1000000) {
      amountMultiplier = 3;
    } else if (avgAmount >= 250000) {
      amountMultiplier = 2;
    } else if (avgAmount >= 50000) {
      amountMultiplier = 1.5;
    }

    return (baseWeight + committeeBonus) * txMultiplier * amountMultiplier;
  }

  calculateInstitutionalWeight(holding: InstitutionalHolding): number {
    let baseWeight = 5;

    // Weight by change type
    if (holding.changeType === 'NEW') {
      baseWeight *= 2;
    } else if (holding.changeType === 'INCREASE') {
      baseWeight *= 1.5;
    } else if (holding.changeType === 'DECREASE' || holding.changeType === 'SOLD_OUT') {
      baseWeight *= 0.3;
    }

    // Weight by value (in millions)
    const valueMillions = holding.value / 1000000;
    if (valueMillions >= 1000) {
      baseWeight *= 3;
    } else if (valueMillions >= 100) {
      baseWeight *= 2;
    } else if (valueMillions >= 10) {
      baseWeight *= 1.5;
    }

    // Bonus for large ownership percentage
    if (holding.ownershipPercent && holding.ownershipPercent >= 10) {
      baseWeight *= 1.5;
    }

    return baseWeight;
  }

  async detectConvergence(input: ConvergenceInput): Promise<ConvergenceSignal[]> {
    const { insiderTransactions, congressTransactions, institutionalHoldings, lookbackDays } =
      input;

    // Group all activity by ticker
    const tickerActivity: Record<
      string,
      {
        insider: InsiderTransaction[];
        congress: CongressTransaction[];
        institutional: InstitutionalHolding[];
      }
    > = {};

    // Process insider transactions
    for (const tx of insiderTransactions) {
      if (!tickerActivity[tx.ticker]) {
        tickerActivity[tx.ticker] = { insider: [], congress: [], institutional: [] };
      }
      tickerActivity[tx.ticker].insider.push(tx);
    }

    // Process congress transactions
    for (const tx of congressTransactions) {
      if (!tickerActivity[tx.ticker]) {
        tickerActivity[tx.ticker] = { insider: [], congress: [], institutional: [] };
      }
      tickerActivity[tx.ticker].congress.push(tx);
    }

    // Process institutional holdings
    for (const h of institutionalHoldings) {
      if (!tickerActivity[h.ticker]) {
        tickerActivity[h.ticker] = { insider: [], congress: [], institutional: [] };
      }
      tickerActivity[h.ticker].institutional.push(h);
    }

    // Calculate convergence signals for each ticker
    const signals: ConvergenceSignal[] = [];

    for (const [ticker, activity] of Object.entries(tickerActivity)) {
      // Count buys in each category
      const insiderBuys = activity.insider.filter((t) => t.transactionType === 'BUY');
      const congressBuys = activity.congress.filter((t) => t.transactionType === 'PURCHASE');
      const institutionalIncreases = activity.institutional.filter(
        (h) => h.changeType === 'INCREASE' || h.changeType === 'NEW'
      );

      // Calculate scores for each category
      let insiderScore = 0;
      for (const tx of insiderBuys) {
        insiderScore += this.calculateInsiderWeight({
          insiderTitle: tx.insiderTitle,
          transactionType: tx.transactionType,
          shares: tx.shares,
          pricePerShare: tx.pricePerShare,
        });
      }

      let congressScore = 0;
      for (const tx of congressBuys) {
        congressScore += this.calculateCongressWeight({
          memberName: tx.memberName,
          committees: tx.committees,
          transactionType: tx.transactionType,
          amountRange: tx.amountRange,
        });
      }

      let institutionalScore = 0;
      for (const h of institutionalIncreases) {
        institutionalScore += this.calculateInstitutionalWeight(h);
      }

      // Convergence bonus when multiple categories are active
      let convergenceBonus = 0;
      const activeCategories = [
        insiderBuys.length > 0,
        congressBuys.length > 0,
        institutionalIncreases.length > 0,
      ].filter(Boolean).length;

      if (activeCategories >= 3) {
        convergenceBonus = 30;
      } else if (activeCategories >= 2) {
        convergenceBonus = 15;
      }

      // Normalize scores to 0-100 scale
      const normalizedInsider = Math.min(100, insiderScore * 2);
      const normalizedCongress = Math.min(100, congressScore * 2);
      const normalizedInstitutional = Math.min(100, institutionalScore * 2);

      // Overall convergence score
      const convergenceScore = Math.min(
        100,
        (normalizedInsider * 0.35 +
          normalizedCongress * 0.3 +
          normalizedInstitutional * 0.25 +
          convergenceBonus) *
          (activeCategories >= 2 ? 1.2 : 1)
      );

      // Build recent buyers list
      const recentBuyers: RecentBuyer[] = [];

      for (const tx of insiderBuys.slice(0, 5)) {
        const type = this.getInsiderType(tx.insiderTitle);
        recentBuyers.push({
          name: tx.insiderName,
          type,
          date: tx.transactionDate,
          amount: tx.shares * tx.pricePerShare,
        });
      }

      for (const tx of congressBuys.slice(0, 3)) {
        recentBuyers.push({
          name: tx.memberName,
          type: 'Congress',
          date: tx.transactionDate,
          amountRange: tx.amountRange,
        });
      }

      for (const h of institutionalIncreases.slice(0, 3)) {
        recentBuyers.push({
          name: h.institutionName,
          type: 'Institution',
          date: h.filingDate,
          amount: h.value,
        });
      }

      // Only include if there's meaningful activity
      if (convergenceScore > 10) {
        signals.push({
          ticker,
          companyName: activity.insider[0]?.companyName || activity.institutional[0]?.companyName,
          date: new Date(),
          convergenceScore,
          insiderScore: normalizedInsider,
          congressScore: normalizedCongress,
          institutionalScore: normalizedInstitutional,
          convergenceBonus,
          signals: {
            insiderBuys: insiderBuys.length,
            congressBuys: congressBuys.length,
            institutionalIncreases: institutionalIncreases.length,
          },
          recentBuyers: recentBuyers.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          ),
        });
      }
    }

    // Sort by convergence score descending
    return signals.sort((a, b) => b.convergenceScore - a.convergenceScore);
  }

  private getInsiderType(
    title: string
  ): 'CEO' | 'CFO' | 'Director' | 'Officer' | '10%+ Owner' {
    const titleUpper = title.toUpperCase();

    if (titleUpper.includes('CEO') || titleUpper.includes('CHIEF EXECUTIVE')) {
      return 'CEO';
    }
    if (titleUpper.includes('CFO') || titleUpper.includes('CHIEF FINANCIAL')) {
      return 'CFO';
    }
    if (titleUpper.includes('10%') || titleUpper.includes('TEN PERCENT')) {
      return '10%+ Owner';
    }
    if (titleUpper.includes('DIRECTOR')) {
      return 'Director';
    }
    return 'Officer';
  }

  async scoreStock(ticker: string, lookbackDays: number): Promise<StockScore> {
    if (!this.db) {
      // Return default score if no database
      return {
        ticker,
        overallScore: 0,
        insiderScore: 0,
        congressScore: 0,
        institutionalScore: 0,
        convergenceBonus: 0,
        recentBuyers: [],
        signals: {
          insiderBuys: 0,
          congressBuys: 0,
          institutionalIncreases: 0,
        },
      };
    }

    const activity = await this.db.getAllActivityForTicker(ticker, lookbackDays);

    const signals = await this.detectConvergence({
      insiderTransactions: activity.insiderTransactions,
      congressTransactions: activity.congressTransactions,
      institutionalHoldings: activity.institutionalHoldings,
      lookbackDays,
    });

    const tickerSignal = signals.find((s) => s.ticker === ticker);

    if (!tickerSignal) {
      return {
        ticker,
        overallScore: 0,
        insiderScore: 0,
        congressScore: 0,
        institutionalScore: 0,
        convergenceBonus: 0,
        recentBuyers: [],
        signals: {
          insiderBuys: 0,
          congressBuys: 0,
          institutionalIncreases: 0,
        },
      };
    }

    return {
      ticker,
      companyName: tickerSignal.companyName,
      overallScore: tickerSignal.convergenceScore,
      insiderScore: tickerSignal.insiderScore,
      congressScore: tickerSignal.congressScore,
      institutionalScore: tickerSignal.institutionalScore,
      convergenceBonus: tickerSignal.convergenceBonus,
      recentBuyers: tickerSignal.recentBuyers,
      signals: tickerSignal.signals,
    };
  }

  async getTopPicks(
    limit: number,
    lookbackDays: number,
    minScore: number = 0
  ): Promise<StockScore[]> {
    if (!this.db) {
      return [];
    }

    // Get all unique tickers with activity
    const tickers = await this.db.getUniqueTickersWithActivity(lookbackDays);

    // Score each ticker
    const scores: StockScore[] = [];

    for (const ticker of tickers) {
      const score = await this.scoreStock(ticker, lookbackDays);
      if (score.overallScore >= minScore) {
        scores.push(score);
      }
    }

    // Sort by score and return top picks
    return scores.sort((a, b) => b.overallScore - a.overallScore).slice(0, limit);
  }

  async analyzeFromDatabase(lookbackDays: number = 30): Promise<ConvergenceSignal[]> {
    if (!this.db) {
      throw new Error('Database not set');
    }

    const [insiderTxs, congressTxs, institutionalHoldings] = await Promise.all([
      this.db.getAllInsiderTransactions(lookbackDays),
      this.db.getAllCongressTransactions(lookbackDays),
      this.db.getAllInstitutionalHoldings(lookbackDays),
    ]);

    return this.detectConvergence({
      insiderTransactions: insiderTxs,
      congressTransactions: congressTxs,
      institutionalHoldings,
      lookbackDays,
    });
  }
}
