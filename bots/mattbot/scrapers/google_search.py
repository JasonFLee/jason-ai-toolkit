"""Web search scraper using DuckDuckGo"""

import re
from typing import List, Optional
from datetime import datetime
from dateutil import parser as date_parser
from ddgs import DDGS
from loguru import logger

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.base_scraper import BaseScraper
from models.event import Event
from config import SEARCH_QUERIES


class GoogleSearchScraper(BaseScraper):
    """Searches web for Matt Knight events using DuckDuckGo"""

    # MUST have one of these to confirm it's the OpenAI Matt Knight
    OPENAI_KEYWORDS = [
        'openai', 'open ai', 'ciso', 'chief information security officer',
        'embeddedsec', '@embeddedsec',
    ]

    # Additional context keywords (event-related)
    EVENT_KEYWORDS = [
        'conference', 'summit', 'keynote', 'speaker', 'speaking',
        'panel', 'event', 'talk', 'presentation', 'session',
        'rsa', 'rsac', 'black hat', 'blackhat', 'def con', 'defcon',
        'acsac', 'hitb', 'infosec',
    ]

    def __init__(self, target_names: List[str]):
        super().__init__("Web Search", target_names)
        self.queries = SEARCH_QUERIES

    def _is_relevant_result(self, content: str) -> bool:
        """Check if the result is actually about the OpenAI Matt Knight"""
        content_lower = content.lower()

        # Must mention Matt Knight
        has_name = self.contains_target(content)
        if not has_name:
            return False

        # MUST mention OpenAI or related identifier to confirm it's the right person
        is_openai_matt = any(kw in content_lower for kw in self.OPENAI_KEYWORDS)

        return is_openai_matt

    def scrape(self) -> List[Event]:
        events = []
        seen_urls = set()

        with DDGS() as ddgs:
            for query in self.queries:
                try:
                    logger.debug(f"Searching: {query}")
                    results = ddgs.text(query, max_results=10)

                    for result in results:
                        url = result.get('href', '')

                        # Deduplicate by URL
                        if url in seen_urls:
                            continue
                        seen_urls.add(url)

                        title = result.get('title', '')
                        body = result.get('body', '')

                        # Only include if this is about the OpenAI Matt Knight
                        content = f"{title} {body}"
                        if self._is_relevant_result(content):
                            # Try to extract date from content
                            event_date = self._extract_date(content)

                            event = Event(
                                title=title,
                                source="Web Search",
                                url=url,
                                event_date=event_date,
                                description=body[:500] if body else None,
                            )
                            events.append(event)
                            logger.debug(f"Found relevant event: {title}")
                        else:
                            logger.debug(f"Skipped irrelevant result: {title}")

                except Exception as e:
                    logger.warning(f"Search query failed '{query}': {e}")
                    continue

        return events

    def _extract_date(self, text: str) -> Optional[datetime]:
        """Try to extract a future date from text - only accepts dates with explicit year 2025 or later"""
        now = datetime.now()
        current_year = now.year

        # Only accept patterns with EXPLICIT year (2025 or later)
        # This avoids false positives from old articles mentioning dates
        patterns = [
            # Full dates with explicit year
            r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(202[5-9]|20[3-9]\d)\b',
            r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(202[5-9]|20[3-9]\d)\b',
            r'\b\d{1,2}/\d{1,2}/(202[5-9]|20[3-9]\d)\b',
            r'\b(202[5-9]|20[3-9]\d)-\d{2}-\d{2}\b',
            # Also match "March 27-28, 2025" style
            r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:-\d{1,2})?,?\s+(202[5-9]|20[3-9]\d)\b',
        ]

        found_dates = []

        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    date_str = match.group()
                    parsed = date_parser.parse(date_str, fuzzy=True)

                    # Only keep future dates
                    if parsed > now:
                        found_dates.append(parsed)
                        logger.debug(f"Found future date: {parsed} from '{date_str}'")
                except Exception:
                    continue

        # Return the earliest future date found
        if found_dates:
            return min(found_dates)

        return None
