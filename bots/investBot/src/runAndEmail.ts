import 'dotenv/config';
import { Database } from './db/database';
import { SECForm4Scraper, CongressTradingScraper, InstitutionalInvestorScraper } from './scrapers';
import { ConvergenceAnalyzer } from './analysis/convergence';
import { sendGmail } from './email/gmailOAuth';
import { ConvergenceSignal } from './types/analysis';

async function generateEmailContent(signals: ConvergenceSignal[]): Promise<{ subject: string; html: string; text: string }> {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `🎯 InvestBot Stock Picks - ${date}`;

  // Text version
  let text = `InvestBot Stock Picks for ${date}\n`;
  text += '='.repeat(50) + '\n\n';

  for (const pick of signals.slice(0, 10)) {
    text += `${pick.ticker} - Score: ${pick.convergenceScore.toFixed(1)}/100\n`;
    text += `Company: ${pick.companyName || 'N/A'}\n`;
    text += `Insider Score: ${pick.insiderScore.toFixed(1)} | Congress: ${pick.congressScore.toFixed(1)} | Institutional: ${pick.institutionalScore.toFixed(1)}\n`;
    text += `Activity: ${pick.signals.insiderBuys} insider buys, ${pick.signals.congressBuys} congress buys, ${pick.signals.institutionalIncreases} institutional increases\n`;

    if (pick.recentBuyers.length > 0) {
      text += 'WHO IS BUYING:\n';
      for (const buyer of pick.recentBuyers.slice(0, 5)) {
        const amount = buyer.amount
          ? `$${(buyer.amount / 1000).toFixed(0)}K`
          : buyer.amountRange
            ? `$${(buyer.amountRange.min / 1000).toFixed(0)}K-$${(buyer.amountRange.max / 1000).toFixed(0)}K`
            : '';
        text += `  - ${buyer.name} (${buyer.type}) ${amount}\n`;
      }
    }
    text += '\n' + '-'.repeat(40) + '\n\n';
  }

  text += '\n⚠️ Disclaimer: This is not financial advice. Do your own research.\n';

  // HTML version with beautiful formatting
  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 15px;
      margin-bottom: 25px;
      text-align: center;
    }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; }
    .stock-card {
      background: white;
      border-radius: 15px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      border-left: 5px solid #667eea;
    }
    .stock-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
    }
    .ticker {
      font-size: 28px;
      font-weight: bold;
      color: #333;
      margin: 0;
    }
    .company-name {
      color: #666;
      font-size: 14px;
      margin: 5px 0 0 0;
    }
    .score-badge {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 18px;
    }
    .score-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .score-item {
      text-align: center;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 10px;
    }
    .score-item .value {
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
    }
    .score-item .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .buyers-section {
      background: #f0f4ff;
      padding: 20px;
      border-radius: 10px;
      margin-top: 15px;
    }
    .buyers-title {
      font-weight: bold;
      color: #667eea;
      margin-bottom: 15px;
      font-size: 16px;
    }
    .buyer-item {
      padding: 12px 0;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .buyer-item:last-child { border-bottom: none; }
    .buyer-name { font-weight: 500; }
    .buyer-type {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 3px 10px;
      border-radius: 15px;
      font-size: 11px;
      margin-left: 8px;
    }
    .buyer-amount {
      color: #28a745;
      font-weight: 500;
    }
    .signals {
      display: flex;
      gap: 10px;
      margin: 15px 0;
      flex-wrap: wrap;
    }
    .signal {
      padding: 8px 15px;
      background: #e8f5e9;
      border-radius: 20px;
      font-size: 13px;
      color: #2e7d32;
    }
    .disclaimer {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 20px;
      border-radius: 10px;
      margin-top: 30px;
    }
    .why-section {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 10px;
      margin: 15px 0;
    }
    .why-title {
      font-weight: bold;
      color: #1565c0;
      margin-bottom: 10px;
    }
    .footer {
      text-align: center;
      color: #999;
      margin-top: 30px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 InvestBot Stock Picks</h1>
    <p>${date}</p>
  </div>
`;

  for (let i = 0; i < Math.min(10, signals.length); i++) {
    const pick = signals[i];
    const rank = i + 1;

    html += `
  <div class="stock-card">
    <div class="stock-header">
      <div>
        <p class="ticker">#${rank} ${pick.ticker}</p>
        <p class="company-name">${pick.companyName || ''}</p>
      </div>
      <div class="score-badge">${pick.convergenceScore.toFixed(0)}/100</div>
    </div>

    <div class="score-grid">
      <div class="score-item">
        <div class="value">${pick.insiderScore.toFixed(0)}</div>
        <div class="label">Insider Score</div>
      </div>
      <div class="score-item">
        <div class="value">${pick.congressScore.toFixed(0)}</div>
        <div class="label">Congress Score</div>
      </div>
      <div class="score-item">
        <div class="value">${pick.institutionalScore.toFixed(0)}</div>
        <div class="label">Institutional</div>
      </div>
    </div>

    <div class="signals">
      <span class="signal">📊 ${pick.signals.insiderBuys} Insider Buys</span>
      <span class="signal">🏛️ ${pick.signals.congressBuys} Congress Buys</span>
      <span class="signal">🏦 ${pick.signals.institutionalIncreases} Institutional↑</span>
    </div>

    <div class="why-section">
      <div class="why-title">💡 Why This Stock?</div>
      <p style="margin: 0; font-size: 14px;">
        ${getWhyExplanation(pick)}
      </p>
    </div>
`;

    if (pick.recentBuyers.length > 0) {
      html += `
    <div class="buyers-section">
      <div class="buyers-title">👥 Who's Buying</div>
`;
      for (const buyer of pick.recentBuyers.slice(0, 5)) {
        const amount = buyer.amount
          ? `$${(buyer.amount / 1000).toFixed(0)}K`
          : buyer.amountRange
            ? `$${(buyer.amountRange.min / 1000).toFixed(0)}K-$${(buyer.amountRange.max / 1000).toFixed(0)}K`
            : '';
        const dateStr = new Date(buyer.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        html += `
      <div class="buyer-item">
        <span>
          <span class="buyer-name">${buyer.name}</span>
          <span class="buyer-type">${buyer.type}</span>
        </span>
        <span class="buyer-amount">${amount} • ${dateStr}</span>
      </div>
`;
      }
      html += `
    </div>
`;
    }

    html += `
  </div>
`;
  }

  html += `
  <div class="disclaimer">
    <strong>⚠️ Disclaimer:</strong> This is not financial advice. The information provided is for educational purposes only. Always do your own research and consult with a qualified financial advisor before making investment decisions.
  </div>

  <div class="footer">
    Generated by InvestBot • Insider Convergence Analysis System<br>
    Data sources: SEC Form 4, Congress STOCK Act, SEC 13F filings
  </div>
</body>
</html>
`;

  return { subject, html, text };
}

function getWhyExplanation(signal: ConvergenceSignal): string {
  const reasons: string[] = [];

  if (signal.signals.insiderBuys >= 3) {
    reasons.push(`<strong>${signal.signals.insiderBuys} corporate insiders</strong> (executives, directors) are buying their own company's stock`);
  } else if (signal.signals.insiderBuys > 0) {
    reasons.push(`${signal.signals.insiderBuys} insider(s) buying shares`);
  }

  if (signal.signals.congressBuys >= 2) {
    reasons.push(`<strong>${signal.signals.congressBuys} members of Congress</strong> have disclosed purchases`);
  } else if (signal.signals.congressBuys > 0) {
    reasons.push(`${signal.signals.congressBuys} Congress member(s) buying`);
  }

  if (signal.signals.institutionalIncreases >= 3) {
    reasons.push(`<strong>${signal.signals.institutionalIncreases} major institutions</strong> are increasing their positions`);
  } else if (signal.signals.institutionalIncreases > 0) {
    reasons.push(`${signal.signals.institutionalIncreases} institution(s) adding shares`);
  }

  if (signal.convergenceBonus >= 20) {
    reasons.push('Strong multi-source convergence detected (insiders + Congress + institutions all buying)');
  } else if (signal.convergenceBonus >= 10) {
    reasons.push('Multiple insider types converging on this stock');
  }

  // Highlight notable buyers
  const notableBuyers = signal.recentBuyers.filter(b =>
    b.type === 'CEO' || b.type === 'CFO' || b.type === 'Congress'
  );
  if (notableBuyers.length > 0) {
    const names = notableBuyers.slice(0, 2).map(b => `${b.name} (${b.type})`).join(', ');
    reasons.push(`Notable buyers include: ${names}`);
  }

  return reasons.join('. ') + '.';
}

