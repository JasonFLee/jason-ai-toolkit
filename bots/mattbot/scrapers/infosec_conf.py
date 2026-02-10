"""Infosec-conferences.com scraper"""

import requests
from bs4 import BeautifulSoup
from typing import List
from loguru import logger

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.base_scraper import BaseScraper
from models.event import Event
from config import INFOSEC_CONFERENCES_URL


class InfosecConfScraper(BaseScraper):
    """Scrapes infosec-conferences.com for events mentioning Matt Knight"""

    def __init__(self, target_names: List[str]):
        super().__init__("Infosec Conferences", target_names)
        self.base_url = INFOSEC_CONFERENCES_URL
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }

    def scrape(self) -> List[Event]:
        events = []

        try:
            logger.debug(f"Fetching: {self.base_url}")
            response = requests.get(self.base_url, headers=self.headers, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')
            text_content = soup.get_text()

            # Check if Matt Knight is mentioned anywhere
            if not self.contains_target(text_content):
                logger.debug("No Matt Knight mentions on infosec-conferences.com")
                return events

            logger.info("Found potential Matt Knight mention on infosec-conferences.com")

            # Look for conference listings
            # The site structure may vary, search for common patterns
            conf_elements = soup.find_all(['article', 'div', 'tr'], class_=lambda x: x and ('conf' in x.lower() or 'event' in x.lower()) if x else False)

            for elem in conf_elements:
                elem_text = elem.get_text()

                if self.contains_target(elem_text):
                    # Extract title and link
                    link = elem.find('a', href=True)
                    title = link.get_text(strip=True) if link else elem_text[:100]
                    url = link['href'] if link else self.base_url

                    if not url.startswith('http'):
                        url = f"{self.base_url.rstrip('/')}/{url.lstrip('/')}"

                    event = Event(
                        title=title,
                        source="Infosec Conferences",
                        url=url,
                        description=elem_text[:500],
                    )
                    events.append(event)

            # If mentions found but no structured events, create generic
            if not events and self.contains_target(text_content):
                event = Event(
                    title="Matt Knight mention on Infosec Conferences",
                    source="Infosec Conferences",
                    url=self.base_url,
                    description="Matt Knight mentioned on infosec-conferences.com - check site for details",
                )
                events.append(event)

        except Exception as e:
            logger.error(f"Failed to scrape infosec-conferences.com: {e}")

        return events
