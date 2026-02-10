#!/usr/bin/env python3
"""Manual OAuth using just the authorization code"""

import os
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
        print(f"Error: {response.text}")
        return None

    return response.json()

def save_credentials(token_data):
    """Save credentials to pickle file"""
    # Create credentials object
    creds = Credentials(
        token=token_data['access_token'],
        refresh_token=token_data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=token_data.get('client_id'),
        client_secret=token_data.get('client_secret'),
        scopes=token_data.get('scope', '').split()
    )

    # Save to pickle
    os.makedirs(os.path.dirname(TOKEN_PICKLE_PATH), exist_ok=True)
    with open(TOKEN_PICKLE_PATH, 'wb') as token:
        pickle.dump(creds, token)

    print(f"\n✅ Credentials saved to: {TOKEN_PICKLE_PATH}")

if __name__ == "__main__":
    print("\n" + "="*80)
    print("Manual OAuth Setup")
    print("="*80)
    print("\nStep 1: Visit this URL in your browser:")
    print()

    client_id, client_secret = load_client_secrets()

    auth_url = f"https://accounts.google.com/o/oauth2/auth?response_type=code&client_id={client_id}&redirect_uri=http://localhost:8080/&scope=https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent"

    print(auth_url)
    print()
    print("Step 2: After authorizing, copy just the CODE from the redirect URL")
    print("        (the part after '?...&code=' and before '&scope=')")
    print()

    auth_code = input("Paste the authorization code here: ").strip()

    print("\nExchanging code for tokens...")
    token_data = exchange_code_for_tokens(auth_code, client_id, client_secret)

    if token_data:
        # Add client info for refresh
        token_data['client_id'] = client_id
        token_data['client_secret'] = client_secret
        save_credentials(token_data)
        print("✅ OAuth setup complete!")
    else:
        print("❌ Failed to exchange code for tokens")
