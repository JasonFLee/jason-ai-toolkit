import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  getAccount,
  getPositions,
  submitDollarOrder,
  isMarketOpen,
  testConnection,
  hasPosition,
  getLatestPrice,
  closePosition,
} from './paperTrading/alpacaClient';
import type { Position } from './paperTrading/alpacaClient';
import { execSync } from 'child_process';
import {
  logTrade,
  takeSnapshot,
  initializePortfolio,
} from './paperTrading/portfolioTracker';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendGmail } from './email/gmailOAuth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../logs');
const DATA_DIR = join(__dirname, '../data');
const LOG_FILE = join(LOG_DIR, 'daily-runner.log');
const PENDING_PICKS_FILE = join(DATA_DIR, 'pending-picks.json');
const POSITION_TRACKER_FILE = join(DATA_DIR, 'position-tracker.json');
const QUEUED_SELLS_FILE = join(DATA_DIR, 'queued-sells.json');


// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // How long to hold positions before auto-selling (in days)
  HOLD_PERIOD_DAYS: 90,

  // Investment sizing - PROPORTIONATE to available cash
  // Each trade = percentage of available cash (after reserve)
  INVESTMENT_PCT_PER_TRADE: 0.15,  // 15% of available cash per trade
  MIN_INVESTMENT: 500,              // Minimum $500 per trade
  MAX_INVESTMENT: 10000,            // Maximum $10K per trade

  // Cash management
  MIN_CASH_RESERVE_PCT: 0.20,  // Keep 20% in cash minimum
  MAX_DAILY_INVESTMENT: 15000,  // Max to invest in a single day
};

// Ensure directories exist
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  appendFileSync(LOG_FILE, logMessage + '\n');
}

// ============================================================================
// INTERFACES
// ============================================================================

interface InsiderTrade {
  ticker: string;
  company: string;
  insiderName: string;
  title: string;
  shares: number;
  value: number;
  date: string;
  executiveScore: number;
}

interface FinalPick {
  ticker: string;
  company: string;
  score: number;
  holdPeriod: string;
  whyBuy: string;
  confidence: number;
  savedAt?: string;  // When the pick was saved
}

// ============================================================================
// PICK PERSISTENCE - Save picks when found, execute when market opens
// ============================================================================

function savePendingPicks(picks: FinalPick[]): void {
  const picksWithTimestamp = picks.map(p => ({
    ...p,
    savedAt: new Date().toISOString(),
  }));
  writeFileSync(PENDING_PICKS_FILE, JSON.stringify(picksWithTimestamp, null, 2));
  log(`Saved ${picks.length} picks to pending-picks.json`);
}

function loadPendingPicks(): FinalPick[] {
  if (!existsSync(PENDING_PICKS_FILE)) {
    return [];
  }
  try {
    const data = readFileSync(PENDING_PICKS_FILE, 'utf-8');
    const picks = JSON.parse(data) as FinalPick[];

    // Only use picks from the last 3 days (insider signals stay relevant)
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const validPicks = picks.filter(p => {
      if (!p.savedAt) return false;
      return new Date(p.savedAt).getTime() > threeDaysAgo;
    });

    if (validPicks.length > 0) {
      log(`Loaded ${validPicks.length} pending picks from file`);
    }
    return validPicks;
  } catch (e) {
    log('Could not load pending picks, starting fresh');
    return [];
  }
}

function clearPendingPicks(): void {
  if (existsSync(PENDING_PICKS_FILE)) {
    writeFileSync(PENDING_PICKS_FILE, '[]');
    log('Cleared pending picks after execution');
  }
}

// ============================================================================
// POSITION TRACKING - Track when positions were opened for auto-sell
// ============================================================================

interface TrackedPosition {
  symbol: string;
  buyDate: string;
  buyPrice: number;
  shares: number;
  reason: string;
  confidence: number;
}

