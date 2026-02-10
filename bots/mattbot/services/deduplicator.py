"""Event deduplication to prevent notification spam"""

import json
import os
from datetime import datetime
from typing import List, Set
from loguru import logger

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import NOTIFIED_EVENTS_PATH


class Deduplicator:
    """Tracks events that have already been notified"""

    def __init__(self):
        self.notified_ids: Set[str] = set()
        self._load()

    def _load(self):
        """Load notified event IDs from disk"""
        if os.path.exists(NOTIFIED_EVENTS_PATH):
            try:
                with open(NOTIFIED_EVENTS_PATH, 'r') as f:
                    data = json.load(f)
                    self.notified_ids = set(data.get('notified_ids', []))
                logger.info(f"Loaded {len(self.notified_ids)} previously notified events")
            except Exception as e:
                logger.warning(f"Failed to load notified events: {e}")
                self.notified_ids = set()
        else:
            logger.info("No previous notification history found")

    def _save(self):
        """Save notified event IDs to disk"""
        try:
            data = {
                'notified_ids': list(self.notified_ids),
                'last_updated': datetime.now().isoformat(),
            }
            with open(NOTIFIED_EVENTS_PATH, 'w') as f:
                json.dump(data, f, indent=2)
            logger.debug(f"Saved {len(self.notified_ids)} event IDs to disk")
        except Exception as e:
            logger.error(f"Failed to save notified events: {e}")

    def filter_new_events(self, events: List) -> List:
        """Return only events that haven't been notified yet"""
        new_events = []

        for event in events:
            if event.unique_id not in self.notified_ids:
                new_events.append(event)

        logger.info(f"Filtered {len(events)} events to {len(new_events)} new events")
        return new_events

    def mark_notified(self, events: List):
        """Mark events as notified"""
        for event in events:
            self.notified_ids.add(event.unique_id)
        self._save()
        logger.info(f"Marked {len(events)} events as notified")

    def clear_history(self):
        """Clear all notification history (for testing)"""
        self.notified_ids = set()
        self._save()
        logger.info("Cleared notification history")
