#!/bin/bash

# Start all launchd services

echo "Starting all services..."

launchctl load ~/Library/LaunchAgents/com.jasonlee.book-processor.plist 2>/dev/null && echo "✓ Book Processor started" || echo "✗ Book Processor already running or not found"
launchctl load ~/Library/LaunchAgents/com.jasonlee.supost-bot.plist 2>/dev/null && echo "✓ SUPost Bot started" || echo "✗ SUPost Bot already running or not found"

echo ""
echo "Service status:"
launchctl list | grep jasonlee

echo ""
echo "To view logs:"
echo "  tail -f ~/Library/LaunchAgents/*.log"
