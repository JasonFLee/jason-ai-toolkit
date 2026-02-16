#!/bin/bash
#
# JASON'S AI TOOLKIT - COMPLETE NEW MACHINE SETUP
# Run this with Claude Code on your new MacBook
#
# This is the canonical build that gives you:
# - Always-on MacBook
# - SSH from anywhere (no ports exposed)
# - OpenClaw + Claude Code + DeepSeek R1
# - Agent Deck orchestration
# - All your bots and tools
# - iTerm + tmux for resilience
# - Tailscale for remote access
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=================================================="
echo "JASON'S AI TOOLKIT - NEW MACHINE SETUP"
echo "=================================================="
echo -e "${NC}"
echo "This will set up EVERYTHING on this MacBook."
echo ""
echo "What you'll get:"
echo "  ✓ Always-on Mac (no sleep)"
echo "  ✓ SSH via Tailscale (secure remote access)"
echo "  ✓ Claude Code + OpenClaw + DeepSeek R1"
echo "  ✓ Agent Deck orchestration"
echo "  ✓ All bots (MattBot, SUPost, InvestBot)"
echo "  ✓ All tools (LibGen downloader, Book Processor)"
echo "  ✓ iTerm2 + tmux for session management"
echo "  ✓ Dedicated agent user (security)"
echo ""
echo "Estimated time: 60-90 minutes"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Setup cancelled.${NC}"
    exit 1
fi

# ============================================
# PART A: MAKE MAC ALWAYS ON
# ============================================
echo ""
echo -e "${GREEN}[1/15] Making Mac always-on...${NC}"
sudo pmset -a sleep 0 displaysleep 0 disksleep 0
echo "✓ Sleep disabled"

# ============================================
# PART B: INSTALL HOMEBREW
# ============================================
echo ""
echo -e "${GREEN}[2/15] Installing Homebrew...${NC}"
if ! command -v brew &> /dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
fi
echo "✓ Homebrew installed"

# ============================================
# PART C: INSTALL TAILSCALE
# ============================================
echo ""
echo -e "${GREEN}[3/15] Installing Tailscale...${NC}"
brew install --cask tailscale 2>/dev/null || true
echo ""
echo -e "${YELLOW}⚠️  MANUAL STEP REQUIRED:${NC}"
echo "1. Open Tailscale from Applications"
echo "2. Sign in to your Tailscale account"
echo "3. Run: tailscale up --ssh"
echo ""
read -p "Press Enter when Tailscale is set up and running..."

# Get Tailscale IP for later
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

# ============================================
# PART D: SSH SETUP
# ============================================
echo ""
echo -e "${GREEN}[4/15] Setting up SSH (hardened)...${NC}"

# Enable SSH if not already
sudo systemsetup -setremotelogin on 2>/dev/null || true

# Generate SSH key if doesn't exist
if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
fi

# Copy key to localhost
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Harden SSH config
sudo tee -a /etc/ssh/sshd_config > /dev/null <<EOF

# ============================================
# Jason's AI Toolkit - Hardened SSH
# ============================================
PasswordAuthentication no
PermitRootLogin no
AllowUsers $(whoami) agent
EOF

# Lock SSH to Tailscale only if available
if [ -n "$TAILSCALE_IP" ]; then
    sudo tee -a /etc/ssh/sshd_config > /dev/null <<EOF
ListenAddress ${TAILSCALE_IP}
EOF
    echo "✓ SSH locked to Tailscale IP: ${TAILSCALE_IP}"
fi

# Restart SSH
sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd
echo "✓ SSH hardened"

# ============================================
# PART E: CREATE AGENT USER
# ============================================
echo ""
echo -e "${GREEN}[5/15] Creating dedicated agent user...${NC}"
echo "Enter a strong password for the 'agent' user:"
read -s AGENT_PASSWORD
echo ""

sudo sysadminctl -addUser agent -password "$AGENT_PASSWORD" -admin no 2>/dev/null || true
sudo createhomedir -c -u agent 2>/dev/null || true
echo "✓ Agent user created (non-admin)"

# ============================================
# PART F: INSTALL TERMINAL TOOLS
# ============================================
echo ""
echo -e "${GREEN}[6/15] Installing iTerm2 and tmux...${NC}"
brew install --cask iterm2 2>/dev/null || true
brew install tmux

# Create tmux config
cat > ~/.tmux.conf <<'TMUXEOF'
# Mouse support
set -g mouse on

# Split panes with | and -
bind | split-window -h
bind - split-window -v

# Easy config reload
bind r source-file ~/.tmux.conf

# Start windows at 1
set -g base-index 1
set -g pane-base-index 1

# Longer scrollback
set -g history-limit 50000

