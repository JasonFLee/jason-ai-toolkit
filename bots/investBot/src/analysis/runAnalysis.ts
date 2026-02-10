import 'dotenv/config';
import { Database } from '../db/database';
import { ConvergenceAnalyzer } from './convergence';
import { EmailNotifier } from '../email/notifier';
import { StockScore } from '../types/analysis';

async function runAnalysis() {
  console.log('🔍 InvestBot Convergence Analysis');
  console.log('='.repeat(50));

  const db = new Database();
  await db.initialize();
  console.log('✓ Database initialized\n');

  const analyzer = new ConvergenceAnalyzer(db);

  console.log('Analyzing convergence signals from last 30 days...\n');

  const signals = await analyzer.analyzeFromDatabase(30);

  if (signals.length === 0) {
    console.log('No convergence signals found. Try running the scraper first:');
    console.log('  npm run scrape\n');
    await db.close();
    return;
  }

  console.log(`📊 Found ${signals.length} stocks with convergence activity\n`);

  // Filter for high-confidence signals
  const strongSignals = signals.filter(s => s.convergenceScore >= 60);
  const mediumSignals = signals.filter(s => s.convergenceScore >= 40 && s.convergenceScore < 60);
  const weakSignals = signals.filter(s => s.convergenceScore < 40);

  console.log(`Signal Strength Breakdown:`);
  console.log(`  🟢 Strong (60+): ${strongSignals.length} stocks`);
  console.log(`  🟡 Medium (40-60): ${mediumSignals.length} stocks`);
  console.log(`  🔴 Weak (<40): ${weakSignals.length} stocks\n`);

  // Display top 10 picks
  console.log('🎯 TOP 10 STOCK PICKS');
  console.log('='.repeat(60));

  for (let i = 0; i < Math.min(10, signals.length); i++) {
    const s = signals[i];
    const rank = i + 1;
    const scoreBar = '█'.repeat(Math.round(s.convergenceScore / 10)) + '░'.repeat(10 - Math.round(s.convergenceScore / 10));

    console.log(`\n#${rank} ${s.ticker} ${s.companyName ? `(${s.companyName})` : ''}`);
    console.log(`   Score: [${scoreBar}] ${s.convergenceScore.toFixed(1)}/100`);
    console.log(`   ├─ Insider:       ${s.insiderScore.toFixed(1)} (${s.signals.insiderBuys} buys)`);
    console.log(`   ├─ Congress:      ${s.congressScore.toFixed(1)} (${s.signals.congressBuys} buys)`);
    console.log(`   ├─ Institutional: ${s.institutionalScore.toFixed(1)} (${s.signals.institutionalIncreases} increases)`);
    console.log(`   └─ Convergence:   +${s.convergenceBonus.toFixed(1)} bonus`);

    if (s.recentBuyers.length > 0) {
      console.log('   Recent Buyers:');
      for (const buyer of s.recentBuyers.slice(0, 3)) {
        const date = new Date(buyer.date).toLocaleDateString();
        const amount = buyer.amount
          ? `$${(buyer.amount / 1000).toFixed(0)}K`
          : buyer.amountRange
            ? `$${(buyer.amountRange.min / 1000).toFixed(0)}K-$${(buyer.amountRange.max / 1000).toFixed(0)}K`
            : '';
        console.log(`     • ${buyer.name} (${buyer.type}) ${amount} on ${date}`);
      }
    }
  }

  // Send email if configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.RECIPIENT_EMAIL) {
    console.log('\n📧 Sending email notification...');

    const notifier = new EmailNotifier({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || '',
      recipientEmail: process.env.RECIPIENT_EMAIL,
    });

    const topPicks: StockScore[] = signals.slice(0, 10).map(s => ({
      ticker: s.ticker,
      companyName: s.companyName,
      overallScore: s.convergenceScore,
      insiderScore: s.insiderScore,
      congressScore: s.congressScore,
      institutionalScore: s.institutionalScore,
      convergenceBonus: s.convergenceBonus,
      recentBuyers: s.recentBuyers,
      signals: s.signals,
    }));

    const result = await notifier.sendNotification(topPicks);

    if (result.success) {
      console.log(`✓ Email sent to ${process.env.RECIPIENT_EMAIL}`);
    } else {
      console.log(`✗ Failed to send email: ${result.error}`);
    }
  } else {
    console.log('\n💡 Tip: Configure SMTP settings in .env to receive email notifications');
  }

  // Save signals to database for backtesting
  console.log('\n💾 Saving signals to database...');
  for (const signal of signals) {
    await db.saveConvergenceSignal(signal);
  }
  console.log(`✓ Saved ${signals.length} signals`);

  await db.close();
  console.log('\n✓ Analysis complete');
}

runAnalysis().catch(console.error);
