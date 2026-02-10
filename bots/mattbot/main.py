#!/usr/bin/env python3
"""
MattBot - Matt Knight Event Tracker

Searches multiple sources daily for upcoming events featuring
Matt Knight (OpenAI CISO) and sends email notifications.
"""

import sys
import os
from datetime import datetime
from typing import List

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from loguru import logger
from config import TARGET_ALIASES, RECIPIENT_EMAIL, LOG_DIR
from models.event import Event
from scrapers.google_search import GoogleSearchScraper
from scrapers.openai_rss import OpenAIRSSScraper
from scrapers.dartmouth import DartmouthScraper
from scrapers.infosec_conf import InfosecConfScraper
from services.gmail_client import GmailClient
from services.deduplicator import Deduplicator

# Configure logging
os.makedirs(LOG_DIR, exist_ok=True)
logger.add(
    os.path.join(LOG_DIR, "mattbot_{time}.log"),
    rotation="1 week",
    retention="1 month",
    level="INFO"
)


def main():
    """Main entry point"""
    logger.info("=" * 50)
    logger.info(f"MattBot starting at {datetime.now()}")
    logger.info("=" * 50)

    # First, try to send any pending emails from previous rate-limited runs
    gmail = GmailClient()
    if gmail.authenticate():
        gmail.send_pending_email()
    else:
        logger.warning("Could not authenticate Gmail to check pending emails")

    # Initialize scrapers
    scrapers = [
        GoogleSearchScraper(TARGET_ALIASES),
        OpenAIRSSScraper(TARGET_ALIASES),
        DartmouthScraper(TARGET_ALIASES),
        InfosecConfScraper(TARGET_ALIASES),
    ]

    # Collect events from all sources
    all_events: List[Event] = []

    for scraper in scrapers:
        events = scraper.safe_scrape()
        all_events.extend(events)

    logger.info(f"Total events collected: {len(all_events)}")

    # Filter to upcoming events with confirmed dates only
    upcoming_events = [e for e in all_events if e.is_upcoming]
    events_without_dates = len([e for e in all_events if not e.has_confirmed_date])
    past_events = len([e for e in all_events if e.has_confirmed_date and not e.is_upcoming])

    logger.info(f"Events with confirmed future dates: {len(upcoming_events)}")
    logger.info(f"Skipped {events_without_dates} events without dates, {past_events} past events")

    # Deduplicate against previously notified
    deduplicator = Deduplicator()
    new_events = deduplicator.filter_new_events(upcoming_events)

    if not new_events:
        logger.info("No new events to notify about - exiting silently")
        return

    logger.info(f"New events to notify: {len(new_events)}")
    for event in new_events:
        logger.info(f"  - {event}")

    # Re-authenticate Gmail if needed (in case first auth failed)
    if not gmail.service:
        if not gmail.authenticate():
            logger.error("Failed to authenticate with Gmail - exiting")
            return

    # Determine recipient email (defaults to authenticated user if not set)
    recipient = RECIPIENT_EMAIL or gmail.get_user_email()
    logger.info(f"Sending notification to: {recipient or 'authenticated user'}")

    # Send email notification
    success = gmail.send_event_notification(recipient, new_events)

    if success:
        # Mark events as notified
        deduplicator.mark_notified(new_events)
        logger.info("Notification sent successfully")
    else:
        logger.error("Failed to send notification")

    logger.info("MattBot finished")


if __name__ == "__main__":
    main()
