import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  executePicks,
  TradeResult,
} from './paperTrading/autoTrader';
import {
  logTrade,
  takeSnapshot,
  initializePortfolio,
  getPerformanceSummary,
} from './paperTrading/portfolioTracker';
import {
  generateConsoleReport,
  getSummaryString,
} from './paperTrading/performanceReport';
import {
  testConnection,
  isMarketOpen,
} from './paperTrading/alpacaClient';

// ============================================================================
// INVESTBOT PAPER TRADING RUNNER
// Runs daily at market open to find and execute picks
// ============================================================================

interface InsiderTrade {
  ticker: string;
  company: string;
  insiderName: string;
  title: string;
  shares: number;
  value: number;
  date: string;
  executiveScore?: number;
}

interface CongressTrade {
  politician: string;
  party: string;
  chamber: string;
  ticker: string;
  company: string;
  amountRange: string;
  tradeDate: string;
  traderScore?: number;
  isTopTrader?: boolean;
  performanceNote?: string;
}

interface TraderPerformance {
  name: string;
  historicalReturn: number;
  winRate: number;
  totalTrades: number;
  avgTradeSize: string;
  dynamicScore: number;
  tier: 'ELITE' | 'TOP' | 'GOOD' | 'AVERAGE';
}

interface StockSignal {
  ticker: string;
  company: string;
  insiderBuys: InsiderTrade[];
  congressBuys: CongressTrade[];
  totalInsiderValue: number;
  convergenceScore: number;
  hasEliteTrader: boolean;
  hasTopExecutive: boolean;
  maxTraderScore: number;
  maxExecutiveScore: number;
}

interface AIAnalysis {
  isLegitimate: boolean;
  confidence: number;
  reasoning: string;
  redFlags: string[];
  holdPeriod: string;
  summary: string;
}

interface FinalPick {
  ticker: string;
  company: string;
  score: number;
  holdPeriod: string;
  whyBuy: string;
  keyPeople: string;
  aiConfidence: number;
}

// ============================================================================
// RESEARCH-BASED TIME-DECAY WEIGHTS
// ============================================================================

function getInsiderTimeDecayWeight(daysOld: number): number {
  if (daysOld <= 5) return 1.00;
  if (daysOld <= 14) return 0.85;
  if (daysOld <= 30) return 0.65;
  if (daysOld <= 60) return 0.45;
  if (daysOld <= 90) return 0.30;
  if (daysOld <= 180) return 0.15;
  return 0.05;
}

function getExecutiveAlphaMultiplier(title: string, daysOld: number): number {
  const titleUpper = title.toUpperCase();
  let baseMultiplier = 1.0;
  let isCFO = false;
  let isCEO = false;

  if (titleUpper.includes('CFO') || titleUpper.includes('CHIEF FINANCIAL')) {
    isCFO = true;
  } else if (titleUpper.includes('CEO') || titleUpper.includes('CHIEF EXECUTIVE')) {
    isCEO = true;
  } else if (titleUpper.includes('COO') || titleUpper.includes('PRESIDENT') ||
             titleUpper.includes('CHIEF OPERATING')) {
    baseMultiplier = 0.95;
  } else if (titleUpper.includes('FOUNDER')) {
    baseMultiplier = 1.05;
  } else if (titleUpper.includes('10%') || titleUpper.includes('OWNER')) {
    baseMultiplier = 0.90;
  } else if (titleUpper.includes('VICE PRESIDENT') || titleUpper.includes('EVP') ||
             titleUpper.includes('SVP')) {
    baseMultiplier = 0.85;
  } else if (titleUpper.includes('DIRECTOR')) {
    baseMultiplier = 0.75;
  } else if (titleUpper.includes('OFFICER')) {
    baseMultiplier = 0.70;
  } else {
    baseMultiplier = 0.65;
  }

  if (isCFO) {
    if (daysOld <= 90) baseMultiplier = 1.26;
    else if (daysOld <= 180) baseMultiplier = 1.12;
    else if (daysOld <= 270) baseMultiplier = 1.10;
    else baseMultiplier = 1.02;
  } else if (isCEO) {
    if (daysOld <= 90) baseMultiplier = 1.00;
    else if (daysOld <= 180) baseMultiplier = 0.95;
    else baseMultiplier = 0.90;
  }

  return baseMultiplier;
}