# Status bar
set -g status-style bg=black,fg=white
set -g status-right '#[fg=yellow]#(hostname -s) #[fg=white]%H:%M'
TMUXEOF

echo "✓ iTerm2 and tmux installed"

# ============================================
# PART G: CLONE TOOLKIT
# ============================================
echo ""
echo -e "${GREEN}[7/15] Cloning jason-ai-toolkit from GitHub...${NC}"
mkdir -p ~/projects
cd ~/projects

if [ -d "jason-ai-toolkit" ]; then
    echo "Toolkit already exists, pulling latest..."
    cd jason-ai-toolkit
    git pull
else
    git clone https://github.com/JasonFLee/jason-ai-toolkit.git
    cd jason-ai-toolkit
fi

echo "✓ Toolkit cloned to ~/projects/jason-ai-toolkit"

# ============================================
# PART H: RUN MASTER SETUP
# ============================================
echo ""
echo -e "${GREEN}[8/15] Running master setup (installs all dependencies)...${NC}"
echo "This will install: Python, Node, Calibre, and all bot dependencies"
echo ""

./scripts/install_dependencies.sh

# Setup Python environments
echo ""
echo "Setting up Python environments..."

# Book Processor
cd ~/projects/jason-ai-toolkit/tools/book-processor
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

# MattBot
cd ~/projects/jason-ai-toolkit/bots/mattbot
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

# SUPost Bot
cd ~/projects/jason-ai-toolkit/bots/supost-bot
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install pytest schedule -q
deactivate

# InvestBot
echo "Setting up InvestBot (Node.js)..."
cd ~/projects/jason-ai-toolkit/bots/investBot
npm install --silent

echo "✓ All bots configured"

# ============================================
# PART I: INSTALL CLAUDE CODE
# ============================================
echo ""
echo -e "${GREEN}[9/15] Installing Claude Code globally...${NC}"
npm install -g @anthropic-ai/claude-code

# Create symlink if needed
if [ ! -f /opt/homebrew/bin/claude ]; then
    ln -sf /opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js /opt/homebrew/bin/claude
    chmod +x /opt/homebrew/bin/claude
fi

echo "✓ Claude Code installed"
claude --version

# ============================================
# PART J: INSTALL OPENCLAW
# ============================================
echo ""
echo -e "${GREEN}[10/15] Installing OpenClaw...${NC}"
npm install -g openclaw

echo "✓ OpenClaw installed"
openclaw --version

# ============================================
# PART K: INSTALL OLLAMA + DEEPSEEK R1
# ============================================
echo ""
echo -e "${GREEN}[11/15] Installing Ollama and DeepSeek R1...${NC}"
brew install ollama
brew services start ollama

echo "Waiting for Ollama to start..."
sleep 5

echo "Pulling DeepSeek R1 8B model (this may take a few minutes)..."
ollama pull deepseek-r1:8b

echo "✓ Ollama + DeepSeek R1 installed"
ollama list

# ============================================
# PART L: DEPLOY OPENCLAW CONFIG
# ============================================
echo ""
echo -e "${GREEN}[12/15] Deploying OpenClaw configuration...${NC}"
mkdir -p ~/.openclaw

# Copy template
cp ~/projects/jason-ai-toolkit/configs/openclaw/openclaw.json.template ~/.openclaw/openclaw.json

# Generate random token
RANDOM_TOKEN=$(openssl rand -hex 32)
sed -i '' "s/GENERATE_NEW_TOKEN_ON_SETUP/$RANDOM_TOKEN/" ~/.openclaw/openclaw.json

# Expand ~ to full path
sed -i '' "s|~/.openclaw/workspace|$HOME/.openclaw/workspace|g" ~/.openclaw/openclaw.json

# Install and start OpenClaw gateway
openclaw gateway install
openclaw gateway start

echo "✓ OpenClaw configured and gateway started"
sleep 2
openclaw gateway status

# ============================================
# PART M: DEPLOY OTHER CONFIGS
# ============================================
echo ""
echo -e "${GREEN}[13/15] Deploying Agent Deck and Claude configs...${NC}"

