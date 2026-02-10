"""Scrapers package"""
from .base_scraper import BaseScraper
from .google_search import GoogleSearchScraper
from .openai_rss import OpenAIRSSScraper
from .dartmouth import DartmouthScraper
from .infosec_conf import InfosecConfScraper

__all__ = [
    'BaseScraper',
    'GoogleSearchScraper',
    'OpenAIRSSScraper',
    'DartmouthScraper',
    'InfosecConfScraper',
]
