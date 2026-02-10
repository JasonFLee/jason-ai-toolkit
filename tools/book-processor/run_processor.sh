#!/bin/bash
# Book Processor Runner Script
# This script is called by launchd to run the book processor on startup

cd /Users/jasonlee/codingProjects/book-processor

# Log file for tracking
LOG_FILE="/Users/jasonlee/codingProjects/book-processor/logs/runner.log"

echo "$(date): Starting book processor run..." >> "$LOG_FILE"

# Run the processor using the virtual environment
/Users/jasonlee/codingProjects/book-processor/venv/bin/python /Users/jasonlee/codingProjects/book-processor/main.py 2>&1 >> "$LOG_FILE"

echo "$(date): Book processor run completed." >> "$LOG_FILE"
