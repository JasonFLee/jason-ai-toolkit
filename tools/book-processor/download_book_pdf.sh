#!/bin/bash
# Wrapper script for libgen PDF downloader
# Usage: ./download_book_pdf.sh "Book Title" ["Author Name"]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOWNLOADER="$SCRIPT_DIR/libgen_downloader_v3_pdf_only.py"

if [ ! -f "$DOWNLOADER" ]; then
    echo "Error: Downloader script not found at $DOWNLOADER"
    exit 1
fi

python3 "$DOWNLOADER" "$@"
