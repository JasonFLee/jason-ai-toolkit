"""Abstract base class for event scrapers"""

from abc import ABC, abstractmethod
from typing import List
from loguru import logger

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.event import Event


class BaseScraper(ABC):
    """Base class for all event scrapers"""

    def __init__(self, name: str, target_names: List[str]):
        self.name = name
        self.target_names = target_names

    @abstractmethod
    def scrape(self) -> List[Event]:
        """Scrape source and return list of events mentioning target"""
        pass

    def contains_target(self, text: str) -> bool:
        """Check if text contains any target name"""
        if not text:
            return False
        text_lower = text.lower()
        for name in self.target_names:
            if name.lower() in text_lower:
                return True
        return False

    def safe_scrape(self) -> List[Event]:
        """Wrapper with error handling"""
        try:
            logger.info(f"Starting {self.name} scraper...")
            events = self.scrape()
            logger.info(f"{self.name}: Found {len(events)} events")
            return events
        except Exception as e:
            logger.error(f"{self.name} scraper failed: {e}")
            return []