async function main() {
  console.log('🚀 InvestBot - Running Analysis and Sending Email');
  console.log('='.repeat(50));

  // Initialize database
  const db = new Database();
  await db.initialize();
  console.log('✓ Database initialized');

  // Initialize scrapers
  const secScraper = new SECForm4Scraper();
  const congressScraper = new CongressTradingScraper();
  const institutionalScraper = new InstitutionalInvestorScraper();

  // Fetch fresh data
  console.log('\n📥 Fetching insider trading data...');

  try {
    console.log('  • Fetching SEC Form 4 filings...');
    const form4Data = await secScraper.fetchRecentFilings(50);
    await db.saveInsiderTransactions(form4Data);
    console.log(`    ✓ ${form4Data.length} insider transactions`);

    console.log('  • Fetching Congress trading disclosures...');
    const congressData = await congressScraper.getAllCongressTrades(50);
    await db.saveCongressTransactions(congressData);
    console.log(`    ✓ ${congressData.length} congress transactions`);

    console.log('  • Fetching institutional investor filings...');
    const institutionalData = await institutionalScraper.fetch13FFilings(30);
    await db.saveInstitutionalHoldings(institutionalData);
    console.log(`    ✓ ${institutionalData.length} institutional holdings`);
  } catch (error) {
    console.error('Error fetching data:', error);
  }

  // Analyze convergence
  console.log('\n🔍 Analyzing convergence signals...');
  const analyzer = new ConvergenceAnalyzer(db);
  const signals = await analyzer.analyzeFromDatabase(30);

  console.log(`📊 Found ${signals.length} stocks with convergence signals`);

  if (signals.length === 0) {
    console.log('\nNo significant convergence signals found today.');
    console.log('This is normal - A+ opportunities are rare. Will check again tomorrow.');
    process.exit(0);
  }

  // Get recipient email from environment
  console.log('\n📧 Preparing to send email...');
  const recipientEmail = process.env.RECIPIENT_EMAIL;

  if (!recipientEmail) {
    console.error('RECIPIENT_EMAIL not set in .env file');
    throw new Error('RECIPIENT_EMAIL environment variable is required');
  }

  console.log(`  Sending to: ${recipientEmail}`);

  // Generate and send email
  const { subject, html, text } = await generateEmailContent(signals);

  console.log('\n📤 Sending email with stock picks...');
  await sendGmail(recipientEmail, subject, html, text);

  // Save signals to database
  for (const signal of signals) {
    await db.saveConvergenceSignal(signal);
  }

  await db.close();
  console.log('\n✓ Analysis complete and email sent!');
}

main().catch(console.error);
