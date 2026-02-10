#!/bin/bash

# Install all bots as launchd services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(dirname "$SCRIPT_DIR")"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

echo "=================================================="
echo "Installing LaunchD Services"
echo "=================================================="

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCHAGENTS_DIR"

# Book Processor
if [ -f "$TOOLKIT_ROOT/tools/book-processor/com.jasonlee.book-processor.plist" ]; then
    echo "Installing Book Processor service..."
    cp "$TOOLKIT_ROOT/tools/book-processor/com.jasonlee.book-processor.plist" "$LAUNCHAGENTS_DIR/"
    launchctl load "$LAUNCHAGENTS_DIR/com.jasonlee.book-processor.plist" 2>/dev/null || echo "  (already loaded)"
    echo "  ✓ Book Processor installed"
else
    echo "  ✗ Book Processor plist not found"
fi

# SUPost Bot
if [ -f "$TOOLKIT_ROOT/bots/supost-bot/com.jasonlee.supost-bot.plist" ]; then
    echo "Installing SUPost Bot service..."
    cp "$TOOLKIT_ROOT/bots/supost-bot/com.jasonlee.supost-bot.plist" "$LAUNCHAGENTS_DIR/"
    launchctl load "$LAUNCHAGENTS_DIR/com.jasonlee.supost-bot.plist" 2>/dev/null || echo "  (already loaded)"
    echo "  ✓ SUPost Bot installed"
else
    echo "  ✗ SUPost Bot plist not found"
fi

echo ""
echo "LaunchD services installed!"
echo ""
echo "To check service status:"
echo "  launchctl list | grep jasonlee"
echo ""
echo "To view logs:"
echo "  tail -f ~/Library/LaunchAgents/*.log"
echo ""
echo "To unload a service:"
echo "  launchctl unload ~/Library/LaunchAgents/com.jasonlee.SERVICE.plist"
echo ""
