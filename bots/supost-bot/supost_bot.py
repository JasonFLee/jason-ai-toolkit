"""
SUPost Bot - Automated Housing Listing Responder

Monitors SUPost housing listings and automatically sends messages to
relevant posts (roommate searches, subleases) for Jan-Feb timeframes.
Uses Playwright for headless browser automation.
"""

import json
import os
import re
import time
import logging
from datetime import datetime, date
from typing import List, Dict, Optional
from pathlib import Path

from playwright.sync_api import sync_playwright, Browser, Page
from openai import OpenAI

# OpenAI client for filtering and tailoring
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/Users/jasonlee/codingProjects/supost-bot/bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SUPostScraper:
    """Scrapes housing listings from SUPost using Playwright"""

    BASE_URL = "https://supost.com/search/cat/3"

    def __init__(self, browser: Browser):
        self.browser = browser
        self.posts: List[Dict] = []

    def fetch_posts(self) -> List[Dict]:
        """Fetch posts from SUPost housing page"""
        posts = []
        page = self.browser.new_page()

        try:
            logger.info(f"Fetching posts from {self.BASE_URL}")
            page.goto(self.BASE_URL, wait_until='domcontentloaded')
            page.wait_for_timeout(2000)  # Wait for page to fully load

            # Get all post links
            links = page.query_selector_all('a[href*="/post/index/"]')

            current_date_section = None

            for link in links:
                href = link.get_attribute('href')
                title = link.inner_text().strip()

                if not href or not title:
                    continue

                # Extract post ID from URL
                match = re.search(r'/post/index/(\d+)', href)
                if not match:
                    continue

                post_id = match.group(1)

                # Try to find the date from preceding elements
                # Dates appear as "Mon, Dec 08" in the page
                post_date = self._extract_post_date(page, link)

                posts.append({
                    'id': post_id,
                    'title': title,
                    'url': f"https://supost.com/post/index/{post_id}",
                    'date': post_date,
                    'content': ''  # Will be fetched when needed
                })

            logger.info(f"Found {len(posts)} posts")

        except Exception as e:
            logger.error(f"Error fetching posts: {e}")
        finally:
            page.close()

        return posts

    def _extract_post_date(self, page: Page, link) -> Optional[date]:
        """Extract post date - defaults to today if not found"""
        try:
            # Get page content and find dates
            content = page.content()

            # Look for date patterns like "Mon, Dec 08" or "Sun, Dec 07"
            # The dates appear before groups of posts
            date_pattern = r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (Dec|Jan|Feb|Nov) (\d{1,2})'
            matches = re.findall(date_pattern, content)

            if matches:
                # Use the most recent date found (first one is usually current)
                _, month_str, day_str = matches[0]
                month_map = {'Jan': 1, 'Feb': 2, 'Nov': 11, 'Dec': 12}
                month = month_map.get(month_str, 12)
                day = int(day_str)
                year = 2025
                return date(year, month, day)
        except:
            pass

        return date.today()

    def get_post_details(self, post_url: str) -> Dict:
        """Get detailed content from a specific post page"""
        page = self.browser.new_page()
        details = {'content': '', 'full_text': ''}

        try:
            page.goto(post_url, wait_until='domcontentloaded')
            page.wait_for_timeout(1000)

            # Get all text content from the page
            body_text = page.inner_text('body')
            details['full_text'] = body_text
            details['content'] = body_text

        except Exception as e:
            logger.error(f"Error fetching post details: {e}")
        finally:
            page.close()

        return details


class PostFilter:
    """Simple GPT-only filter - asks GPT if the post could work"""

    def filter_by_date(self, posts: List[Dict], min_date: date) -> List[Dict]:
        """Filter posts to only include those on or after min_date"""
        return [p for p in posts if p.get('date') and p['date'] >= min_date]

    def could_work_gpt(self, post: Dict) -> bool:
        """
        Ask GPT: could this listing work for someone looking for a sublease mid-Feb to June?
        """
        title = post.get('title', '')
        content = post.get('content', '')[:2000]

        prompt = f"""I'm looking for housing from Jan/Feb 2026 to June 2026. Could this listing maybe work for me?

LISTING:
Title: {title}
Content: {content}

SAY YES unless it's obviously wrong. Be very generous.

YES if:
- Any housing post that doesn't clearly conflict
- Dates not specified
- Long-term, month-to-month, flexible
- Available anytime Jan through June
- Someone looking for housing (I could offer them a place)
- Unclear timing (give benefit of doubt)

Only NO if:
- Clearly just Dec or winter break only
- Explicitly ends before Jan
- Not housing at all (parking, storage, pet sitting)

Default to YES. Answer ONLY "YES" or "NO"."""

        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=10,
                temperature=0
            )
            answer = response.choices[0].message.content.strip().upper()
            result = answer == "YES"
            logger.info(f"GPT check '{title[:40]}...': {answer}")
            return result
        except Exception as e:
            logger.error(f"GPT API error: {e}")
            return True