function loadPositionTracker(): TrackedPosition[] {
  if (!existsSync(POSITION_TRACKER_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(POSITION_TRACKER_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function savePositionTracker(positions: TrackedPosition[]): void {
  writeFileSync(POSITION_TRACKER_FILE, JSON.stringify(positions, null, 2));
}

function trackNewPosition(symbol: string, shares: number, price: number, reason: string, confidence: number): void {
  const positions = loadPositionTracker();
  // Don't add duplicates
  if (!positions.find(p => p.symbol === symbol)) {
    positions.push({
      symbol,
      buyDate: new Date().toISOString(),
      buyPrice: price,
      shares,
      reason,
      confidence,
    });
    savePositionTracker(positions);
    log(`Tracking new position: ${symbol} bought at $${price}`);
  }
}

function removeTrackedPosition(symbol: string): void {
  const positions = loadPositionTracker();
  const filtered = positions.filter(p => p.symbol !== symbol);
  savePositionTracker(filtered);
}

async function checkAndSellOldPositions(): Promise<string[]> {
  const soldSymbols: string[] = [];
  const positions = loadPositionTracker();
  const now = Date.now();

  for (const pos of positions) {
    const buyDate = new Date(pos.buyDate).getTime();
    const daysHeld = (now - buyDate) / (1000 * 60 * 60 * 24);

    if (daysHeld >= CONFIG.HOLD_PERIOD_DAYS) {
      log(`Position ${pos.symbol} held for ${Math.floor(daysHeld)} days - AUTO-SELLING`);

      const order = await closePosition(pos.symbol);
      if (order) {
        log(`Sold ${pos.symbol}: ${order.status}`);
        removeTrackedPosition(pos.symbol);
        soldSymbols.push(pos.symbol);

        // Log the sell trade
        logTrade(
          pos.symbol,
          'sell',
          0, // Will be filled by order
          order.qty,
          order.filledAvgPrice || 0,
          `Auto-sell after ${CONFIG.HOLD_PERIOD_DAYS} days hold period`
        );
      }
    }
  }

  return soldSymbols;
}

// Process manually queued sells (e.g., removing bad positions like fake NVDA data)
async function processQueuedSells(): Promise<string[]> {
  const soldSymbols: string[] = [];

  if (!existsSync(QUEUED_SELLS_FILE)) {
    return soldSymbols;
  }

  try {
    const queued = JSON.parse(readFileSync(QUEUED_SELLS_FILE, 'utf-8')) as Array<{
      symbol: string;
      reason: string;
      queuedAt: string;
    }>;

    if (queued.length === 0) return soldSymbols;

    log(`Processing ${queued.length} queued sell(s)...`);

    for (const sell of queued) {
      log(`  Selling ${sell.symbol}: ${sell.reason}`);
      const order = await closePosition(sell.symbol);
      if (order) {
        log(`    Sold ${sell.symbol}: ${order.status}`);
        removeTrackedPosition(sell.symbol);
        soldSymbols.push(sell.symbol);

        logTrade(
          sell.symbol,
          'sell',
          0,
          order.qty,
          order.filledAvgPrice || 0,
          `Manual sell: ${sell.reason}`
        );
      } else {
        log(`    Failed to sell ${sell.symbol} - may not hold position`);
      }
    }

    // Clear the queue
    writeFileSync(QUEUED_SELLS_FILE, '[]');
    log(`Cleared queued sells`);

  } catch (e: any) {
    log(`Error processing queued sells: ${e.message}`);
  }

  return soldSymbols;
}

// ============================================================================
// EXECUTIVE SCORING
// ============================================================================

const EXECUTIVE_RANKS = [
  { pattern: /\bCEO\b/i, baseScore: 100 },
  { pattern: /\bChief Executive/i, baseScore: 100 },
  { pattern: /\bCFO\b/i, baseScore: 95 },
  { pattern: /\bChief Financial/i, baseScore: 95 },
  { pattern: /\bCOO\b/i, baseScore: 90 },
  { pattern: /\bPresident\b/i, baseScore: 90 },
  { pattern: /\bChairman\b/i, baseScore: 88 },
  { pattern: /\bFounder\b/i, baseScore: 95 },
  { pattern: /\b10% Owner/i, baseScore: 92 },
  { pattern: /\bExecutive Vice President/i, baseScore: 75 },
  { pattern: /\bSenior Vice President/i, baseScore: 70 },
  { pattern: /\bVice President/i, baseScore: 65 },
  { pattern: /\bDirector\b/i, baseScore: 50 },
  { pattern: /\bOfficer\b/i, baseScore: 45 },
];

function calculateExecutiveScore(title: string, tradeValue: number): number {
  let bestScore = 30;
  for (const rank of EXECUTIVE_RANKS) {
    if (rank.pattern.test(title) && rank.baseScore > bestScore) {
      bestScore = rank.baseScore;
    }
  }
  let multiplier = 1.0;
  if (tradeValue >= 10000000) multiplier = 2.0;
  else if (tradeValue >= 5000000) multiplier = 1.8;
  else if (tradeValue >= 1000000) multiplier = 1.5;
  else if (tradeValue >= 500000) multiplier = 1.3;
  else if (tradeValue >= 100000) multiplier = 1.1;
  return Math.min(bestScore * multiplier, 200);
}

// ============================================================================
// DATA FETCHING - REAL DATA ONLY, NO FALLBACKS
// ============================================================================

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.dataroma.com/',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
};

async function scrapeDataroma(): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  const response = await axios.get('https://www.dataroma.com/m/ins/ins.php?po=1', {
    headers: HEADERS,
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);
  $('table#grid tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 10) {
      const ticker = $(cells[1]).text().trim();
      const company = $(cells[2]).text().trim();
      const insider = $(cells[3]).text().trim();
      const title = $(cells[4]).text().trim();
      const dateText = $(cells[5]).text().trim();
      const sharesText = $(cells[7]).text().trim();
      const amountText = $(cells[9]).text().trim();
      if (ticker && ticker.length <= 5) {
        const shares = parseInt(sharesText.replace(/,/g, '')) || 0;
        const value = parseFloat(amountText.replace(/,/g, '')) || 0;
        trades.push({
          ticker: ticker.toUpperCase(),
          company,
          insiderName: insider,
          title,
          shares,
          value,
          date: dateText,
          executiveScore: calculateExecutiveScore(title, value),
        });
      }
    }
  });

  return trades;
}

// OpenInsider has FRESH data from SEC Form 4 filings (filed within hours/days)
async function scrapeOpenInsider(): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  try {
    // Get latest insider buys - purchases over $100K filed in last 7 days
    const response = await axios.get('http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=7&fdr=&td=0&tdr=&fdlyl=&fdlyh=&dtefrom=&deteto=&xp=1&vl=100&vh=&ocl=&och=&session=&sort=fd&sortBy=1&cnt=100', {
      headers: HEADERS,
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);

    // Parse the "Latest Insider Buys" table
    $('table.tinytable tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 13) {
        const ticker = $(cells[3]).text().trim();
        const company = $(cells[4]).text().trim();
        const insider = $(cells[5]).text().trim();
        const title = $(cells[6]).text().trim();
        const tradeDateText = $(cells[2]).text().trim(); // Trade date
        const sharesText = $(cells[9]).text().trim();
        const valueText = $(cells[12]).text().trim();

        if (ticker && ticker.length <= 5 && !ticker.includes(':')) {
          const shares = parseInt(sharesText.replace(/[+,]/g, '')) || 0;
          // Value format: +$123,456 or +$1,234,567
          const value = parseFloat(valueText.replace(/[+$,]/g, '')) || 0;

          // Only include trades worth at least $50K
          if (value >= 50000) {
            trades.push({
              ticker: ticker.toUpperCase(),
              company,
              insiderName: insider,
              title,
              shares,
              value,
              date: tradeDateText,
              executiveScore: calculateExecutiveScore(title, value),
            });
          }
        }
      }
    });

    log(`OpenInsider: Found ${trades.length} recent insider buys (>$50K)`);
  } catch (error: any) {
    log(`OpenInsider scrape failed: ${error.message}`);
  }

  return trades;
}

