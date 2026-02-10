# Quick Start Guide

Get Jason's AI Toolkit up and running in minutes.

## TL;DR

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/jason-ai-toolkit.git
cd jason-ai-toolkit

# Run setup
./scripts/setup_macos.sh

# Configure secrets
cp .env.example .env
# Edit .env with your API keys

# Start services
./scripts/start_all_services.sh
```

## Step-by-Step

### 1. Prerequisites Check

Before starting, ensure you have:
- macOS (10.15+)
- Admin access to install software
- Internet connection
- GitHub account (for pushing code)

### 2. Clone the Repository

```bash
cd ~/codingProjects  # or wherever you keep projects
git clone https://github.com/YOUR_USERNAME/jason-ai-toolkit.git
cd jason-ai-toolkit
```

### 3. Run Master Setup

This installs everything:

```bash
./scripts/setup_macos.sh
```

The script will:
- Install Homebrew (if needed)
- Install Python 3.11, Node.js, Git, Calibre
- Set up all Python virtual environments
- Install Node.js dependencies
- Deploy configuration files
- Install launchd services

**Time**: 10-15 minutes depending on internet speed

### 4. Configure API Keys

```bash
# Copy the template
cp .env.example .env

# Edit with your actual keys
nano .env  # or use your preferred editor
```

Required keys:
- `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/)
- `GOOGLE_CLIENT_ID/SECRET` - Get from [Google Cloud Console](https://console.cloud.google.com/)

Optional keys:
- `N8N_API_KEY` - If using n8n workflows
- `SMTP_*` - For email notifications (InvestBot)

### 5. Set Up Google OAuth (for bots)

#### Book Processor

```bash
cd tools/book-processor
source venv/bin/activate
python complete_oauth.py
```

Follow the prompts to authenticate with Google.

#### MattBot

```bash
cd bots/mattbot
source venv/bin/activate
python setup_oauth.py
```

### 6. Start Services

```bash
./scripts/start_all_services.sh
```

This loads the launchd services:
- Book Processor (runs every 6 hours)
- SUPost Bot (runs hourly)

### 7. Verify Everything Works

#### Check services are running

```bash
launchctl list | grep jasonlee
```

You should see:
- `com.jasonlee.book-processor`
- `com.jasonlee.supost-bot`

#### Check logs

```bash
# Book processor
tail -f tools/book-processor/logs/main.log

# SUPost bot
tail -f bots/supost-bot/bot.log
```

#### Test individual bots

```bash
# Book processor
cd tools/book-processor
./venv/bin/python main.py

# MattBot
cd bots/mattbot
./venv/bin/python main.py

# InvestBot
cd bots/investBot
npm start
```

## What's Next?

### Use the Tools

1. **Book Processor**: Add books to Google Tasks "To read" list
2. **MattBot**: It will automatically check for Matt Knight games
3. **SUPost Bot**: Monitors housing listings automatically
4. **InvestBot**: Run `npm start` for insider trading analysis

### Customize Configurations

Edit config files to customize behavior:
- `tools/book-processor/config.py` - Book processing settings
- `bots/mattbot/config.py` - Event tracking settings
- `bots/investBot/.env` - Email and alert settings

### Add More Tools

The toolkit is extensible. Add your own bots:

```bash
mkdir bots/my-new-bot
cd bots/my-new-bot
python3 -m venv venv
# Build your bot...
```

## Common First-Time Issues

### "Permission denied" when running scripts

```bash
chmod +x scripts/*.sh
```

### Python version mismatch

```bash
# Use Python 3.11+
python3 --version

# If wrong version
brew install python@3.11
```

### OAuth redirect URI mismatch

Make sure your Google Cloud Console has:
```
http://localhost:8080
```
as an authorized redirect URI.

### Services not starting

```bash
# Check plist files exist
ls ~/Library/LaunchAgents/com.jasonlee.*

# Check paths in plist files are correct
cat ~/Library/LaunchAgents/com.jasonlee.book-processor.plist
```

Paths should point to your actual toolkit location.

## Getting Help

1. Check the main [README.md](../README.md)
2. Read individual bot documentation in their folders
3. Review logs for error messages
4. Check [Troubleshooting](../README.md#troubleshooting) section

## Success Checklist

- [ ] All dependencies installed
- [ ] API keys configured in `.env`
- [ ] Google OAuth completed for bots that need it
- [ ] LaunchD services loaded
- [ ] Logs show successful runs (no errors)
- [ ] Individual bots tested manually

Once all checked, you're ready to go!
