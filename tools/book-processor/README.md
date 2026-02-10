# Automated Book Processing System

Monitors your Google Tasks "To read" list and automatically processes books through:
1. **Download** from Library Genesis
2. **Podcast Summary** generation via open-notebook-project API
3. **Audiobook** conversion using Kokoro TTS
4. **Upload** to Google Drive in organized folders

## Installation

The system is already set up! Dependencies are installed in `/Users/jasonlee/codingProjects/book-processor/venv/`

### Install LaunchD Service (For Automatic Startup)

```bash
cd /Users/jasonlee/codingProjects/book-processor

# Copy plist to LaunchAgents
cp com.jasonlee.book-processor.plist ~/Library/LaunchAgents/

# Load the service
launchctl load ~/Library/LaunchAgents/com.jasonlee.book-processor.plist

# Verify it's loaded
launchctl list | grep book-processor
```

The service will now:
- Run on computer startup
- Run every 6 hours automatically

## Manual Usage

To run manually (for testing):

```bash
cd /Users/jasonlee/codingProjects/book-processor
./venv/bin/python main.py
```

## How It Works

1. **Checks Google Tasks** for unchecked items in "To read" list added after Feb 6, 2026
2. For each new book:
   - Downloads PDF/EPUB from LibGen
   - Extracts text and generates 2-person podcast summary
   - Converts to audiobook using Kokoro TTS (voice: af_bella)
   - Uploads all three files to Google Drive
3. **Resumes** from where it left off if interrupted
4. **State tracking** via SQLite database at `data/state.db`

## Configuration

Edit `config.py` to customize:
- `AUDIOBOOK_VOICE` - Change TTS voice (default: "af_bella")
- `PODCAST_TIMEOUT` - Adjust podcast generation timeout
- `AUDIOBOOK_TIMEOUT` - Adjust audiobook conversion timeout
- `MAX_RETRIES` - Number of retry attempts on failure

## Google Drive Structure

Files are uploaded to Google Drive in this structure:

```
Books/
├── Book Title 1/
│   ├── Book_Title_1.pdf
│   ├── podcast_summary.mp3
│   └── Book_Title_1_audiobook/
│       ├── chapter_001.mp3
│       ├── chapter_002.mp3
│       └── ...
└── Book Title 2/
    └── ...
```

## Prerequisites

- **Google Tasks** "To read" list with book titles
- **OAuth credentials** (already configured via testyoueverday)
- **open-notebook-project API** running at `localhost:5055`
- **pdf-narrator** installed at `/Users/jasonlee/codingProjects/pdf-narrator/`

## Logs

View logs at:
- `logs/main.log` - Application logs
- `logs/runner.log` - LaunchD execution logs
- `logs/stdout.log` - Standard output
- `logs/stderr.log` - Error output

## Database

Monitor processing status:

```bash
cd /Users/jasonlee/codingProjects/book-processor
./venv/bin/python -c "from state_manager import StateManager; sm = StateManager('data/state.db'); import json; print(json.dumps([dict(b) for b in sm.get_all_books()], indent=2))"
```

## Troubleshooting

**Book not downloading:**
- Check LibGen is accessible
- Verify book title is correct in Google Tasks

**Podcast generation fails:**
- Ensure open-notebook-project API is running: `curl http://localhost:5055/api/podcasts/episodes`

**Audiobook conversion fails:**
- Check pdf-narrator is installed and working
- Verify Kokoro TTS is functioning

**Drive upload fails:**
- Check OAuth credentials are valid
- Verify sufficient Drive storage

## Uninstallation

To stop the service:

```bash
launchctl unload ~/Library/LaunchAgents/com.jasonlee.book-processor.plist
rm ~/Library/LaunchAgents/com.jasonlee.book-processor.plist
```

To remove completely:

```bash
rm -rf /Users/jasonlee/codingProjects/book-processor
```
