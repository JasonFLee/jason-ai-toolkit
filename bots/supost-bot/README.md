# SUPost Bot

Automated housing listing responder for SUPost.com. Monitors Stanford housing listings and sends personalized messages to relevant posts.

## Features

- Scrapes SUPost housing listings (https://supost.com/search/cat/3)
- Filters posts by:
  - Date (only posts after Dec 8, 2025)
  - Type (roommate searches, subleases, rooms available)
  - Timing (Jan-Feb move-in dates)
- Tracks sent messages to avoid duplicates
- Runs hourly via macOS launchd daemon
- Uses Chrome MCP for browser automation

## Setup

### 1. Install Dependencies

```bash
cd /Users/jasonlee/codingProjects/supost-bot
python3 -m venv venv
source venv/bin/activate
pip install pytest schedule
```

### 2. Install the Daemon

```bash
# Copy plist to LaunchAgents
cp com.jasonlee.supost-bot.plist ~/Library/LaunchAgents/

# Load the daemon (starts running hourly)
launchctl load ~/Library/LaunchAgents/com.jasonlee.supost-bot.plist

# To check status
launchctl list | grep supost

# To stop the daemon
launchctl unload ~/Library/LaunchAgents/com.jasonlee.supost-bot.plist
```

### 3. Manual Run

You can run the bot manually with Claude Code:

```bash
./run_bot.sh
```

Or invoke Claude directly to process listings.

## Configuration

### Message Template

Edit `run_bot.sh` to customize the message sent to listings.

### Email

Current email: jason.lee.jfl@gmail.com

### Sent Posts Tracking

Sent post IDs are stored in `sent_posts.json` to prevent duplicate messages.

## Files

- `supost_bot.py` - Main bot logic (scraper, filter, tracker, sender classes)
- `test_supost_bot.py` - Test suite
- `run_bot.sh` - Shell script for daemon execution
- `com.jasonlee.supost-bot.plist` - macOS launchd configuration
- `sent_posts.json` - Tracks which posts have been messaged
- `bot.log` - Execution log

## Filter Criteria

Posts are messaged if they:

1. **Are dated Dec 8, 2025 or later**
2. **Match housing keywords:**
   - roommate, room available, room for rent
   - sublease, sublet, subletting
   - bedroom available, private room, furnished room
3. **Are NOT excluded topics:**
   - parking, garage, storage
   - cat sitter, pet sitter, dog sitter

## Logs

- `bot.log` - Main execution log
- `bot_stdout.log` - Standard output from daemon
- `bot_stderr.log` - Standard error from daemon

## Testing

```bash
source venv/bin/activate
python -m pytest test_supost_bot.py -v
```

## Messages Sent (Dec 8, 2025)

Successfully messaged the following Dec 8 posts:

1. **130028988** - A furnished private bedroom at Mountain view available - $1,300
2. **130028984** - 26M Stanford Postdoc Looking for a Room — Late Dec / Jan Move-In
3. **130028976** - Stanford postdoc couple seeking 1BR/studio near campus (Jan move-in)
4. **130028974** - Fully furnished rooms available in Palo Alto - $1,850
5. **130028961** - Subletting Studio 2 apartment from Dec 10th to Jan 5th
6. **130028959** - Furnished MBR ensuite in Mountain View - $1,600
7. **130028957** - Single Graduate EVGR A Housing Sublet - $67
