#!/usr/bin/env python3
"""Save OAuth token using authorization code from command line"""

import os
import sys
import pickle
import requests
import json
from config import CLIENT_SECRET_PATH, TOKEN_PICKLE_PATH
from google.oauth2.credentials import Credentials

def load_client_secrets():
    """Load client ID and secret from file"""
    with open(CLIENT_SECRET_PATH, 'r') as f:
        data = json.load(f)
        client_info = data['installed']
        return client_info['client_id'], client_info['client_secret']

def exchange_code_for_tokens(auth_code, client_id, client_secret):
    """Exchange authorization code for access and refresh tokens"""
    token_url = "https://oauth2.googleapis.com/token"

    data = {
        'code': auth_code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': 'http://localhost:8080/',
        'grant_type': 'authorization_code'
    }

    response = requests.post(token_url, data=data)
    if response.status_code != 200:
        print(f"❌ Error: {response.text}")
        return None

    return response.json()

def save_credentials(token_data, client_id, client_secret):
    """Save credentials to pickle file"""
    # Create credentials object
    creds = Credentials(
        token=token_data['access_token'],
        refresh_token=token_data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=client_id,
        client_secret=client_secret,
        scopes=token_data.get('scope', '').split()
    )

    # Save to pickle
    os.makedirs(os.path.dirname(TOKEN_PICKLE_PATH), exist_ok=True)
    with open(TOKEN_PICKLE_PATH, 'wb') as token:
        pickle.dump(creds, token)

    print(f"✅ Credentials saved to: {TOKEN_PICKLE_PATH}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python save_token.py <authorization_code>")
        print("\nGet the authorization code by visiting:")
        client_id, _ = load_client_secrets()
        auth_url = f"https://accounts.google.com/o/oauth2/auth?response_type=code&client_id={client_id}&redirect_uri=http://localhost:8080/&scope=https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent"
        print(auth_url)
        sys.exit(1)

    auth_code = sys.argv[1]
    client_id, client_secret = load_client_secrets()

    print(f"Exchanging authorization code for tokens...")
    token_data = exchange_code_for_tokens(auth_code, client_id, client_secret)

    if token_data:
        save_credentials(token_data, client_id, client_secret)
        print("✅ OAuth setup complete! You can now run main.py")
    else:
        print("❌ Failed to exchange code for tokens")
        sys.exit(1)
