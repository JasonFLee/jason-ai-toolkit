#!/usr/bin/env python3
"""
Libgen Book Downloader v3 - PDF ONLY VERSION
Always downloads as PDF. Converts EPUB to PDF if necessary.
"""

import urllib.request
import urllib.parse
import re
import os
import sys
import subprocess
import time

def convert_epub_to_pdf(epub_path, pdf_path):
    """Convert EPUB to PDF using Calibre's ebook-convert"""
    print()
    print("=" * 70)
    print("CONVERTING EPUB TO PDF")
    print("=" * 70)
    print(f"Input:  {os.path.basename(epub_path)}")
    print(f"Output: {os.path.basename(pdf_path)}")
    print()
    print("This may take a minute...")

    # Try multiple possible paths for ebook-convert
    possible_paths = [
        "/Applications/calibre.app/Contents/MacOS/ebook-convert",
        "/usr/local/bin/ebook-convert",
        "/opt/homebrew/bin/ebook-convert"
    ]

    ebook_convert = None
    for path in possible_paths:
        if os.path.exists(path):
            ebook_convert = path
            break

    if not ebook_convert:
        # Try to find it in PATH
        try:
            result = subprocess.run(['which', 'ebook-convert'],
                                  capture_output=True, text=True)
            if result.returncode == 0:
                ebook_convert = result.stdout.strip()
        except:
            pass

    if not ebook_convert:
        print("ERROR: ebook-convert not found!")
        print("Please install Calibre: brew install --cask calibre")
        return None

    try:
        # Run conversion
        result = subprocess.run(
            [ebook_convert, epub_path, pdf_path,
             '--pdf-page-numbers',
             '--paper-size', 'letter',
             '--pdf-default-font-size', '12'],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode == 0 and os.path.exists(pdf_path):
            # Delete the original EPUB
            os.remove(epub_path)
            print()
            print("✓ Conversion successful!")
            print(f"✓ Removed original EPUB")
            return pdf_path
        else:
            print(f"ERROR: Conversion failed")
            print(result.stderr)
            return None

    except subprocess.TimeoutExpired:
        print("ERROR: Conversion timed out (>5 minutes)")
        return None
    except Exception as e:
        print(f"ERROR: Conversion failed - {e}")
        return None


def search_and_download(title, author=""):
    """Search libgen.li and download the book as PDF"""

    print("=" * 70)
    print("LIBGEN BOOK DOWNLOADER v3 - PDF ONLY")
    print("=" * 70)
    print(f"Book: {title}")
    print(f"Author: {author if author else 'Not specified'}")
    print(f"Format: PDF (will convert EPUB if needed)")
    print()

    # Step 1: Search for the book
    query = f"{title} {author}".strip()
    search_url = f"https://libgen.li/index.php?req={urllib.parse.quote(query)}&res=100"

    print(f"[1/5] Searching Library Genesis...")
    print(f"      URL: {search_url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"ERROR: Failed to search - {e}")
        return None

    # Step 2: Extract MD5 hashes and download links
    print(f"[2/5] Parsing search results...")

    # Find all /ads.php?md5=... links
    md5_pattern = r'/ads\.php\?md5=([a-f0-9]{32})'
    md5_matches = re.findall(md5_pattern, html)

    if not md5_matches:
        print("ERROR: No results found")
        return None

    print(f"      Found {len(md5_matches)} results")

    # Try to find PDF first, fallback to EPUB
    best_md5 = None
    file_format = None

    # First pass: Look for PDF
    for md5 in md5_matches:
        md5_pos = html.find(md5)
        nearby_text = html[max(0, md5_pos-500):md5_pos+500]

        # Check if it's a PDF
        if '.pdf' in nearby_text.lower() or 'pdf' in nearby_text.lower():
            if author:
                author_pattern = re.escape(author.split()[-1])
                if re.search(author_pattern, nearby_text, re.IGNORECASE):
                    best_md5 = md5
                    file_format = 'pdf'
                    print(f"      ✓ Found PDF matching author: {md5[:8]}...")
                    break
            elif not best_md5:
                best_md5 = md5
                file_format = 'pdf'
                print(f"      ✓ Found PDF: {md5[:8]}...")
                break

    # Second pass: If no PDF, look for EPUB
    if not best_md5:
        print("      No PDF found, looking for EPUB to convert...")
        for md5 in md5_matches:
            md5_pos = html.find(md5)
            nearby_text = html[max(0, md5_pos-500):md5_pos+500]

            if '.epub' in nearby_text.lower() or 'epub' in nearby_text.lower():
                if author:
                    author_pattern = re.escape(author.split()[-1])
                    if re.search(author_pattern, nearby_text, re.IGNORECASE):
                        best_md5 = md5
                        file_format = 'epub'
                        print(f"      ✓ Found EPUB matching author (will convert): {md5[:8]}...")
                        break
                elif not best_md5:
                    best_md5 = md5
                    file_format = 'epub'
                    print(f"      ✓ Found EPUB (will convert): {md5[:8]}...")
                    break

    # Last resort: Use first result
    if not best_md5:
        best_md5 = md5_matches[0]
        file_format = 'unknown'
        print(f"      Using first result: {best_md5[:8]}...")

    # Step 3: Get the download page
    ads_url = f"https://libgen.li/ads.php?md5={best_md5}"
    print(f"[3/5] Accessing download page...")
    print(f"      URL: {ads_url}")

    try:
        req = urllib.request.Request(ads_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            ads_html = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"ERROR: Failed to access download page - {e}")
        return None

    # Step 4: Extract the actual download link
    get_pattern = r'get\.php\?md5=' + best_md5 + r'&key=([A-Z0-9]+)'
    get_match = re.search(get_pattern, ads_html)

    if not get_match:
        print("ERROR: Could not find download link")
        return None

    download_key = get_match.group(1)
    download_url = f"https://libgen.li/get.php?md5={best_md5}&key={download_key}"

    print(f"[4/5] Downloading file...")
    print(f"      URL: {download_url[:60]}...")

    # Step 5: Download the file
    headers['Referer'] = ads_url

    try:
        req = urllib.request.Request(download_url, headers=headers)
        with urllib.request.urlopen(req, timeout=120) as response:
            # Get filename from Content-Disposition header
            content_disp = response.headers.get('Content-Disposition', '')
            filename_match = re.search(r'filename="(.+?)"', content_disp)

            if filename_match:
                filename = filename_match.group(1)
                # Clean up the filename
                filename = re.sub(r'[^\w\s\-\.]', '_', filename)
            else:
                # Generate a filename based on detected format
                safe_title = re.sub(r'[^\w\s\-]', '', title).replace(' ', '_')
                if file_format == 'epub':
                    filename = f"{safe_title}.epub"
                else:
                    filename = f"{safe_title}.pdf"

            download_path = os.path.join(os.path.expanduser('~/Downloads'), filename)

            # Download with progress
            file_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            chunk_size = 8192

            with open(download_path, 'wb') as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if file_size > 0:
                        percent = (downloaded / file_size) * 100
                        mb_downloaded = downloaded / 1024 / 1024
                        mb_total = file_size / 1024 / 1024
                        print(f"\r      Progress: {percent:.1f}% ({mb_downloaded:.2f}/{mb_total:.2f} MB)", end='')

            print()  # New line after progress

    except Exception as e:
        print(f"ERROR: Download failed - {e}")
        return None

    # Step 6: Convert to PDF if needed
    final_path = download_path

    if download_path.lower().endswith('.epub'):
        print()
        print(f"[5/5] Converting EPUB to PDF...")
        pdf_path = download_path.rsplit('.', 1)[0] + '.pdf'
        converted_path = convert_epub_to_pdf(download_path, pdf_path)

        if converted_path:
            final_path = converted_path
        else:
            print("WARNING: Conversion failed, keeping EPUB")
            final_path = download_path
    else:
        print(f"[5/5] File is already PDF, no conversion needed")

    # Display success message
    print()
    print("=" * 70)
    print("SUCCESS!")
    print("=" * 70)
    print(f"File: {os.path.basename(final_path)}")
    print(f"Size: {os.path.getsize(final_path) / 1024 / 1024:.2f} MB")
    print(f"Path: {final_path}")
    print()

    return final_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 libgen_downloader_v3_pdf_only.py 'Book Title' ['Author Name']")
        print("Example: python3 libgen_downloader_v3_pdf_only.py 'The Lean Startup' 'Eric Ries'")
        print()
        print("This version ALWAYS downloads/converts to PDF!")
        sys.exit(1)

    title = sys.argv[1]
    author = sys.argv[2] if len(sys.argv) > 2 else ""

    result = search_and_download(title, author)

    if result:
        print("Opening PDF...")
        subprocess.run(['open', result])
        sys.exit(0)
    else:
        print()
        print("Download failed. Please try:")
        print("1. Checking your internet connection")
        print("2. Verifying the book title and author spelling")
        print("3. Trying manually at https://libgen.li")
        sys.exit(1)

if __name__ == '__main__':
    main()
