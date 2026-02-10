#!/bin/bash

# InvestBot Scheduler Setup Script
# This script installs the launchd services to run InvestBot automatically

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "========================================"
echo "  InvestBot Scheduler Setup"
echo "========================================"
echo ""

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"
echo "Created logs directory"

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Find npx path
NPX_PATH=$(which npx)
if [ -z "$NPX_PATH" ]; then
    echo "ERROR: npx not found. Please install Node.js first."
    exit 1
fi
echo "Found npx at: $NPX_PATH"

# Update plist files with correct npx path
sed -i '' "s|/usr/local/bin/npx|$NPX_PATH|g" "$SCRIPT_DIR/com.investbot.daily.plist"
sed -i '' "s|/usr/local/bin/npx|$NPX_PATH|g" "$SCRIPT_DIR/com.investbot.weekly.plist"

# Unload existing services if they exist
echo ""
echo "Removing old services (if any)..."
launchctl unload "$LAUNCH_AGENTS_DIR/com.investbot.daily.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.investbot.weekly.plist" 2>/dev/null || true

# Copy plist files to LaunchAgents
echo "Installing services..."
cp "$SCRIPT_DIR/com.investbot.daily.plist" "$LAUNCH_AGENTS_DIR/"
cp "$SCRIPT_DIR/com.investbot.weekly.plist" "$LAUNCH_AGENTS_DIR/"

# Load the services
echo "Loading services..."
launchctl load "$LAUNCH_AGENTS_DIR/com.investbot.daily.plist"
launchctl load "$LAUNCH_AGENTS_DIR/com.investbot.weekly.plist"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Services installed:"
echo "  - com.investbot.daily   (runs Mon-Fri at 9:35 AM)"
echo "  - com.investbot.weekly  (runs Sunday at 6:00 PM)"
echo ""
echo "Commands:"
echo "  Check status:   launchctl list | grep investbot"
echo "  View logs:      tail -f $SCRIPT_DIR/logs/daily-runner.log"
echo "  Run now:        npx tsx $SCRIPT_DIR/src/dailyRunner.ts"
echo "  Uninstall:      launchctl unload ~/Library/LaunchAgents/com.investbot.*.plist"
echo ""
echo "IMPORTANT: Make sure your .env file has:"
echo "  - ALPACA_API_KEY"
echo "  - ALPACA_SECRET_KEY"
echo "  - RECIPIENT_EMAIL"
echo "  - GMAIL_CLIENT_ID"
echo "  - GMAIL_CLIENT_SECRET"
echo ""
