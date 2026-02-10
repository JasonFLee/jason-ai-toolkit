#!/usr/bin/env python3
"""One-time OAuth setup for MattBot"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.gmail_client import GmailClient


def main():
    print("=" * 50)
    print("MattBot - Gmail OAuth Setup")
    print("=" * 50)
    print()
    print("This will authorize MattBot to send emails on your behalf.")
    print("A browser window will open for you to sign in with Google.")
    print()

    client = GmailClient()

    if client.authenticate():
        print()
        print("=" * 50)
        print("SUCCESS!")
        print("=" * 50)
        print(f"Authenticated as: {client.get_user_email()}")
        print()
        print("MattBot is now authorized to send email notifications.")
        print("You can run 'python main.py' to test the event search.")
        print()
    else:
        print()
        print("ERROR: Failed to authenticate. Please check the error messages above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
