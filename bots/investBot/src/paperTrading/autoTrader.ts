import {
  getAccount,
  getPositions,
  hasPosition,
  submitDollarOrder,
  isMarketOpen,
  getLatestPrice,
} from './alpacaClient';

export interface TradeResult {
  success: boolean;
  symbol: string;
  action: 'buy' | 'sell' | 'skip';
  reason: string;
  amount?: number;
  shares?: number;
  price?: number;
}

// Configuration
const CONFIG = {
  MAX_POSITION_PERCENT: 0.10,  // Max 10% of portfolio per position
  MIN_CASH_RESERVE: 1000,      // Keep $1000 minimum cash
  MAX_POSITIONS: 20,           // Maximum number of positions
};

// Execute a buy for a pick
export async function executePick(
  ticker: string,
  confidence: number = 80
): Promise<TradeResult> {
  try {
    // Check if market is open
    const marketOpen = await isMarketOpen();
    if (!marketOpen) {
      return {
        success: false,
        symbol: ticker,
        action: 'skip',
        reason: 'Market is closed',
      };
    }

    // Check if we already hold this stock
    if (await hasPosition(ticker)) {
      return {
        success: false,
        symbol: ticker,
        action: 'skip',
        reason: 'Already holding this position',
      };
    }

    // Get account info
    const account = await getAccount();
    const positions = await getPositions();

    // Check position limit
    if (positions.length >= CONFIG.MAX_POSITIONS) {
      return {
        success: false,
        symbol: ticker,
        action: 'skip',
        reason: `Max positions reached (${CONFIG.MAX_POSITIONS})`,
      };
    }

    // Calculate position size (10% of equity, adjusted by confidence)
    const confidenceMultiplier = Math.min(confidence / 100, 1);
    const maxPositionSize = account.equity * CONFIG.MAX_POSITION_PERCENT;
    const positionSize = maxPositionSize * confidenceMultiplier;

    // Check available cash
    const availableCash = account.cash - CONFIG.MIN_CASH_RESERVE;
    if (availableCash < positionSize) {
      if (availableCash < 100) {
        return {
          success: false,
          symbol: ticker,
          action: 'skip',
          reason: 'Insufficient cash',
        };
      }
      // Use what's available
    }

    const tradeAmount = Math.min(positionSize, availableCash);

    // Get current price for logging
    const currentPrice = await getLatestPrice(ticker);

    // Submit the order
    console.log(`  Buying $${tradeAmount.toFixed(2)} of ${ticker} @ ~$${currentPrice.toFixed(2)}`);
    const order = await submitDollarOrder(ticker, tradeAmount, 'buy');

    return {
      success: true,
      symbol: ticker,
      action: 'buy',
      reason: `Order submitted: ${order.status}`,
      amount: tradeAmount,
      price: currentPrice,
      shares: order.qty,
    };
  } catch (error: any) {
    // Handle specific Alpaca errors
    let reason = error.message;
    if (error.response?.status === 422 || error.message?.includes('422')) {
      reason = 'Stock not tradeable on Alpaca (OTC/delisted/restricted)';
    } else if (error.response?.status === 403) {
      reason = 'Forbidden - check API permissions';
    }

    return {
      success: false,
      symbol: ticker,
      action: 'skip',
      reason,
    };
  }
}

// Execute multiple picks
export async function executePicks(
  picks: Array<{ ticker: string; confidence?: number }>
): Promise<TradeResult[]> {
  const results: TradeResult[] = [];

  for (const pick of picks) {
    const result = await executePick(pick.ticker, pick.confidence || 80);
    results.push(result);

    // Small delay between orders
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

// Sell a position
export async function sellPosition(
  ticker: string,
  reason: string = 'Manual sell'
): Promise<TradeResult> {
  try {
    const marketOpen = await isMarketOpen();
    if (!marketOpen) {
      return {
        success: false,
        symbol: ticker,
        action: 'skip',
        reason: 'Market is closed',
      };
    }

    const positions = await getPositions();
    const position = positions.find(p => p.symbol === ticker);

    if (!position) {
      return {
        success: false,
        symbol: ticker,
        action: 'skip',
        reason: 'No position found',
      };
    }

    const order = await submitDollarOrder(ticker, position.marketValue, 'sell');

    return {
      success: true,
      symbol: ticker,
      action: 'sell',
      reason,
      amount: position.marketValue,
      shares: position.qty,
      price: position.currentPrice,
    };
  } catch (error: any) {
    return {
      success: false,
      symbol: ticker,
      action: 'skip',
      reason: `Error: ${error.message}`,
    };
  }
}
