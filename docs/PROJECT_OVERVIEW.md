# Project Overview

Comprehensive documentation of all components in Jason's AI Toolkit.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Jason's AI Toolkit                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Automation  │  │  AI Tools    │  │  Configs     │  │
│  │    Bots      │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│        │                  │                  │           │
│        ├─ MattBot         ├─ Book Processor │           │
│        ├─ SUPost Bot      ├─ LibGen v3      ├─ Agent Deck│
│        └─ InvestBot       └─ PDF Tools      ├─ OpenClaw │
│                                              └─ Claude MCP│
└─────────────────────────────────────────────────────────┘
```

## Components

### Automation Bots (`/bots`)

#### 1. MattBot - Basketball Event Tracker

**Purpose**: Track Matt Knight's basketball games and send calendar notifications

**Technology**: Python 3.11, Google Calendar API

**Key Features**:
- Multi-source scraping (DuckDuckGo, direct websites)
- Basketball-america.com schedule parser
- Google Calendar integration
- Duplicate event prevention
- Scheduled runs via launchd

**Files**:
- `main.py` - Main orchestrator
- `config.py` - Configuration settings
- `scrapers/` - Various scrapers (DDG, direct sites)
- `services/` - Google Calendar integration
- `models/` - Data models

**Dependencies**:
- `requests` - HTTP requests
- `beautifulsoup4` - HTML parsing
- `google-api-python-client` - Calendar API
- `duckduckgo-search` - DDG search

**Usage**:
```bash
cd bots/mattbot
source venv/bin/activate
python main.py
```

**Runs**: Every hour via launchd

---

#### 2. SUPost Bot - Housing Listing Automator

**Purpose**: Monitor Stanford housing listings and auto-respond to relevant posts

**Technology**: Python 3.11, Claude Code, Chrome MCP

**Key Features**:
- Scrapes SUPost.com housing section
- Filters by date, keywords, and relevance
- Sends personalized messages
- Tracks sent posts to avoid duplicates
- Hourly execution via launchd

**Files**:
- `supost_bot.py` - Main bot logic
- `run_bot.sh` - Execution script
- `sent_posts.json` - Tracking database
- `test_supost_bot.py` - Test suite

**Dependencies**:
- `pytest` - Testing
- `schedule` - Task scheduling
- Claude Code - AI-powered browsing

**Usage**:
```bash
cd bots/supost-bot
./run_bot.sh
```

**Runs**: Every hour via launchd

---

#### 3. InvestBot - Insider Trading Analysis

**Purpose**: Analyze SEC filings for insider trading convergence signals

**Technology**: Node.js/TypeScript, LowDB

**Key Features**:
- Scrapes SEC Form 4, 13F, 13D/13G filings
- Monitors Congress STOCK Act disclosures
- Calculates convergence scores (0-100)
- Email alerts for top picks
- Backtesting framework

**Files**:
- `src/index.ts` - Main entry
- `src/scrapers/` - Data collection
- `src/analysis/` - Convergence algorithm
- `src/backtest/` - Strategy testing
- `src/email/` - Notifications

**Dependencies**:
- `typescript` - Type safety
- `lowdb` - JSON database
- `nodemailer` - Email
- `axios` - HTTP requests
- `vitest` - Testing

**Usage**:
```bash
cd bots/investBot
npm start
```

**Runs**: On-demand or via cron

**Performance**: 100% positive alpha across 11 backtested periods

---

### AI Tools (`/tools`)

#### 1. Book Processor - Automated Book Pipeline

**Purpose**: Download, process, and upload books automatically

**Technology**: Python 3.11, Google APIs, Kokoro TTS

**Pipeline**:
1. Monitor Google Tasks "To read" list
2. Download from Library Genesis (PDF/EPUB)
3. Generate 2-person podcast summary (open-notebook-project)
4. Convert to audiobook (pdf-narrator + Kokoro TTS)
5. Upload all to Google Drive

**Key Features**:
- Full state management (SQLite)
- Resume on interruption
- LibGen downloader v3 (PDF-first, EPUB→PDF conversion)
- Organized Google Drive structure
- Comprehensive logging

**Files**:
- `main.py` - Main orchestrator
- `libgen_downloader_v3_pdf_only.py` - Book downloader
- `state_manager.py` - State tracking
- `services/google_tasks_service.py` - Tasks integration
- `config.py` - Settings

**Dependencies**:
- `google-api-python-client` - Google APIs
- `requests` - HTTP
- `beautifulsoup4` - Parsing
- Calibre (`ebook-convert`) - EPUB→PDF
- pdf-narrator (external)
- open-notebook-project API (external)

**Usage**:
```bash
cd tools/book-processor
./venv/bin/python main.py
```

**Runs**: Every 6 hours via launchd

**External Dependencies**:
- `open-notebook-project` API at localhost:5055
- `pdf-narrator` installed at ~/codingProjects/pdf-narrator

---

### Configurations (`/configs`)

#### 1. Agent Deck Configuration

**Location**: `~/.agent-deck/`

**Purpose**: Multi-agent orchestration platform

**Files**:
- `config.toml` - Main configuration
- `profiles/` - Agent profiles

**Key Settings**:
- Default tool (claude)
- Global search (enabled)
- MCP server configurations
- Update checking

---

#### 2. OpenClaw Configuration

**Location**: `~/.openclaw/`

**Purpose**: Local/cloud LLM orchestration

**Files**:
- `openclaw.json` - Main config

**Key Settings**:
- Model: ollama/deepseek-r1:8b
- Workspace: ~/.openclaw/workspace
- Max concurrent: 4 agents, 8 subagents
- Gateway mode: local

**Models Supported**:
- Ollama (local): DeepSeek R1, Llama 3.1, Qwen 2.5
- Cloud: Anthropic Claude, OpenAI GPT

---

#### 3. Claude Desktop MCP

**Location**: `~/Library/Application Support/Claude/`

**Purpose**: Extend Claude Desktop with tools

**Configured Servers**:
- `n8n-mcp` - Workflow automation

**Available Servers**:
- Filesystem
- Brave Search
- GitHub
- Slack
- PostgreSQL
- Chrome Browser

---

## Data Flow

### Book Processor Flow

```
Google Tasks          LibGen              Podcast API
   │                   │                      │
   └──> Check new ──> Download ──> Extract ─┘
         books          PDF        text
                        │                      │
                        │              Generate podcast
                        │                      │
                        └───> Upload <─────────┘
                          Google Drive
                              │
                          ┌───┴────┐
                      Folder structure:
                      Books/
                      └── Book Title/
                          ├── book.pdf
                          ├── podcast.mp3
                          └── audiobook/
                              └── chapters...
