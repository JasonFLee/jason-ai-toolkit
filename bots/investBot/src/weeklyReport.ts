import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { sendGmail } from './email/gmailOAuth';
import {
  getAccount,
  getPositions,
  getPortfolioHistory,
} from './paperTrading/alpacaClient';
import {
  getPerformanceSummary,
  getTradeHistory,
} from './paperTrading/portfolioTracker';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../logs');
const LOG_FILE = join(LOG_DIR, 'weekly-report.log');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
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

interface Position {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  marketValue: number;
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

const EXECUTIVE_RANKS = [
  { pattern: /\bCEO\b/i, baseScore: 100 },
  { pattern: /\bCFO\b/i, baseScore: 95 },
  { pattern: /\bCOO\b/i, baseScore: 90 },
  { pattern: /\bPresident\b/i, baseScore: 90 },
  { pattern: /\bFounder\b/i, baseScore: 95 },
  { pattern: /\b10% Owner/i, baseScore: 92 },
  { pattern: /\bDirector\b/i, baseScore: 50 },
];

function calculateExecutiveScore(title: string, value: number): number {
  let score = 30;
  for (const rank of EXECUTIVE_RANKS) {
    if (rank.pattern.test(title) && rank.baseScore > score) {
      score = rank.baseScore;
    }
  }
  if (value >= 1000000) score *= 1.5;
  else if (value >= 500000) score *= 1.3;
  return Math.min(score, 200);
}

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
    log('Failed to fetch insider data for recommendations');
  }
  return trades;
}

// ============================================================================
// GET TOP PICKS FOR NEXT WEEK
// ============================================================================

interface WeeklyPick {
  ticker: string;
  company: string;
  reason: string;
  confidence: number;
  totalValue: number;
}

function getTopPicks(trades: InsiderTrade[]): WeeklyPick[] {
  const byTicker = new Map<string, InsiderTrade[]>();
  for (const trade of trades) {
    if (!byTicker.has(trade.ticker)) {
      byTicker.set(trade.ticker, []);
    }
    byTicker.get(trade.ticker)!.push(trade);
  }

  const picks: WeeklyPick[] = [];

  for (const [ticker, tickerTrades] of byTicker) {
    const totalValue = tickerTrades.reduce((sum, t) => sum + t.value, 0);
    const maxExecScore = Math.max(...tickerTrades.map(t => t.executiveScore));

    const hasCEO = tickerTrades.some(t => /\b(CEO|Chief Executive)\b/i.test(t.title));
    const hasCFO = tickerTrades.some(t => /\b(CFO|Chief Financial)\b/i.test(t.title));
    const hasCsuite = tickerTrades.some(t =>
      /\b(CEO|CFO|COO|President|Founder|10% Owner)\b/i.test(t.title)
    );

    const hasClusterBuy = tickerTrades.length >= 3 && totalValue >= 500000;
    const hasMegaPurchase = tickerTrades.some(t =>
      t.value >= 1000000 && /\b(CEO|CFO|COO|President|Founder)\b/i.test(t.title)
    );
    const hasCeoAndCfo = hasCEO && hasCFO;

    let confidence = 30;
    if (hasMegaPurchase) confidence += 35;
    if (hasClusterBuy) confidence += 25;
    if (hasCeoAndCfo) confidence += 25;
    else if (hasCsuite && !hasMegaPurchase) confidence += 15;
    if (totalValue >= 1000000) confidence += 10;
    else if (totalValue >= 500000) confidence += 5;
    if (maxExecScore >= 150) confidence += 10;

    if (confidence >= 60) {
      const topBuyer = tickerTrades.sort((a, b) => b.value - a.value)[0];

      let reason = '';
      if (hasMegaPurchase) {
        reason = `${topBuyer.insiderName} (${topBuyer.title}) bought $${(totalValue/1000000).toFixed(1)}M`;
      } else if (hasClusterBuy) {
        reason = `${tickerTrades.length} insiders buying, total $${(totalValue/1000).toFixed(0)}K`;
      } else {
        reason = `${topBuyer.insiderName} (${topBuyer.title}) bought $${(topBuyer.value/1000).toFixed(0)}K`;
      }

      picks.push({
        ticker,
        company: topBuyer.company,
        reason,
        confidence,
        totalValue,
      });
    }
  }

  return picks.sort((a, b) => b.confidence - a.confidence || b.totalValue - a.totalValue).slice(0, 5);
}

