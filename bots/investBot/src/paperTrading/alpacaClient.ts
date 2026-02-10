import 'dotenv/config';
import Alpaca from '@alpacahq/alpaca-trade-api';

// Initialize Alpaca client
// Set ALPACA_LIVE=true in .env to use real money
const isLive = process.env.ALPACA_LIVE === 'true';
const alpaca = new Alpaca({
  keyId: isLive ? process.env.ALPACA_LIVE_API_KEY : process.env.ALPACA_API_KEY,
  secretKey: isLive ? process.env.ALPACA_LIVE_SECRET_KEY : process.env.ALPACA_SECRET_KEY,
  paper: !isLive,
  usePolygon: false,
});

if (isLive) {
  console.log('⚠️  LIVE TRADING MODE - Using real money!');
}

export interface AccountInfo {
  id: string;
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  lastEquity: number;
  dayTradeCount: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  costBasis: number;
}

export interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  filledQty: number;
  filledAvgPrice: number;
  submittedAt: string;
}

// Get account information
export async function getAccount(): Promise<AccountInfo> {
  const account = await alpaca.getAccount();
  return {
    id: account.id,
    equity: parseFloat(account.equity),
    cash: parseFloat(account.cash),
    buyingPower: parseFloat(account.buying_power),
    portfolioValue: parseFloat(account.portfolio_value),
    lastEquity: parseFloat(account.last_equity),
    dayTradeCount: account.daytrade_count,
  };
}

// Get all current positions
export async function getPositions(): Promise<Position[]> {
  const positions = await alpaca.getPositions();
  return positions.map((p: any) => ({
    symbol: p.symbol,
    qty: parseFloat(p.qty),
    avgEntryPrice: parseFloat(p.avg_entry_price),
    marketValue: parseFloat(p.market_value),
    currentPrice: parseFloat(p.current_price),
    unrealizedPL: parseFloat(p.unrealized_pl),
    unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
    costBasis: parseFloat(p.cost_basis),
  }));
}

// Check if we already hold a position
export async function hasPosition(symbol: string): Promise<boolean> {
  const positions = await getPositions();
  return positions.some(p => p.symbol === symbol);
}

// Submit a market order
export async function submitMarketOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell'
): Promise<Order> {
  const order = await alpaca.createOrder({
    symbol,
    qty,
    side,
    type: 'market',
    time_in_force: 'day',
  });

  return {
    id: order.id,
    symbol: order.symbol,
    qty: parseFloat(order.qty),
    side: order.side,
    type: order.type,
    status: order.status,
    filledQty: parseFloat(order.filled_qty || '0'),
    filledAvgPrice: parseFloat(order.filled_avg_price || '0'),
    submittedAt: order.submitted_at,
  };
}

// Submit a dollar amount order (buy $X worth of stock)
export async function submitDollarOrder(
  symbol: string,
  dollarAmount: number,
  side: 'buy' | 'sell'
): Promise<Order> {
  const order = await alpaca.createOrder({
    symbol,
    notional: dollarAmount,
    side,
    type: 'market',
    time_in_force: 'day',
  });

  return {
    id: order.id,
    symbol: order.symbol,
    qty: parseFloat(order.qty || '0'),
    side: order.side,
    type: order.type,
    status: order.status,
    filledQty: parseFloat(order.filled_qty || '0'),
    filledAvgPrice: parseFloat(order.filled_avg_price || '0'),
    submittedAt: order.submitted_at,
  };
}

// Get recent orders
export async function getOrders(status: 'open' | 'closed' | 'all' = 'all', limit = 50): Promise<Order[]> {
  const orders = await alpaca.getOrders({ status, limit });
  return orders.map((o: any) => ({
    id: o.id,
    symbol: o.symbol,
    qty: parseFloat(o.qty),
    side: o.side,
    type: o.type,
    status: o.status,
    filledQty: parseFloat(o.filled_qty || '0'),
    filledAvgPrice: parseFloat(o.filled_avg_price || '0'),
    submittedAt: o.submitted_at,
  }));
}

// Get portfolio history
export async function getPortfolioHistory(period: string = '1M'): Promise<{
  timestamps: number[];
  equity: number[];
  profitLoss: number[];
  profitLossPct: number[];
}> {
  const history = await alpaca.getPortfolioHistory({ period, timeframe: '1D' });
  return {
    timestamps: history.timestamp,
    equity: history.equity,
    profitLoss: history.profit_loss,
    profitLossPct: history.profit_loss_pct.map((p: number) => p * 100),
  };
}

// Get current price of a stock
export async function getLatestPrice(symbol: string): Promise<number> {
  const quote = await alpaca.getLatestQuote(symbol);
  return quote.AskPrice || quote.BidPrice || 0;
}

// Check if market is open
export async function isMarketOpen(): Promise<boolean> {
  const clock = await alpaca.getClock();
  return clock.is_open;
}

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    await getAccount();
    return true;
  } catch (error) {
    console.error('Alpaca connection failed:', error);
    return false;
  }
}

// Close an entire position (sell all shares)
export async function closePosition(symbol: string): Promise<Order | null> {
  try {
    const positions = await getPositions();
    const position = positions.find(p => p.symbol === symbol);
    if (!position || position.qty <= 0) {
      return null;
    }

    const order = await alpaca.createOrder({
      symbol,
      qty: position.qty,
      side: 'sell',
      type: 'market',
      time_in_force: 'day',
    });

    return {
      id: order.id,
      symbol: order.symbol,
      qty: parseFloat(order.qty || '0'),
      side: order.side,
      type: order.type,
      status: order.status,
      filledQty: parseFloat(order.filled_qty || '0'),
      filledAvgPrice: parseFloat(order.filled_avg_price || '0'),
      submittedAt: order.submitted_at,
    };
  } catch (error) {
    console.error(`Failed to close position ${symbol}:`, error);
    return null;
  }
}
