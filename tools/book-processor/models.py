"""Data models for book-processor"""

from dataclasses import dataclass
from typing import Optional, List


@dataclass
class BookState:
    """Represents the processing state of a book"""
    task_id: str
    book_title: str
    task_created_date: str
    status: str  # pending, downloading, podcast_generating, audiobook_converting, uploading, completed, failed
    book_file_path: Optional[str] = None
    podcast_file_path: Optional[str] = None
    audiobook_dir_path: Optional[str] = None
    drive_folder_id: Optional[str] = None
    drive_book_file_id: Optional[str] = None
    drive_podcast_file_id: Optional[str] = None
    drive_audiobook_file_ids: Optional[str] = None  # JSON string of list
    error_message: Optional[str] = None
    retry_count: int = 0
    audiobook_progress: Optional[str] = None  # JSON string with progress metadata
    last_updated: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> 'BookState':
        """Create BookState from dictionary"""
        return cls(**{k: v for k, v in data.items() if k in cls.__annotations__})

    def is_resumable(self) -> bool:
        """Check if this book can be resumed"""
        return self.status in ['downloading', 'podcast_generating',
                               'audiobook_converting', 'uploading']

    def is_failed(self) -> bool:
        """Check if this book has failed"""
        return self.status == 'failed'

    def is_completed(self) -> bool:
        """Check if this book is completed"""
        return self.status == 'completed'


@dataclass
class GoogleTask:
    """Represents a Google Task from the 'To read' list"""
    id: str
    title: str
    created: str
    status: str  # needsAction, completed

    @classmethod
    def from_api_response(cls, task_data: dict) -> 'GoogleTask':
        """Create GoogleTask from Google Tasks API response"""
        return cls(
            id=task_data.get('id'),
            title=task_data.get('title', 'Untitled'),
            created=task_data.get('updated', task_data.get('created', '')),
            status=task_data.get('status', 'needsAction')
        )
