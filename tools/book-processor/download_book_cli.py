#!/usr/bin/env python3
"""
Download books from LibGen using libgen-downloader CLI tool.
Only downloads PDFs and opens them automatically.
"""

import subprocess
import sys
import os
import glob
from pathlib import Path

def download_book_pdf(title: str, author: str = "", output_dir: str = None) -> str:
    """
    Download a book as PDF using libgen-downloader CLI.

    Args:
        title: Book title
        author: Author name (optional)
        output_dir: Output directory (default: ~/Downloads)

    Returns:
        Path to downloaded PDF
    """
    if output_dir is None:
        output_dir = os.path.expanduser("~/Downloads")

    os.makedirs(output_dir, exist_ok=True)

    # Build search query
    query = f"{title} {author}".strip()

    print(f"🔍 Searching LibGen for: {query}")
    print(f"📁 Download directory: {output_dir}")
    print()

    # Get list of files before download
    files_before = set(glob.glob(os.path.join(output_dir, "*.pdf")))

    # Change to output directory
    original_dir = os.getcwd()
    os.chdir(output_dir)

    try:
        # Run libgen-downloader with PDF-only filter
        # The tool will interactively show results and let user pick
        cmd = ["libgen-downloader", "-r", "25", "-e", "pdf", "-s", query]

        print(f"💾 Running: {' '.join(cmd)}")
        print()

        result = subprocess.run(
            cmd,
            stdin=sys.stdin,
            stdout=sys.stdout,
            stderr=sys.stderr,
            text=True
        )

        if result.returncode != 0:
            print(f"\n❌ Download failed with exit code {result.returncode}")
            return None

        # Find newly downloaded PDF
        files_after = set(glob.glob(os.path.join(output_dir, "*.pdf")))
        new_files = files_after - files_before

        if new_files:
            downloaded_file = list(new_files)[0]
            print(f"\n✅ Downloaded: {os.path.basename(downloaded_file)}")

            # Open the PDF
            print("📖 Opening PDF...")
            subprocess.run(["open", downloaded_file])

            return downloaded_file
        else:
            print("\n⚠️  No new PDF found. Download may have been cancelled.")
            return None

    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None
    finally:
        os.chdir(original_dir)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 download_book_cli.py \"Book Title\" [\"Author Name\"]")
        print()
        print("Example:")
        print('  python3 download_book_cli.py "The Case Against Sugar" "Gary Taubes"')
        sys.exit(1)

    title = sys.argv[1]
    author = sys.argv[2] if len(sys.argv) > 2 else ""

    result = download_book_pdf(title, author)

    if result:
        print(f"\n🎉 Success! PDF available at: {result}")
    else:
        print("\n❌ Download failed")
        sys.exit(1)
