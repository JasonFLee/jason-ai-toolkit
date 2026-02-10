"""LibGen book download service"""

import requests
import os
import re
import time
import subprocess
import glob
from typing import Optional
from bs4 import BeautifulSoup
from loguru import logger
from urllib.parse import urljoin

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import DOWNLOADS_DIR


def sanitize_filename(title: str) -> str:
    """Clean title for safe filename"""
    # Remove invalid filename characters
    sanitized = re.sub(r'[<>:"/\\|?*]', '', title)
    # Replace spaces with underscores
    sanitized = re.sub(r'\s+', '_', sanitized)
    # Limit length
    return sanitized[:200]


def search_libgen(query: str, max_results: int = 5) -> list:
    """
    Search Library Genesis for books.

    Returns list of book dictionaries with download info.
    """
    logger.info(f"Searching LibGen for: {query}")

    # Try multiple mirrors in case one is down
    mirrors = [
        "http://libgen.li/index.php",
        "http://libgen.is/search.php",
        "http://libgen.rs/search.php",
    ]

    for search_url in mirrors:
        try:
            logger.debug(f"Trying mirror: {search_url}")

            if 'libgen.li' in search_url:
                # libgen.li uses different parameters
                params = {
                    'req': query,
                    'columns[]': 'title',
                    'columns[]': 'author',
                    'objects[]': 'f',
                    'objects[]': 'e',
                    'objects[]': 's',
                    'objects[]': 'a',
                    'objects[]': 'p',
                    'objects[]': 'w',
                    'topics[]': 'l',
                    'res': str(max_results),
                    'filesuns': 'all'
                }
            else:
                # Standard libgen parameters
                params = {
                    'req': query,
                    'lg_topic': 'libgen',
                    'open': '0',
                    'view': 'simple',
                    'res': str(max_results),
                    'phrase': '1',
                    'column': 'def'
                }

            response = requests.get(search_url, params=params, timeout=30)
            response.raise_for_status()

            # If we got here, the request succeeded
            logger.info(f"Connected to mirror: {search_url}")
            break
        except Exception as e:
            logger.warning(f"Mirror {search_url} failed: {e}")
            if search_url == mirrors[-1]:
                # Last mirror failed
                logger.error(f"All LibGen mirrors failed")
                return []
            continue

    try:

        soup = BeautifulSoup(response.content, 'html.parser')

        # Find the results table
        results = []
        table = soup.find('table', {'class': 'c'})

        if not table:
            logger.warning("No results table found")
            return []

        rows = table.find_all('tr')[1:]  # Skip header row

        for row in rows[:max_results]:
            cols = row.find_all('td')
            if len(cols) < 10:
                continue

            # Extract book information
            title = cols[2].get_text(strip=True)
            author = cols[1].get_text(strip=True)
            extension = cols[8].get_text(strip=True).lower()
            size = cols[7].get_text(strip=True)

            # Find download link (mirror links in last column)
            mirrors = cols[-1].find_all('a')
            download_links = []

            for mirror in mirrors:
                href = mirror.get('href')
                if href:
                    download_links.append(href)

            if download_links:
                results.append({
                    'title': title,
                    'author': author,
                    'extension': extension,
                    'size': size,
                    'mirror_links': download_links
                })

        logger.info(f"Found {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"LibGen search failed: {e}")
        return []


def get_direct_download_link(mirror_url: str) -> Optional[str]:
    """
    Follow mirror link to get actual download URL.
    """
    try:
        logger.debug(f"Following mirror: {mirror_url}")
        response = requests.get(mirror_url, timeout=30, allow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Look for download link - different mirrors have different structures
        # Try common patterns
        download_link = None

        # Pattern 1: Direct download link with "GET" text
        get_link = soup.find('a', string=re.compile('GET', re.I))
        if get_link and get_link.get('href'):
            download_link = get_link['href']

        # Pattern 2: Look for links containing "download" or "get"
        if not download_link:
            for link in soup.find_all('a', href=True):
                href = link['href']
                if 'download' in href.lower() or '/get/' in href.lower():
                    download_link = href
                    break

        # Pattern 3: Look in meta refresh
        if not download_link:
            meta = soup.find('meta', {'http-equiv': 'refresh'})
            if meta and meta.get('content'):
                content = meta['content']
                match = re.search(r'url=(.+)', content)
                if match:
                    download_link = match.group(1)

        if download_link:
            # Make absolute URL if relative
            if not download_link.startswith('http'):
                download_link = urljoin(mirror_url, download_link)
            logger.debug(f"Found download link: {download_link}")
            return download_link

        logger.warning("Could not find direct download link")
        return None

    except Exception as e:
        logger.error(f"Failed to get download link from mirror: {e}")
        return None


def download_file(url: str, output_path: str) -> bool:
    """
    Download file from URL to output_path.
    """
    try:
        logger.info(f"Downloading from: {url}")

        response = requests.get(url, stream=True, timeout=120)
        response.raise_for_status()

        # Get file size if available
        total_size = int(response.headers.get('content-length', 0))
        block_size = 8192
        downloaded = 0

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=block_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_size > 0 and downloaded % (block_size * 100) == 0:
                        progress = (downloaded / total_size) * 100
                        logger.debug(f"Download progress: {progress:.1f}%")

        file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        logger.info(f"Downloaded: {output_path} ({file_size_mb:.1f} MB)")
        return True

    except Exception as e:
        logger.error(f"Download failed: {e}")
        if os.path.exists(output_path):
            os.remove(output_path)
        return False


def get_md5_from_search(book_title: str) -> Optional[str]:
    """
    Search LibGen and extract MD5 hash from best matching result.

    Args:
        book_title: Title to search for

    Returns:
        MD5 hash string or None
    """
    try:
        # Search libgen.vg which provides clean MD5 hashes
        search_url = f"https://libgen.vg/index.php?req={book_title.replace(' ', '+')}&res=50"
        response = requests.get(search_url, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Find all links with MD5 hashes and their associated titles
        results = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'ads.php?md5=' in href:
                md5 = href.split('md5=')[1].split('&')[0]

                # Get the title from the first TD in the same row
                parent_tr = link.find_parent('tr')
                title_text = ''

                if parent_tr:
                    tds = parent_tr.find_all('td')
                    if len(tds) > 0:
                        title_text = tds[0].get_text().strip()

                if title_text and len(title_text) > 3:
                    results.append((md5, title_text))

        if not results:
            logger.warning(f"No results found for: {book_title}")
            return None

        logger.debug(f"Found {len(results)} results for '{book_title}'")

        # Show first few results for debugging
        if results and len(results) > 0:
            logger.debug(f"First 3 results: {[r[1][:50] for r in results[:3]]}")

        # Score each result based on word matching
        title_words = set(w.lower() for w in book_title.split() if len(w) > 2)
        logger.debug(f"Search words (>2 chars): {title_words}")

        best_match = None
        best_score = 0

        # First, check for exact substring match (case-insensitive)
        book_title_lower = book_title.lower()
        for md5, result_title in results:
            if book_title_lower in result_title.lower():
                logger.debug(f"Found exact substring match: '{result_title[:80]}'")
                return md5

        # If no exact match, use word-based scoring
        for md5, result_title in results:
            result_words = set(w.lower() for w in result_title.split() if len(w) > 2)
            common_words = title_words & result_words
            score = len(common_words)

            if score > best_score:
                best_score = score
                best_match = (md5, result_title)

        # Log top 3 matches for debugging
        if best_match:
            logger.debug(f"Best match: '{best_match[1][:80]}' (score: {best_score})")

        if best_match and best_score >= 1:  # At least 1 word must match
            md5, matched_title = best_match
            logger.info(f"Best match for '{book_title}': {matched_title[:80]}... (score: {best_score}, MD5: {md5[:8]}...)")
            return md5

        logger.warning(f"No good match found for: {book_title} (best score: {best_score})")
        return None

    except Exception as e:
        logger.error(f"Failed to get MD5: {e}")
        return None


def download_with_libgen_downloader(md5: str, output_dir: str) -> Optional[str]:
    """
    Download book using libgen-downloader tool with MD5 hash.

    Args:
        md5: MD5 hash of the book
        output_dir: Directory to save file

    Returns:
        Path to downloaded file or None
    """
    try:
        os.makedirs(output_dir, exist_ok=True)

        # Save current directory to restore later
        original_dir = os.getcwd()

        # Get timestamps of all files before download
        existing_files = {}
        for f in glob.glob(os.path.join(output_dir, '*.pdf')) + glob.glob(os.path.join(output_dir, '*.epub')):
            existing_files[f] = os.path.getmtime(f)

        # Change to output directory for libgen-downloader
        os.chdir(output_dir)

        # Run libgen-downloader with pseudo-TTY using script
        cmd = f'echo "{md5}" | script -q /dev/null libgen-downloader -d {md5}'
        logger.info(f"Running: libgen-downloader -d {md5}")

        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300
        )

        # Restore directory
        os.chdir(original_dir)

        # Find newly downloaded file (newest file that wasn't there before or was modified)
        all_files_now = glob.glob(os.path.join(output_dir, '*.pdf')) + glob.glob(os.path.join(output_dir, '*.epub'))

        # Find files that are new or were modified
        new_or_modified = []
        for f in all_files_now:
            if f not in existing_files or os.path.getmtime(f) > existing_files[f]:
                new_or_modified.append((f, os.path.getmtime(f)))

        if new_or_modified:
            # Sort by modification time and get the newest
            new_or_modified.sort(key=lambda x: x[1], reverse=True)
            downloaded_file = new_or_modified[0][0]
            logger.info(f"Downloaded: {downloaded_file}")
            return downloaded_file
        else:
            logger.error("No new file found after download")
            return None

    except subprocess.TimeoutExpired:
        logger.error("Download timed out after 5 minutes")
        os.chdir(original_dir)
        return None
    except Exception as e:
        logger.error(f"Download failed: {e}")
        os.chdir(original_dir)
        return None


def download_book(book_title: str, output_dir: str = DOWNLOADS_DIR) -> Optional[str]:
    """
    Search for and download a book from LibGen using libgen-downloader tool.

    Args:
        book_title: Title of the book to search for
        output_dir: Directory to save downloaded book

    Returns:
        Absolute path to downloaded file, or None if failed
    """
    os.makedirs(output_dir, exist_ok=True)

    # Get MD5 hash from search
    md5 = get_md5_from_search(book_title)

    if not md5:
        logger.error(f"Could not find MD5 for: {book_title}")
        return None

    # Download using libgen-downloader
    downloaded_file = download_with_libgen_downloader(md5, output_dir)

    if downloaded_file:
        logger.info(f"Successfully downloaded: {downloaded_file}")
        return downloaded_file
    else:
        logger.error(f"Failed to download book: {book_title}")
        return None


if __name__ == "__main__":
    # Test the service
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "The Lean Startup"

    print(f"Searching for: {query}\n")
    book_path = download_book(query, "/tmp")

    if book_path:
        print(f"\nSuccess! Downloaded to: {book_path}")
    else:
        print("\nFailed to download book")
