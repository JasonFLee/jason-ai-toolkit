#!/bin/bash
# SUPost Bot Runner Script
# This script is called by launchd to run the bot hourly
# Uses Playwright for headless browser automation

cd /Users/jasonlee/codingProjects/supost-bot

# Log file for tracking
LOG_FILE="/Users/jasonlee/codingProjects/supost-bot/bot.log"

echo "$(date): Starting SUPost bot run..." >> "$LOG_FILE"

# Run the Python bot directly using the venv
/Users/jasonlee/codingProjects/supost-bot/venv/bin/python /Users/jasonlee/codingProjects/supost-bot/supost_bot.py 2>&1 >> "$LOG_FILE"

echo "$(date): SUPost bot run completed." >> "$LOG_FILE"
