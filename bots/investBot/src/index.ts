import 'dotenv/config';
import { Database } from './db/database';
import { SECForm4Scraper, CongressTradingScraper, InstitutionalInvestorScraper } from './scrapers';
import { ConvergenceAnalyzer } from './analysis/convergence';
import { Backtester } from './backtest/backtester';
import { EmailNotifier } from './email/notifier';
import { StockScore } from './types/analysis';

async function main() {
  console.log('🚀 InvestBot - Insider Convergence Analysis System');
  console.log('='.repeat(50));

  // Initialize database
  const db = new Database();
  await db.initialize();
  console.log('✓ Database initialized');

  // Initialize scrapers
  const secScraper = new SECForm4Scraper();
  const congressScraper = new CongressTradingScraper();
  const institutionalScraper = new InstitutionalInvestorScraper();

  // Initialize analyzer
  const analyzer = new ConvergenceAnalyzer(db);

  // Initialize email notifier (if configured)
  let notifier: EmailNotifier | null = null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.RECIPIENT_EMAIL) {
    notifier = new EmailNotifier({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || '',
      recipientEmail: process.env.RECIPIENT_EMAIL,
    });
    console.log('✓ Email notifier configured');
  }

  // Fetch fresh data
  console.log('\n📥 Fetching insider trading data...');

  try {
    // Fetch SEC Form 4 filings
    console.log('  • Fetching SEC Form 4 filings...');
    const form4Data = await secScraper.fetchRecentFilings(50);
    await db.saveInsiderTransactions(form4Data);
    console.log(`    ✓ ${form4Data.length} insider transactions`);

    // Fetch Congress trading disclosures
    console.log('  • Fetching Congress trading disclosures...');
    const congressData = await congressScraper.getAllCongressTrades(50);
    await db.saveCongressTransactions(congressData);
    console.log(`    ✓ ${congressData.length} congress transactions`);

    // Fetch institutional investor filings
    console.log('  • Fetching institutional investor filings...');
    const institutionalData = await institutionalScraper.fetch13FFilings(30);
    await db.saveInstitutionalHoldings(institutionalData);
    console.log(`    ✓ ${institutionalData.length} institutional holdings`);

  } catch (error) {
    console.error('Error fetching data:', error);
  }

  // Analyze convergence
  console.log('\n🔍 Analyzing convergence signals...');
  const signals = await analyzer.analyzeFromDatabase(30);

  console.log(`\n📊 Found ${signals.length} stocks with convergence signals`);

  // Get top picks
  const topPicks = signals.slice(0, 10);

  if (topPicks.length > 0) {
    console.log('\n🎯 Top Stock Picks:');
    console.log('-'.repeat(50));

    for (const pick of topPicks) {
      console.log(`\n${pick.ticker} - Score: ${pick.convergenceScore.toFixed(1)}/100`);
      console.log(`  Company: ${pick.companyName || 'N/A'}`);
      console.log(`  Insider: ${pick.insiderScore.toFixed(1)} | Congress: ${pick.congressScore.toFixed(1)} | Institutional: ${pick.institutionalScore.toFixed(1)}`);
      console.log(`  Activity: ${pick.signals.insiderBuys} insider buys, ${pick.signals.congressBuys} congress buys, ${pick.signals.institutionalIncreases} institutional increases`);

      if (pick.recentBuyers.length > 0) {
        console.log('  Notable buyers:');
        for (const buyer of pick.recentBuyers.slice(0, 3)) {
          console.log(`    - ${buyer.name} (${buyer.type})`);
        }
      }
    }
  } else {
    console.log('No significant convergence signals found.');
  }

  // Send email notification if configured
  if (notifier && topPicks.length > 0) {
    console.log('\n📧 Sending email notification...');

    const stockScores: StockScore[] = topPicks.map(signal => ({
      ticker: signal.ticker,
      companyName: signal.companyName,
      overallScore: signal.convergenceScore,
      insiderScore: signal.insiderScore,
      congressScore: signal.congressScore,
      institutionalScore: signal.institutionalScore,
      convergenceBonus: signal.convergenceBonus,
      recentBuyers: signal.recentBuyers,
      signals: signal.signals,
    }));

    const result = await notifier.sendNotification(stockScores);

    if (result.success) {
      console.log('✓ Email sent successfully');
    } else {
      console.log(`✗ Failed to send email: ${result.error}`);
    }
  }

  // Save signals to database
  for (const signal of signals) {
    await db.saveConvergenceSignal(signal);
  }

  await db.close();
  console.log('\n✓ Analysis complete');
}

main().catch(console.error);
