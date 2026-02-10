#!/bin/bash

# Jason's AI Toolkit - Complete macOS Setup
# Run this script to install everything on a new machine

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=================================================="
echo "Jason's AI Toolkit - macOS Setup"
echo "=================================================="
echo ""
echo "This script will:"
echo "  1. Install dependencies (Homebrew, Python, Node, etc.)"
echo "  2. Set up all bots and tools"
echo "  3. Deploy configurations"
echo "  4. Install launchd services"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 1
fi

# Step 1: Install Dependencies
echo ""
echo "=================================================="
echo "Step 1: Installing Dependencies"
echo "=================================================="
"$SCRIPT_DIR/install_dependencies.sh"

# Step 2: Set up Python tools
echo ""
echo "=================================================="
echo "Step 2: Setting up Python Tools"
echo "=================================================="

# Book Processor
echo "Setting up Book Processor..."
cd "$TOOLKIT_ROOT/tools/book-processor"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# MattBot
echo "Setting up MattBot..."
cd "$TOOLKIT_ROOT/bots/mattbot"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# SUPost Bot
echo "Setting up SUPost Bot..."
cd "$TOOLKIT_ROOT/bots/supost-bot"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install pytest schedule
deactivate

# Step 3: Set up Node.js tools
echo ""
echo "=================================================="
echo "Step 3: Setting up Node.js Tools"
echo "=================================================="

# InvestBot
echo "Setting up InvestBot..."
cd "$TOOLKIT_ROOT/bots/investBot"
npm install

# Step 4: Deploy configurations
echo ""
echo "=================================================="
echo "Step 4: Deploying Configurations"
echo "=================================================="
"$SCRIPT_DIR/setup_configs.sh"

# Step 5: Install launchd services
echo ""
echo "=================================================="
echo "Step 5: Installing LaunchD Services"
echo "=================================================="
"$SCRIPT_DIR/setup_bots.sh"

echo ""
echo "=================================================="
echo "Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Configure API keys and credentials:"
echo "   - Copy .env.example to .env and fill in your keys"
echo "   - Run OAuth setup for Google APIs (see docs)"
echo ""
echo "2. Start services:"
echo "   ./scripts/start_all_services.sh"
echo ""
echo "3. Check logs:"
echo "   tail -f ~/Library/LaunchAgents/*.log"
echo ""
echo "4. Read individual project documentation:"
echo "   - tools/book-processor/README.md"
echo "   - bots/mattbot/README.md"
echo "   - bots/supost-bot/README.md"
echo "   - bots/investBot/README.md"
echo ""
echo "For help, see README.md or individual project docs."
echo ""
