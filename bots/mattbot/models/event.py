"""Event data model"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import hashlib


@dataclass
class Event:
    """Represents a detected event mentioning Matt Knight"""

    title: str
    source: str
    url: str
    event_date: Optional[datetime] = None
    location: Optional[str] = None
    description: Optional[str] = None
    detected_at: datetime = field(default_factory=datetime.now)

    @property
    def unique_id(self) -> str:
        """Generate unique ID for deduplication based on title and URL"""
        content = f"{self.title}|{self.url}"
        return hashlib.md5(content.encode()).hexdigest()

    @property
    def has_confirmed_date(self) -> bool:
        """Check if event has a confirmed date"""
        return self.event_date is not None

    @property
    def is_upcoming(self) -> bool:
        """Check if event is in the future with a confirmed date"""
        if self.event_date is None:
            return False  # No date = not confirmed upcoming
        return self.event_date > datetime.now()

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'unique_id': self.unique_id,
            'title': self.title,
            'source': self.source,
            'url': self.url,
            'event_date': self.event_date.isoformat() if self.event_date else None,
            'location': self.location,
            'description': self.description,
            'detected_at': self.detected_at.isoformat(),
        }

    def __str__(self) -> str:
        date_str = self.event_date.strftime('%Y-%m-%d') if self.event_date else 'TBD'
        return f"{self.title} ({date_str}) - {self.source}"
