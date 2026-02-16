# Complete Setup Guide - Jason's AI Toolkit on New MacBook

**Canonical build for always-on MacBook with remote access**

This setup gives you:
- ✅ Always-on MacBook (SSH from anywhere)
- ✅ OpenClaw + Claude Code + DeepSeek R1
- ✅ Agent Deck orchestration
- ✅ All your bots and tools
- ✅ iTerm + tmux for resilience
- ✅ Tailscale for secure remote access

---

## PART A — Pre-Setup: Make Mac Always On

### 1. Disable sleep
```bash
sudo pmset -a sleep 0 displaysleep 0 disksleep 0
```

**In System Settings:**
- Battery → Low Power Mode: OFF
- Battery → Put hard disks to sleep: OFF

### 2. Keep-awake failsafe
```bash
brew install caffeinate
```

**Add to Login Items:**
```bash
open /System/Applications/System\ Settings.app
# Go to: General → Login Items
# Add: caffeinate -dimsu
```

### 3. Auto-login after reboot
**System Settings → Users & Groups → Login Options**
- Enable "Automatic login" for your user

---

## PART B — SSH Setup (Local + Tailscale)

### 4. Enable SSH
**System Settings → General → Sharing**
- Enable "Remote Login" (your user only)

**Verify:**
```bash
ssh localhost
```

### 5. SSH keys only (harden)
```bash
# Generate key
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

# Copy to localhost
ssh-copy-id $(whoami)@localhost

# Harden SSH config
sudo tee -a /etc/ssh/sshd_config <<EOF

# Hardened SSH
PasswordAuthentication no
PermitRootLogin no
AllowUsers $(whoami) agent
EOF

# Restart SSH
sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd
```

---

## PART C — Tailscale (Remote Access)

### 6. Install Tailscale
```bash
brew install --cask tailscale
tailscale up --ssh
```

**Get your Tailscale IP:**
```bash
tailscale ip -4
```

**SSH from anywhere:**
```bash
ssh $(whoami)@macbook-name
```

### 7. Lock SSH to Tailscale only (recommended)
```bash
# Get Tailscale IP
TAILSCALE_IP=$(tailscale ip -4)

# Edit SSH config
sudo tee -a /etc/ssh/sshd_config <<EOF
ListenAddress ${TAILSCALE_IP}
EOF

# Restart SSH
sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd
```

---

## PART D — Dedicated Agent User (Critical)

### 8. Create agent account
```bash
# Create user
sudo sysadminctl -addUser agent -password "CHANGEME_STRONG_PASSWORD" -admin no

# Create home directory if needed
sudo createhomedir -c -u agent
```

**Purpose:**
- Run OpenClaw as `agent`
- Keep personal account clean

### 9. macOS Permissions (minimum required)
**System Settings → Privacy & Security**

Grant to apps that need it:
- ✅ Accessibility (OpenClaw, iTerm)
- ✅ Screen Recording (OpenClaw)
- ✅ Input Monitoring (OpenClaw)
- ❌ Do NOT give Full Disk Access

### 10. Separate browser profile
**For OpenClaw:**
- Create new Chrome/Edge profile
- No saved passwords
- No personal Google account
- Used only by OpenClaw

---

## PART E — Terminal + Session Control

### 11. Install iTerm2
```bash
brew install --cask iterm2
```

**Recommended settings:**
- Preferences → Profiles → Terminal → Unlimited scrollback: ON
- Preferences → General → tmux → tmux integration: ON

### 12. Install tmux (mandatory)
```bash
brew install tmux

# Create tmux config
cat > ~/.tmux.conf <<'EOF'
# Enable mouse
set -g mouse on

# Split panes with | and -
bind | split-window -h
bind - split-window -v

# Easy config reload
bind r source-file ~/.tmux.conf

# Start windows at 1
set -g base-index 1
EOF
```

