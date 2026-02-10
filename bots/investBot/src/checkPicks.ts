import axios from 'axios';

async function checkStock(ticker: string) {
  try {
    const resp = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = resp.data?.chart?.result?.[0];
    const prices = data?.indicators?.quote?.[0]?.close || [];
    const current = data?.meta?.regularMarketPrice;
    const sixMonthsAgo = prices[0];
    const threeMonthsAgo = prices[Math.floor(prices.length / 2)];
    const oneMonthAgo = prices[prices.length - 22] || prices[prices.length - 20];

    console.log(`\n${ticker}:`);
    console.log(`  Current: $${current?.toFixed(2)}`);
    console.log(`  6 months ago: $${sixMonthsAgo?.toFixed(2)} → ${(((current - sixMonthsAgo) / sixMonthsAgo) * 100).toFixed(1)}% return`);
    console.log(`  3 months ago: $${threeMonthsAgo?.toFixed(2)} → ${(((current - threeMonthsAgo) / threeMonthsAgo) * 100).toFixed(1)}% return`);
    console.log(`  1 month ago: $${oneMonthAgo?.toFixed(2)} → ${(((current - oneMonthAgo) / oneMonthAgo) * 100).toFixed(1)}% return`);
  } catch (e) {
    console.log(`${ticker}: Error fetching`);
  }
}

async function main() {
  console.log('=== CURRENT PICKS - Recent Performance ===');
  await checkStock('MSFT');
  await checkStock('TPVG');

  console.log('\n=== S&P 500 (SPY) for comparison ===');
  await checkStock('SPY');

  console.log('\n=== BACKTEST STOCKS - How They Did ===');
  await checkStock('NVDA');
  await checkStock('GOOGL');
  await checkStock('AAPL');
  await checkStock('AMZN');
}

main();
