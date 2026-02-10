"""Google Drive upload service"""

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import os.path
import pickle
from typing import Optional, Dict, List
from loguru import logger

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import TOKEN_PICKLE_PATH, CLIENT_SECRET_PATH, SCOPES, DRIVE_ROOT_FOLDER_NAME


def get_drive_service():
    """Get authenticated Google Drive service"""
    creds = None

    # Load existing credentials
    if os.path.exists(TOKEN_PICKLE_PATH):
        with open(TOKEN_PICKLE_PATH, 'rb') as token:
            creds = pickle.load(token)

    # Refresh or re-authenticate if needed
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            logger.info("Refreshing Google Drive credentials")
            creds.refresh(Request())
        else:
            logger.info("Starting OAuth flow for Google Drive")
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
    service = build('drive', 'v3', credentials=creds)
    return service


def get_or_create_books_folder() -> Optional[str]:
    """
    Find or create root 'Books' folder in Google Drive.

    Returns:
        Folder ID or None on failure
    """
    try:
        service = get_drive_service()

        # Search for existing folder
        query = f"name='{DRIVE_ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)'
        ).execute()

        files = results.get('files', [])

        if files:
            folder_id = files[0]['id']
            logger.info(f"Found existing '{DRIVE_ROOT_FOLDER_NAME}' folder: {folder_id}")
            return folder_id

        # Create new folder
        file_metadata = {
            'name': DRIVE_ROOT_FOLDER_NAME,
            'mimeType': 'application/vnd.google-apps.folder'
        }

        folder = service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()

        folder_id = folder.get('id')
        logger.info(f"Created '{DRIVE_ROOT_FOLDER_NAME}' folder: {folder_id}")
        return folder_id

    except Exception as e:
        logger.error(f"Failed to get/create Books folder: {e}")
        return None


def create_book_folder(parent_folder_id: str, book_title: str) -> Optional[str]:
    """
    Create subfolder for a book.

    Args:
        parent_folder_id: ID of parent folder
        book_title: Title of the book (will be folder name)

    Returns:
        Folder ID or None on failure
    """
    try:
        service = get_drive_service()

        file_metadata = {
            'name': book_title,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_folder_id]
        }

        folder = service.files().create(
            body=file_metadata,
            fields='id, webViewLink'
        ).execute()

        folder_id = folder.get('id')
        web_link = folder.get('webViewLink')
        logger.info(f"Created book folder: {book_title} ({folder_id})")
        logger.info(f"Folder link: {web_link}")
        return folder_id

    except Exception as e:
        logger.error(f"Failed to create book folder: {e}")
        return None


