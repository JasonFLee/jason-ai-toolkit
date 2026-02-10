import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';
import {
  InsiderTransaction,
  CongressTransaction,
  InstitutionalHolding,
  ConvergenceSignal,
  HistoricalPrice,
} from '../types';

interface DatabaseSchema {
  insider_transactions: InsiderTransaction[];
  congress_transactions: CongressTransaction[];
  institutional_holdings: InstitutionalHolding[];
  convergence_signals: ConvergenceSignal[];
  stock_prices: Record<string, HistoricalPrice[]>;
  metadata: {
    lastUpdated: string;
    version: string;
  };
}

const defaultData: DatabaseSchema = {
  insider_transactions: [],
  congress_transactions: [],
  institutional_holdings: [],
  convergence_signals: [],
  stock_prices: {},
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: '1.0.0',
  },
};

export class Database {
  private db: Low<DatabaseSchema> | null = null;
  private dbPath: string;

  constructor(dbPath: string = 'data/investbot.json') {
    if (dbPath === ':memory:') {
      this.dbPath = ':memory:';
    } else {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      this.dbPath = join(__dirname, '../../', dbPath);
    }
  }

  async initialize(): Promise<void> {
    if (this.dbPath === ':memory:') {
      // In-memory database for testing
      this.db = new Low<DatabaseSchema>(
        new JSONFile<DatabaseSchema>('/dev/null'),
        defaultData
      );
      this.db.data = { ...defaultData };
    } else {
      // Ensure directory exists
      await mkdir(dirname(this.dbPath), { recursive: true });

      const adapter = new JSONFile<DatabaseSchema>(this.dbPath);
      this.db = new Low<DatabaseSchema>(adapter, defaultData);
      await this.db.read();

      if (!this.db.data) {
        this.db.data = { ...defaultData };
        await this.db.write();
      }
    }
  }

  async close(): Promise<void> {
    if (this.db && this.dbPath !== ':memory:') {
      await this.db.write();
    }
    this.db = null;
  }

  async getTables(): Promise<string[]> {
    return [
      'insider_transactions',
      'congress_transactions',
      'institutional_holdings',
      'convergence_signals',
      'stock_prices',
    ];
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getTransactionKey(tx: InsiderTransaction): string {
    return `${tx.ticker}-${tx.insiderName}-${tx.transactionDate}-${tx.shares}`;
  }

  private getCongressKey(tx: CongressTransaction): string {
    return `${tx.ticker}-${tx.memberName}-${tx.transactionDate}-${tx.amountRange.min}`;
  }

  private getHoldingKey(h: InstitutionalHolding): string {
    return `${h.ticker}-${h.institutionCIK}-${h.reportDate}`;
  }

  // Insider Transactions
  async saveInsiderTransaction(transaction: InsiderTransaction): Promise<void> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const key = this.getTransactionKey(transaction);
    const exists = this.db.data.insider_transactions.some(
      (tx) => this.getTransactionKey(tx) === key
    );

    if (!exists) {
      this.db.data.insider_transactions.push({
        ...transaction,
        id: this.generateId(),
      });
      if (this.dbPath !== ':memory:') await this.db.write();
    }
  }

  async saveInsiderTransactions(transactions: InsiderTransaction[]): Promise<void> {
    for (const tx of transactions) {
      await this.saveInsiderTransaction(tx);
    }
  }

  async getInsiderTransactions(ticker: string, lookbackDays: number): Promise<InsiderTransaction[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.insider_transactions.filter((tx) => {
      const txDate = new Date(tx.transactionDate);
      return tx.ticker === ticker && txDate >= cutoffDate;
    });
  }

  async getAllInsiderTransactions(lookbackDays: number): Promise<InsiderTransaction[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.insider_transactions.filter((tx) => {
      const txDate = new Date(tx.transactionDate);
      return txDate >= cutoffDate;
    });
  }

  // Congress Transactions
  async saveCongressTransaction(transaction: CongressTransaction): Promise<void> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const key = this.getCongressKey(transaction);
    const exists = this.db.data.congress_transactions.some(
      (tx) => this.getCongressKey(tx) === key
    );

