export type TransactionType = 'BUY' | 'SELL' | 'EXERCISE' | 'GIFT' | 'OTHER';
export type CongressTransactionType = 'PURCHASE' | 'SALE' | 'EXCHANGE';
export type Chamber = 'HOUSE' | 'SENATE';
export type OwnershipType = 'DIRECT' | 'INDIRECT';
export type ChangeType = 'INCREASE' | 'DECREASE' | 'NEW' | 'SOLD_OUT' | 'NO_CHANGE';
export type DataSource = 'SEC_FORM4' | 'STOCK_ACT' | 'SEC_13F' | 'SEC_13D' | 'SEC_13G';

export interface InsiderTransaction {
  id?: string;
  ticker: string;
  companyName?: string;
  insiderName: string;
  insiderTitle: string;
  insiderCIK?: string;
  transactionType: TransactionType;
  shares: number;
  pricePerShare: number;
  totalValue?: number;
  transactionDate: Date;
  filingDate: Date;
  ownershipType: OwnershipType;
  source: DataSource;
  filingUrl?: string;
}

export interface CongressTransaction {
  id?: string;
  memberName: string;
  chamber: Chamber;
  state: string;
  district?: string;
  party?: string;
  committees?: string[];
  ticker: string;
  assetDescription: string;
  assetType?: string;
  transactionType: CongressTransactionType | string;
  transactionDate: Date;
  disclosureDate: Date;
  amountRange: AmountRange;
  source: DataSource;
  disclosureUrl?: string;
}

export interface AmountRange {
  min: number;
  max: number;
}

export interface InstitutionalHolding {
  id?: string;
  institutionName: string;
  institutionCIK: string;
  ticker: string;
  companyName?: string;
  cusip: string;
  shares: number;
  value: number; // in thousands
  filingDate: Date;
  reportDate: Date;
  changeType?: ChangeType;
  changePercent?: number;
  previousShares?: number;
  ownershipPercent?: number;
  source: DataSource;
  filingUrl?: string;
}

export interface OwnershipChange {
  institutionName: string;
  institutionCIK: string;
  ticker: string;
  cusip: string;
  shares: number;
  ownershipPercent: number;
  filingDate: Date;
  changeType: 'ACQUIRED' | 'DISPOSED' | 'AMENDED';
  source: DataSource;
}

export interface RawFiling {
  accessionNumber: string;
  filingDate: string;
  primaryDocument: string;
  primaryDocumentDescription: string;
  form: string;
  filingUrl: string;
  cik: string;
  companyName?: string;
}