// Get cluster buys - multiple insiders buying same stock (very bullish signal)
async function scrapeOpenInsiderClusters(): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  try {
    const response = await axios.get('http://openinsider.com/latest-cluster-buys', {
      headers: HEADERS,
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);

    $('table.tinytable tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 10) {
        const ticker = $(cells[3]).text().trim();
        const company = $(cells[4]).text().trim();
        const numInsiders = parseInt($(cells[6]).text().trim()) || 1;
        const tradeDateText = $(cells[2]).text().trim();
        const sharesText = $(cells[9]).text().trim();
        const valueText = $(cells[12]).text().trim();

        if (ticker && ticker.length <= 5) {
          const shares = parseInt(sharesText.replace(/[+,]/g, '')) || 0;
          const value = parseFloat(valueText.replace(/[+$,]/g, '')) || 0;

          // Cluster buys are significant - use "Multiple Insiders" as title
          if (value >= 100000) {
            trades.push({
              ticker: ticker.toUpperCase(),
              company,
              insiderName: `${numInsiders} Insiders (Cluster Buy)`,
              title: `${numInsiders} executives buying together`,
              shares,
              value,
              date: tradeDateText,
              executiveScore: Math.min(100 + numInsiders * 20, 200), // Higher score for more insiders
            });
          }
        }
      }
    });

    log(`OpenInsider Clusters: Found ${trades.length} cluster buys (>$100K)`);
  } catch (error: any) {
    log(`OpenInsider cluster scrape failed: ${error.message}`);
  }

  return trades;
}

// ============================================================================
// ANALYSIS - A+ PICKS ONLY
// ============================================================================

