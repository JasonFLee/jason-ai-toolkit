"""State management with SQLite for book processing pipeline"""

import sqlite3
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import asdict
import os


class StateManager:
    """Manages persistent state for book processing using SQLite"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database schema if it doesn't exist"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS book_processing (
                task_id TEXT PRIMARY KEY,
                book_title TEXT NOT NULL,
                task_created_date TEXT NOT NULL,
                status TEXT NOT NULL,
                book_file_path TEXT,
                podcast_file_path TEXT,
                audiobook_dir_path TEXT,
                drive_folder_id TEXT,
                drive_book_file_id TEXT,
                drive_podcast_file_id TEXT,
                drive_audiobook_file_ids TEXT,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                audiobook_progress TEXT,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()
        conn.close()

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with row factory"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def create_book_entry(self, task_id: str, title: str, created_date: str) -> None:
        """Create a new book processing entry"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR IGNORE INTO book_processing
            (task_id, book_title, task_created_date, status)
            VALUES (?, ?, ?, ?)
        ''', (task_id, title, created_date, 'pending'))

        conn.commit()
        conn.close()

    def get_book_state(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get current state of a book by task_id"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute(
            'SELECT * FROM book_processing WHERE task_id = ?',
            (task_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None

    def update_status(self, task_id: str, status: str, **metadata) -> None:
        """Update book status and optional metadata fields"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Build update query dynamically based on provided metadata
        update_fields = ['status = ?', 'last_updated = ?']
        values = [status, datetime.now().isoformat()]

        for key, value in metadata.items():
            if key in ['book_file_path', 'podcast_file_path', 'audiobook_dir_path',
                      'drive_folder_id', 'drive_book_file_id', 'drive_podcast_file_id',
                      'drive_audiobook_file_ids', 'audiobook_progress']:
                update_fields.append(f'{key} = ?')
                # Convert lists/dicts to JSON for storage
                if isinstance(value, (list, dict)):
                    value = json.dumps(value)
                values.append(value)

        values.append(task_id)
        query = f'''
            UPDATE book_processing
            SET {', '.join(update_fields)}
            WHERE task_id = ?
        '''

        cursor.execute(query, values)
        conn.commit()
        conn.close()

    def record_error(self, task_id: str, error_msg: str) -> None:
        """Record error and increment retry count"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE book_processing
            SET status = 'failed',
                error_message = ?,
                retry_count = retry_count + 1,
                last_updated = ?
            WHERE task_id = ?
        ''', (error_msg, datetime.now().isoformat(), task_id))

        conn.commit()
        conn.close()

    def mark_completed(self, task_id: str, drive_folder_id: str) -> None:
        """Mark book as completed"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE book_processing
            SET status = 'completed',
                drive_folder_id = ?,
                last_updated = ?
            WHERE task_id = ?
        ''', (drive_folder_id, datetime.now().isoformat(), task_id))

        conn.commit()
        conn.close()

    def get_pending_books(self) -> List[Dict[str, Any]]:
        """Get all books in pending status"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM book_processing
            WHERE status = 'pending'
            ORDER BY task_created_date ASC
        ''')

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_resumable_books(self) -> List[Dict[str, Any]]:
        """Get books in in-progress states (can be resumed)"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM book_processing
            WHERE status IN ('downloading', 'podcast_generating',
                           'audiobook_converting', 'uploading')
            ORDER BY last_updated ASC
        ''')

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def reset_stalled_jobs(self, timeout_hours: int = 24) -> None:
        """Reset jobs that have been in-progress for too long"""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Calculate timeout threshold
        timeout_threshold = datetime.now().timestamp() - (timeout_hours * 3600)

        cursor.execute('''
            UPDATE book_processing
            SET status = 'failed',
                error_message = 'Job stalled - exceeded timeout',
                last_updated = ?
            WHERE status IN ('downloading', 'podcast_generating',
                           'audiobook_converting', 'uploading')
              AND datetime(last_updated) < datetime(?, 'unixepoch')
        ''', (datetime.now().isoformat(), timeout_threshold))

        stalled_count = cursor.rowcount
        conn.commit()
        conn.close()

        if stalled_count > 0:
            print(f"Reset {stalled_count} stalled job(s)")

    def get_failed_books(self, min_retry_count: int = 3) -> List[Dict[str, Any]]:
        """Get books that have failed after max retries"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM book_processing
            WHERE status = 'failed' AND retry_count >= ?
            ORDER BY last_updated DESC
        ''', (min_retry_count,))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_all_books(self) -> List[Dict[str, Any]]:
        """Get all books for debugging/monitoring"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM book_processing ORDER BY task_created_date DESC')

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]
