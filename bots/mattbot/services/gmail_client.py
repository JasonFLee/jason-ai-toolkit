"""Gmail API client for sending event notifications"""

import os
import json
import base64
import time
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from loguru import logger

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    CREDENTIALS_PATH, TOKEN_PATH, GMAIL_SCOPES,
    GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_PROJECT_ID, BASE_DIR
)

# File to store pending emails when rate limited
PENDING_EMAIL_PATH = os.path.join(BASE_DIR, "pending_email.json")


class GmailClient:
    """Gmail API client for sending notifications"""

    def __init__(self):
        self.service = None
        self.creds = None
        self.user_email = None

    def authenticate(self) -> bool:
        """Authenticate with Gmail API using OAuth2"""
        try:
            if os.path.exists(TOKEN_PATH):
                self.creds = Credentials.from_authorized_user_file(TOKEN_PATH, GMAIL_SCOPES)
                logger.info("Loaded existing OAuth token")

            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    logger.info("Refreshing expired token...")
                    self.creds.refresh(Request())
                else:
                    logger.info("Starting OAuth2 flow...")

                    # Create credentials.json if it doesn't exist
                    self._ensure_credentials_file()

                    flow = InstalledAppFlow.from_client_secrets_file(
                        CREDENTIALS_PATH, GMAIL_SCOPES
                    )
                    self.creds = flow.run_local_server(port=0)

                # Save token
                with open(TOKEN_PATH, 'w') as token:
                    token.write(self.creds.to_json())
                logger.info(f"Saved OAuth token to {TOKEN_PATH}")

            self.service = build('gmail', 'v1', credentials=self.creds)

            # Try to get user's email address (non-critical)
            try:
                profile = self.service.users().getProfile(userId='me').execute()
                self.user_email = profile.get('emailAddress')
                logger.info(f"Gmail API authenticated as: {self.user_email}")
            except HttpError as e:
                # Rate limit or other error - not critical, continue
                logger.warning(f"Could not get user profile (non-critical): {e}")
                self.user_email = None

            return True

        except Exception as e:
            logger.error(f"Failed to authenticate: {e}")
            return False

    def _ensure_credentials_file(self):
        """Create credentials.json from config if needed"""
        if not os.path.exists(CREDENTIALS_PATH):
            creds_data = {
                "installed": {
                    "client_id": GMAIL_CLIENT_ID,
                    "project_id": GMAIL_PROJECT_ID,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_secret": GMAIL_CLIENT_SECRET,
                    "redirect_uris": ["http://localhost"]
                }
            }
            with open(CREDENTIALS_PATH, 'w') as f:
                json.dump(creds_data, f, indent=2)
            logger.info(f"Created credentials file at {CREDENTIALS_PATH}")

    def get_user_email(self) -> Optional[str]:
        """Get the authenticated user's email address"""
        return self.user_email

    def send_event_notification(self, to_email: Optional[str], events: List, max_retries: int = 5) -> bool:
        """Send HTML email with event details. If to_email is None, sends to self.

        Handles rate limits with exponential backoff and saves pending emails to disk
        if rate limit won't resolve within reasonable time.
        """
        if not events:
            logger.info("No events to send notification for")
            return True

        if not self.service:
            logger.error("Gmail service not initialized - call authenticate() first")
            return False

        subject = f"Matt Knight Event Alert: {len(events)} upcoming event(s) found"
        html_body = self._build_email_html(events)
        recipient = to_email or self.user_email or 'me'

        # Try to send with retries for rate limits
        for attempt in range(max_retries):
            try:
                message = MIMEMultipart('alternative')
                message['to'] = recipient
                message['subject'] = subject

                html_part = MIMEText(html_body, 'html')
                message.attach(html_part)

                raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')

                result = self.service.users().messages().send(
                    userId='me',
                    body={'raw': raw}
                ).execute()

                logger.info(f"Sent notification email (Message ID: {result.get('id')})")

                # Clear any pending email since we succeeded
                self._clear_pending_email()
                return True

            except HttpError as e:
                if e.resp.status == 429:  # Rate limit
                    retry_after = self._parse_retry_after(str(e))

                    if retry_after and retry_after < 300:  # Less than 5 minutes
                        wait_time = min(retry_after + 5, 60 * (2 ** attempt))  # Exponential backoff, max from retry_after
                        logger.warning(f"Rate limited. Waiting {wait_time} seconds before retry {attempt + 1}/{max_retries}")
                        time.sleep(wait_time)
                        continue
                    else:
                        # Rate limit too long - save for later
                        logger.warning(f"Rate limit too long ({retry_after}s). Saving email for later delivery.")
                        self._save_pending_email(recipient, subject, html_body, events)
                        return False
                else:
                    logger.error(f"Failed to send email: {e}")
                    return False

        # All retries exhausted
        logger.error(f"Failed to send email after {max_retries} attempts. Saving for later.")
        self._save_pending_email(recipient, subject, html_body, events)
        return False

    def _parse_retry_after(self, error_message: str) -> Optional[int]:
        """Parse the retry-after timestamp from rate limit error and return seconds to wait."""
        # Look for timestamp like "Retry after 2025-12-18T17:52:07.708Z"
        match = re.search(r'Retry after (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', error_message)
        if match:
            try:
                retry_time = datetime.fromisoformat(match.group(1))
                now = datetime.utcnow()
                seconds = (retry_time - now).total_seconds()
                return max(0, int(seconds))
            except Exception:
                pass
        return None

    def _save_pending_email(self, recipient: str, subject: str, html_body: str, events: List):
        """Save email to disk for later delivery."""
        pending = {
            'recipient': recipient,
            'subject': subject,
            'html_body': html_body,
            'events': [e.to_dict() for e in events],
            'saved_at': datetime.now().isoformat(),
        }
        with open(PENDING_EMAIL_PATH, 'w') as f:
            json.dump(pending, f, indent=2)
        logger.info(f"Saved pending email to {PENDING_EMAIL_PATH}")

    def _clear_pending_email(self):
        """Clear pending email file after successful send."""
        if os.path.exists(PENDING_EMAIL_PATH):
            os.remove(PENDING_EMAIL_PATH)
            logger.debug("Cleared pending email file")

    def send_pending_email(self) -> bool:
        """Try to send any pending email from previous rate-limited attempt."""
        if not os.path.exists(PENDING_EMAIL_PATH):
            return True  # No pending email

        try:
            with open(PENDING_EMAIL_PATH, 'r') as f:
                pending = json.load(f)

            logger.info("Found pending email, attempting to send...")

            message = MIMEMultipart('alternative')
            message['to'] = pending['recipient']
            message['subject'] = pending['subject']

            html_part = MIMEText(pending['html_body'], 'html')
            message.attach(html_part)

            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')

            result = self.service.users().messages().send(
                userId='me',
                body={'raw': raw}
            ).execute()

            logger.info(f"Sent pending email (Message ID: {result.get('id')})")
            self._clear_pending_email()
            return True

        except HttpError as e:
            if e.resp.status == 429:
                logger.warning("Still rate limited, will try again next run")
            else:
                logger.error(f"Failed to send pending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Error processing pending email: {e}")
            return False

    def _build_email_html(self, events: List) -> str:
        """Build HTML email body"""
        html = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .event-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .event-card h3 { margin: 0 0 10px 0; }
        .event-card h3 a { color: #1a73e8; text-decoration: none; }
        .event-card h3 a:hover { text-decoration: underline; }
        .meta { color: #666; margin: 5px 0; font-size: 14px; }
        .description { margin: 10px 0 0 0; color: #333; }
        hr { margin: 20px 0; border: none; border-top: 1px solid #eee; }
        .footer { color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <h2>Matt Knight Event Alert</h2>
    <p>The following upcoming events mentioning Matt Knight have been detected:</p>
"""

        for event in events:
            date_str = event.event_date.strftime('%B %d, %Y') if event.event_date else 'Date TBD'
            location_html = f'<p class="meta"><strong>Location:</strong> {event.location}</p>' if event.location else ''
            description_html = f'<p class="description">{event.description}</p>' if event.description else ''

            html += f"""
    <div class="event-card">
        <h3><a href="{event.url}">{event.title}</a></h3>
        <p class="meta"><strong>Date:</strong> {date_str}</p>
        <p class="meta"><strong>Source:</strong> {event.source}</p>
        {location_html}
        {description_html}
    </div>
"""

        html += """
    <hr>
    <p class="footer">
        This notification was sent by MattBot - your Matt Knight event tracker.
    </p>
</body>
</html>
"""

        return html