**Create persistent sessions:**
```bash
# Claude Code session
tmux new -s claude

# Agents session
tmux new -s agents

# Bots session
tmux new -s bots
```

---

## PART F — Clone Your Toolkit

### 13. Clone jason-ai-toolkit
```bash
# Create projects directory
mkdir -p ~/projects
cd ~/projects

# Clone the repo
git clone https://github.com/JasonFLee/jason-ai-toolkit.git
cd jason-ai-toolkit
```

---

## PART G — Run Master Setup Script

### 14. Install everything
```bash
# This installs:
# - Homebrew dependencies
# - Python/Node environments
# - All bots
# - All tools
# - Configurations
./scripts/setup_macos.sh
```

**What this does:**
1. Installs Homebrew, Python 3, Node.js, Git, Calibre
2. Sets up Python venvs for all bots
3. Installs npm packages for InvestBot
4. Deploys configs to:
   - `~/.agent-deck/`
   - `~/.openclaw/`
   - `~/Library/Application Support/Claude/`
5. Installs LaunchD services for bots

---

## PART H — Configure API Keys & Secrets

### 15. Set up environment variables
```bash
cd ~/projects/jason-ai-toolkit

# Copy template
cp .env.example .env

# Edit with your keys
nano .env
```

**Required keys:**
```bash
# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-api03-...

# Google OAuth (get from console.cloud.google.com)
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# Email for alerts
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
ALERT_EMAIL=your_email@gmail.com

# OpenAI (optional)
OPENAI_API_KEY=sk-...
```

### 16. Run OAuth setup (for Google-dependent bots)
```bash
# MattBot
cd ~/projects/jason-ai-toolkit/bots/mattbot
source venv/bin/activate
python3 setup_oauth.py
deactivate

# Book Processor
cd ~/projects/jason-ai-toolkit/tools/book-processor
source venv/bin/activate
# Run OAuth setup when prompted
deactivate
```

---

## PART I — Claude Code

### 17. Install Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

**Verify:**
```bash
claude --version
```

### 18. Run Claude Code in tmux
```bash
# Attach to claude session
tmux attach -t claude

# Start Claude Code
claude
```

**Purpose:** Planning, refactors, repo reasoning
**NOT for:** Direct OS control (use OpenClaw for that)

---

## PART J — OpenClaw Setup

### 19. Install OpenClaw
```bash
npm install -g openclaw
```

### 20. Configure OpenClaw
```bash
# Run setup wizard
openclaw onboard

# Or manually configure
openclaw configure
```

**Set model to DeepSeek R1:**
```bash
# Edit config
nano ~/.openclaw/openclaw.json
```

Set:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "ollama/deepseek-r1:8b"
      }
    }
  }
}
```

### 21. Install DeepSeek R1 (via Ollama)
```bash
# Install Ollama
brew install ollama

# Start Ollama service
brew services start ollama

# Pull DeepSeek R1 8B
ollama pull deepseek-r1:8b

# Verify
ollama list
```

### 22. Start OpenClaw Gateway
```bash
# Install service
openclaw gateway install

# Start
openclaw gateway start

# Verify
openclaw gateway status
```

---

## PART K — Agent Deck (Optional)

### 23. Install Agent Deck
```bash
brew tap chrisbutler/agent-deck
brew install agent-deck

# Or download from:
# https://github.com/chrisbutler/agent-deck/releases
```

### 24. Run Agent Deck
```bash
# Attach to agents session
tmux attach -t agents

# Start Agent Deck
agent-deck
```

**Config is already deployed at:** `~/.agent-deck/config.toml`

---

## PART L — Start All Services

### 25. Start all bots
```bash
cd ~/projects/jason-ai-toolkit
./scripts/start_all_services.sh
```

**This starts:**
- MattBot (event tracker)
- SUPost Bot (housing monitor)
- InvestBot (insider trading)
- Book Processor (pipeline)

### 26. Verify services are running
```bash
# Check LaunchD services
launchctl list | grep jasonlee

