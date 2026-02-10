#!/usr/bin/env python3
"""
Libgen Book Downloader v2 - Improved Version
Downloads books from Library Genesis using proven working method
"""

import urllib.request
import urllib.parse
import re
import os
import sys

def search_and_download(title, author="", preferred_format="epub"):
    """Search libgen.li and download the book"""

    print("=" * 70)
    print("LIBGEN BOOK DOWNLOADER v2")
    print("=" * 70)
    print(f"Book: {title}")
    print(f"Author: {author if author else 'Not specified'}")
    print(f"Preferred format: {preferred_format}")
    print()

    # Step 1: Search for the book
    query = f"{title} {author}".strip()
    search_url = f"https://libgen.li/index.php?req={urllib.parse.quote(query)}&res=100"

    print(f"[1/4] Searching Library Genesis...")
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
    print(f"[2/4] Parsing search results...")

    # Find all /ads.php?md5=... links
    md5_pattern = r'/ads\.php\?md5=([a-f0-9]{32})'
    md5_matches = re.findall(md5_pattern, html)

    if not md5_matches:
        print("ERROR: No results found")
        return None

    print(f"      Found {len(md5_matches)} results")

    # If author specified, try to find the matching one
    best_md5 = None
    if author:
        # Look for author name in the HTML near the md5 links
        author_pattern = re.escape(author.split()[-1])  # Last name
        for md5 in md5_matches:
            # Check if author appears near this MD5 in the HTML
            md5_pos = html.find(md5)
            nearby_text = html[max(0, md5_pos-500):md5_pos+500]
            if re.search(author_pattern, nearby_text, re.IGNORECASE):
                # Also check for format preference
                if preferred_format in nearby_text.lower():
                    best_md5 = md5
                    print(f"      Selected result matching author and format: {md5[:8]}...")
                    break
                elif not best_md5:
                    best_md5 = md5

    # If no author match, just use first one
    if not best_md5:
        best_md5 = md5_matches[0]
        print(f"      Using first result: {best_md5[:8]}...")

    # Step 3: Get the download page
    ads_url = f"https://libgen.li/ads.php?md5={best_md5}"
    print(f"[3/4] Accessing download page...")
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

    print(f"[4/4] Downloading file...")
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
                # Generate a filename
                safe_title = re.sub(r'[^\w\s\-]', '', title).replace(' ', '_')
                filename = f"{safe_title}.{preferred_format}"

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
            print()
            print("=" * 70)
            print("SUCCESS!")
            print("=" * 70)
            print(f"File: {filename}")
            print(f"Size: {downloaded / 1024 / 1024:.2f} MB")
            print(f"Path: {download_path}")
            print()

            return download_path

    except Exception as e:
        print(f"ERROR: Download failed - {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 libgen_downloader_v2.py 'Book Title' ['Author Name'] [format]")
        print("Example: python3 libgen_downloader_v2.py 'The Lean Startup' 'Eric Ries' epub")
        sys.exit(1)

    title = sys.argv[1]
    author = sys.argv[2] if len(sys.argv) > 2 else ""
    preferred_format = sys.argv[3] if len(sys.argv) > 3 else "epub"

    result = search_and_download(title, author, preferred_format)

    if result:
        print("Opening Downloads folder...")
        os.system("open ~/Downloads")
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
