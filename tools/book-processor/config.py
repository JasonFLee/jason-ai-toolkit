"""Configuration constants for book-processor"""

import os

# Base paths
BASE_DIR = "/Users/jasonlee/codingProjects/book-processor"
DATA_DIR = os.path.join(BASE_DIR, "data")
LOGS_DIR = os.path.join(BASE_DIR, "logs")

# State database
DB_PATH = os.path.join(DATA_DIR, "state.db")

# Working directories
DOWNLOADS_DIR = os.path.join(DATA_DIR, "downloads")
PODCASTS_DIR = os.path.join(DATA_DIR, "podcasts")
AUDIOBOOKS_DIR = os.path.join(DATA_DIR, "audiobooks")

# Google OAuth credentials (reuse from testyoueverday)
OAUTH_DIR = "/Users/jasonlee/codingProjects/testyoueverday"
TOKEN_PICKLE_PATH = os.path.join(OAUTH_DIR, "token.pickle")
CLIENT_SECRET_PATH = os.path.join(
    OAUTH_DIR,
    "client_secret_510996379701-6k9v08cb7d66tuise3ucf8sa2g5b3pt3.apps.googleusercontent.com.json"
)

# Google API Scopes
SCOPES = [
    'https://www.googleapis.com/auth/tasks.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

# Google Tasks settings
TASKS_LIST_NAME = "To read"
TASKS_CUTOFF_DATE = "2026-02-06T00:00:00.000Z"

# Podcast API settings
PODCAST_API_URL = "http://localhost:5055/api"
PODCAST_TIMEOUT = 600  # 10 minutes in seconds

# Audiobook settings
AUDIOBOOK_VOICE = "af_bella"  # Kokoro voice
AUDIOBOOK_LANG = "a"  # American English
AUDIOBOOK_DEVICE = None  # Auto-detect (MPS/CUDA/CPU)
AUDIOBOOK_FORMAT = ".mp3"  # Output format
AUDIOBOOK_SPEED = 1.0  # Speech speed multiplier
AUDIOBOOK_TIMEOUT = 21600  # 6 hours per book

# Google Drive settings
DRIVE_ROOT_FOLDER_NAME = "Books"

# Retry settings
MAX_RETRIES = 3
RETRY_DELAYS = [3600, 14400, 43200]  # 1h, 4h, 12h in seconds

# Logging settings
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Text extraction settings (for podcast generation)
MAX_TEXT_LENGTH_FOR_PODCAST = 50000  # characters (~10,000 words)

# Job staleness timeout
STALLED_JOB_TIMEOUT_HOURS = 24
