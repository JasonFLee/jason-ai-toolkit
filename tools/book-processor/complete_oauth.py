#!/usr/bin/env python3
"""Complete OAuth flow with authorization code"""

import os
import sys
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from config import CLIENT_SECRET_PATH, TOKEN_PICKLE_PATH

# Scopes required
SCOPES = [
    'https://www.googleapis.com/auth/tasks.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

def complete_oauth(auth_response_url):
    """Complete OAuth flow with the authorization response URL"""
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET_PATH,
        SCOPES,
        redirect_uri='http://localhost:8080/'
    )

    # Disable scope checking since Google may return additional scopes
    flow.oauth2session.scope = None

    # Fetch the token using the authorization response
    flow.fetch_token(authorization_response=auth_response_url)

    # Save the credentials
    creds = flow.credentials
    os.makedirs(os.path.dirname(TOKEN_PICKLE_PATH), exist_ok=True)
    with open(TOKEN_PICKLE_PATH, 'wb') as token:
        pickle.dump(creds, token)

    print(f"✅ OAuth completed successfully!")
    print(f"✅ Credentials saved to: {TOKEN_PICKLE_PATH}")
    return creds

if __name__ == "__main__":
    # The authorization response URL from the user
    auth_url = "http://localhost:8080/?state=xNUPfRjmuhnRYfR2CCVsRaGXyw0WVj&code=4/0ASc3gC3dCmhhTg7awnFilT4Rdr3nUdqqQnDfgT0ZZA6e5Xei-SQQcN_PCYY_V6XkhjwgBw&scope=email%20https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/tasks.readonly%20https://www.googleapis.com/auth/userinfo.email%20openid%20https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/calendar.events%20https://www.googleapis.com/auth/calendar.readonly%20https://www.googleapis.com/auth/gmail.send%20https://www.googleapis.com/auth/gmail.labels&authuser=0&prompt=consent"

    complete_oauth(auth_url)
