"""Dartmouth events page scraper"""

import requests
from bs4 import BeautifulSoup
from typing import List
from loguru import logger

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.base_scraper import BaseScraper
from models.event import Event
from config import DARTMOUTH_EVENTS_URL, DARTMOUTH_ISTS_URL


class DartmouthScraper(BaseScraper):
    """Scrapes Dartmouth events for Matt Knight mentions"""

    def __init__(self, target_names: List[str]):
        super().__init__("Dartmouth Events", target_names)
        self.urls = [DARTMOUTH_EVENTS_URL, DARTMOUTH_ISTS_URL]
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }

    def scrape(self) -> List[Event]:
        events = []

        for url in self.urls:
            try:
                page_events = self._scrape_page(url)
                events.extend(page_events)
            except Exception as e:
                logger.warning(f"Failed to scrape {url}: {e}")

        return events

    def _scrape_page(self, url: str) -> List[Event]:
        events = []

        logger.debug(f"Fetching Dartmouth page: {url}")
        response = requests.get(url, headers=self.headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')

        # Get full text to check for mentions
        text_content = soup.get_text()

        if not self.contains_target(text_content):
            logger.debug(f"No target mentions found on {url}")
            return events

        # Found a mention - try to extract event details
        logger.info(f"Found potential Matt Knight mention on {url}")

        # Look for event-like elements (common patterns)
        event_selectors = [
            'article',
            '.event',
            '.event-item',
            '[class*="event"]',
            '.listing-item',
        ]

        for selector in event_selectors:
            elements = soup.select(selector)
            for elem in elements:
                elem_text = elem.get_text()

                if self.contains_target(elem_text):
                    # Extract title
                    title_elem = elem.find(['h2', 'h3', 'h4', 'a'])
                    title = title_elem.get_text(strip=True) if title_elem else "Dartmouth Event"

                    # Extract link
                    link_elem = elem.find('a', href=True)
                    event_url = url
                    if link_elem:
                        href = link_elem['href']
                        if href.startswith('http'):
                            event_url = href
                        elif href.startswith('/'):
                            # Construct full URL
                            from urllib.parse import urlparse
                            parsed = urlparse(url)
                            event_url = f"{parsed.scheme}://{parsed.netloc}{href}"

                    event = Event(
                        title=title,
                        source="Dartmouth Events",
                        url=event_url,
                        description=elem_text[:500],
                    )
                    events.append(event)

        # If no structured events found but target mentioned, create generic event
        if not events and self.contains_target(text_content):
            event = Event(
                title="Matt Knight mention on Dartmouth",
                source="Dartmouth Events",
                url=url,
                description=text_content[:500],
            )
            events.append(event)

        return events
