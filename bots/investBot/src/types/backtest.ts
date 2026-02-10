export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  minConvergenceScore: number;
  maxPositions: number;
  holdingPeriodDays: number;
  positionSizing?: 'equal' | 'score-weighted';
  stopLoss?: number; // percentage
  takeProfit?: number; // percentage
}

export interface BacktestTrade {
  ticker: string;
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  shares: number;
  positionValue: number;
  returnPercent: number;
  returnDollars: number;
  convergenceScoreAtEntry: number;
  holdingDays: number;
  exitReason: 'holding_period' | 'stop_loss' | 'take_profit' | 'end_of_test';
}

export interface BacktestResult {
  config: BacktestConfig;
  period?: { startDate: Date; endDate: Date };
  trades: BacktestTrade[];
  totalReturn: number;
  totalReturnDollars: number;
  finalCapital: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  maxDrawdownDate?: Date;
  sharpeRatio?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgHoldingPeriod: number;
  bestTrade?: BacktestTrade;
  worstTrade?: BacktestTrade;
}

export interface SPYComparison {
  strategyReturn: number;
  spyReturn: number;
  alpha: number;
  outperformed: boolean;
  strategyFinalValue: number;
  spyFinalValue: number;
}

export interface MultiPeriodConfig {
  periods: Array<{ startDate: Date; endDate: Date }>;
  initialCapital: number;
  minConvergenceScore: number;
  maxPositions: number;
  holdingPeriodDays: number;
}

export interface AggregateStats {
  averageReturn: number;
  medianReturn: number;
  totalTrades: number;
  overallWinRate: number;
  bestPeriod: { period: { startDate: Date; endDate: Date }; return: number };
  worstPeriod: { period: { startDate: Date; endDate: Date }; return: number };
  consistencyScore: number; // % of periods with positive returns
  averageAlpha: number;
}

export interface HistoricalPrice {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

export interface PriceRange {
  start: Date;
  end: Date;
}