class SentPostsTracker:
    """Tracks which posts have already been messaged to avoid duplicates"""

    def __init__(self, filepath: str = None):
        self.filepath = filepath or '/Users/jasonlee/codingProjects/supost-bot/sent_posts.json'
        self.sent_ids: set = set()
        self._load()

    def _load(self):
        """Load sent post IDs from file"""
        try:
            if os.path.exists(self.filepath):
                with open(self.filepath, 'r') as f:
                    data = json.load(f)
                    self.sent_ids = set(data.get('sent_ids', []))
        except (json.JSONDecodeError, IOError):
            self.sent_ids = set()

    def _save(self):
        """Save sent post IDs to file"""
        with open(self.filepath, 'w') as f:
            json.dump({'sent_ids': list(self.sent_ids)}, f)

    def mark_as_sent(self, post_id: str):
        """Mark a post as having been messaged"""
        self.sent_ids.add(post_id)
        self._save()

    def has_been_sent(self, post_id: str) -> bool:
        """Check if a post has already been messaged"""
        return post_id in self.sent_ids


class MessageSender:
    """Sends messages to SUPost listings via Playwright"""

    def __init__(self, browser: Browser, email: str, message_template: str):
        self.browser = browser
        self.email = email
        self.message_template = message_template

    def tailor_message(self, post_title: str, post_content: str) -> str:
        """Use GPT to slightly tailor the message based on the post"""
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{
                    "role": "user",
                    "content": f"""Tailor my message to this specific housing post. Add 1-2 sentences that reference something SPECIFIC from their post (location, amenities, vibe, roommates, etc). Make it feel like I actually read their listing.

MY BASE MESSAGE:
{self.message_template}

THEIR POST:
Title: {post_title}
Content: {post_content[:800]}

Rules:
- Keep my core message intact
- ADD a sentence or two that shows I read their post (mention their neighborhood, the backyard, the kitchen, roommate situation, etc)
- No em dashes
- Sound genuine, not robotic
- Keep it concise

Output ONLY the tailored message."""
                }],
                max_tokens=500,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"GPT tailoring error: {e}")
            return self.message_template

    def send_message(self, post_url: str, post_title: str = "", post_content: str = "") -> bool:
        """
        Send message to a post using Playwright
        Returns True if successful, False otherwise
        """
        page = self.browser.new_page()

        try:
            logger.info(f"Sending message to {post_url}")
            page.goto(post_url, wait_until='domcontentloaded')
            page.wait_for_timeout(1500)

            # Tailor the message based on the post
            message = self.tailor_message(post_title, post_content)

            # Find and fill the message textarea
            message_box = page.query_selector('textarea')
            if not message_box:
                logger.error("Could not find message textarea")
                return False

            message_box.fill(message)

            # Find and fill the email input
            email_box = page.query_selector('#message_email')
            if not email_box:
                email_box = page.query_selector('input[name="message[email]"]')

            if email_box:
                email_box.fill(self.email)
                logger.info(f"Filled email: {self.email}")
            else:
                logger.error("Could not find email input")
                return False

            # Find and click the Send button
            send_button = page.query_selector('button:has-text("Send")')
            if not send_button:
                send_button = page.query_selector('input[value="Send!"]')

            if not send_button:
                logger.error("Could not find Send button")
                return False

            send_button.click()
            page.wait_for_timeout(2000)

            # Verify message was sent - check a few times
            for _ in range(3):
                page.wait_for_timeout(1000)
                page_content = page.inner_text('body')
                if 'Message Sent!' in page_content or 'sent' in page_content.lower():
                    logger.info("Message sent successfully!")
                    return True

            # If we clicked send and no error, assume it worked
            logger.info("Message sent (assumed success after clicking Send)")
            return True

        except Exception as e:
            logger.error(f"Error sending message: {e}")
            return False
        finally:
            page.close()