```

### MattBot Flow

```
    DuckDuckGo        Direct Sites
         │                 │
         └───> Scrape ─────┘
               events
                 │
           Filter & Parse
                 │
        Check for duplicates
                 │
         Google Calendar API
                 │
           Create events
                 │
         Track notified IDs
```

### InvestBot Flow

```
   SEC EDGAR       Congress        Institutions
      │               │                 │
      └───> Scrape ───┴─────────────────┘
            Form 4, 13F, 13D/13G, STOCK Act
                      │
              Store in database
                      │
            Calculate convergence
               (0-100 score)
                      │
              ┌───────┴────────┐
              │                │
         Top picks         Historical
              │             backtest
         Email alert           │
                          Strategy
                          performance
```

## Scheduling

### LaunchD Services

All bots run as macOS launchd services:

| Service | Interval | Purpose |
|---------|----------|---------|
| book-processor | 6 hours | Process new books |
| supost-bot | 1 hour | Check housing listings |

**Control**:
```bash
# Start all
./scripts/start_all_services.sh

# Stop all
./scripts/stop_all_services.sh

# Check status
launchctl list | grep jasonlee
```

### Manual Execution

All bots can also run manually:

```bash
# Book processor
cd tools/book-processor && ./venv/bin/python main.py

# MattBot
cd bots/mattbot && ./venv/bin/python main.py

