"""Podcast generation service using open-notebook-project API"""

import os
import time
import requests
from typing import Optional
from loguru import logger
import fitz  # PyMuPDF
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import PODCAST_API_URL, PODCAST_TIMEOUT, MAX_TEXT_LENGTH_FOR_PODCAST, PODCASTS_DIR


def extract_text_from_pdf(pdf_path: str, max_chars: int = MAX_TEXT_LENGTH_FOR_PODCAST) -> str:
    """
    Extract text from PDF file.

    Args:
        pdf_path: Path to PDF file
        max_chars: Maximum characters to extract

    Returns:
        Extracted text
    """
    try:
        doc = fitz.open(pdf_path)
        text = ""

        for page_num in range(len(doc)):
            if len(text) >= max_chars:
                break

            page = doc[page_num]
            text += page.get_text()

        doc.close()

        # Clean up text
        text = text[:max_chars]
        logger.info(f"Extracted {len(text)} characters from PDF")
        return text

    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        return ""


def extract_text_from_epub(epub_path: str, max_chars: int = MAX_TEXT_LENGTH_FOR_PODCAST) -> str:
    """
    Extract text from EPUB file.

    Args:
        epub_path: Path to EPUB file
        max_chars: Maximum characters to extract

    Returns:
        Extracted text
    """
    try:
        book = epub.read_epub(epub_path)
        text = ""

        # Iterate through items in the book
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                content = item.get_content().decode('utf-8', errors='ignore')

                # Parse HTML and extract text
                soup = BeautifulSoup(content, 'html.parser')
                text += soup.get_text() + "\n\n"

                if len(text) >= max_chars:
                    break

        # Clean up text
        text = text[:max_chars]
        logger.info(f"Extracted {len(text)} characters from EPUB")
        return text

    except Exception as e:
        logger.error(f"Failed to extract text from EPUB: {e}")
        return ""


def extract_text_from_book(book_path: str) -> str:
    """
    Extract text from book file (PDF or EPUB).

    Args:
        book_path: Path to book file

    Returns:
        Extracted text
    """
    _, ext = os.path.splitext(book_path.lower())

    if ext == '.pdf':
        return extract_text_from_pdf(book_path)
    elif ext == '.epub':
        return extract_text_from_epub(book_path)
    else:
        logger.error(f"Unsupported file format: {ext}")
        return ""


def generate_podcast(content: str, episode_name: str) -> Optional[tuple]:
    """
    Submit text to podcast API and wait for generation to complete.

    Args:
        content: Text content to convert to podcast
        episode_name: Name for the podcast episode

    Returns:
        Tuple of (episode_id, audio_url) or None on failure
    """
    logger.info(f"Submitting podcast generation for: {episode_name} ({len(content)} chars)")

    try:
        resp = requests.post(
            f"{PODCAST_API_URL}/podcasts/generate",
            json={
                "episode_profile": "simple_conversation",
                "speaker_profile": "simple_conversation",
                "episode_name": episode_name,
                "content": content,
                "briefing_suffix": "",
            },
            timeout=30,
        )

        if resp.status_code != 200:
            logger.error(f"Podcast submission failed: {resp.status_code} - {resp.text}")
            return None

        result = resp.json()
        job_id = result.get("job_id")
        logger.info(f"Podcast job submitted: {job_id}")

    except requests.RequestException as e:
        logger.error(f"Failed to connect to podcast API: {e}")
        return None

    # Poll for completion
    start_time = time.time()
    while time.time() - start_time < PODCAST_TIMEOUT:
        try:
            episodes_resp = requests.get(
                f"{PODCAST_API_URL}/podcasts/episodes",
                timeout=10
            )
            episodes = episodes_resp.json()

            for episode in episodes:
                if episode.get("name") == episode_name:
                    status = episode.get("job_status", "unknown")

                    if status == "completed":
                        episode_id = episode.get("id")
                        audio_url = episode.get("audio_url")
                        if not audio_url or not audio_url.startswith('http'):
                            # Fix relative URLs
                            if audio_url and audio_url.startswith('/'):
                                audio_url = f"http://localhost:5055{audio_url}"
                            else:
                                audio_url = f"{PODCAST_API_URL}/podcasts/episodes/{episode_id}/audio"
                        logger.info(f"Podcast ready: {audio_url}")
                        return episode_id, audio_url

                    elif status == "failed":
                        logger.error("Podcast generation failed")
                        return None

                    else:
                        elapsed = int(time.time() - start_time)
                        logger.debug(f"Podcast status: {status} ({elapsed}s elapsed)")
                        break

        except requests.RequestException as e:
            logger.warning(f"Error polling podcast status: {e}")

        time.sleep(10)

    logger.error(f"Podcast generation timed out after {PODCAST_TIMEOUT}s")
    return None


def download_podcast_audio(audio_url: str, output_path: str) -> Optional[str]:
    """
    Download generated podcast audio file.

    Args:
        audio_url: URL to audio file
        output_path: Path to save audio file

    Returns:
        Path to saved file or None on failure
    """
    try:
        logger.info(f"Downloading podcast from: {audio_url}")
        resp = requests.get(audio_url, timeout=120, stream=True)
        resp.raise_for_status()

        with open(output_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        logger.info(f"Downloaded podcast: {output_path} ({file_size_mb:.1f} MB)")
        return output_path

    except requests.RequestException as e:
        logger.error(f"Failed to download podcast audio: {e}")
        return None


def generate_podcast_summary(
    book_path: str,
    book_title: str,
    output_dir: str = PODCASTS_DIR
) -> Optional[str]:
    """
    Generate podcast summary for a book.

    Args:
        book_path: Path to book file (PDF/EPUB)
        book_title: Title of the book
        output_dir: Directory to save podcast audio

    Returns:
        Path to podcast audio file or None on failure
    """
    os.makedirs(output_dir, exist_ok=True)

    # Extract text from book
    logger.info(f"Extracting text from: {book_path}")
    text = extract_text_from_book(book_path)

    if not text or len(text) < 100:
        logger.error("Insufficient text extracted from book")
        return None

    # Generate podcast
    episode_name = f"{book_title} - Summary"
    result = generate_podcast(text, episode_name)

    if not result:
        return None

    episode_id, audio_url = result

    # Download audio
    from services.libgen_service import sanitize_filename
    safe_title = sanitize_filename(book_title)
    output_path = os.path.join(output_dir, f"{safe_title}_podcast.mp3")

    podcast_path = download_podcast_audio(audio_url, output_path)

    if podcast_path:
        logger.info(f"Podcast generated successfully: {podcast_path}")

    return podcast_path


if __name__ == "__main__":
    # Test the service
    if len(sys.argv) > 1:
        book_path = sys.argv[1]
        book_title = os.path.splitext(os.path.basename(book_path))[0]

        podcast_path = generate_podcast_summary(book_path, book_title, "/tmp")

        if podcast_path:
            print(f"Success! Podcast saved to: {podcast_path}")
        else:
            print("Failed to generate podcast")
    else:
        print("Usage: python podcast_service.py <path_to_book>")