class SUPostBot:
    """Main bot that orchestrates scraping, filtering, and messaging"""

    def __init__(
        self,
        browser: Browser,
        email: str,
        message_template: str,
        tracker_filepath: str = None,
        min_date: date = None
    ):
        self.browser = browser
        self.scraper = SUPostScraper(browser)
        self.filter = PostFilter()
        self.tracker = SentPostsTracker(filepath=tracker_filepath)
        self.sender = MessageSender(browser, email=email, message_template=message_template)
        self.min_date = min_date or date(2025, 12, 8)

    def get_new_matching_posts(self) -> List[Dict]:
        """Get posts that match criteria and haven't been messaged yet"""
        posts = self.scraper.fetch_posts()
        logger.info(f"Starting with {len(posts)} posts")

        # Step 1: Filter to ONLY today's posts
        today = date.today()

        # Skip Dec 12, 2025 only
        if today == date(2025, 12, 12):
            logger.info("Skipping Dec 12, 2025 as requested")
            return []

        posts = [p for p in posts if p.get('date') == today]
        logger.info(f"After filtering to today ({today}): {len(posts)} posts")

        if not posts:
            logger.info("No new posts for today")
            return []

        # Step 2: Exclude already messaged posts (no content needed)
        posts = [p for p in posts if not self.tracker.has_been_sent(p.get('id', ''))]
        logger.info(f"After excluding sent posts: {len(posts)} posts")

        # Step 3: Quick title-based filter for obvious non-housing stuff
        def title_might_be_housing(post):
            title = post.get('title', '').lower()
            # Skip obvious non-housing posts
            skip_keywords = ['parking', 'garage', 'storage', 'cat sitter', 'pet sitter', 'dog sitter', 'car storage']
            for kw in skip_keywords:
                if kw in title:
                    return False
            return True

        posts = [p for p in posts if title_might_be_housing(p)]
        logger.info(f"After title pre-filter: {len(posts)} posts to fetch details for")

        # Step 4: Fetch detailed content only for remaining candidates
        for i, post in enumerate(posts):
            if not post.get('content'):
                logger.info(f"Fetching details {i+1}/{len(posts)}: {post.get('title', '')[:40]}...")
                details = self.scraper.get_post_details(post['url'])
                post['content'] = details.get('content', '')

        # Step 5: GPT decides if each post could work
        filtered = [p for p in posts if self.filter.could_work_gpt(p)]
        logger.info(f"After GPT filter: {len(filtered)} posts")

        logger.info(f"Found {len(filtered)} new matching posts")
        return filtered

    def run(self) -> List[Dict]:
        """
        Run the bot: fetch, filter, and message new posts
        Returns list of posts that were messaged
        """
        messaged = []
        new_posts = self.get_new_matching_posts()

        for post in new_posts:
            logger.info(f"Processing: {post.get('title', 'Unknown')}")
            success = self.sender.send_message(post['url'], post.get('title', ''), post.get('content', ''))
            if success:
                self.tracker.mark_as_sent(post['id'])
                messaged.append(post)
                logger.info(f"Successfully messaged: {post.get('title', 'Unknown')}")
                # Small delay between messages to be polite
                time.sleep(3)
            else:
                logger.warning(f"Failed to message: {post.get('title', 'Unknown')}")

        return messaged


def run_once():
    """Run the bot once (for daemon/scheduled execution). Retries on network failure."""
    MESSAGE_TEMPLATE = """Hello, I hope you're having a wonderful day. I just finished my master's degree at Dartmouth, and I will be working full-time at Netflix. I'm looking for housing from Jan/Feb to June. I want to live near Stanford because many of my friends research and study there, and I also train with their triathlon team. Let me know if you'd like to have a call! I love running, meditating, and making things like films and robots.
I'm a tidy, easygoing person who enjoys good conversations. I'm flexible about household dynamics and comfortable living with anyone.
719-440-6373 :)"""

    EMAIL = "jason.lee.jfl@gmail.com"
    MAX_RETRIES = 3
    RETRY_DELAY = 300  # 5 minutes between retries

    for attempt in range(MAX_RETRIES):
        logger.info("=" * 50)
        logger.info(f"Starting SUPost bot run at {datetime.now()} (attempt {attempt + 1}/{MAX_RETRIES})")
        logger.info("=" * 50)

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)

                try:
                    bot = SUPostBot(
                        browser=browser,
                        email=EMAIL,
                        message_template=MESSAGE_TEMPLATE
                    )
                    messaged = bot.run()
                    logger.info(f"Run complete. Messaged {len(messaged)} posts.")
                    return  # Success, exit
                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Run failed: {e}")
            if attempt < MAX_RETRIES - 1:
                logger.info(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
            else:
                logger.error("All retries exhausted. Will try again at next scheduled run.")


def run_scheduler():
    """Run the bot on a schedule (hourly)"""
    import schedule

    # Run immediately on start
    run_once()

    # Schedule hourly runs
    schedule.every(1).hours.do(run_once)

    logger.info("Scheduler started. Running every hour. Press Ctrl+C to stop.")
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--scheduler':
        run_scheduler()
    else:
        # Default: run once (for launchd daemon)
        run_once()