# Agent Deck config
mkdir -p ~/.agent-deck
cp -r ~/projects/jason-ai-toolkit/configs/agent-deck/* ~/.agent-deck/

# Claude Desktop config
mkdir -p ~/Library/Application\ Support/Claude
if [ -f ~/projects/jason-ai-toolkit/configs/claude-desktop/claude_desktop_config.json ]; then
    cp ~/projects/jason-ai-toolkit/configs/claude-desktop/claude_desktop_config.json \
       ~/Library/Application\ Support/Claude/
fi

echo "✓ All configurations deployed"

# ============================================
# PART N: CREATE TMUX SESSIONS
# ============================================
echo ""
echo -e "${GREEN}[14/15] Creating tmux sessions...${NC}"

# Kill existing sessions if they exist
tmux kill-session -t claude 2>/dev/null || true
tmux kill-session -t agents 2>/dev/null || true
tmux kill-session -t bots 2>/dev/null || true

# Create new sessions
tmux new -d -s claude
tmux new -d -s agents
tmux new -d -s bots

echo "✓ Tmux sessions created: claude, agents, bots"

# ============================================
# PART O: SETUP ENVIRONMENT VARIABLES
# ============================================
echo ""
echo -e "${GREEN}[15/15] Setting up environment file...${NC}"

cd ~/projects/jason-ai-toolkit
cp .env.example .env

echo "✓ .env file created from template"

# ============================================
# FINAL SUMMARY
# ============================================
echo ""
echo -e "${GREEN}=================================================="
echo "SETUP COMPLETE! 🎉"
echo "==================================================${NC}"
echo ""
echo -e "${YELLOW}MANUAL STEPS REQUIRED:${NC}"
echo ""
echo "1. Configure API keys:"
echo "   cd ~/projects/jason-ai-toolkit"
echo "   nano .env"
echo "   Add: ANTHROPIC_API_KEY, GOOGLE credentials, etc."
echo ""
echo "2. Grant macOS permissions:"
echo "   System Settings → Privacy & Security"
echo "   - Accessibility: ✓ OpenClaw, iTerm"
echo "   - Screen Recording: ✓ OpenClaw"
echo "   - Input Monitoring: ✓ OpenClaw"
echo ""
echo "3. Run OAuth setup for Google bots:"
echo "   cd ~/projects/jason-ai-toolkit/bots/mattbot"
echo "   source venv/bin/activate"
echo "   python3 setup_oauth.py"
echo ""
echo "4. Start all services:"
echo "   cd ~/projects/jason-ai-toolkit"
echo "   ./scripts/start_all_services.sh"
echo ""
echo "5. Configure keep-awake on boot:"
echo "   System Settings → General → Login Items"
echo "   Add: caffeinate -dimsu"
echo ""
echo "6. Enable auto-login (optional):"
echo "   System Settings → Users & Groups → Login Options"
echo "   Enable: Automatic login"
echo ""
echo -e "${GREEN}VERIFICATION:${NC}"
echo ""
echo "Test Claude Code:"
echo "  tmux attach -t claude"
echo "  claude"
echo ""
echo "Test OpenClaw:"
echo "  openclaw doctor"
echo ""
echo "Test LibGen downloader:"
echo "  cd ~/projects/jason-ai-toolkit/tools/book-processor"
echo "  python3 libgen_downloader_v3_pdf_only.py 'Sapiens'"
echo ""
echo "Test MattBot:"
echo "  cd ~/projects/jason-ai-toolkit/bots/mattbot"
echo "  source venv/bin/activate"
echo "  python3 main.py"
echo ""
echo -e "${GREEN}TMUX QUICK REFERENCE:${NC}"
echo "  tmux ls                    # List sessions"
echo "  tmux attach -t claude      # Attach to session"
echo "  Ctrl+B then D              # Detach from session"
echo ""
echo -e "${GREEN}SSH ACCESS:${NC}"
if [ -n "$TAILSCALE_IP" ]; then
    echo "  ssh $(whoami)@${TAILSCALE_IP}"
    echo "  Or: ssh $(whoami)@$(hostname -s)"
else
    echo "  Configure Tailscale first, then:"
    echo "  ssh $(whoami)@macbook-name"
fi
echo ""
echo -e "${GREEN}INSTALLED:${NC}"
echo "  ✓ Always-on Mac (sleep disabled)"
echo "  ✓ SSH (hardened, keys-only)"
echo "  ✓ Tailscale (remote access)"
echo "  ✓ Agent user (security isolation)"
echo "  ✓ iTerm2 + tmux (session management)"
echo "  ✓ Claude Code (global)"
echo "  ✓ OpenClaw + DeepSeek R1"
echo "  ✓ All bots (MattBot, SUPost, InvestBot)"
echo "  ✓ All tools (LibGen, Book Processor)"
echo "  ✓ All configs (Agent Deck, OpenClaw, Claude)"
echo ""
echo -e "${GREEN}TOOLKIT LOCATION:${NC}"
echo "  ~/projects/jason-ai-toolkit"
echo ""
echo -e "${GREEN}DOCUMENTATION:${NC}"
echo "  ~/projects/jason-ai-toolkit/COMPLETE_SETUP.md"
echo "  ~/projects/jason-ai-toolkit/README.md"
echo ""
echo "=================================================="
echo ""
