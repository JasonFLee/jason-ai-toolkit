"""Services package"""
from .gmail_client import GmailClient
from .deduplicator import Deduplicator

__all__ = ['GmailClient', 'Deduplicator']