# SUPost bot
cd bots/supost-bot && ./run_bot.sh

# InvestBot
cd bots/investBot && npm start
```

## Technology Stack

### Languages
- **Python 3.11**: Book processor, MattBot, SUPost bot
- **TypeScript/Node.js**: InvestBot
- **Bash**: Setup scripts

### Frameworks & Libraries

**Python**:
- `google-api-python-client` - Google APIs
- `requests` - HTTP
- `beautifulsoup4` - HTML parsing
- `schedule` - Task scheduling
- `pytest` - Testing

**Node.js**:
- `typescript` - Type safety
- `lowdb` - JSON database
- `axios` - HTTP
- `nodemailer` - Email
- `vitest` - Testing

### APIs & Services
- **Anthropic Claude** - AI processing
- **Google APIs** - Tasks, Calendar, Drive
- **SEC EDGAR** - Financial filings
- **Library Genesis** - Book downloads
- **Kokoro TTS** - Text-to-speech

### Infrastructure
- **SQLite** - State management
- **LaunchD** - Service scheduling (macOS)
- **MCP** - Model Context Protocol
- **Ollama** - Local LLMs

## Security

### Secrets Management
- `.env` file for API keys (git-ignored)
- OAuth tokens stored locally
- Credentials never committed

### Git Ignore
- All `.env` files
- `token.json`, `credentials.json`
- Virtual environments
- Node modules
- Logs and databases

### Best Practices
- Use `.example` suffixes for config templates
- Environment variables for sensitive data
- OAuth for Google API access
- App passwords for SMTP

## Performance

### Resource Usage

**Book Processor**:
- Memory: ~100MB
- Disk: Varies (downloaded books)
- Network: Moderate (downloads)

**MattBot**:
- Memory: ~50MB
- Network: Low (web scraping)

**SUPost Bot**:
- Memory: ~50MB
- Network: Low (web scraping)

**InvestBot**:
- Memory: ~80MB
- Network: Moderate (SEC data)

### Optimization
- State management for resumability
- Duplicate prevention
- Rate limiting on external APIs
- Efficient scraping patterns

## Testing

### Unit Tests
- **SUPost Bot**: `pytest test_supost_bot.py`
- **InvestBot**: `npm test`

### Integration Tests
- Manual test runs
- Log monitoring
- Service status checks

### Backtesting
- **InvestBot**: Historical performance analysis
- 11 periods tested
- 100% positive alpha
- Hypothetical $100K → $342K

## Deployment

### New Machine Setup
1. Clone repository
2. Run `./scripts/setup_macos.sh`
3. Configure `.env`
4. Run OAuth setups
5. Start services

**Time**: ~15 minutes

### Updates
```bash
git pull
./scripts/setup_macos.sh  # Re-run setup
./scripts/stop_all_services.sh
./scripts/start_all_services.sh
```

## Monitoring

### Logs

Each component logs to its own directory:

- Book processor: `tools/book-processor/logs/`
- MattBot: `bots/mattbot/logs/`
- SUPost bot: `bots/supost-bot/bot.log`
- InvestBot: `bots/investBot/logs/`

### Status Checks

```bash
# Service status
launchctl list | grep jasonlee

# Recent logs
tail -f tools/book-processor/logs/main.log

# Database state
cd tools/book-processor
./venv/bin/python -c "from state_manager import StateManager; sm = StateManager('data/state.db'); print([b.title for b in sm.get_all_books()])"
```

## Future Enhancements

### Planned Features
- Docker containerization
- Linux support
- Web dashboard
- More bots (job applications, research tracking)
- Telegram notifications
- More MCP integrations

### Potential Improvements
- Centralized logging
- Monitoring dashboard
- Health checks
- Auto-recovery
- Metrics collection

## Contributing

This is a personal toolkit, but:
- Bug fixes welcome
- Suggestions appreciated
- Forks encouraged

## License

MIT License - See LICENSE file

---

**Last Updated**: 2026-02-10
**Version**: 1.0.0
