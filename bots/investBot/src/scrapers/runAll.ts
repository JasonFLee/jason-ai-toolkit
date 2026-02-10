import 'dotenv/config';
import { Database } from '../db/database';
import { SECForm4Scraper } from './secForm4';
import { CongressTradingScraper } from './congressTrading';
import { InstitutionalInvestorScraper } from './institutionalInvestors';

async function runAllScrapers() {
  console.log('📥 InvestBot Data Scraper');
  console.log('='.repeat(50));

  const db = new Database();
  await db.initialize();
  console.log('✓ Database initialized\n');

  const secScraper = new SECForm4Scraper();
  const congressScraper = new CongressTradingScraper();
  const institutionalScraper = new InstitutionalInvestorScraper();

  // SEC Form 4 (Corporate Insiders)
  console.log('1️⃣  Fetching SEC Form 4 filings (Corporate Insiders)...');
  try {
    const form4Data = await secScraper.fetchRecentFilings(100);
    await db.saveInsiderTransactions(form4Data);
    console.log(`   ✓ Saved ${form4Data.length} insider transactions`);

    // Show sample
    if (form4Data.length > 0) {
      console.log('   Sample transactions:');
      for (const tx of form4Data.slice(0, 3)) {
        console.log(`     - ${tx.ticker}: ${tx.insiderName} (${tx.insiderTitle}) ${tx.transactionType} ${tx.shares} shares @ $${tx.pricePerShare}`);
      }
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  // Congress Trading (STOCK Act)
  console.log('\n2️⃣  Fetching Congress trading disclosures (STOCK Act)...');
  try {
    const congressData = await congressScraper.getAllCongressTrades(100);
    await db.saveCongressTransactions(congressData);
    console.log(`   ✓ Saved ${congressData.length} congress transactions`);

    // Show sample
    if (congressData.length > 0) {
      console.log('   Sample transactions:');
      for (const tx of congressData.slice(0, 3)) {
        const amount = `$${(tx.amountRange.min / 1000).toFixed(0)}K - $${(tx.amountRange.max / 1000).toFixed(0)}K`;
        console.log(`     - ${tx.ticker}: ${tx.memberName} (${tx.chamber}) ${tx.transactionType} ${amount}`);
      }
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  // Institutional Investors (13F)
  console.log('\n3️⃣  Fetching 13F filings (Institutional Investors)...');
  try {
    const institutionalData = await institutionalScraper.fetch13FFilings(50);
    await db.saveInstitutionalHoldings(institutionalData);
    console.log(`   ✓ Saved ${institutionalData.length} institutional holdings`);

    // Show sample
    if (institutionalData.length > 0) {
      console.log('   Sample holdings:');
      for (const h of institutionalData.slice(0, 3)) {
        const value = `$${(h.value / 1000000).toFixed(1)}M`;
        console.log(`     - ${h.ticker}: ${h.institutionName} holds ${h.shares.toLocaleString()} shares (${value})`);
      }
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  // 13D/13G Filings (Activist Investors)
  console.log('\n4️⃣  Fetching 13D/13G filings (Activist Investors)...');
  try {
    const ownershipChanges = await institutionalScraper.getOwnershipChanges(30);
    console.log(`   ✓ Found ${ownershipChanges.length} ownership changes (>5% positions)`);

    if (ownershipChanges.length > 0) {
      console.log('   Sample changes:');
      for (const change of ownershipChanges.slice(0, 3)) {
        console.log(`     - ${change.ticker}: ${change.institutionName} ${change.changeType} ${change.ownershipPercent.toFixed(1)}% stake`);
      }
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SCRAPING SUMMARY');

  const tickers = await db.getUniqueTickersWithActivity(30);
  const topStocks = await db.getTopStocksByActivity(10, 30);

  console.log(`\nUnique tickers with buy activity: ${tickers.length}`);
  console.log('\nTop 10 stocks by total activity:');
  for (const stock of topStocks) {
    console.log(`  ${stock.ticker}: ${stock.activityCount} signals`);
  }

  await db.close();
  console.log('\n✓ Scraping complete');
}

runAllScrapers().catch(console.error);
