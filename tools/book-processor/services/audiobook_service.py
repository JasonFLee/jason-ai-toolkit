"""Audiobook conversion service using epub-narrator with Kokoro TTS via subprocess"""

import os
import subprocess
import json
import time
from typing import Optional, Dict
from loguru import logger

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import (
    AUDIOBOOK_VOICE, AUDIOBOOK_LANG, AUDIOBOOKS_DIR, AUDIOBOOK_FORMAT
)
from services.libgen_service import sanitize_filename

# Path to pdf-narrator project
PDF_NARRATOR_PATH = "/Users/jasonlee/codingProjects/pdf-narrator"
PDF_NARRATOR_VENV = os.path.join(PDF_NARRATOR_PATH, "venv/bin/python")
EPUB2AUDIO_SCRIPT = os.path.join(PDF_NARRATOR_PATH, "epub2audio.py")


def convert_to_audiobook(
    book_path: str,
    book_title: str,
    output_base_dir: str = AUDIOBOOKS_DIR,
    voice: str = AUDIOBOOK_VOICE,
    lang_code: str = AUDIOBOOK_LANG
) -> Optional[str]:
    """
    Convert book to audiobook using epub-narrator via subprocess.

    Args:
        book_path: Path to book file (PDF/EPUB)
        book_title: Title of the book
        output_base_dir: Base directory for audiobook output
        voice: Kokoro voice identifier
        lang_code: Language code

    Returns:
        Path to audiobook directory containing audio files, or None on failure
    """
    try:
        safe_title = sanitize_filename(book_title)

        # Create audiobook output directory
        audio_output_dir = os.path.join(output_base_dir, f"{safe_title}_audiobook")
        os.makedirs(audio_output_dir, exist_ok=True)

        logger.info(f"Starting audiobook conversion for: {book_title}")
        logger.info(f"Voice: {voice}, Language: {lang_code}")
        logger.info(f"Output directory: {audio_output_dir}")

        # Build command to run epub2audio.py
        # Format: python epub2audio.py <file> <voice> <speed>
        cmd = [
            PDF_NARRATOR_VENV,
            EPUB2AUDIO_SCRIPT,
            book_path,
            voice,
            "1.0"  # speed
        ]

        logger.info(f"Running: {' '.join(cmd)}")

        # Set environment variable for MPS fallback (macOS GPU issue workaround)
        env = os.environ.copy()
        env['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'

        # Run the conversion process
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env
        )

        # Monitor output with progress tracking
        last_log_time = time.time()
        for line in iter(process.stdout.readline, ''):
            if line:
                # Show all progress lines (they have % in them)
                if '%]' in line or 'Page' in line or 'Done!' in line or 'SUCCESS' in line:
                    logger.info(line.strip())

                # Log other output occasionally (every 30 seconds)
                current_time = time.time()
                if current_time - last_log_time > 30:
                    logger.info(f"Still processing: {line.strip()}")
                    last_log_time = current_time

        process.stdout.close()
        return_code = process.wait()

        if return_code != 0:
            logger.error(f"Audiobook conversion failed with return code: {return_code}")
            return None

        # The script generates <book_name>_audio.mp3 in the same directory as the input
        book_dir = os.path.dirname(book_path)
        book_base = os.path.splitext(os.path.basename(book_path))[0]
        generated_file = os.path.join(book_dir, f"{book_base}_audio.mp3")

        if os.path.exists(generated_file):
            # Verify file is valid and complete (not corrupted/truncated)
            file_size = os.path.getsize(generated_file)

            if file_size < 1024 * 100:  # Less than 100 KB is suspicious
                logger.error(f"Generated audiobook is suspiciously small ({file_size} bytes) - likely incomplete")
                return None

            # Verify it's a valid audio file using file command
            try:
                result = subprocess.run(
                    ['file', generated_file],
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if 'Audio' not in result.stdout and 'MPEG' not in result.stdout:
                    logger.error(f"Generated file is not a valid audio file: {result.stdout}")
                    return None

                logger.info(f"✅ Audiobook verified as valid MP3 ({file_size / (1024*1024):.1f} MB)")

            except Exception as e:
                logger.warning(f"Could not verify audio file (proceeding anyway): {e}")

            # Move to our audiobook directory
            import shutil
            dest_file = os.path.join(audio_output_dir, f"{safe_title}_audiobook.mp3")
            shutil.move(generated_file, dest_file)
            logger.info(f"Audiobook generated: {dest_file}")

            # Final validation of moved file
            if not os.path.exists(dest_file):
                logger.error(f"File move failed - destination doesn't exist: {dest_file}")
                return None

            return audio_output_dir
        else:
            logger.error(f"No audio file generated at expected path: {generated_file}")
            return None

    except Exception as e:
        logger.error(f"Failed to convert to audiobook: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def resume_audiobook_conversion(book_state: Dict) -> Optional[str]:
    """
    Resume interrupted audiobook conversion.

    Args:
        book_state: Book state dictionary from database

    Returns:
        Path to audiobook directory or None on failure
    """
    # Parse audiobook progress if available
    progress_data = None
    if book_state.get('audiobook_progress'):
        try:
            progress_data = json.loads(book_state['audiobook_progress'])
            logger.info(f"Resuming audiobook conversion from: {progress_data}")
        except json.JSONDecodeError:
            logger.warning("Invalid audiobook progress data, starting fresh")

    # Restart the conversion
    return convert_to_audiobook(
        book_state['book_file_path'],
        book_state['book_title']
    )


if __name__ == "__main__":
    # Test the service
    if len(sys.argv) > 1:
        book_path = sys.argv[1]
        book_title = os.path.splitext(os.path.basename(book_path))[0]

        audio_dir = convert_to_audiobook(book_path, book_title, "/tmp")

        if audio_dir:
            print(f"Success! Audiobook saved to: {audio_dir}")
            # List generated files
            files = os.listdir(audio_dir)
            print(f"Generated {len(files)} audio files:")
            for f in sorted(files)[:5]:
                print(f"  - {f}")
            if len(files) > 5:
                print(f"  ... and {len(files) - 5} more")
        else:
            print("Failed to generate audiobook")
    else:
        print("Usage: python audiobook_service.py <path_to_book>")
