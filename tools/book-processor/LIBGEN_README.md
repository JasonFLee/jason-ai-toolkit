# LibGen Book Downloader - PDF Only Version

## Overview
This tool downloads books from Library Genesis and **always** provides them as PDF files.
- If a PDF is available, it downloads that
- If only EPUB is available, it automatically converts to PDF
- Auto-opens the PDF when done

## Usage

### Command Line
```bash
python3 libgen_downloader_v3_pdf_only.py "Book Title" ["Author Name"]
```

### Examples
```bash
# Simple search
python3 libgen_downloader_v3_pdf_only.py "Sapiens"

# With author for better accuracy
python3 libgen_downloader_v3_pdf_only.py "The Case Against Sugar" "Gary Taubes"

# Use the wrapper script
./download_book_pdf.sh "Atomic Habits" "James Clear"
```

## Features

1. **PDF Priority**: Always searches for PDF first
2. **Auto-Conversion**: Converts EPUB→PDF using Calibre if needed
3. **Auto-Open**: Opens the PDF automatically when downloaded
4. **Progress Bar**: Shows download progress
5. **Smart Search**: Matches author names when specified

## Requirements

- Python 3
- Calibre (for EPUB→PDF conversion)
  - Install: `brew install --cask calibre`
  - Installed at: `/Applications/calibre.app/`

## Files

- `libgen_downloader_v3_pdf_only.py` - Main downloader script
- `download_book_pdf.sh` - Wrapper script for easy use
- All downloads go to: `~/Downloads/`

## How It Works

1. **Search**: Queries libgen.li for the book
2. **Select**: Chooses PDF if available, otherwise EPUB
3. **Download**: Downloads the file with progress tracking
4. **Convert**: If EPUB, converts to PDF using Calibre
5. **Open**: Automatically opens the PDF

## Troubleshooting

### "No results found"
- Check book title spelling
- Try without author name
- Try a shorter/simpler title

### "Conversion failed"
- Ensure Calibre is installed: `brew install --cask calibre`
- Check: `/Applications/calibre.app/Contents/MacOS/ebook-convert --version`

### Download is slow
- LibGen servers can be slow
- Be patient, large books (10+ MB) may take a few minutes

## Integration with Agents

This downloader is used by the libgen-book-finder agent.
When you ask an agent to download a book, it uses this script automatically.
