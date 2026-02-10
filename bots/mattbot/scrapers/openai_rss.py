"""OpenAI News RSS feed scraper"""

import feedparser
from typing import List
from datetime import datetime
from loguru import logger

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.base_scraper import BaseScraper
from models.event import Event
from config import OPENAI_RSS_URL


class OpenAIRSSScraper(BaseScraper):
    """Scrapes OpenAI News RSS for Matt Knight mentions"""

    def __init__(self, target_names: List[str]):
        super().__init__("OpenAI RSS", target_names)
        self.feed_url = OPENAI_RSS_URL

    def scrape(self) -> List[Event]:
        events = []

        logger.debug(f"Fetching RSS feed: {self.feed_url}")
        feed = feedparser.parse(self.feed_url)

        if feed.bozo:
            logger.warning(f"RSS feed parsing issue: {feed.bozo_exception}")

        for entry in feed.entries:
            # Check title and description for target mentions
            title = entry.get('title', '')
            description = entry.get('description', '') or entry.get('summary', '')
            content = f"{title} {description}"

            if self.contains_target(content):
                # Parse publication date
                pub_date = None
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    pub_date = datetime(*entry.published_parsed[:6])

                event = Event(
                    title=title,
                    source="OpenAI News",
                    url=entry.get('link', ''),
                    event_date=pub_date,
                    description=description[:500] if description else None,
                )
                events.append(event)
                logger.debug(f"Found OpenAI mention: {title}")

        return events