def upload_file(
    file_path: str,
    parent_folder_id: str,
    custom_name: Optional[str] = None,
    max_retries: int = 3
) -> Optional[str]:
    """
    Upload file to Google Drive with retry logic.

    Args:
        file_path: Path to file to upload
        parent_folder_id: ID of parent folder
        custom_name: Optional custom name for the file
        max_retries: Number of retry attempts

    Returns:
        File ID or None on failure
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return None

    file_name = custom_name or os.path.basename(file_path)
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

    # Determine MIME type
    mime_types = {
        '.pdf': 'application/pdf',
        '.epub': 'application/epub+zip',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.txt': 'text/plain'
    }

    ext = os.path.splitext(file_path)[1].lower()
    mime_type = mime_types.get(ext, 'application/octet-stream')

    for attempt in range(max_retries):
        try:
            service = get_drive_service()

            file_metadata = {
                'name': file_name,
                'parents': [parent_folder_id]
            }

            # Use chunked upload for large files (>10 MB)
            chunk_size = 10 * 1024 * 1024  # 10 MB chunks
            media = MediaFileUpload(
                file_path,
                mimetype=mime_type,
                resumable=True,
                chunksize=chunk_size
            )

            logger.info(f"Uploading {file_name} ({file_size_mb:.1f} MB) - Attempt {attempt + 1}/{max_retries}")

            # Create request with longer timeout
            request = service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink'
            )

            # Upload in chunks with progress tracking
            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    progress = int(status.progress() * 100)
                    if progress % 20 == 0:  # Log every 20%
                        logger.info(f"Upload progress: {progress}%")

            file = response

            file_id = file.get('id')
            web_link = file.get('webViewLink')

            # Verify upload is complete by checking file size
            try:
                uploaded_file = service.files().get(
                    fileId=file_id,
                    fields='size'
                ).execute()

                uploaded_size = int(uploaded_file.get('size', 0))
                local_size = os.path.getsize(file_path)

                if uploaded_size != local_size:
                    logger.error(f"Upload size mismatch! Local: {local_size}, Uploaded: {uploaded_size}")
                    # Delete incomplete upload
                    service.files().delete(fileId=file_id).execute()
                    raise Exception(f"Upload incomplete - size mismatch")

                logger.info(f"✅ Verified: {file_name} ({file_id}) - {uploaded_size} bytes")

            except Exception as e:
                logger.warning(f"Could not verify upload (proceeding): {e}")

            logger.info(f"Uploaded: {file_name} ({file_id})")
            logger.debug(f"File link: {web_link}")
            return file_id

        except Exception as e:
            logger.warning(f"Upload attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                import time
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                logger.error(f"Failed to upload {file_name} after {max_retries} attempts")
                return None

    return None


def upload_audiobook_folder(audiobook_dir: str, parent_folder_id: str) -> List[str]:
    """
    Upload all audiobook files from a directory.

    Args:
        audiobook_dir: Path to directory containing audiobook files
        parent_folder_id: ID of parent folder in Drive

    Returns:
        List of uploaded file IDs
    """
    file_ids = []

    try:
        # Get all audio files from directory
        audio_files = [
            f for f in os.listdir(audiobook_dir)
            if f.endswith(('.mp3', '.wav'))
        ]

        audio_files.sort()  # Sort to maintain chapter order

        logger.info(f"Uploading {len(audio_files)} audiobook files")

        for audio_file in audio_files:
            file_path = os.path.join(audiobook_dir, audio_file)
            file_id = upload_file(file_path, parent_folder_id, custom_name=audio_file)

            if file_id:
                file_ids.append(file_id)
            else:
                logger.warning(f"Failed to upload: {audio_file}")

        logger.info(f"Successfully uploaded {len(file_ids)}/{len(audio_files)} audiobook files")
        return file_ids

    except Exception as e:
        logger.error(f"Failed to upload audiobook folder: {e}")
        return file_ids


def upload_book_assets(book_state: Dict, book_title: str) -> Dict[str, any]:
    """
    Upload all files for a book to Google Drive.

    Args:
        book_state: Book state dictionary from database
        book_title: Title of the book

    Returns:
        Dict with 'folder_id', 'book_file_id', 'podcast_file_id', 'audiobook_file_ids'
    """
    result = {
        'folder_id': None,
        'book_file_id': None,
        'podcast_file_id': None,
        'audiobook_file_ids': []
    }

    try:
        # Get or create root Books folder
        books_folder_id = get_or_create_books_folder()
        if not books_folder_id:
            logger.error("Failed to get Books folder")
            return result

        # Create book subfolder
        book_folder_id = create_book_folder(books_folder_id, book_title)
        if not book_folder_id:
            logger.error("Failed to create book folder")
            return result

        result['folder_id'] = book_folder_id

        # Upload original book file
        if book_state.get('book_file_path'):
            book_file_id = upload_file(
                book_state['book_file_path'],
                book_folder_id,
                custom_name=os.path.basename(book_state['book_file_path'])
            )
            result['book_file_id'] = book_file_id

        # Upload podcast summary
        if book_state.get('podcast_file_path'):
            podcast_file_id = upload_file(
                book_state['podcast_file_path'],
                book_folder_id,
                custom_name="podcast_summary.mp3"
            )
            result['podcast_file_id'] = podcast_file_id

        # Upload audiobook files
        if book_state.get('audiobook_dir_path'):
            audiobook_ids = upload_audiobook_folder(
                book_state['audiobook_dir_path'],
                book_folder_id
            )
            result['audiobook_file_ids'] = audiobook_ids

        logger.info(f"Successfully uploaded all assets for: {book_title}")
        return result

    except Exception as e:
        logger.error(f"Failed to upload book assets: {e}")
        return result


if __name__ == "__main__":
    # Test the service
    print("Testing Google Drive service...\n")

    # Get or create Books folder
    folder_id = get_or_create_books_folder()
    print(f"Books folder ID: {folder_id}\n")

    if folder_id:
        # Test creating a subfolder
        test_folder_id = create_book_folder(folder_id, "Test Book")
        print(f"Test folder ID: {test_folder_id}")
