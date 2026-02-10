#!/usr/bin/env python3
"""
Libgen Book Downloader
Downloads books from Anna's Archive or Library Genesis
"""

import urllib.request
import urllib.parse
import json
import re
import os
import sys
import time
from html.parser import HTMLParser

class LinkParser(HTMLParser):
    """Simple HTML parser to extract links and text"""
    def __init__(self):
        super().__init__()
        self.links = []
        self.current_tag = None
        self.current_attrs = {}

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        self.current_attrs = dict(attrs)
        if tag == 'a' and dict(attrs).get('href'):
            self.links.append({
                'href': dict(attrs)['href'],
                'text': '',
                'attrs': dict(attrs)
            })

    def handle_data(self, data):
        if self.links and self.current_tag == 'a':
            self.links[-1]['text'] += data.strip()

def search_annas_archive(title, author=""):
    """Search Anna's Archive for a book"""
    print(f"Searching Anna's Archive for: {title} by {author}")

    # Anna's Archive search URL
    query = f"{title} {author}".strip()
    search_url = f"https://annas-archive.org/search?q={urllib.parse.quote(query)}"

    print(f"Search URL: {search_url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8')

        # Look for JSON data in the page (Anna's Archive often embeds data)
        # Or parse HTML for download links
        parser = LinkParser()
        parser.feed(html)

        # Filter for book result links
        book_links = []
        for link in parser.links:
            href = link['href']
            if '/md5/' in href or '/isbn/' in href or '/download/' in href:
                book_links.append(link)

        print(f"Found {len(book_links)} potential book links")
        return book_links[:10]  # Return top 10

    except Exception as e:
        print(f"Error searching Anna's Archive: {e}")
        return []

def search_libgen(title, author=""):
    """Search Library Genesis for a book"""
    print(f"Searching Library Genesis for: {title} by {author}")

    # Try libgen.li (more accessible)
    query = f"{title} {author}".strip()
    search_url = f"https://libgen.li/index.php?req={urllib.parse.quote(query)}&res=100"

    print(f"Search URL: {search_url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8')

        parser = LinkParser()
        parser.feed(html)

        # Look for download links or book detail pages
        download_links = []
        for link in parser.links:
            href = link['href']
            text = link['text'].lower()

            # Look for mirror links or download buttons
            if 'mirror' in text or 'get' in text.lower() or 'download' in text:
                if href.startswith('http'):
                    download_links.append(link)
                elif href.startswith('/'):
                    download_links.append({
                        'href': f"https://libgen.li{href}",
                        'text': link['text']
                    })

        print(f"Found {len(download_links)} potential download links")
        return download_links[:10]

    except Exception as e:
        print(f"Error searching Library Genesis: {e}")
        return []

def try_download(url, filename):
    """Attempt to download a file from a URL"""
    print(f"\nAttempting download from: {url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://libgen.li/'
    }

    try:
        req = urllib.request.Request(url, headers=headers)

        # Try to open the URL
        with urllib.request.urlopen(req, timeout=60) as response:
            content_type = response.headers.get('Content-Type', '')
            content_disposition = response.headers.get('Content-Disposition', '')

            print(f"Content-Type: {content_type}")
            print(f"Content-Disposition: {content_disposition}")

            # Check if this is actually a file download
            if 'application/pdf' in content_type or 'application/epub' in content_type or 'application/octet-stream' in content_type:
                # This is a direct download
                download_path = os.path.join(os.path.expanduser('~/Downloads'), filename)

                print(f"Downloading to: {download_path}")

                with open(download_path, 'wb') as f:
                    chunk_size = 8192
                    downloaded = 0
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        print(f"Downloaded: {downloaded / 1024 / 1024:.2f} MB", end='\r')

                print(f"\n\nSuccess! File downloaded to: {download_path}")
                return download_path
            else:
                # This might be an HTML page with more links
                html = response.read().decode('utf-8', errors='ignore')

                # Look for direct download links in the HTML
                parser = LinkParser()
                parser.feed(html)

                # Find links that look like direct downloads
                for link in parser.links:
                    href = link['href']
                    if any(ext in href.lower() for ext in ['.pdf', '.epub', '.mobi']):
                        print(f"Found potential download link: {href}")
                        if not href.startswith('http'):
                            # Make it absolute
                            from urllib.parse import urljoin
                            href = urljoin(url, href)
                        return try_download(href, filename)

                print("Page loaded but no direct download found")
                return None

    except Exception as e:
        print(f"Error downloading: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 libgen_downloader.py 'Book Title' ['Author Name']")
        sys.exit(1)

    title = sys.argv[1]
    author = sys.argv[2] if len(sys.argv) > 2 else ""

    print("=" * 60)
    print("LIBGEN BOOK DOWNLOADER")
    print("=" * 60)
    print(f"Book: {title}")
    print(f"Author: {author if author else 'Not specified'}")
    print()

    # Try Anna's Archive first
    print("\n--- Trying Anna's Archive ---")
    results = search_annas_archive(title, author)

    if not results:
        print("\n--- Trying Library Genesis ---")
        results = search_libgen(title, author)

    if not results:
        print("\nNo results found. Please try:")
        print("1. Checking your internet connection")
        print("2. Using a different book title or author")
        print("3. Trying manually at https://annas-archive.org or https://libgen.li")
        sys.exit(1)

    print(f"\nFound {len(results)} potential sources")
    print("\nTop results:")
    for i, link in enumerate(results[:5], 1):
        print(f"{i}. {link['text'][:60]} - {link['href'][:80]}")

    # Try each link until we get a successful download
    filename = f"{title.replace(' ', '_')}.epub"  # Default to epub

    for i, link in enumerate(results[:5], 1):
        print(f"\n--- Attempt {i}/{len(results[:5])} ---")
        result = try_download(link['href'], filename)
        if result:
            return result
        time.sleep(2)  # Be nice to the servers

    print("\nFailed to download from any source.")
    print("You may need to:")
    print("1. Try the browser-based method with MCP tools")
    print("2. Manually visit the site and solve any captchas")
    print("3. Try again later if the site is having issues")

if __name__ == '__main__':
    main()