    if (!exists) {
      this.db.data.congress_transactions.push({
        ...transaction,
        id: this.generateId(),
      });
      if (this.dbPath !== ':memory:') await this.db.write();
    }
  }

  async saveCongressTransactions(transactions: CongressTransaction[]): Promise<void> {
    for (const tx of transactions) {
      await this.saveCongressTransaction(tx);
    }
  }

  async getCongressTransactions(ticker: string, lookbackDays: number): Promise<CongressTransaction[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.congress_transactions.filter((tx) => {
      const txDate = new Date(tx.transactionDate);
      return tx.ticker === ticker && txDate >= cutoffDate;
    });
  }

  async getAllCongressTransactions(lookbackDays: number): Promise<CongressTransaction[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.congress_transactions.filter((tx) => {
      const txDate = new Date(tx.transactionDate);
      return txDate >= cutoffDate;
    });
  }

  // Institutional Holdings
  async saveInstitutionalHolding(holding: InstitutionalHolding): Promise<void> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const key = this.getHoldingKey(holding);
    const exists = this.db.data.institutional_holdings.some(
      (h) => this.getHoldingKey(h) === key
    );

    if (!exists) {
      this.db.data.institutional_holdings.push({
        ...holding,
        id: this.generateId(),
      });
      if (this.dbPath !== ':memory:') await this.db.write();
    }
  }

  async saveInstitutionalHoldings(holdings: InstitutionalHolding[]): Promise<void> {
    for (const h of holdings) {
      await this.saveInstitutionalHolding(h);
    }
  }

  async getInstitutionalHoldings(ticker: string, lookbackDays: number): Promise<InstitutionalHolding[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.institutional_holdings.filter((h) => {
      const filingDate = new Date(h.filingDate);
      return h.ticker === ticker && filingDate >= cutoffDate;
    });
  }

  async getAllInstitutionalHoldings(lookbackDays: number): Promise<InstitutionalHolding[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.institutional_holdings.filter((h) => {
      const filingDate = new Date(h.filingDate);
      return filingDate >= cutoffDate;
    });
  }

  // Convergence Signals
  async saveConvergenceSignal(signal: ConvergenceSignal): Promise<void> {
    if (!this.db?.data) throw new Error('Database not initialized');

    this.db.data.convergence_signals.push(signal);
    if (this.dbPath !== ':memory:') await this.db.write();
  }

  async getConvergenceSignals(lookbackDays: number): Promise<ConvergenceSignal[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    return this.db.data.convergence_signals.filter((s) => {
      const signalDate = new Date(s.date);
      return signalDate >= cutoffDate;
    });
  }

  // Stock Prices
  async saveStockPrices(ticker: string, prices: HistoricalPrice[]): Promise<void> {
    if (!this.db?.data) throw new Error('Database not initialized');

    this.db.data.stock_prices[ticker] = prices;
    if (this.dbPath !== ':memory:') await this.db.write();
  }

  async getStockPrices(ticker: string, start: Date, end: Date): Promise<HistoricalPrice[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const prices = this.db.data.stock_prices[ticker] || [];
    return prices.filter((p) => {
      const priceDate = new Date(p.date);
      return priceDate >= start && priceDate <= end;
    });
  }

  // Combined queries
  async getAllActivityForTicker(
    ticker: string,
    lookbackDays: number
  ): Promise<{
    insiderTransactions: InsiderTransaction[];
    congressTransactions: CongressTransaction[];
    institutionalHoldings: InstitutionalHolding[];
  }> {
    const [insiderTransactions, congressTransactions, institutionalHoldings] = await Promise.all([
      this.getInsiderTransactions(ticker, lookbackDays),
      this.getCongressTransactions(ticker, lookbackDays),
      this.getInstitutionalHoldings(ticker, lookbackDays),
    ]);

    return { insiderTransactions, congressTransactions, institutionalHoldings };
  }

  async getTopStocksByActivity(
    limit: number,
    lookbackDays: number
  ): Promise<Array<{ ticker: string; activityCount: number }>> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const activityCounts: Record<string, number> = {};

    // Count insider transactions
    this.db.data.insider_transactions.forEach((tx) => {
      const txDate = new Date(tx.transactionDate);
      if (txDate >= cutoffDate) {
        activityCounts[tx.ticker] = (activityCounts[tx.ticker] || 0) + 1;
      }
    });

    // Count congress transactions
    this.db.data.congress_transactions.forEach((tx) => {
      const txDate = new Date(tx.transactionDate);
      if (txDate >= cutoffDate) {
        activityCounts[tx.ticker] = (activityCounts[tx.ticker] || 0) + 1;
      }
    });

    // Count institutional changes
    this.db.data.institutional_holdings.forEach((h) => {
      const filingDate = new Date(h.filingDate);
      if (filingDate >= cutoffDate && h.changeType === 'INCREASE') {
        activityCounts[h.ticker] = (activityCounts[h.ticker] || 0) + 1;
      }
    });

    return Object.entries(activityCounts)
      .map(([ticker, activityCount]) => ({ ticker, activityCount }))
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, limit);
  }

  async getUniqueTickersWithActivity(lookbackDays: number): Promise<string[]> {
    if (!this.db?.data) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const tickers = new Set<string>();

    this.db.data.insider_transactions.forEach((tx) => {
      const txDate = new Date(tx.transactionDate);
      if (txDate >= cutoffDate && tx.transactionType === 'BUY') {
        tickers.add(tx.ticker);
      }
    });

    this.db.data.congress_transactions.forEach((tx) => {
      const txDate = new Date(tx.transactionDate);
      if (txDate >= cutoffDate && tx.transactionType === 'PURCHASE') {
        tickers.add(tx.ticker);
      }
    });

    this.db.data.institutional_holdings.forEach((h) => {
      const filingDate = new Date(h.filingDate);
      if (filingDate >= cutoffDate && h.changeType === 'INCREASE') {
        tickers.add(h.ticker);
      }
    });

    return Array.from(tickers);
  }
}
