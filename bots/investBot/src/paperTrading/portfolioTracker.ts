import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getAccount,
  getPositions,
  getOrders,
  getPortfolioHistory,
  Position,
  AccountInfo,
} from './alpacaClient';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '../../data/portfolio.json');

export interface PortfolioSnapshot {
  timestamp: string;
  equity: number;
  cash: number;
  positions: Position[];
  totalReturn: number;
  totalReturnPct: number;
}

export interface TradeLog {
  timestamp: string;
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  shares: number;
  price: number;
  reason: string;
}

export interface PortfolioData {
  startDate: string;
  startingCapital: number;
  trades: TradeLog[];
  snapshots: PortfolioSnapshot[];
}

// Load portfolio data from JSON
function loadPortfolioData(): PortfolioData {
  if (existsSync(DATA_PATH)) {
    const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    return data;
  }
  return {
    startDate: new Date().toISOString(),
    startingCapital: 100000,
    trades: [],
    snapshots: [],
  };
}

// Save portfolio data to JSON
function savePortfolioData(data: PortfolioData): void {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Log a trade
export function logTrade(
  symbol: string,
  action: 'buy' | 'sell',
  amount: number,
  shares: number,
  price: number,
  reason: string
): void {
  const data = loadPortfolioData();
  data.trades.push({
    timestamp: new Date().toISOString(),
    symbol,
    action,
    amount,
    shares,
    price,
    reason,
  });
  savePortfolioData(data);
}

// Take a portfolio snapshot
export async function takeSnapshot(): Promise<PortfolioSnapshot> {
  const data = loadPortfolioData();
  const account = await getAccount();
  const positions = await getPositions();

  const totalReturn = account.equity - data.startingCapital;
  const totalReturnPct = (totalReturn / data.startingCapital) * 100;

  const snapshot: PortfolioSnapshot = {
    timestamp: new Date().toISOString(),
    equity: account.equity,
    cash: account.cash,
    positions,
    totalReturn,
    totalReturnPct,
  };

  // Keep only last 365 daily snapshots
  data.snapshots.push(snapshot);
  if (data.snapshots.length > 365) {
    data.snapshots = data.snapshots.slice(-365);
  }

  savePortfolioData(data);
  return snapshot;
}

// Get performance summary
export async function getPerformanceSummary(): Promise<{
  equity: number;
  cash: number;
  totalReturn: number;
  totalReturnPct: number;
  positionCount: number;
  winRate: number;
  avgReturnPerTrade: number;
  tradeCount: number;
}> {
  const data = loadPortfolioData();
  const account = await getAccount();
  const positions = await getPositions();

  const totalReturn = account.equity - data.startingCapital;
  const totalReturnPct = (totalReturn / data.startingCapital) * 100;

  // Calculate win rate from trades
  const completedTrades = data.trades.filter(t => t.action === 'sell');
  const wins = completedTrades.filter(t => {
    // Find corresponding buy
    const buyTrade = data.trades
      .filter(bt => bt.symbol === t.symbol && bt.action === 'buy')
      .pop();
    return buyTrade && t.price > buyTrade.price;
  });

  const winRate = completedTrades.length > 0
    ? (wins.length / completedTrades.length) * 100
    : 0;

  const avgReturnPerTrade = completedTrades.length > 0
    ? totalReturn / completedTrades.length
    : 0;

  return {
    equity: account.equity,
    cash: account.cash,
    totalReturn,
    totalReturnPct,
    positionCount: positions.length,
    winRate,
    avgReturnPerTrade,
    tradeCount: data.trades.length,
  };
}

// Get all positions with P/L
export async function getPositionsWithPL(): Promise<Array<{
  symbol: string;
  qty: number;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  pl: number;
  plPct: number;
}>> {
  const positions = await getPositions();
  return positions.map(p => ({
    symbol: p.symbol,
    qty: p.qty,
    avgEntry: p.avgEntryPrice,
    currentPrice: p.currentPrice,
    marketValue: p.marketValue,
    pl: p.unrealizedPL,
    plPct: p.unrealizedPLPercent,
  }));
}

// Get trade history
export function getTradeHistory(): TradeLog[] {
  const data = loadPortfolioData();
  return data.trades;
}

// Get historical equity values
export function getEquityHistory(): Array<{ date: string; equity: number }> {
  const data = loadPortfolioData();
  return data.snapshots.map(s => ({
    date: s.timestamp.split('T')[0],
    equity: s.equity,
  }));
}

// Initialize portfolio data if not exists
export function initializePortfolio(startingCapital: number = 100000): void {
  if (!existsSync(DATA_PATH)) {
    const data: PortfolioData = {
      startDate: new Date().toISOString(),
      startingCapital,
      trades: [],
      snapshots: [],
    };
    savePortfolioData(data);
    console.log(`Portfolio initialized with $${startingCapital.toLocaleString()} starting capital`);
  }
}

// Reset portfolio data
export function resetPortfolio(startingCapital: number = 100000): void {
  const data: PortfolioData = {
    startDate: new Date().toISOString(),
    startingCapital,
    trades: [],
    snapshots: [],
  };
  savePortfolioData(data);
  console.log(`Portfolio reset with $${startingCapital.toLocaleString()} starting capital`);
}