# Check specific service
launchctl list com.jasonlee.mattbot
launchctl list com.jasonlee.book-processor

# View logs
tail -f ~/projects/jason-ai-toolkit/bots/mattbot/logs/mattbot_*.log
tail -f ~/projects/jason-ai-toolkit/tools/book-processor/logs/main.log
```

---

## PART M — Final Verification

### 27. Test each component

**Claude Code:**
```bash
tmux attach -t claude
claude
# Ask: "What's the weather?" to test API
```

**OpenClaw:**
```bash
openclaw doctor
# Should show: Gateway running, Model connected
```

**MattBot:**
```bash
cd ~/projects/jason-ai-toolkit/bots/mattbot
source venv/bin/activate
python3 main.py
# Should search for events
```

**LibGen Downloader:**
```bash
cd ~/projects/jason-ai-toolkit/tools/book-processor
python3 libgen_downloader_v3_pdf_only.py "Sapiens"
# Should download PDF
```

---

## PART N — What NOT to Do

❌ **Don't expose port 22 publicly**
❌ **Don't run OpenClaw as admin**
❌ **Don't use personal browser profile for OpenClaw**
❌ **Don't let agents run outside tmux**
❌ **Don't skip the dedicated agent user**
❌ **Don't commit API keys to git**

---

## Quick Reference

### Service Management
```bash
# Start all
./scripts/start_all_services.sh

# Stop all
./scripts/stop_all_services.sh

# Restart specific service
launchctl stop com.jasonlee.mattbot
launchctl start com.jasonlee.mattbot
```

### Tmux Sessions
```bash
# List sessions
tmux ls

# Attach to session
tmux attach -t claude
tmux attach -t agents
tmux attach -t bots

# Create new session
tmux new -s newsession

# Detach (while in session)
Ctrl+B then D
```

### SSH Access
```bash
# From another device on Tailscale
ssh $(whoami)@macbook-name

# Or using Tailscale IP
ssh $(whoami)@100.x.x.x
```

### Logs
```bash
# MattBot
tail -f ~/projects/jason-ai-toolkit/bots/mattbot/logs/*.log

# Book Processor
tail -f ~/projects/jason-ai-toolkit/tools/book-processor/logs/main.log

# OpenClaw Gateway
tail -f ~/.openclaw/logs/gateway.log

# Claude Code (if logging enabled)
tail -f ~/.claude/logs/*.log
```

---

## Troubleshooting

### Services not starting
```bash
# Check LaunchD errors
launchctl list | grep jasonlee
launchctl print gui/$(id -u)/com.jasonlee.mattbot

# Check logs
cat ~/projects/jason-ai-toolkit/bots/mattbot/logs/stderr.log
```

### OpenClaw can't connect
```bash
# Restart gateway
openclaw gateway restart

# Check Ollama
ollama list
ollama ps

# Restart Ollama
brew services restart ollama
```

### SSH not working
```bash
# Check SSH service
sudo launchctl list | grep ssh

# Check SSH config
sudo cat /etc/ssh/sshd_config | grep -E "Allow|Listen"

# Restart SSH
sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd
```

---

## Estimated Setup Time

- **Basic setup (A-F)**: 15-20 min
- **Toolkit install (G)**: 10-15 min
- **API configuration (H)**: 5-10 min
- **Claude + OpenClaw (I-J)**: 10-15 min
- **Verification (M)**: 5-10 min

**Total: 45-70 minutes**

---

## Next Steps (Optional)

Want to add:
- ✅ **Auto-start Agent Deck on boot**
- ✅ **Nightly agent account reset**
- ✅ **Read-only project mounts**
- ✅ **Command allow/deny lists**
- ✅ **Snapshot rollback**

Let me know which one!

---

**Version**: 1.0.0
**Last Updated**: 2026-02-16
**Repository**: https://github.com/JasonFLee/jason-ai-toolkit
