# Jason's AI Toolkit

A comprehensive collection of AI-powered automation tools, bots, and configurations for rapid deployment on new machines. This repository packages everything needed to get Jason's AI/automation infrastructure running quickly.

## Table of Contents

- [Overview](#overview)
- [What's Included](#whats-included)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Documentation](#project-documentation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Overview

This toolkit contains:
- **Automation Bots**: Event trackers, housing search bots, investment analysis
- **AI Tools**: Book processing, libgen downloader, automated workflows
- **Agent Configurations**: Agent Deck, OpenClaw, Claude Desktop MCP servers
- **Setup Scripts**: One-command installation for macOS

## What's Included

### Bots (`/bots`)

1. **MattBot** - Matt Knight Event Tracker
   - Scrapes multiple sources for Matt Knight basketball game information
   - Sends Google Calendar notifications for upcoming games
   - Includes DuckDuckGo search, direct website scraping
   - Runs as macOS daemon

2. **SUPost Bot** - Stanford Housing Automator
   - Monitors SUPost.com housing listings
   - Filters by date, type, and keywords
   - Auto-sends personalized messages to relevant posts
   - Tracks sent messages to avoid duplicates
   - Runs hourly via launchd

3. **InvestBot** - Insider Trading Analysis
   - Monitors SEC Form 4, Congress STOCK Act, 13F/13D/13G filings
   - Calculates convergence scores when multiple insider types buy
   - Email alerts for top picks
   - Backtesting framework (100% positive alpha across 11 periods)
   - Node.js/TypeScript

### Tools (`/tools`)

1. **Book Processor**
   - Monitors Google Tasks "To read" list
   - Downloads books from Library Genesis (v3 downloader)
   - Generates 2-person podcast summaries
   - Converts to audiobook using Kokoro TTS
   - Uploads all to Google Drive in organized folders
   - Full state management and resume capability

### Configurations (`/configs`)

1. **Agent Deck** (`/configs/agent-deck`)
   - Default profiles and settings
   - MCP configurations
   - Global search settings

2. **OpenClaw** (`/configs/openclaw`)
   - Agent workspace configuration
   - Model settings (Ollama DeepSeek-R1)
   - Gateway and authentication setup

3. **Claude Desktop** (`/configs/claude-desktop`)
   - MCP server configurations
   - N8N MCP integration

### Setup Scripts (`/scripts`)

- `setup_macos.sh` - Full macOS setup
- `install_dependencies.sh` - Install Homebrew, Python, Node, etc.
- `setup_bots.sh` - Install all bots as launchd services
- `setup_configs.sh` - Deploy all configurations

## Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/jason-ai-toolkit.git
cd jason-ai-toolkit

# Run the complete setup (macOS)
./scripts/setup_macos.sh

# Or install components individually
./scripts/install_dependencies.sh  # Install prerequisites
./scripts/setup_bots.sh           # Install all bots
./scripts/setup_configs.sh        # Deploy configurations
```

## Prerequisites

### Required Software

- **macOS** (scripts designed for macOS, can be adapted for Linux)
- **Homebrew** - Package manager
- **Python 3.10+** - For Python-based tools
- **Node.js 18+** - For JavaScript-based tools
- **Git** - Version control

### Optional but Recommended

- **Calibre** - For EPUB to PDF conversion (book-processor)
- **Ollama** - For local LLM support (OpenClaw)
- **n8n** - For workflow automation (if using n8n MCP)

### API Keys & Credentials

You'll need to set up:
- **Google OAuth** - For Tasks, Calendar, Drive access
- **Anthropic API Key** - For Claude access
- **Email SMTP** - For notifications (optional)

## Installation

### 1. Install Prerequisites

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python, Node, Git
brew install python@3.11 node git

# Install Calibre (for book processing)
brew install --cask calibre

# Install Ollama (for local LLMs)
brew install ollama
```

### 2. Clone and Setup

```bash
git clone https://github.com/YOUR_USERNAME/jason-ai-toolkit.git
cd jason-ai-toolkit

# Run the master setup script
chmod +x scripts/*.sh
./scripts/setup_macos.sh
```

### 3. Configure Credentials

Each bot needs its own credentials. See individual bot documentation:

- **Book Processor**: Run OAuth setup for Google APIs
- **MattBot**: Configure Google Calendar OAuth
- **SUPost Bot**: No credentials needed (uses Claude Code)
- **InvestBot**: Configure SMTP for email alerts

### 4. Start Services

```bash
# Load all launchd services
launchctl load ~/Library/LaunchAgents/com.jasonlee.book-processor.plist
launchctl load ~/Library/LaunchAgents/com.jasonlee.supost-bot.plist

# Or use the helper script
./scripts/start_all_services.sh
```

## Project Documentation

### Bots

- [MattBot Documentation](bots/mattbot/README.md)
- [SUPost Bot Documentation](bots/supost-bot/README.md)
- [InvestBot Documentation](bots/investBot/README.md)

### Tools

- [Book Processor Documentation](tools/book-processor/README.md)
- [LibGen Downloader v3 Guide](tools/book-processor/LIBGEN_README.md)

### Configuration Guides

- [Agent Deck Setup](docs/AGENT_DECK_SETUP.md)
- [OpenClaw Configuration](docs/OPENCLAW_SETUP.md)
- [Claude Desktop MCP](docs/CLAUDE_DESKTOP_MCP.md)

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Anthropic
ANTHROPIC_API_KEY=your_api_key_here

# Google OAuth (for bots that need it)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Email (for investBot alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# N8N (if using)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your_n8n_api_key

# Optional
OPENAI_API_KEY=your_openai_key
```

### Customization

Each tool can be customized via its config file:

- **Book Processor**: Edit `tools/book-processor/config.py`
- **MattBot**: Edit `bots/mattbot/config.py`
- **InvestBot**: Edit `bots/investBot/.env`

## Troubleshooting

### Common Issues

**Python venv issues**
```bash
# Recreate virtual environment
cd tools/book-processor
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**LaunchD service not starting**
```bash
# Check service status
launchctl list | grep jasonlee

# View logs
tail -f ~/Library/LaunchAgents/*.log

# Reload service
launchctl unload ~/Library/LaunchAgents/com.jasonlee.SERVICENAME.plist
launchctl load ~/Library/LaunchAgents/com.jasonlee.SERVICENAME.plist
```

**OAuth authentication fails**
```bash
# Re-run OAuth setup
cd tools/book-processor
./venv/bin/python complete_oauth.py
```

**Port conflicts**
```bash
# Check what's using a port
lsof -i :5055
lsof -i :5678

# Kill process if needed
kill -9 <PID>
```

### Getting Help

1. Check individual project README files
2. Review logs in each project's `/logs` directory
3. Check launchd logs: `~/Library/LaunchAgents/*.log`

## Architecture

```
jason-ai-toolkit/
├── agents/              # Agent Deck agent profiles
├── bots/               # Automation bots
│   ├── mattbot/        # Matt Knight event tracker
│   ├── supost-bot/     # Stanford housing bot
│   └── investBot/      # Insider trading analyzer
├── tools/              # Standalone CLI tools
│   └── book-processor/ # Book download/process/upload
├── configs/            # Configuration templates
│   ├── agent-deck/     # Agent Deck config
│   ├── openclaw/       # OpenClaw config
│   └── claude-desktop/ # Claude Desktop MCP
├── scripts/            # Setup and utility scripts
├── docker/             # Docker configurations (optional)
└── docs/               # Additional documentation
```

## Tech Stack

- **Python 3.11+**: Book processor, MattBot, SUPost Bot
- **Node.js/TypeScript**: InvestBot
- **SQLite**: State management (book-processor)
- **Google APIs**: Tasks, Calendar, Drive integration
- **Anthropic Claude**: AI processing via API
- **macOS LaunchD**: Service scheduling and management

## Security Notes

- Never commit `.env` files or credentials
- Use `.env.example` templates instead
- OAuth tokens are stored locally and git-ignored
- Sensitive configs have `.example` suffixes

## Contributing

This is a personal toolkit, but feel free to:
1. Fork for your own use
2. Submit bug fixes
3. Suggest improvements

## License

MIT License - See LICENSE file

## Author

Jason Lee
- Personal AI/automation toolkit
- Built with Claude Code and Anthropic Claude

## Version History

- **v1.0.0** (2026-02-10): Initial release
  - MattBot, SUPost Bot, InvestBot, Book Processor
  - Agent Deck, OpenClaw, Claude Desktop configs
  - macOS setup scripts