function analyzeForPicks(trades: InsiderTrade[]): FinalPick[] {
  // Group by ticker
  const byTicker = new Map<string, InsiderTrade[]>();
  for (const trade of trades) {
    if (!byTicker.has(trade.ticker)) {
      byTicker.set(trade.ticker, []);
    }
    byTicker.get(trade.ticker)!.push(trade);
  }

  const picks: FinalPick[] = [];

  for (const [ticker, tickerTrades] of byTicker) {
    const totalValue = tickerTrades.reduce((sum, t) => sum + t.value, 0);
    const maxExecScore = Math.max(...tickerTrades.map(t => t.executiveScore));

    // Check for C-Suite involvement
    const hasCEO = tickerTrades.some(t => /\b(CEO|Chief Executive)\b/i.test(t.title));
    const hasCFO = tickerTrades.some(t => /\b(CFO|Chief Financial)\b/i.test(t.title));
    const hasCsuite = tickerTrades.some(t =>
      /\b(CEO|CFO|COO|CTO|President|Chairman|Founder|10% Owner)\b/i.test(t.title)
    );
    const hasDirector = tickerTrades.some(t => /\bDirector\b/i.test(t.title));

    // Check for cluster buying (3+ insiders)
    const hasClusterBuy = tickerTrades.length >= 3 && totalValue >= 500000;

    // Check for mega purchase ($1M+ from anyone)
    const hasMegaPurchase = tickerTrades.some(t => t.value >= 1000000);

    // Check for large director buy ($500K+)
    const hasLargeDirectorBuy = tickerTrades.some(t =>
      t.value >= 500000 && /\bDirector\b/i.test(t.title)
    );

    // Check for CEO+CFO both buying (strong signal)
    const hasCeoAndCfo = hasCEO && hasCFO;

    // Calculate confidence
    let confidence = 30;
    if (hasMegaPurchase) confidence += 30;  // $1M+ buy from anyone
    if (hasClusterBuy) confidence += 25;
    if (hasCeoAndCfo) confidence += 25;  // CEO + CFO both buying = strong
    else if (hasCsuite && !hasMegaPurchase) confidence += 15;
    if (hasLargeDirectorBuy) confidence += 15;  // Big director buys matter
    if (totalValue >= 5000000) confidence += 15;  // $5M+ total = very significant
    else if (totalValue >= 1000000) confidence += 10;
    else if (totalValue >= 500000) confidence += 5;
    if (maxExecScore >= 150) confidence += 10;

    // Only A+ picks (70%+ confidence)
    if (confidence >= 70) {
      const topBuyer = tickerTrades.sort((a, b) => b.value - a.value)[0];

      let reasoning = '';
      if (hasMegaPurchase) {
        reasoning = `C-Suite $${(totalValue/1000000).toFixed(1)}M purchase - high conviction`;
      } else if (hasClusterBuy) {
        reasoning = `${tickerTrades.length} insiders cluster buying $${(totalValue/1000).toFixed(0)}K`;
      } else {
        reasoning = `${topBuyer.title} buying $${(topBuyer.value/1000).toFixed(0)}K`;
      }

      picks.push({
        ticker,
        company: topBuyer.company,
        score: Math.round(confidence + totalValue / 100000),
        holdPeriod: hasMegaPurchase ? '6-12 months' : '3-6 months',
        whyBuy: `${topBuyer.insiderName} (${topBuyer.title}): ${reasoning}`,
        confidence,
      });
    }
  }

  return picks.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ============================================================================
// AI RESEARCH - Validate picks before buying
// ============================================================================

interface ResearchResult {
  ticker: string;
  approved: boolean;
  adjustedConfidence: number;
  reasoning: string;
  companyDescription: string;
  risks: string[];
  investmentAmount: number;
}

async function researchPick(pick: FinalPick, availableCash: number): Promise<ResearchResult> {
  log(`Checking ${pick.ticker}...`);

  // Simple validation - no complex AI research that times out
  // The insider signal itself is the research - if C-suite is buying, trust it

  const redFlags: string[] = [];
  let approved = true;
  let reasoning = pick.whyBuy;

  // Check if it's a real C-suite buy vs 10% owner (less reliable)
  const isCsuiteBuy = /\b(CEO|CFO|COO|CTO|President|Chairman|Founder)\b/i.test(pick.whyBuy);
  const is10PctOwner = /10%\s*Owner/i.test(pick.whyBuy) || /\(10%\)/i.test(pick.whyBuy);

  // 10% owners are often institutions - still valid but lower confidence
  let adjustedConfidence = pick.confidence;
  if (is10PctOwner && !isCsuiteBuy) {
    adjustedConfidence = Math.max(pick.confidence - 10, 65);
    reasoning = `10% owner purchase (institutional) - ${pick.whyBuy}`;
  }

  // Calculate proportionate investment based on available cash
  let investmentAmount = Math.round(availableCash * CONFIG.INVESTMENT_PCT_PER_TRADE);

  // Adjust by confidence
  if (adjustedConfidence >= 90) {
    investmentAmount = Math.round(investmentAmount * 1.5);  // 50% more for high confidence
  } else if (adjustedConfidence < 75) {
    investmentAmount = Math.round(investmentAmount * 0.7);  // 30% less for lower confidence
  }

  // Apply min/max limits
  investmentAmount = Math.max(CONFIG.MIN_INVESTMENT, Math.min(CONFIG.MAX_INVESTMENT, investmentAmount));

  log(`  ${pick.ticker}: APPROVED - $${investmentAmount.toLocaleString()} (${adjustedConfidence}% confidence)`);

  return {
    ticker: pick.ticker,
    approved,
    adjustedConfidence,
    reasoning,
    companyDescription: pick.company,
    risks: redFlags,
    investmentAmount,
  };
}

async function researchAllPicks(picks: FinalPick[], availableCash: number): Promise<Map<string, ResearchResult>> {
  const results = new Map<string, ResearchResult>();

  for (const pick of picks) {
    const result = await researchPick(pick, availableCash);
    results.set(pick.ticker, result);
  }

  return results;
}

// ============================================================================
// SMART CASH ALLOCATION
// ============================================================================

function calculateAvailableBudget(account: { cash: number; equity: number }): number {
  // Keep minimum reserve
  const minReserve = account.equity * CONFIG.MIN_CASH_RESERVE_PCT;
  const availableCash = Math.max(0, account.cash - minReserve);

  // Cap at max daily investment
  return Math.min(availableCash, CONFIG.MAX_DAILY_INVESTMENT);
}

// ============================================================================
// TRADING EXECUTION
// ============================================================================

interface ExecutedTrade {
  ticker: string;
  company: string;
  amount: number;
  reason: string;
  status: string;
}

// Quick company description lookup (common stocks)
function getCompanyBlurb(ticker: string, company: string): string {
  const blurbs: Record<string, string> = {
    'AAPL': 'Apple - Consumer electronics, software, and services',
    'MSFT': 'Microsoft - Software, cloud computing, and AI',
    'GOOGL': 'Alphabet/Google - Search, advertising, and cloud',
    'AMZN': 'Amazon - E-commerce and cloud computing',
    'NVDA': 'Nvidia - AI chips and graphics processors',
    'META': 'Meta - Social media and virtual reality',
    'TSLA': 'Tesla - Electric vehicles and energy',
    'JPM': 'JPMorgan Chase - Banking and financial services',
    'V': 'Visa - Digital payments and financial services',
    'JNJ': 'Johnson & Johnson - Pharmaceuticals and consumer health',
    'WMT': 'Walmart - Retail and e-commerce',
    'NKE': 'Nike - Athletic footwear and apparel',
    'DIS': 'Disney - Entertainment and streaming',
    'BHVN': 'Biohaven - Biotech developing neurological treatments',
    'CNS': 'Cohen & Steers - Investment management firm',
    'VRCA': 'Verrica Pharmaceuticals - Dermatology biotech',
    'COO': 'Cooper Companies - Medical devices and contact lenses',
    'WHF': 'Whitehorse Finance - Business development company',
    'AZO': 'AutoZone - Auto parts retailer',
    'UA': 'Under Armour - Athletic apparel and footwear',
    'GME': 'GameStop - Video game retailer and e-commerce',
    'WRB': 'W.R. Berkley - Commercial insurance provider',
    'THM': 'International Tower Hill - Gold exploration in Alaska',
    'SHCO': 'Soho House - Private members club operator',
    'MANE': 'Mane - Biotech focused on hair loss treatments',
  };
  return blurbs[ticker] || company || ticker;
}

async function executeTrades(
  picks: FinalPick[],
  researchResults: Map<string, ResearchResult>
): Promise<ExecutedTrade[]> {
  const account = await getAccount();
  const dailyBudget = calculateAvailableBudget(account);
  const executedTrades: ExecutedTrade[] = [];
  let spentToday = 0;

  log(`Daily budget: $${dailyBudget.toLocaleString()} (cash: $${account.cash.toLocaleString()}, reserve: $${(account.equity * CONFIG.MIN_CASH_RESERVE_PCT).toLocaleString()})`);

  if (dailyBudget < 500) {
    log('Insufficient budget for trades. Need to maintain cash reserve.');
    return executedTrades;
  }

  for (const pick of picks) {
    const research = researchResults.get(pick.ticker);

    // Skip if AI research rejected this pick
    if (research && !research.approved) {
      log(`${pick.ticker} REJECTED by AI research: ${research.reasoning}`);
      continue;
    }

    // Determine investment amount from research (or use default)
    const investmentAmount = research?.investmentAmount || CONFIG.INVESTMENT_TIERS.LOW.amount;

    // Check if we have budget left
    if (spentToday + investmentAmount > dailyBudget) {
      log(`${pick.ticker}: Would exceed daily budget, skipping`);
      continue;
    }

    try {
      // Check if we already hold this position
      const alreadyHeld = await hasPosition(pick.ticker);
      if (alreadyHeld) {
        log(`Already holding ${pick.ticker}, skipping`);
        continue;
      }

      // Check if stock is tradeable on Alpaca (skip OTC/penny stocks)
      let price = 0;
      try {
        price = await getLatestPrice(pick.ticker);
        if (!price || price < 1) {
          log(`${pick.ticker} not tradeable or penny stock, skipping`);
          continue;
        }
      } catch (e) {
        log(`${pick.ticker} not available on Alpaca, skipping`);
        continue;
      }

      const confidenceLabel = research ? `${research.adjustedConfidence}%` : `${pick.confidence}%`;
      log(`Buying $${investmentAmount.toLocaleString()} of ${pick.ticker} (${confidenceLabel} confidence)...`);

      const order = await submitDollarOrder(pick.ticker, investmentAmount, 'buy');
      log(`Order submitted: ${order.id} - ${order.status}`);
      spentToday += investmentAmount;

      // Track the position for auto-sell
      trackNewPosition(
        pick.ticker,
        order.qty || investmentAmount / price,
        price,
        research?.reasoning || pick.whyBuy,
        research?.adjustedConfidence || pick.confidence
      );

      // Log the trade
      logTrade(
        pick.ticker,
        'buy',
        investmentAmount,
        order.qty || 0,
        order.filledAvgPrice || 0,
        pick.whyBuy
      );

      executedTrades.push({
        ticker: pick.ticker,
        company: research?.companyDescription || getCompanyBlurb(pick.ticker, pick.company),
        amount: investmentAmount,
        reason: research?.reasoning || pick.whyBuy,
        status: order.status,
      });

      // Small delay between orders
      await new Promise(r => setTimeout(r, 1000));

    } catch (error: any) {
      log(`Failed to buy ${pick.ticker}: ${error.message}`);
    }
  }

  return executedTrades;
}

// Use Claude Code CLI to get a quick company blurb + why it might be a good investment
async function getAIResearchBlurb(ticker: string, company: string, whyBuy: string): Promise<string> {
  try {
    const prompt = `In exactly 2 short sentences: (1) What does ${ticker} (${company}) do as a company? (2) Given this insider signal: "${whyBuy}" - why might this be interesting? Keep it simple and factual. No disclaimers.`;
    const result = execSync(
      `claude --print "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { encoding: 'utf-8', timeout: 60000, maxBuffer: 512 * 1024 }
    );
    return result.trim().slice(0, 300);
  } catch {
    return `${getCompanyBlurb(ticker, company)}. Insider buying signal detected.`;
  }
}

// Send trade alert email - ONLY when trades are executed
async function sendTradeEmail(
  trades: ExecutedTrade[],
  positions: Position[],
  portfolioValue: number,
  cash: number,
): Promise<void> {
  const toEmail = process.env.NOTIFICATION_EMAIL || process.env.RECIPIENT_EMAIL || 'jason.lee.jfl@gmail.com';
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Calculate return based on INVESTED amount, not total portfolio
  const totalInvested = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const investedPnl = totalMarketValue - totalInvested;
  const investedReturnPct = totalInvested > 0 ? (investedPnl / totalInvested) * 100 : 0;

  const todayInvested = trades.reduce((sum, t) => sum + t.amount, 0);

  const subject = `🚀 InvestBot: Bought ${trades.length} stock(s) for $${todayInvested.toLocaleString()} | ${investedPnl >= 0 ? '+' : ''}${investedReturnPct.toFixed(1)}% return`;

  // Build positions table - uses Position type from alpacaClient (marketValue, unrealizedPL, etc.)
  const positionRows = positions.map(p => {
    const returnPct = p.costBasis > 0 ? (p.unrealizedPL / p.costBasis) * 100 : 0;
    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">
          <strong>${p.symbol}</strong><br>
          <span style="font-size: 11px; color: #666;">@ $${p.currentPrice.toFixed(2)}</span>
        </td>
        <td style="padding: 10px; border: 1px solid #ddd;">$${p.marketValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">$${p.costBasis.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td style="padding: 10px; border: 1px solid #ddd; color: ${p.unrealizedPL >= 0 ? '#2e7d32' : '#c62828'}; font-weight: bold;">
          ${p.unrealizedPL >= 0 ? '+' : ''}$${p.unrealizedPL.toFixed(0)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%)
        </td>
      </tr>
    `;
  }).join('');

  // Build NEW trades section with AI research blurbs
  let tradeDetails = '';
  for (const t of trades) {
    const blurb = await getAIResearchBlurb(t.ticker, t.company, t.reason);
    tradeDetails += `
      <div style="background: #e8f5e9; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 4px solid #2e7d32;">
        <strong style="font-size: 18px;">${t.ticker}</strong> - $${t.amount.toLocaleString()}<br>
        <span style="font-size: 13px; color: #333;">${blurb}</span><br>
        <span style="font-size: 11px; color: #666;">Signal: ${t.reason}</span>
      </div>
    `;
  }

  const htmlBody = `
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2e7d32;">🚀 InvestBot Trade Alert - ${date}</h2>

      <div style="background: #f0f4ff; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <table style="width: 100%;">
          <tr>
            <td>
              <span style="font-size: 12px; color: #666;">Invested Today</span><br>
              <strong style="font-size: 22px;">$${todayInvested.toLocaleString()}</strong>
            </td>
            <td style="text-align: center;">
              <span style="font-size: 12px; color: #666;">Return on Invested</span><br>
              <strong style="font-size: 22px; color: ${investedReturnPct >= 0 ? '#2e7d32' : '#c62828'};">
                ${investedReturnPct >= 0 ? '+' : ''}${investedReturnPct.toFixed(1)}%
              </strong>
            </td>
            <td style="text-align: right;">
              <span style="font-size: 12px; color: #666;">Portfolio</span><br>
              <strong style="font-size: 22px;">$${portfolioValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>
            </td>
          </tr>
        </table>
      </div>

      <h3>🛒 New Trades:</h3>
      ${tradeDetails}

      <h3>📊 All Positions (${positions.length}):</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f5f5f5;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Stock</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Value</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Cost</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Return</th>
        </tr>
        ${positionRows}
      </table>

      <p style="margin-top: 15px; color: #666;">
        Cash remaining: $${cash.toLocaleString(undefined, {maximumFractionDigits: 0})} |
        Total invested: $${totalInvested.toLocaleString(undefined, {maximumFractionDigits: 0})} |
        P&L: ${investedPnl >= 0 ? '+' : ''}$${investedPnl.toFixed(0)}
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 11px; color: #999;">
        InvestBot automated trade alert | Based on SEC Form 4 insider buying signals
      </p>
    </body>
    </html>
  `;

  const textBody = `InvestBot Trade Alert - ${date}

New Trades:
${trades.map(t => `- ${t.ticker}: $${t.amount.toLocaleString()} - ${t.reason}`).join('\n')}

Positions:
${positions.map(p => `- ${p.symbol}: $${p.marketValue.toFixed(0)} (cost $${p.costBasis.toFixed(0)}, ${p.unrealizedPL >= 0 ? '+' : ''}$${p.unrealizedPL.toFixed(0)})`).join('\n')}

Return on invested: ${investedReturnPct >= 0 ? '+' : ''}${investedReturnPct.toFixed(1)}%
Portfolio: $${portfolioValue.toLocaleString()} | Cash: $${cash.toLocaleString()}
`;

  try {
    await sendGmail(toEmail, subject, htmlBody, textBody);
    log(`Trade alert email sent to ${toEmail}`);
  } catch (error: any) {
    log(`Failed to send trade alert email: ${error.message}`);
  }
}

// Daily status email - always sends regardless of whether trades happened
async function sendDailyStatusEmail(
  executedTrades: ExecutedTrade[],
  insiderPicks: FinalPick[],
  positions: Position[],
  portfolioValue: number,
  cash: number
): Promise<void> {
  const toEmail = process.env.NOTIFICATION_EMAIL || process.env.RECIPIENT_EMAIL || 'jason.lee.jfl@gmail.com';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Calculate return on invested capital
  const totalInvested = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const investedPnl = totalMarketValue - totalInvested;
  const investedReturnPct = totalInvested > 0 ? (investedPnl / totalInvested) * 100 : 0;

  const tradesCount = executedTrades.length;
  const subject = tradesCount > 0
    ? `InvestBot: ${tradesCount} Trade${tradesCount > 1 ? 's' : ''} Executed | Portfolio $${portfolioValue.toLocaleString()}`
    : `InvestBot Daily Status | Portfolio $${portfolioValue.toLocaleString()}`;

  // Build HTML email
  let htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">InvestBot Daily Report</h2>
      <p style="color: #666;">${today}</p>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Portfolio Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;">Portfolio Value:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">$${portfolioValue.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Available Cash:</td>
            <td style="padding: 8px 0; text-align: right;">$${cash.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Total Invested:</td>
            <td style="padding: 8px 0; text-align: right;">$${totalInvested.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Return on Invested:</td>
            <td style="padding: 8px 0; text-align: right; color: ${investedPnl >= 0 ? '#22c55e' : '#ef4444'}; font-weight: bold;">
              ${investedPnl >= 0 ? '+' : ''}$${investedPnl.toFixed(2)} (${investedReturnPct >= 0 ? '+' : ''}${investedReturnPct.toFixed(1)}%)
            </td>
          </tr>
        </table>
      </div>`;

  // Trades section (if any)
  if (executedTrades.length > 0) {
    htmlBody += `
      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #2e7d32;">Today's Trades</h3>`;

    for (const trade of executedTrades) {
      const blurb = await getAIResearchBlurb(trade.ticker, trade.company, trade.reason);
      htmlBody += `
        <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #4caf50;">
          <div style="font-weight: bold; font-size: 18px; color: #1a1a2e;">${trade.ticker}</div>
          <div style="color: #666; margin: 5px 0;">Invested $${trade.amount.toLocaleString()}</div>
          <div style="color: #444; margin-top: 10px; font-style: italic;">${blurb}</div>
          <div style="color: #888; margin-top: 8px; font-size: 12px;">Signal: ${trade.reason}</div>
        </div>`;
    }
    htmlBody += `</div>`;
  } else {
    htmlBody += `
      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #e65100;">No Trades Today</h3>
        <p style="color: #666; margin: 0;">No qualifying insider signals found today. The bot is monitoring and will trade when A+ opportunities appear.</p>
      </div>`;
  }

  // Insider picks found (even if not traded)
  if (insiderPicks.length > 0 && executedTrades.length === 0) {
    htmlBody += `
      <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1565c0;">Signals Detected (Not Traded)</h3>
        <p style="color: #666; margin-bottom: 15px;">These signals were found but not executed (market closed, already held, or below threshold):</p>`;

    for (const pick of insiderPicks.slice(0, 5)) {
      htmlBody += `
        <div style="padding: 8px 0; border-bottom: 1px solid #ddd;">
          <span style="font-weight: bold;">${pick.ticker}</span>: ${pick.whyBuy} (${pick.confidence}% confidence)
        </div>`;
    }
    if (insiderPicks.length > 5) {
      htmlBody += `<p style="color: #888; margin-top: 10px;">... and ${insiderPicks.length - 5} more</p>`;
    }
    htmlBody += `</div>`;
  }

  // Current positions
  if (positions.length > 0) {
    htmlBody += `
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Current Holdings (${positions.length})</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 2px solid #ddd;">
            <th style="text-align: left; padding: 8px 4px; color: #666;">Stock</th>
            <th style="text-align: right; padding: 8px 4px; color: #666;">Value</th>
            <th style="text-align: right; padding: 8px 4px; color: #666;">P&L</th>
          </tr>`;

    for (const p of positions) {
      const plColor = p.unrealizedPL >= 0 ? '#22c55e' : '#ef4444';
      const companyDesc = getCompanyBlurb(p.symbol, p.symbol);
      htmlBody += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px 4px;">
              <div style="font-weight: bold;">${p.symbol}</div>
              <div style="font-size: 11px; color: #888;">${companyDesc}</div>
            </td>
            <td style="padding: 8px 4px; text-align: right;">$${p.marketValue.toFixed(0)}</td>
            <td style="padding: 8px 4px; text-align: right; color: ${plColor};">
              ${p.unrealizedPL >= 0 ? '+' : ''}$${p.unrealizedPL.toFixed(0)} (${p.unrealizedPLPercent >= 0 ? '+' : ''}${p.unrealizedPLPercent.toFixed(1)}%)
            </td>
          </tr>`;
    }
    htmlBody += `</table></div>`;
  }

  htmlBody += `
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        InvestBot monitors insider trading signals and executes trades automatically.<br>
        This email is sent daily at 9:35 AM ET on market days.
      </p>
    </div>`;

  // Plain text version
  const textBody = `InvestBot Daily Report - ${today}

Portfolio: $${portfolioValue.toLocaleString()} | Cash: $${cash.toLocaleString()}
Return on Invested: ${investedReturnPct >= 0 ? '+' : ''}${investedReturnPct.toFixed(1)}% (${investedPnl >= 0 ? '+' : ''}$${investedPnl.toFixed(2)})

${executedTrades.length > 0 ? `TODAY'S TRADES:\n${executedTrades.map(t => `- ${t.ticker}: $${t.amount.toLocaleString()} - ${t.reason}`).join('\n')}` : 'No trades today.'}

CURRENT HOLDINGS:
${positions.map(p => `- ${p.symbol}: $${p.marketValue.toFixed(0)} (${p.unrealizedPL >= 0 ? '+' : ''}$${p.unrealizedPL.toFixed(0)}, ${p.unrealizedPLPercent >= 0 ? '+' : ''}${p.unrealizedPLPercent.toFixed(1)}%)`).join('\n')}
`;

  try {
    await sendGmail(toEmail, subject, htmlBody, textBody);
    log(`Daily status email sent to ${toEmail}`);
  } catch (error: any) {
    log(`Failed to send daily status email: ${error.message}`);
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

const LAST_RUN_FILE = join(DATA_DIR, '.last_run_date');

function hasAlreadyRunToday(): boolean {
  try {
    if (!existsSync(LAST_RUN_FILE)) return false;
    const lastRun = readFileSync(LAST_RUN_FILE, 'utf-8').trim();
    const today = new Date().toISOString().slice(0, 10);
    return lastRun === today;
  } catch {
    return false;
  }
}

function markRanToday(): void {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(LAST_RUN_FILE, today);
}

async function main() {
  log('========================================');
  log('InvestBot Daily Runner Started');
  log('========================================');

  // Prevent running twice in one day (RunAtLoad + scheduled time)
  if (hasAlreadyRunToday()) {
    log('Already ran today - skipping. Will run again tomorrow.');
    process.exit(0);
  }
  markRanToday();

  // Initialize portfolio if needed
  initializePortfolio(100000);

  // Step 1: Test Alpaca connection
  log('Testing Alpaca connection...');
  const connected = await testConnection();
  if (!connected) {
    log('ERROR: Failed to connect to Alpaca. Check API keys.');
    process.exit(1);
  }
  log('Connected to Alpaca Paper Trading');

  // Step 2: Check if market is open
  log('Checking market status...');
  const marketOpen = await isMarketOpen();
  if (marketOpen) {
    log('Market is OPEN - will execute trades');
  } else {
    log('Market is CLOSED - will analyze and save picks');
  }

  // Step 3: Check for positions to auto-sell (90 days old) and process queued sells
  if (marketOpen) {
    log('Checking for positions to auto-sell...');
    const soldPositions = await checkAndSellOldPositions();
    if (soldPositions.length > 0) {
      log(`Auto-sold ${soldPositions.length} positions: ${soldPositions.join(', ')}`);
    }

    // Process manually queued sells (e.g., bad data cleanup)
    const queuedSells = await processQueuedSells();
    if (queuedSells.length > 0) {
      log(`Processed ${queuedSells.length} queued sell(s): ${queuedSells.join(', ')}`);
    }
  }

  // Step 4: Load any pending picks from previous runs
  const pendingPicks = loadPendingPicks();

  // Step 5: Fetch REAL insider data from MULTIPLE sources
  log('Fetching insider trading data from multiple sources...');
  let insiderTrades: InsiderTrade[] = [];

  // Fetch from all sources in parallel
  try {
    const [dataromaTrades, openInsiderTrades, clusterTrades] = await Promise.all([
      scrapeDataroma().catch(e => { log(`Dataroma failed: ${e.message}`); return []; }),
      scrapeOpenInsider().catch(e => { log(`OpenInsider failed: ${e.message}`); return []; }),
      scrapeOpenInsiderClusters().catch(e => { log(`OpenInsider Clusters failed: ${e.message}`); return []; }),
    ]);

    // Combine all trades
    insiderTrades = [...dataromaTrades, ...openInsiderTrades, ...clusterTrades];

    // Dedupe by ticker + insider name
    const seen = new Set<string>();
    insiderTrades = insiderTrades.filter(t => {
      const key = `${t.ticker}-${t.insiderName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    log(`Total: ${insiderTrades.length} unique insider trades (Dataroma: ${dataromaTrades.length}, OpenInsider: ${openInsiderTrades.length}, Clusters: ${clusterTrades.length})`);
  } catch (error: any) {
    log(`ERROR: Failed to fetch insider data: ${error.message}`);
    // If we have pending picks, continue with those
    if (pendingPicks.length === 0) {
      log('No pending picks and no new data. Exiting.');
      process.exit(1);
    }
  }

  // Step 6: Analyze for A+ picks from fresh data
  log('Analyzing for A+ picks...');
  const freshPicks = insiderTrades.length > 0 ? analyzeForPicks(insiderTrades) : [];

  // Combine fresh picks with pending picks (dedupe by ticker)
  const seenTickers = new Set<string>();
  const allPicks: FinalPick[] = [];

  // Fresh picks take priority
  for (const pick of freshPicks) {
    if (!seenTickers.has(pick.ticker)) {
      seenTickers.add(pick.ticker);
      allPicks.push(pick);
    }
  }
  // Add pending picks that aren't duplicates
  for (const pick of pendingPicks) {
    if (!seenTickers.has(pick.ticker)) {
      seenTickers.add(pick.ticker);
      allPicks.push({ ...pick, whyBuy: `[SAVED] ${pick.whyBuy}` });
    }
  }

  if (allPicks.length === 0) {
    log('No picks found (fresh or pending). This is normal - quality signals are rare.');
    const snapshot = await takeSnapshot();
    log(`Portfolio: $${snapshot.equity.toLocaleString()} (${snapshot.totalReturnPct >= 0 ? '+' : ''}${snapshot.totalReturnPct.toFixed(2)}%)`);

    // Always send daily status email
    log('Sending daily status email...');
    const finalAccount = await getAccount();
    const positions = await getPositions();
    await sendDailyStatusEmail([], [], positions, snapshot.equity, finalAccount.cash);

    log('Daily run complete!');
    process.exit(0);
  }

  log(`Found ${allPicks.length} total picks (${freshPicks.length} fresh, ${pendingPicks.length} pending):`);
  for (const pick of allPicks) {
    log(`  - ${pick.ticker}: ${pick.whyBuy} (${pick.confidence}% confidence)`);
  }

  // Step 7: Calculate available cash and research picks
  const account = await getAccount();
  const availableCash = calculateAvailableBudget(account);
  log(`Available cash for trading: $${availableCash.toLocaleString()}`);

  let researchResults = new Map<string, ResearchResult>();
  if (marketOpen) {
    log('Validating picks...');
    researchResults = await researchAllPicks(allPicks, availableCash);

    const approved = [...researchResults.values()].filter(r => r.approved).length;
    log(`${approved} picks ready to trade`);
  }

  // Step 8: Execute or save picks
  let executedTrades: ExecutedTrade[] = [];
  if (marketOpen) {
    log('Executing trades...');
    executedTrades = await executeTrades(allPicks, researchResults);
    // Clear pending picks after successful execution attempt
    clearPendingPicks();
  } else {
    log('Market closed - saving picks for next market open');
    savePendingPicks(allPicks);
  }

  // Step 9: Take snapshot
  const snapshot = await takeSnapshot();
  log(`Portfolio: $${snapshot.equity.toLocaleString()} (${snapshot.totalReturnPct >= 0 ? '+' : ''}${snapshot.totalReturnPct.toFixed(2)}%)`);

  // Step 10: Always send daily status email
  log('Sending daily status email...');
  const finalAccount = await getAccount();
  const positions = await getPositions();
  await sendDailyStatusEmail(executedTrades, allPicks, positions, snapshot.equity, finalAccount.cash);

  log('Daily run complete!');
  log('========================================');
}

main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});
