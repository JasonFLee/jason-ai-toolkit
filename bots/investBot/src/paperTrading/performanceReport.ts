import {
  getAccount,
  getPositions,
  getPortfolioHistory,
  getLatestPrice,
} from './alpacaClient';
import {
  getPerformanceSummary,
  getPositionsWithPL,
  getTradeHistory,
  getEquityHistory,
} from './portfolioTracker';

// Get SPY performance for comparison
async function getSPYReturn(days: number = 30): Promise<number> {
  try {
    // This is a simplified version - in production you'd want historical data
    const currentPrice = await getLatestPrice('SPY');
    // Approximate based on typical SPY performance
    // For accurate comparison, you'd fetch historical SPY data
    return (days / 365) * 10; // Assume ~10% annual return for SPY
  } catch {
    return 0;
  }
}

// Generate console report
export async function generateConsoleReport(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('          INVESTBOT PAPER TRADING REPORT');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    const summary = await getPerformanceSummary();
    const positions = await getPositionsWithPL();
    const trades = getTradeHistory();

    // Portfolio Overview
    console.log('PORTFOLIO OVERVIEW');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Total Equity:      $${summary.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Cash Available:    $${summary.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Total Return:      $${summary.totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${summary.totalReturnPct >= 0 ? '+' : ''}${summary.totalReturnPct.toFixed(2)}%)`);
    console.log(`  Position Count:    ${summary.positionCount}`);
    console.log(`  Total Trades:      ${summary.tradeCount}`);

    // Performance Metrics
    console.log('\nPERFORMANCE METRICS');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Win Rate:          ${summary.winRate.toFixed(1)}%`);
    console.log(`  Avg Return/Trade:  $${summary.avgReturnPerTrade.toFixed(2)}`);

    // Current Positions
    if (positions.length > 0) {
      console.log('\nCURRENT POSITIONS');
      console.log('─────────────────────────────────────────────────');
      console.log('  Symbol     Shares     Entry      Current     P/L       P/L %');

      const sortedPositions = positions.sort((a, b) => b.plPct - a.plPct);
      for (const pos of sortedPositions) {
        const plSign = pos.pl >= 0 ? '+' : '';
        const plPctSign = pos.plPct >= 0 ? '+' : '';
        console.log(
          `  ${pos.symbol.padEnd(10)} ` +
          `${pos.qty.toFixed(2).padStart(8)}   ` +
          `$${pos.avgEntry.toFixed(2).padStart(7)}   ` +
          `$${pos.currentPrice.toFixed(2).padStart(7)}   ` +
          `${plSign}$${pos.pl.toFixed(0).padStart(6)}   ` +
          `${plPctSign}${pos.plPct.toFixed(1)}%`
        );
      }
    } else {
      console.log('\nNo open positions.');
    }

    // Recent Trades
    if (trades.length > 0) {
      console.log('\nRECENT TRADES (Last 10)');
      console.log('─────────────────────────────────────────────────');
      const recentTrades = trades.slice(-10).reverse();
      for (const trade of recentTrades) {
        const date = new Date(trade.timestamp).toLocaleDateString();
        const action = trade.action.toUpperCase().padEnd(4);
        console.log(
          `  ${date}  ${action}  ${trade.symbol.padEnd(6)}  ` +
          `${trade.shares.toFixed(2).padStart(8)} shares @ $${trade.price.toFixed(2)}`
        );
      }
    }

    // Benchmark Comparison
    const spyReturn = await getSPYReturn(30);
    console.log('\nBENCHMARK COMPARISON (vs SPY)');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Your Return:       ${summary.totalReturnPct >= 0 ? '+' : ''}${summary.totalReturnPct.toFixed(2)}%`);
    console.log(`  S&P 500 (est):     +${spyReturn.toFixed(2)}%`);
    const alpha = summary.totalReturnPct - spyReturn;
    console.log(`  Alpha:             ${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%`);

    console.log('\n═══════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('Error generating report:', error.message);
  }
}

// Generate summary string for logging
export async function getSummaryString(): Promise<string> {
  const summary = await getPerformanceSummary();
  const sign = summary.totalReturnPct >= 0 ? '+' : '';
  return `Portfolio: $${summary.equity.toLocaleString()} (${sign}${summary.totalReturnPct.toFixed(2)}%) | Positions: ${summary.positionCount} | Win Rate: ${summary.winRate.toFixed(0)}%`;
}

// Get data for email report
export async function getReportData(): Promise<{
  equity: number;
  cash: number;
  totalReturn: number;
  totalReturnPct: number;
  positionCount: number;
  winRate: number;
  positions: Array<{
    symbol: string;
    qty: number;
    pl: number;
    plPct: number;
  }>;
  recentTrades: Array<{
    date: string;
    symbol: string;
    action: string;
    amount: number;
  }>;
}> {
  const summary = await getPerformanceSummary();
  const positions = await getPositionsWithPL();
  const trades = getTradeHistory();

  return {
    equity: summary.equity,
    cash: summary.cash,
    totalReturn: summary.totalReturn,
    totalReturnPct: summary.totalReturnPct,
    positionCount: summary.positionCount,
    winRate: summary.winRate,
    positions: positions.map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      pl: p.pl,
      plPct: p.plPct,
    })),
    recentTrades: trades.slice(-5).map(t => ({
      date: new Date(t.timestamp).toLocaleDateString(),
      symbol: t.symbol,
      action: t.action,
      amount: t.amount,
    })),
  };
}
