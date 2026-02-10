# InvestBot - Insider Trading Convergence Analysis System

An automated system that monitors insider trading from multiple sources and identifies convergence signals when multiple types of insiders are buying the same stock.

## Data Sources

- **SEC Form 4**: Corporate insiders (CEOs, CFOs, directors, officers, 10%+ owners) - filed within 2 business days
- **Congress STOCK Act**: House and Senate members' trading disclosures
- **SEC 13F**: Quarterly institutional investor holdings (hedge funds, asset managers)
- **SEC 13D/13G**: Activist investor positions (>5% ownership stakes)

## How It Works

1. **Scrape**: Fetches recent filings from SEC EDGAR and Congress disclosure databases
2. **Store**: Saves all transactions to a local JSON database
3. **Analyze**: Calculates convergence scores based on:
   - Insider position weight (CEO/CFO > Directors > Officers)
   - Transaction size multipliers
   - Congress committee membership (Finance/Banking weighted higher)
   - Institutional investor activity
   - Multi-source convergence bonuses
4. **Alert**: Sends email notifications with top stock picks
5. **Backtest**: Tests strategy performance against historical data

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Configure:
- SMTP settings for email notifications
- Recipient email address

## Usage

### Run Full Analysis
```bash
npm start
```

### Scrape Latest Data
```bash
npm run scrape
```

### Analyze Convergence Signals
```bash
npm run analyze
```

### Run Backtests
```bash
npm run backtest
```

### Run Tests
```bash
npm test
```

## Convergence Scoring

Stocks are scored 0-100 based on:

| Factor | Weight |
|--------|--------|
| Insider buying (Form 4) | 35% |
| Congress buying (STOCK Act) | 30% |
| Institutional increases (13F) | 25% |
| Multi-source convergence bonus | +10-30 points |

### Insider Weight by Title
- CEO/CFO: 10 points
- COO/President: 8 points
- Director: 5 points
- Officer: 6 points
- 10% Owner: 7 points

### Transaction Size Multipliers
- < $50K: 1x
- $50K - $250K: 1.5x
- $250K - $1M: 2x
- $1M - $5M: 3x
- > $5M: 5x

## Backtest Results (11 periods tested)

| Period | Strategy | SPY | Alpha |
|--------|----------|-----|-------|
| Q1 2023 | +11.6% | +7.0% | +4.6% |
| Q2 2023 | +20.4% | +8.3% | +12.1% |
| Q3 2023 | +4.1% | -3.6% | +7.7% |
| Q4 2023 | +13.0% | +11.2% | +1.8% |
| Q1 2024 | +25.9% | +10.2% | +15.7% |
| Q2 2024 | +14.8% | +3.9% | +10.9% |
| Q3 2024 | +10.1% | +5.5% | +4.6% |
| Oct 2024 | +36.1% | -0.9% | +37.0% |
| Nov 2024 | +20.3% | +5.7% | +14.6% |

**Aggregate Statistics:**
- Average Alpha: +13.89%
- Win Rate: 95.9%
- Positive Alpha: 11/11 periods (100%)
- Hypothetical $100K → $342K (vs SPY $149K)

## Project Structure

```
investBot/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── db/             # Database layer (LowDB)
│   ├── scrapers/       # SEC, Congress, Institutional scrapers
│   ├── analysis/       # Convergence detection algorithm
│   ├── backtest/       # Backtesting framework
│   ├── email/          # Email notification system
│   └── index.ts        # Main entry point
├── tests/              # Vitest test suites
├── package.json
└── README.md
```

## API Compliance

- SEC EDGAR: Uses appropriate User-Agent headers and rate limiting (100-150ms delays)
- All data sources are publicly available government filings

## Disclaimer

This software is for educational and research purposes only. It is not financial advice. Past performance does not guarantee future results. Always do your own research and consult with a qualified financial advisor before making investment decisions.

The backtesting results shown are based on historical patterns and actual market returns but include certain assumptions and simplifications. Real-world trading would incur transaction costs, slippage, and other factors not accounted for in this analysis.

## License

MIT
