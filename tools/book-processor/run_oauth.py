#!/usr/bin/env python3
"""Run OAuth flow with local server"""

import os
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from config import CLIENT_SECRET_PATH, TOKEN_PICKLE_PATH

# Scopes required
SCOPES = [
    'https://www.googleapis.com/auth/tasks.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def run_oauth_flow():
    """Run the full OAuth flow with local server"""
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET_PATH,
        SCOPES
    )

    # Run local server on port 8080
    print("\n" + "="*80)
    print("Opening browser for Google authorization...")
    print("="*80)
    print("\nPlease authorize the app in your browser.")
    print("If the browser doesn't open automatically, copy the URL that appears.")
    print()

    creds = flow.run_local_server(port=8080, open_browser=True)

    # Save the credentials
    os.makedirs(os.path.dirname(TOKEN_PICKLE_PATH), exist_ok=True)
    with open(TOKEN_PICKLE_PATH, 'wb') as token:
        pickle.dump(creds, token)

    print("\n" + "="*80)
    print("✅ OAuth completed successfully!")
    print(f"✅ Credentials saved to: {TOKEN_PICKLE_PATH}")
    print("="*80)
    return creds

if __name__ == "__main__":
    run_oauth_flow()
