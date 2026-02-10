#!/usr/bin/env python3
"""Get OAuth authorization URL for manual browser authentication"""

import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow
from config import CLIENT_SECRET_PATH

# Scopes required
SCOPES = [
    'https://www.googleapis.com/auth/tasks.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def get_auth_url():
    """Get OAuth authorization URL"""
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET_PATH,
        SCOPES,
        redirect_uri='http://localhost:8080/'
    )

    # Get the authorization URL without opening browser
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )

    return auth_url

if __name__ == "__main__":
    url = get_auth_url()
    print("\n" + "="*80)
    print("AUTHORIZATION URL:")
    print("="*80)
    print(url)
    print("="*80)
    print("\nCopy this URL and paste it into your browser to authorize the app.")
    print("After authorizing, you'll be redirected. Copy the full redirect URL")
    print("(including the code parameter) and paste it here:")
    print()
