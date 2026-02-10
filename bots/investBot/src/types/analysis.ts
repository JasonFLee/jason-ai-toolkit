export interface ConvergenceSignal {
  ticker: string;
  companyName?: string;
  date: Date;
  convergenceScore: number;
  insiderScore: number;
  congressScore: number;
  institutionalScore: number;
  convergenceBonus: number;
  signals: SignalDetails;
  recentBuyers: RecentBuyer[];
}

export interface SignalDetails {
  insiderBuys: number;
  congressBuys: number;
  institutionalIncreases: number;
  insiderSells?: number;
  congressSells?: number;
  institutionalDecreases?: number;
}

export interface RecentBuyer {
  name: string;
  type: 'CEO' | 'CFO' | 'Director' | 'Officer' | '10%+ Owner' | 'Congress' | 'Institution';
  date: Date;
  amount?: number;
  amountRange?: { min: number; max: number };
}

export interface StockScore {
  ticker: string;
  companyName?: string;
  overallScore: number;
  insiderScore: number;
  congressScore: number;
  institutionalScore: number;
  convergenceBonus: number;
  recentBuyers: RecentBuyer[];
  signals: SignalDetails;
  priceAtSignal?: number;
  marketCap?: number;
  sector?: string;
}

export interface InsiderWeightInput {
  insiderTitle: string;
  transactionType: string;
  shares: number;
  pricePerShare: number;
}

export interface CongressWeightInput {
  memberName: string;
  committees?: string[];
  transactionType: string;
  amountRange: { min: number; max: number };
}

export interface ConvergenceInput {
  insiderTransactions: import('./transactions').InsiderTransaction[];
  congressTransactions: import('./transactions').CongressTransaction[];
  institutionalHoldings: import('./transactions').InstitutionalHolding[];
  lookbackDays: number;
}

// Weights for different signal types
export const INSIDER_WEIGHTS = {
  CEO: 10,
  CFO: 9,
  COO: 8,
  President: 8,
  'Chief Executive Officer': 10,
  'Chief Financial Officer': 9,
  'Chief Operating Officer': 8,
  Director: 5,
  Officer: 6,
  '10% Owner': 7,
  VP: 4,
  'Vice President': 4,
  Secretary: 3,
  Treasurer: 4,
  General: 3,
} as const;

export const CONGRESS_COMMITTEE_WEIGHTS: Record<string, number> = {
  Finance: 10,
  Banking: 10,
  'Ways and Means': 9,
  'Financial Services': 9,
  Commerce: 8,
  Energy: 8,
  'Armed Services': 7,
  Intelligence: 8,
  Judiciary: 6,
  Appropriations: 7,
};

export const TRANSACTION_SIZE_MULTIPLIERS = {
  small: 1,      // < $50k
  medium: 1.5,   // $50k - $250k
  large: 2,      // $250k - $1M
  xlarge: 3,     // $1M - $5M
  mega: 5,       // > $5M
} as const;
