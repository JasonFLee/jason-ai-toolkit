# Setup on New MacBook - Single Copy-Paste

## 🚀 Quick Start (One Command)

On your **new MacBook**, open Terminal and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/JasonFLee/jason-ai-toolkit/master/QUICK_COPY_PASTE.sh)"
```

**That's it!** This will:
- ✅ Make Mac always-on
- ✅ Install Homebrew, iTerm2, tmux
- ✅ Set up SSH + Tailscale
- ✅ Clone the toolkit
- ✅ Install all bots and tools
- ✅ Install Claude Code + OpenClaw
- ✅ Install Ollama + DeepSeek R1
- ✅ Deploy all configurations

**Time: ~45-70 minutes** (mostly automated)

---

## 📋 Manual Steps After Script

After the script completes, you need to:

### 1. Add Your API Keys
```bash
cd ~/projects/jason-ai-toolkit
cp .env.example .env
nano .env  # Add your keys
```

### 2. Run OAuth Setup (for Google bots)
```bash
cd ~/projects/jason-ai-toolkit/bots/mattbot
source venv/bin/activate
python3 setup_oauth.py
deactivate
```

### 3. Grant macOS Permissions
**System Settings → Privacy & Security:**
- Accessibility: ✅ OpenClaw, iTerm
- Screen Recording: ✅ OpenClaw
- Input Monitoring: ✅ OpenClaw

### 4. Start All Services
```bash
cd ~/projects/jason-ai-toolkit
./scripts/start_all_services.sh
```

### 5. Verify Everything Works
```bash
# Test Claude Code
tmux attach -t claude
claude

# Test OpenClaw
openclaw doctor

# Test a bot
cd ~/projects/jason-ai-toolkit/bots/mattbot
source venv/bin/activate
python3 main.py

# Test LibGen downloader
cd ~/projects/jason-ai-toolkit/tools/book-processor
python3 libgen_downloader_v3_pdf_only.py "Sapiens"
```

---

## 📖 Full Documentation

- **Complete Setup Guide**: [COMPLETE_SETUP.md](./COMPLETE_SETUP.md)
- **Main README**: [README.md](./README.md)
- **Quick Start**: [docs/QUICK_START.md](./docs/QUICK_START.md)

---

## 🔒 What's Included

### Bots
- **MattBot** - Event tracker with Google Calendar
- **SUPost Bot** - Stanford housing automator
- **InvestBot** - Insider trading analyzer

### Tools
- **Book Processor** - LibGen → Podcast → Audiobook → Drive
- **LibGen Downloader v3** - PDF-first with EPUB conversion

### Configurations
- **Agent Deck** - Multi-agent orchestration
- **OpenClaw** - Local LLM management (DeepSeek R1)
- **Claude Desktop** - MCP server configs

### Scripts
- **setup_macos.sh** - Master setup
- **start_all_services.sh** - Start all bots
- **stop_all_services.sh** - Stop all bots

---

## 🛠️ Troubleshooting

### Script fails during installation
```bash
# Re-run just the toolkit setup
cd ~/projects/jason-ai-toolkit
./scripts/setup_macos.sh
```

### Services won't start
```bash
# Check LaunchD
launchctl list | grep jasonlee

# View logs
tail -f ~/projects/jason-ai-toolkit/bots/mattbot/logs/*.log
```

### OpenClaw can't connect
```bash
# Restart gateway
openclaw gateway restart

# Check Ollama
ollama ps
brew services restart ollama
```

---

## 📞 Support

- **Repository**: https://github.com/JasonFLee/jason-ai-toolkit
- **Issues**: https://github.com/JasonFLee/jason-ai-toolkit/issues

---

**Version**: 1.0.1
**Last Updated**: 2026-02-16