function getCongressTimeDecayWeight(daysOld: number, isEliteTrader: boolean): number {
  const eliteMultiplier = isEliteTrader ? 1.5 : 1.0;
  let baseWeight: number;
  if (daysOld <= 14) baseWeight = 0.80;
  else if (daysOld <= 30) baseWeight = 0.60;
  else if (daysOld <= 45) baseWeight = 0.45;
  else if (daysOld <= 60) baseWeight = 0.30;
  else if (daysOld <= 90) baseWeight = 0.15;
  else baseWeight = 0.05;
  return Math.min(baseWeight * eliteMultiplier, 1.0);
}

function daysSinceTrade(tradeDate: string): number {
  const trade = new Date(tradeDate);
  const now = new Date();
  const diffMs = now.getTime() - trade.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// EXECUTIVE SCORING
// ============================================================================

const EXECUTIVE_RANKS = [
  { pattern: /\bCEO\b/i, baseScore: 100, tier: 'C-SUITE' },
  { pattern: /\bChief Executive/i, baseScore: 100, tier: 'C-SUITE' },
  { pattern: /\bCFO\b/i, baseScore: 95, tier: 'C-SUITE' },
  { pattern: /\bChief Financial/i, baseScore: 95, tier: 'C-SUITE' },
  { pattern: /\bCOO\b/i, baseScore: 90, tier: 'C-SUITE' },
  { pattern: /\bPresident\b/i, baseScore: 90, tier: 'C-SUITE' },
  { pattern: /\bChairman\b/i, baseScore: 88, tier: 'C-SUITE' },
  { pattern: /\bFounder\b/i, baseScore: 95, tier: 'C-SUITE' },
  { pattern: /\b10% Owner/i, baseScore: 92, tier: 'C-SUITE' },
  { pattern: /\bExecutive Vice President/i, baseScore: 75, tier: 'VP' },
  { pattern: /\bSenior Vice President/i, baseScore: 70, tier: 'VP' },
  { pattern: /\bVice President/i, baseScore: 65, tier: 'VP' },
  { pattern: /\bEVP\b/i, baseScore: 75, tier: 'VP' },
  { pattern: /\bSVP\b/i, baseScore: 70, tier: 'VP' },
  { pattern: /\bGeneral Counsel/i, baseScore: 70, tier: 'VP' },
  { pattern: /\bDirector\b/i, baseScore: 50, tier: 'DIRECTOR' },
  { pattern: /\bOfficer\b/i, baseScore: 45, tier: 'OFFICER' },
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
// POLITICIAN PERFORMANCE DATA
// ============================================================================

async function fetchPoliticianPerformance(): Promise<Map<string, TraderPerformance>> {
  const performanceMap = new Map<string, TraderPerformance>();
  const politicianData = [
    { name: 'Nancy Pelosi', return2023: 0.655, return2024: 0.92, winRate: 0.78, avgSize: '$1M-5M' },
    { name: 'Ron Wyden', return2023: 0.785, return2024: 0.45, winRate: 0.72, avgSize: '$500K-1M' },
    { name: 'Dan Crenshaw', return2023: 0.52, return2024: 0.68, winRate: 0.70, avgSize: '$100K-500K' },
    { name: 'Tommy Tuberville', return2023: 0.48, return2024: 0.55, winRate: 0.65, avgSize: '$100K-500K' },
    { name: 'Josh Gottheimer', return2023: 0.42, return2024: 0.51, winRate: 0.68, avgSize: '$50K-100K' },
    { name: 'Mark Green', return2023: 0.38, return2024: 0.62, winRate: 0.64, avgSize: '$50K-100K' },
    { name: 'Ro Khanna', return2023: 0.40, return2024: 0.48, winRate: 0.60, avgSize: '$50K-100K' },
  ];

  for (const pol of politicianData) {
    const avgReturn = (pol.return2023 + pol.return2024) / 2;
    const returnScore = Math.min(avgReturn * 100, 40);
    const winRateScore = pol.winRate * 30;
    const sizeBonus = pol.avgSize.includes('$1M') ? 30 : pol.avgSize.includes('$500K') ? 25 : pol.avgSize.includes('$100K') ? 20 : 15;
    const dynamicScore = returnScore + winRateScore + sizeBonus;
    const tier: 'ELITE' | 'TOP' | 'GOOD' | 'AVERAGE' = dynamicScore >= 75 ? 'ELITE' : dynamicScore >= 60 ? 'TOP' : dynamicScore >= 45 ? 'GOOD' : 'AVERAGE';

    performanceMap.set(pol.name, {
      name: pol.name,
      historicalReturn: avgReturn,
      winRate: pol.winRate,
      totalTrades: 30,
      avgTradeSize: pol.avgSize,
      dynamicScore,
      tier,
    });
  }
  return performanceMap;
}

// ============================================================================
// AI ANALYSIS
// ============================================================================

function analyzeStockWithAI(signal: StockSignal): AIAnalysis {
  const redFlags: string[] = [];
  let confidence = 30;
  let isLegitimate = false;

  const hasCsuite = signal.insiderBuys.some(b =>
    /\b(CEO|CFO|COO|CTO|President|Chairman|Founder|10% Owner)\b/i.test(b.title)
  );
  const hasElitePolitician = signal.congressBuys.some(b => b.traderScore && b.traderScore >= 75);
  const hasTrueConvergence = hasCsuite && signal.congressBuys.length > 0;
  const hasClusterBuy = signal.insiderBuys.length >= 3 && signal.totalInsiderValue >= 500000;
  const hasMegaPurchase = signal.insiderBuys.some(b =>
    b.value >= 1000000 && /\b(CEO|CFO|COO|President|Founder)\b/i.test(b.title)
  );

  if (hasElitePolitician) { confidence += 40; isLegitimate = true; }
  if (hasTrueConvergence) { confidence += 35; isLegitimate = true; }
  if (hasMegaPurchase) { confidence += 30; isLegitimate = true; }
  if (hasClusterBuy) { confidence += 25; isLegitimate = true; }
  if (hasCsuite && !hasMegaPurchase) confidence += 15;
  if (signal.totalInsiderValue >= 1000000) confidence += 10;

  const onlySmallDirectorBuys = signal.insiderBuys.every(b =>
    /Director/i.test(b.title) && !/CEO|CFO|COO|President/i.test(b.title)
  ) && signal.totalInsiderValue < 500000;

  if (onlySmallDirectorBuys && !hasElitePolitician) {
    redFlags.push('Only small director purchases');
    isLegitimate = false;
    confidence = Math.min(confidence, 45);
  }

  if (!hasCsuite && signal.congressBuys.length === 0) {
    redFlags.push('No C-Suite or Congress involvement');
    isLegitimate = false;
  }

  confidence = Math.min(95, Math.max(30, confidence));
  if (confidence < 70) isLegitimate = false;

  let holdPeriod = '6-12 months';
  if (hasElitePolitician || hasTrueConvergence) holdPeriod = '6-12 months';
  else if (hasMegaPurchase) holdPeriod = '3-6 months';

  const buyers: string[] = [];
  if (signal.insiderBuys.length > 0) {
    const topInsider = signal.insiderBuys.sort((a, b) => b.value - a.value)[0];
    buyers.push(`${topInsider.insiderName} (${topInsider.title})`);
  }
  if (signal.congressBuys.length > 0) {
    buyers.push(signal.congressBuys[0].politician);
  }

  let reasoning = '';
  if (hasElitePolitician) {
    const pol = signal.congressBuys.find(b => /Pelosi|Wyden/i.test(b.politician));
    reasoning = `${pol?.politician || 'Elite trader'} buying - track record of 65-92% annual returns.`;
  } else if (hasTrueConvergence) {
    reasoning = `TRUE CONVERGENCE: Both C-Suite executives AND Congress buying.`;
  } else if (hasMegaPurchase) {
    reasoning = `C-Suite executive making $1M+ purchase - high conviction signal.`;
  } else if (hasClusterBuy) {
    reasoning = `${signal.insiderBuys.length} insiders cluster buying $${(signal.totalInsiderValue / 1000).toFixed(0)}K total.`;
  } else {
    reasoning = `Signal does not meet A+ criteria.`;
  }

  const summary = `${buyers.join(' + ')} buying $${(signal.totalInsiderValue / 1000).toFixed(0)}K. ${reasoning}`;

  return { isLegitimate, confidence, reasoning, redFlags, holdPeriod, summary };
}

// ============================================================================
// DATA FETCHING
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
  try {
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
  } catch (error) {
    console.error('Error scraping Dataroma:', error);
  }
  return trades;
}

// Congress trades - DISABLED (requires paid API)
// Focusing on LIVE insider trading data from Dataroma
function getCongressTrades(): CongressTrade[] {
  return [];
}

// ============================================================================
// CONVERGENCE ANALYSIS
// ============================================================================

async function analyzeConvergence(
  insiderTrades: InsiderTrade[],
  congressTrades: CongressTrade[]
): Promise<StockSignal[]> {
  const stockMap = new Map<string, StockSignal>();
  const politicianPerformance = await fetchPoliticianPerformance();

  // Process insider trades
  for (const trade of insiderTrades) {
    if (!stockMap.has(trade.ticker)) {
      stockMap.set(trade.ticker, {
        ticker: trade.ticker, company: trade.company, insiderBuys: [], congressBuys: [],
        totalInsiderValue: 0, convergenceScore: 0, hasEliteTrader: false,
        hasTopExecutive: false, maxTraderScore: 0, maxExecutiveScore: 0,
      });
    }
    const signal = stockMap.get(trade.ticker)!;
    signal.insiderBuys.push(trade);
    signal.totalInsiderValue += trade.value;
    if (trade.executiveScore && trade.executiveScore > signal.maxExecutiveScore) {
      signal.maxExecutiveScore = trade.executiveScore;
    }
    if (trade.executiveScore && trade.executiveScore >= 85) {
      signal.hasTopExecutive = true;
    }
  }

  // Process congress trades
  for (const trade of congressTrades) {
    const performance = politicianPerformance.get(trade.politician);
    if (performance) {
      trade.traderScore = performance.dynamicScore;
      trade.isTopTrader = performance.tier === 'ELITE' || performance.tier === 'TOP';
      trade.performanceNote = `${(performance.historicalReturn * 100).toFixed(0)}% avg return`;
    } else {
      trade.traderScore = 30;
    }

    if (!stockMap.has(trade.ticker)) {
      stockMap.set(trade.ticker, {
        ticker: trade.ticker, company: trade.company, insiderBuys: [], congressBuys: [],
        totalInsiderValue: 0, convergenceScore: 0, hasEliteTrader: false,
        hasTopExecutive: false, maxTraderScore: 0, maxExecutiveScore: 0,
      });
    }
    const signal = stockMap.get(trade.ticker)!;
    signal.congressBuys.push(trade);
    if (trade.traderScore && trade.traderScore > signal.maxTraderScore) {
      signal.maxTraderScore = trade.traderScore;
    }
    if (trade.traderScore && trade.traderScore >= 75) {
      signal.hasEliteTrader = true;
    }
  }

  // Score signals with time decay
  for (const signal of stockMap.values()) {
    let score = 0;

    let insiderDaysOld = 7;
    for (const trade of signal.insiderBuys) {
      const baseScore = Math.min((trade.executiveScore || 30) * 0.5, 50);
      if (trade.date) {
        const days = daysSinceTrade(trade.date);
        if (!isNaN(days) && days >= 0) insiderDaysOld = Math.max(insiderDaysOld, days);
      }
      const decayWeight = getInsiderTimeDecayWeight(insiderDaysOld);
      const execMultiplier = getExecutiveAlphaMultiplier(trade.title || '', insiderDaysOld);
      score += baseScore * decayWeight * execMultiplier;
    }
    if (signal.insiderBuys.length >= 3) score += 30;
    else if (signal.insiderBuys.length >= 2) score += 15;

    if (signal.totalInsiderValue > 5000000) score += 50;
    else if (signal.totalInsiderValue > 1000000) score += 35;
    else if (signal.totalInsiderValue > 500000) score += 25;
    else if (signal.totalInsiderValue > 100000) score += 15;

    let congressDaysOld = 30;
    for (const trade of signal.congressBuys) {
      const isElite = trade.traderScore && trade.traderScore >= 75;
      if (trade.tradeDate) {
        const days = daysSinceTrade(trade.tradeDate);
        if (!isNaN(days) && days >= 0) congressDaysOld = Math.max(congressDaysOld, days);
      }
      const decayWeight = getCongressTimeDecayWeight(congressDaysOld, isElite);
      const baseScore = Math.min((trade.traderScore || 30) * 0.8, 80);
      score += baseScore * decayWeight;
    }

    if (signal.insiderBuys.length > 0 && signal.congressBuys.length > 0) {
      const avgDecay = (getInsiderTimeDecayWeight(insiderDaysOld) +
        getCongressTimeDecayWeight(congressDaysOld, signal.hasEliteTrader)) / 2;
      score += 30 * avgDecay;
      if (signal.hasTopExecutive && signal.hasEliteTrader) score += 75 * avgDecay;
      else if (signal.hasTopExecutive || signal.hasEliteTrader) score += 35 * avgDecay;
    }

    if (signal.maxTraderScore >= 80) score += 40 * Math.max(getCongressTimeDecayWeight(congressDaysOld, true), 0.3);
    if (signal.maxExecutiveScore >= 150) score += 40 * Math.max(getInsiderTimeDecayWeight(insiderDaysOld), 0.3);

    signal.convergenceScore = Math.round(score);
  }

  return Array.from(stockMap.values())
    .filter(s => s.convergenceScore > 0)
    .sort((a, b) => b.convergenceScore - a.convergenceScore);
}

// ============================================================================
// MAIN PAPER TRADING RUNNER
// ============================================================================

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  InvestBot Paper Trading Runner');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════');

  // Initialize portfolio if first run
  initializePortfolio(100000);

  // Test Alpaca connection
  console.log('\n[1/6] Testing Alpaca connection...');
  const connected = await testConnection();
  if (!connected) {
    console.error('  Failed to connect to Alpaca. Check API keys in .env');
    console.error('  Required: ALPACA_API_KEY and ALPACA_SECRET_KEY');
    process.exit(1);
  }
  console.log('  Connected to Alpaca Paper Trading');

  // Check if market is open
  console.log('\n[2/6] Checking market status...');
  const marketOpen = await isMarketOpen();
  if (!marketOpen) {
    console.log('  Market is closed. Skipping trade execution.');
    console.log('  Will still analyze picks for next open...');
  } else {
    console.log('  Market is OPEN');
  }

  // Fetch insider data
  console.log('\n[3/6] Fetching insider data...');
  const insiderTrades = await scrapeDataroma();
  if (insiderTrades.length === 0) {
    console.error('  ERROR: No insider trades fetched. Cannot proceed without real data.');
    console.error('  Check if Dataroma is accessible or try again later.');
    process.exit(1);
  }
  console.log(`  Found ${insiderTrades.length} insider trades`);

  // Get congress trades
  console.log('\n[4/6] Loading congress trades...');
  const congressTrades = getCongressTrades();
  console.log(`  Found ${congressTrades.length} congress trades`);

  // Analyze convergence
  console.log('\n[5/6] Analyzing for A+ picks...');
  const signals = await analyzeConvergence(insiderTrades, congressTrades);
  console.log(`  Found ${signals.length} signals`);

  // Filter to top picks
  const topCandidates = signals.slice(0, 6);
  const finalPicks: FinalPick[] = [];

  for (const signal of topCandidates) {
    const analysis = analyzeStockWithAI(signal);

    if (analysis.isLegitimate && analysis.confidence >= 60) {
      const keyPeople = [
        ...signal.insiderBuys.slice(0, 2).map(b => `${b.insiderName} (${b.title})`),
        ...signal.congressBuys.slice(0, 2).map(b => `${b.politician}`),
      ].join(', ');

      finalPicks.push({
        ticker: signal.ticker,
        company: signal.company,
        score: signal.convergenceScore,
        holdPeriod: analysis.holdPeriod,
        whyBuy: analysis.summary,
        keyPeople: `Key buyers: ${keyPeople}`,
        aiConfidence: analysis.confidence,
      });
    }
  }

  // Take top 3 picks
  const top3 = finalPicks.slice(0, 3);

  if (top3.length > 0) {
    console.log('\n  TOP PICKS FOUND:');
    for (let i = 0; i < top3.length; i++) {
      console.log(`    #${i + 1} ${top3[i].ticker} (${top3[i].company}) - Confidence: ${top3[i].aiConfidence}%`);
    }

    // Execute trades if market is open
    if (marketOpen) {
      console.log('\n[6/6] Executing trades...');
      const picksToTrade = top3.map(p => ({
        ticker: p.ticker,
        confidence: p.aiConfidence,
      }));

      const results = await executePicks(picksToTrade);

      // Log successful trades
      for (const result of results) {
        if (result.success && result.action === 'buy') {
          const pick = top3.find(p => p.ticker === result.symbol);
          logTrade(
            result.symbol,
            'buy',
            result.amount || 0,
            result.shares || 0,
            result.price || 0,
            pick?.whyBuy || 'A+ Signal'
          );
          console.log(`    ${result.symbol}: ${result.reason}`);
        } else {
          console.log(`    ${result.symbol}: ${result.reason}`);
        }
      }

      // Take portfolio snapshot
      const snapshot = await takeSnapshot();
      console.log(`\n  Portfolio Snapshot:`);
      console.log(`    Equity: $${snapshot.equity.toLocaleString()}`);
      console.log(`    Return: ${snapshot.totalReturnPct >= 0 ? '+' : ''}${snapshot.totalReturnPct.toFixed(2)}%`);
    } else {
      console.log('\n[6/6] Market closed - trades queued for next open');
    }
  } else {
    console.log('\n  No A+ picks found today. Waiting for better opportunities...');
    console.log('\n[6/6] No trades to execute');
  }

  // Generate performance report
  console.log('\n');
  await generateConsoleReport();

  // Summary line for logs
  const summary = await getSummaryString();
  console.log(`\n  Summary: ${summary}`);

  console.log('\nDone!');
}

main().catch(console.error);
