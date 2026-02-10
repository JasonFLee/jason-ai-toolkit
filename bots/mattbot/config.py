"""Configuration for MattBot - Matt Knight Event Tracker"""

import os

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_PATH = os.path.join(BASE_DIR, "credentials.json")
TOKEN_PATH = os.path.join(BASE_DIR, "token.json")
NOTIFIED_EVENTS_PATH = os.path.join(BASE_DIR, "notified_events.json")
LOG_DIR = os.path.join(BASE_DIR, "logs")

# Gmail OAuth2 Configuration - SET THESE FROM YOUR GOOGLE CLOUD CONSOLE
GMAIL_CLIENT_ID = "YOUR_GMAIL_CLIENT_ID.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET = "YOUR_GMAIL_CLIENT_SECRET"
GMAIL_PROJECT_ID = "email-audiobook"
GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
]

# Recipient email - will be set to the authenticated Gmail account
RECIPIENT_EMAIL = None  # Set during OAuth or override here

# Search target
TARGET_PERSON = "Matt Knight"
TARGET_ALIASES = [
    "Matt Knight",
    "Matthew Knight",
    "Matthew F. Knight",
    "@embeddedsec",
    "OpenAI CISO",
]
TARGET_AFFILIATIONS = ["OpenAI", "Dartmouth"]

# Data sources
OPENAI_RSS_URL = "https://openai.com/news/rss.xml"
DARTMOUTH_EVENTS_URL = "https://home.dartmouth.edu/events"
DARTMOUTH_ISTS_URL = "https://ists.dartmouth.edu/"
INFOSEC_CONFERENCES_URL = "https://infosec-conferences.com/"

# Search queries for web search
SEARCH_QUERIES = [
    '"Matt Knight" OpenAI 2025',
    '"Matt Knight" OpenAI speaker 2025',
    '"Matt Knight" conference 2025',
    '"Matt Knight" CISO 2025',
    '"Matt Knight" keynote 2025',
    'Matt Knight OpenAI RSA 2025',
    'Matt Knight OpenAI Black Hat 2025',
    'Matt Knight OpenAI DEF CON 2025',
]
