"""Google Tasks API integration for fetching books from 'To read' list"""

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import os.path
import pickle
from datetime import datetime
from typing import List, Optional
from loguru import logger

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import TOKEN_PICKLE_PATH, CLIENT_SECRET_PATH, SCOPES, TASKS_LIST_NAME
from models import GoogleTask


def get_tasks_service():
    """Get authenticated Google Tasks service using existing credentials"""
    creds = None

    # Load existing credentials
    if os.path.exists(TOKEN_PICKLE_PATH):
        with open(TOKEN_PICKLE_PATH, 'rb') as token:
            creds = pickle.load(token)

    # Refresh or re-authenticate if needed
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            logger.info("Refreshing Google API credentials")
            creds.refresh(Request())
        else:
            logger.info("Starting OAuth flow for Google API")
            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRET_PATH,
                SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save credentials
        with open(TOKEN_PICKLE_PATH, 'wb') as token:
            pickle.dump(creds, token)
            logger.info("Saved updated credentials")

    # Build service
    service = build('tasks', 'v1', credentials=creds)
    return service


def fetch_to_read_tasks(cutoff_date: str) -> List[GoogleTask]:
    """
    Fetch all unchecked tasks from 'To read' list created after cutoff_date.

    Args:
        cutoff_date: ISO format date string (e.g., "2026-02-06T00:00:00.000Z")

    Returns:
        List of GoogleTask objects
    """
    try:
        service = get_tasks_service()

        # Get all task lists
        tasklists = service.tasklists().list().execute()
        tasklist = next(
            (tl for tl in tasklists.get('items', []) if tl['title'] == TASKS_LIST_NAME),
            None
        )

        if not tasklist:
            logger.warning(f"Task list '{TASKS_LIST_NAME}' not found")
            return []

        logger.info(f"Found task list: {TASKS_LIST_NAME} (ID: {tasklist['id']})")

        # Fetch all tasks from the list
        all_tasks = []
        page_token = None

        while True:
            tasks = service.tasks().list(
                tasklist=tasklist['id'],
                maxResults=100,
                pageToken=page_token,
                showCompleted=False,  # Only unchecked tasks
                showHidden=False
            ).execute()

            for task_data in tasks.get('items', []):
                # Filter by creation date
                task_updated = task_data.get('updated', task_data.get('created', ''))

                if task_updated >= cutoff_date:
                    task = GoogleTask.from_api_response(task_data)
                    all_tasks.append(task)
                    logger.debug(f"Found task: {task.title} (created: {task.created})")

            page_token = tasks.get('nextPageToken')
            if not page_token:
                break

        logger.info(f"Fetched {len(all_tasks)} unchecked tasks after {cutoff_date}")
        return all_tasks

    except Exception as e:
        logger.error(f"Failed to fetch Google Tasks: {e}")
        return []


if __name__ == "__main__":
    # Test the service
    from datetime import datetime
    cutoff = "2026-02-06T00:00:00.000Z"

    print(f"Fetching tasks from '{TASKS_LIST_NAME}' after {cutoff}...")
    tasks = fetch_to_read_tasks(cutoff)

    print(f"\nFound {len(tasks)} tasks:")
    for task in tasks:
        print(f"  - {task.title} (ID: {task.id}, Created: {task.created})")
