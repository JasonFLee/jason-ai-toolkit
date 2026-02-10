#!/usr/bin/env python3
"""
Main orchestrator for automated book processing system.

Monitors Google Tasks 'To read' list and processes books through:
1. Download from LibGen
2. Podcast summary generation
3. Audiobook conversion
4. Upload to Google Drive
"""

import sys
import os
from loguru import logger
from datetime import datetime

# Local imports
from config import (
    DB_PATH, TASKS_CUTOFF_DATE, LOGS_DIR, LOG_LEVEL,
    STALLED_JOB_TIMEOUT_HOURS
)
from state_manager import StateManager
from services.google_tasks_service import fetch_to_read_tasks
from services.libgen_service import download_book
from services.podcast_service import generate_podcast_summary
from services.audiobook_service import convert_to_audiobook
from services.drive_service import upload_book_assets


def setup_logging():
    """Configure logging"""
    os.makedirs(LOGS_DIR, exist_ok=True)

    log_file = os.path.join(LOGS_DIR, "main.log")

    # Configure loguru
    logger.remove()  # Remove default handler

    # Add file handler with rotation
    logger.add(
        log_file,
        rotation="10 MB",
        retention="30 days",
        level=LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}"
    )

    # Add console handler
    logger.add(
        sys.stderr,
        level=LOG_LEVEL,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    )

    logger.info("="  * 60)
    logger.info("Book Processor Starting")
    logger.info("=" * 60)


def process_book(state_mgr: StateManager, book: dict) -> bool:
    """
    Process a single book through all stages.

    Args:
        state_mgr: State manager instance
        book: Book state dictionary

    Returns:
        True if completed successfully, False otherwise
    """
    task_id = book['task_id']
    book_title = book['book_title']

    logger.info(f"Processing book: {book_title} (Status: {book['status']})")

    try:
        # Stage 1: Download book
        if book['status'] in ['pending', 'downloading']:
            logger.info(f"[{book_title}] Stage 1: Downloading from LibGen")
            state_mgr.update_status(task_id, 'downloading')

            book_path = download_book(book_title)

            if not book_path:
                error_msg = "Book download failed - not found in LibGen"
                logger.error(f"[{book_title}] {error_msg}")
                state_mgr.record_error(task_id, error_msg)
                return False

            logger.info(f"[{book_title}] Downloaded: {book_path}")
            state_mgr.update_status(
                task_id,
                'podcast_generating',
                book_file_path=book_path
            )

            # Update book state for next stage
            book = state_mgr.get_book_state(task_id)

        # Stage 2: Generate podcast summary
        if book['status'] == 'podcast_generating':
            logger.info(f"[{book_title}] Stage 2: Generating podcast summary")

            podcast_path = generate_podcast_summary(
                book['book_file_path'],
                book_title
            )

            if not podcast_path:
                error_msg = "Podcast generation failed"
                logger.error(f"[{book_title}] {error_msg}")
                state_mgr.record_error(task_id, error_msg)
                return False

            logger.info(f"[{book_title}] Podcast generated: {podcast_path}")
            state_mgr.update_status(
                task_id,
                'audiobook_converting',
                podcast_file_path=podcast_path
            )

            # Update book state for next stage
            book = state_mgr.get_book_state(task_id)

        # Stage 3: Convert to audiobook
        if book['status'] == 'audiobook_converting':
            logger.info(f"[{book_title}] Stage 3: Converting to audiobook (this may take a while)")

            audiobook_dir = convert_to_audiobook(
                book['book_file_path'],
                book_title
            )

            if not audiobook_dir:
                error_msg = "Audiobook conversion failed"
                logger.error(f"[{book_title}] {error_msg}")
                state_mgr.record_error(task_id, error_msg)
                return False

            logger.info(f"[{book_title}] Audiobook created: {audiobook_dir}")
            state_mgr.update_status(
                task_id,
                'uploading',
                audiobook_dir_path=audiobook_dir
            )

            # Update book state for next stage
            book = state_mgr.get_book_state(task_id)

        # Stage 4: Upload to Google Drive
        if book['status'] == 'uploading':
            logger.info(f"[{book_title}] Stage 4: Uploading to Google Drive")

            upload_result = upload_book_assets(book, book_title)

            if not upload_result['folder_id']:
                error_msg = "Google Drive upload failed"
                logger.error(f"[{book_title}] {error_msg}")
                state_mgr.record_error(task_id, error_msg)
                return False

            # Update database with Drive IDs
            import json
            state_mgr.update_status(
                task_id,
                'uploading',  # Keep as uploading while we record IDs
                drive_folder_id=upload_result['folder_id'],
                drive_book_file_id=upload_result.get('book_file_id'),
                drive_podcast_file_id=upload_result.get('podcast_file_id'),
                drive_audiobook_file_ids=json.dumps(upload_result.get('audiobook_file_ids', []))
            )

            # Mark as completed
            state_mgr.mark_completed(task_id, upload_result['folder_id'])

            logger.success(f"✓ [{book_title}] COMPLETED - All files uploaded to Google Drive")
            return True

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.exception(f"[{book_title}] {error_msg}")
        state_mgr.record_error(task_id, error_msg)
        return False

    return False


def main():
    """Main orchestrator entry point"""
    setup_logging()

    try:
        state_mgr = StateManager(DB_PATH)

        # 1. Reset stalled jobs (stuck >24h)
        logger.info("Checking for stalled jobs...")
        state_mgr.reset_stalled_jobs(timeout_hours=STALLED_JOB_TIMEOUT_HOURS)

        # 2. Resume any in-progress books first
        resumable = state_mgr.get_resumable_books()
        if resumable:
            logger.info(f"Found {len(resumable)} resumable book(s)")
            for book in resumable:
                process_book(state_mgr, book)

        # 3. Fetch new tasks from Google Tasks
        logger.info(f"Fetching new tasks from Google Tasks (after {TASKS_CUTOFF_DATE})...")
        try:
            new_tasks = fetch_to_read_tasks(TASKS_CUTOFF_DATE)

            # 4. Create DB entries for new tasks
            new_count = 0
            for task in new_tasks:
                if not state_mgr.get_book_state(task.id):
                    state_mgr.create_book_entry(
                        task.id,
                        task.title,
                        task.created
                    )
                    new_count += 1
                    logger.info(f"Added new book to queue: {task.title}")

            if new_count > 0:
                logger.info(f"Added {new_count} new book(s) to processing queue")

        except Exception as e:
            logger.error(f"Failed to fetch Google Tasks: {e}")

        # 5. Process pending books
        pending = state_mgr.get_pending_books()
        if pending:
            logger.info(f"Processing {len(pending)} pending book(s)")

            for book in pending:
                process_book(state_mgr, book)
        else:
            logger.info("No pending books to process")

        # 6. Summary
        logger.info("="  * 60)
        logger.info("Processing Summary:")

        all_books = state_mgr.get_all_books()
        status_counts = {}
        for book in all_books:
            status = book['status']
            status_counts[status] = status_counts.get(status, 0) + 1

        for status, count in sorted(status_counts.items()):
            logger.info(f"  {status}: {count}")

        logger.info("=" * 60)
        logger.info("Book Processor Run Completed")
        logger.info("=" * 60)

    except Exception as e:
        logger.exception(f"Fatal error in main orchestrator: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
