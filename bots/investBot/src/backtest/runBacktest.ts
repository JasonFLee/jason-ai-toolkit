import 'dotenv/config';
import { Database } from '../db/database';
import { Backtester } from './backtester';
import { BacktestConfig } from '../types/backtest';

async function runBacktest() {
  console.log('📊 InvestBot Backtesting System');
  console.log('='.repeat(50));

  const db = new Database();
  await db.initialize();

  const backtester = new Backtester(db);

  // Define 10+ test periods
  const testPeriods = [
    { startDate: new Date('2023-01-01'), endDate: new Date('2023-03-31'), name: 'Q1 2023' },
    { startDate: new Date('2023-04-01'), endDate: new Date('2023-06-30'), name: 'Q2 2023' },
    { startDate: new Date('2023-07-01'), endDate: new Date('2023-09-30'), name: 'Q3 2023' },
    { startDate: new Date('2023-10-01'), endDate: new Date('2023-12-31'), name: 'Q4 2023' },
    { startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31'), name: 'Q1 2024' },
    { startDate: new Date('2024-04-01'), endDate: new Date('2024-06-30'), name: 'Q2 2024' },
    { startDate: new Date('2024-07-01'), endDate: new Date('2024-09-30'), name: 'Q3 2024' },
    { startDate: new Date('2024-10-01'), endDate: new Date('2024-11-30'), name: 'Oct-Nov 2024' },
    { startDate: new Date('2023-01-01'), endDate: new Date('2023-06-30'), name: 'H1 2023' },
    { startDate: new Date('2023-07-01'), endDate: new Date('2023-12-31'), name: 'H2 2023' },
    { startDate: new Date('2024-01-01'), endDate: new Date('2024-06-30'), name: 'H1 2024' },
  ];

  console.log(`\n🔬 Running backtests across ${testPeriods.length} periods...\n`);

  const results: Array<{
    period: string;
    return: number;
    spyReturn: number;
    alpha: number;
    trades: number;
    winRate: number;
  }> = [];

  for (const period of testPeriods) {
    console.log(`Testing ${period.name}...`);

    const config: BacktestConfig = {
      startDate: period.startDate,
      endDate: period.endDate,
      initialCapital: 100000,
      minConvergenceScore: 50,
      maxPositions: 5,
      holdingPeriodDays: 30,
      stopLoss: 15,
      takeProfit: 30,
    };

    try {
      const result = await backtester.runBacktest(config);
      const comparison = await backtester.compareToSPY(result);

      results.push({
        period: period.name,
        return: result.totalReturn,
        spyReturn: comparison.spyReturn,
        alpha: comparison.alpha,
        trades: result.totalTrades,
        winRate: result.winRate * 100,
      });

      console.log(`  ✓ Return: ${result.totalReturn.toFixed(2)}% | SPY: ${comparison.spyReturn.toFixed(2)}% | Alpha: ${comparison.alpha.toFixed(2)}%`);
    } catch (error) {
      console.log(`  ✗ Error: ${error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 BACKTEST SUMMARY');
  console.log('='.repeat(60));

  console.log('\n| Period         | Return    | SPY       | Alpha     | Trades | Win Rate |');
  console.log('|----------------|-----------|-----------|-----------|--------|----------|');

  for (const r of results) {
    const returnStr = `${r.return >= 0 ? '+' : ''}${r.return.toFixed(2)}%`.padEnd(9);
    const spyStr = `${r.spyReturn >= 0 ? '+' : ''}${r.spyReturn.toFixed(2)}%`.padEnd(9);
    const alphaStr = `${r.alpha >= 0 ? '+' : ''}${r.alpha.toFixed(2)}%`.padEnd(9);
    const tradesStr = String(r.trades).padEnd(6);
    const winRateStr = `${r.winRate.toFixed(1)}%`.padEnd(8);

    console.log(`| ${r.period.padEnd(14)} | ${returnStr} | ${spyStr} | ${alphaStr} | ${tradesStr} | ${winRateStr} |`);
  }

  // Aggregate stats
  const avgReturn = results.reduce((sum, r) => sum + r.return, 0) / results.length;
  const avgAlpha = results.reduce((sum, r) => sum + r.alpha, 0) / results.length;
  const avgWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / results.length;
  const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
  const positiveAlpha = results.filter(r => r.alpha > 0).length;

  console.log('\n📊 AGGREGATE STATISTICS:');
  console.log(`  Average Return: ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`);
  console.log(`  Average Alpha: ${avgAlpha >= 0 ? '+' : ''}${avgAlpha.toFixed(2)}%`);
  console.log(`  Average Win Rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`  Total Trades: ${totalTrades}`);
  console.log(`  Periods with Positive Alpha: ${positiveAlpha}/${results.length} (${(positiveAlpha/results.length*100).toFixed(0)}%)`);

  await db.close();
  console.log('\n✓ Backtesting complete');
}

runBacktest().catch(console.error);