// ============================================================================
// GENERATE EMAIL
// ============================================================================

function generateWeeklyEmail(
  summary: {
    equity: number;
    cash: number;
    totalReturn: number;
    totalReturnPct: number;
    positionCount: number;
    winRate: number;
    tradeCount: number;
  },
  positions: Position[],
  trades: Array<{ timestamp: string; symbol: string; action: string; amount: number; reason: string }>,
  picks: WeeklyPick[]
): { subject: string; html: string; text: string } {
  const weekOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const subject = `InvestBot Weekly Report - ${weekOf}`;

  const returnColor = summary.totalReturnPct >= 0 ? '#2e7d32' : '#c62828';
  const returnSign = summary.totalReturnPct >= 0 ? '+' : '';

  // Text version
  let text = `INVESTBOT WEEKLY REPORT - ${weekOf}\n\n`;
  text += `PORTFOLIO SUMMARY\n`;
  text += `Total Value: $${summary.equity.toLocaleString()}\n`;
  text += `Total Return: ${returnSign}$${summary.totalReturn.toFixed(2)} (${returnSign}${summary.totalReturnPct.toFixed(2)}%)\n`;
  text += `Cash: $${summary.cash.toLocaleString()}\n`;
  text += `Positions: ${summary.positionCount}\n\n`;

  if (positions.length > 0) {
    text += `CURRENT HOLDINGS\n`;
    for (const p of positions) {
      const plSign = p.unrealizedPL >= 0 ? '+' : '';
      text += `${p.symbol}: ${plSign}$${p.unrealizedPL.toFixed(2)} (${plSign}${p.unrealizedPLPercent.toFixed(1)}%)\n`;
    }
    text += '\n';
  }

  if (picks.length > 0) {
    text += `TOP PICKS FOR NEXT WEEK\n`;
    for (let i = 0; i < picks.length; i++) {
      text += `${i + 1}. ${picks[i].ticker} - ${picks[i].reason}\n`;
    }
  }

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; }
    .header h1 { margin: 0; font-size: 26px; }
    .header p { margin: 10px 0 0 0; opacity: 0.9; }
    .card { background: white; border-radius: 12px; padding: 20px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .card h2 { margin: 0 0 15px 0; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
    .stat { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .return-positive { color: #2e7d32; }
    .return-negative { color: #c62828; }
    .position { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .position:last-child { border-bottom: none; }
    .position-symbol { font-weight: bold; color: #1a1a2e; }
    .position-details { color: #666; font-size: 13px; }
    .pick { padding: 15px; margin-bottom: 10px; background: #f0f7ff; border-radius: 8px; border-left: 4px solid #1a1a2e; }
    .pick-header { display: flex; justify-content: space-between; align-items: center; }
    .pick-ticker { font-size: 18px; font-weight: bold; color: #1a1a2e; }
    .pick-confidence { background: #1a1a2e; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; }
    .pick-reason { color: #555; font-size: 13px; margin-top: 8px; }
    .footer { text-align: center; color: #999; font-size: 11px; margin-top: 25px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Weekly Investment Report</h1>
    <p>Week of ${weekOf}</p>
  </div>

  <div class="card">
    <h2>Portfolio Summary</h2>
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-value">$${summary.equity.toLocaleString()}</div>
        <div class="stat-label">Total Value</div>
      </div>
      <div class="stat">
        <div class="stat-value ${summary.totalReturnPct >= 0 ? 'return-positive' : 'return-negative'}">${returnSign}${summary.totalReturnPct.toFixed(2)}%</div>
        <div class="stat-label">Total Return</div>
      </div>
      <div class="stat">
        <div class="stat-value">$${summary.cash.toLocaleString()}</div>
        <div class="stat-label">Cash Available</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.positionCount}</div>
        <div class="stat-label">Open Positions</div>
      </div>
    </div>
  </div>

  ${positions.length > 0 ? `
  <div class="card">
    <h2>Current Holdings</h2>
    ${positions.sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent).map(p => {
      const plSign = p.unrealizedPL >= 0 ? '+' : '';
      const plClass = p.unrealizedPL >= 0 ? 'return-positive' : 'return-negative';
      return `
      <div class="position">
        <div>
          <div class="position-symbol">${p.symbol}</div>
          <div class="position-details">${p.qty.toFixed(2)} shares @ $${p.avgEntryPrice.toFixed(2)}</div>
        </div>
        <div style="text-align: right;">
          <div class="${plClass}" style="font-weight: bold;">${plSign}$${p.unrealizedPL.toFixed(2)}</div>
          <div class="position-details ${plClass}">${plSign}${p.unrealizedPLPercent.toFixed(1)}%</div>
        </div>
      </div>
      `;
    }).join('')}
  </div>
  ` : ''}

  ${picks.length > 0 ? `
  <div class="card">
    <h2>Top Picks for Next Week</h2>
    <p style="color: #666; font-size: 13px; margin-bottom: 15px;">Based on recent insider trading activity:</p>
    ${picks.map((pick, i) => `
    <div class="pick">
      <div class="pick-header">
        <span class="pick-ticker">${i + 1}. ${pick.ticker}</span>
        <span class="pick-confidence">${pick.confidence}% confidence</span>
      </div>
      <div class="pick-reason">${pick.reason}</div>
      <div style="font-size: 11px; color: #888; margin-top: 5px;">${pick.company}</div>
    </div>
    `).join('')}
  </div>
  ` : `
  <div class="card">
    <h2>Top Picks for Next Week</h2>
    <p style="color: #666;">No strong signals found this week. Quality opportunities are rare - patience is key.</p>
  </div>
  `}

  ${trades.length > 0 ? `
  <div class="card">
    <h2>Recent Trades</h2>
    ${trades.slice(-5).reverse().map(t => `
    <div class="position">
      <div>
        <div class="position-symbol">${t.action.toUpperCase()} ${t.symbol}</div>
        <div class="position-details">${new Date(t.timestamp).toLocaleDateString()}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold;">$${t.amount.toLocaleString()}</div>
        <div class="position-details" style="max-width: 200px; text-overflow: ellipsis; overflow: hidden;">${t.reason.substring(0, 40)}...</div>
      </div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="footer">
    <p>Generated by InvestBot | Not financial advice | Past performance doesn't guarantee future results</p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  log('========================================');
  log('InvestBot Weekly Report');
  log('========================================');

  const recipientEmail = process.env.RECIPIENT_EMAIL;
  if (!recipientEmail) {
    log('ERROR: RECIPIENT_EMAIL not set in .env');
    process.exit(1);
  }

  // Get portfolio data
  log('Fetching portfolio data...');
  const summary = await getPerformanceSummary();
  const positions = await getPositions();
  const trades = getTradeHistory();

  log(`Portfolio: $${summary.equity.toLocaleString()} (${summary.totalReturnPct >= 0 ? '+' : ''}${summary.totalReturnPct.toFixed(2)}%)`);
  log(`Positions: ${positions.length}`);

  // Get picks for next week
  log('Fetching insider data for recommendations...');
  const insiderTrades = await scrapeDataroma();
  const picks = getTopPicks(insiderTrades);
  log(`Found ${picks.length} picks for next week`);

  // Generate and send email
  log('Generating email...');
  const { subject, html, text } = generateWeeklyEmail(summary, positions, trades, picks);

  log(`Sending to ${recipientEmail}...`);
  await sendGmail(recipientEmail, subject, html, text);

  log('Weekly report sent successfully!');
  log('========================================');
}

main().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});
