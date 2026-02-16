#!/bin/bash
# Jason's AI Toolkit - Single Copy-Paste Setup
# Run this on your new MacBook

set -e

echo "=================================================="
echo "Jason's AI Toolkit - Quick Setup"
echo "=================================================="
echo ""
echo "This will set up EVERYTHING on this new Mac."
echo "Estimated time: 45-70 minutes"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 1
fi

# ============================================
# PART A: Make Mac Always On
# ============================================
echo ""
echo "==> Making Mac always-on..."
sudo pmset -a sleep 0 displaysleep 0 disksleep 0

# ============================================
# PART B: Install Homebrew
# ============================================
echo ""
echo "==> Installing Homebrew (if not installed)..."
if ! command -v brew &> /dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ============================================
# PART C: Install Tailscale
# ============================================
echo ""
echo "==> Installing Tailscale..."
brew install --cask tailscale || true
echo "⚠️  MANUAL STEP: Open Tailscale and run: tailscale up --ssh"
echo "Press Enter when done..."
read

# ============================================
# PART D: SSH Setup
# ============================================
echo ""
echo "==> Setting up SSH..."
if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
fi
ssh-copy-id $(whoami)@localhost || true

# Harden SSH
sudo tee -a /etc/ssh/sshd_config > /dev/null <<EOF

# Hardened SSH - Added by jason-ai-toolkit
PasswordAuthentication no
PermitRootLogin no
AllowUsers $(whoami) agent
EOF

sudo launchctl stop com.openssh.sshd
sudo launchctl start com.openssh.sshd

# ============================================
# PART E: Create Agent User
# ============================================
echo ""
echo "==> Creating agent user..."
echo "Enter a strong password for the 'agent' user:"
read -s AGENT_PASSWORD
sudo sysadminctl -addUser agent -password "$AGENT_PASSWORD" -admin no || true
sudo createhomedir -c -u agent || true

# ============================================
# PART F: Install Terminal Tools
# ============================================
echo ""
echo "==> Installing iTerm2 and tmux..."
brew install --cask iterm2 || true
brew install tmux

# Create tmux config
cat > ~/.tmux.conf <<'TMUXEOF'
set -g mouse on
bind | split-window -h
bind - split-window -v
bind r source-file ~/.tmux.conf
set -g base-index 1
TMUXEOF

# ============================================
# PART G: Clone Toolkit
# ============================================
echo ""
echo "==> Cloning jason-ai-toolkit..."
mkdir -p ~/projects
cd ~/projects

if [ ! -d "jason-ai-toolkit" ]; then
    git clone https://github.com/JasonFLee/jason-ai-toolkit.git
fi

cd jason-ai-toolkit

# ============================================
# PART H: Run Master Setup
# ============================================
echo ""
echo "==> Running master setup script..."
./scripts/setup_macos.sh

# ============================================
# PART I: Install Claude Code
# ============================================
echo ""
echo "==> Installing Claude Code..."
npm install -g @anthropic-ai/claude-code

# ============================================
# PART J: Install OpenClaw
# ============================================
echo ""
echo "==> Installing OpenClaw..."
npm install -g openclaw

# ============================================
# PART K: Install Ollama + DeepSeek R1
# ============================================
echo ""
echo "==> Installing Ollama and DeepSeek R1..."
brew install ollama
brew services start ollama
sleep 5
ollama pull deepseek-r1:8b

# ============================================
# PART L: Deploy OpenClaw Config
# ============================================
echo ""
echo "==> Deploying OpenClaw config..."
mkdir -p ~/.openclaw
cp configs/openclaw/openclaw.json.template ~/.openclaw/openclaw.json

# Generate random token
RANDOM_TOKEN=$(openssl rand -hex 32)
sed -i '' "s/GENERATE_NEW_TOKEN_ON_SETUP/$RANDOM_TOKEN/" ~/.openclaw/openclaw.json

# Install and start gateway
openclaw gateway install
openclaw gateway start

# ============================================
# PART M: Create Tmux Sessions
# ============================================
echo ""
echo "==> Creating tmux sessions..."
tmux new -d -s claude
tmux new -d -s agents
tmux new -d -s bots

# ============================================
# PART N: Configure API Keys
# ============================================
echo ""
echo "=================================================="
echo "Setup Complete (95%)!"
echo "=================================================="
echo ""
echo "MANUAL STEPS REQUIRED:"
echo ""
echo "1. Configure API keys:"
echo "   cd ~/projects/jason-ai-toolkit"
echo "   cp .env.example .env"
echo "   nano .env  # Add your API keys"
echo ""
echo "2. Run OAuth setup for bots:"
echo "   cd ~/projects/jason-ai-toolkit/bots/mattbot"
echo "   source venv/bin/activate"
echo "   python3 setup_oauth.py"
echo ""
echo "3. Start all services:"
echo "   cd ~/projects/jason-ai-toolkit"
echo "   ./scripts/start_all_services.sh"
echo ""
echo "4. Grant macOS permissions:"
echo "   System Settings → Privacy & Security"
echo "   - Accessibility (OpenClaw, iTerm)"
echo "   - Screen Recording (OpenClaw)"
echo "   - Input Monitoring (OpenClaw)"
echo ""
echo "5. Verify everything:"
echo "   tmux attach -t claude"
echo "   claude  # Test Claude Code"
echo ""
echo "   openclaw doctor  # Check OpenClaw"
echo ""
echo "=================================================="
echo "Toolkit installed at: ~/projects/jason-ai-toolkit"
echo "Documentation: ~/projects/jason-ai-toolkit/COMPLETE_SETUP.md"
echo "=================================================="
