#!/bin/bash

# Stop all launchd services

echo "Stopping all services..."

launchctl unload ~/Library/LaunchAgents/com.jasonlee.book-processor.plist 2>/dev/null && echo "✓ Book Processor stopped" || echo "✗ Book Processor not running or not found"
launchctl unload ~/Library/LaunchAgents/com.jasonlee.supost-bot.plist 2>/dev/null && echo "✓ SUPost Bot stopped" || echo "✗ SUPost Bot not running or not found"

echo ""
echo "Service status:"
launchctl list | grep jasonlee || echo "(no services running)"
