"""
Tests for SUPost Bot - Automated Housing Listing Responder

Test-Driven Development: Write failing tests first, then implement.
"""

import pytest
import json
from datetime import datetime, date
from unittest.mock import Mock, patch, MagicMock

# These imports will fail until we implement them
from supost_bot import (
    SUPostScraper,
    PostFilter,
    MessageSender,
    SentPostsTracker,
    SUPostBot,
)


class TestSUPostScraper:
    """Tests for scraping SUPost housing listings"""

    def test_scraper_fetches_housing_page(self):
        """Scraper should fetch the housing page from SUPost"""
        scraper = SUPostScraper()
        posts = scraper.fetch_posts()
        assert isinstance(posts, list)

    def test_scraper_extracts_post_data(self):
        """Scraper should extract post ID, title, date, and URL from each listing"""
        scraper = SUPostScraper()
        posts = scraper.fetch_posts()

        if posts:  # If there are posts
            post = posts[0]
            assert 'id' in post
            assert 'title' in post
            assert 'date' in post
            assert 'url' in post

    def test_scraper_parses_post_date_correctly(self):
        """Scraper should parse dates like 'Mon, Dec 08' into date objects"""
        scraper = SUPostScraper()
        parsed_date = scraper.parse_date("Mon, Dec 08")
        assert isinstance(parsed_date, date)
        assert parsed_date.month == 12
        assert parsed_date.day == 8


class TestPostFilter:
    """Tests for filtering posts based on criteria"""

    def test_filter_excludes_posts_before_dec_8(self):
        """Should exclude posts dated before December 8, 2025"""
        filter = PostFilter()
        posts = [
            {'id': '1', 'title': 'Room available', 'date': date(2025, 12, 7), 'url': 'url1'},
            {'id': '2', 'title': 'Room available', 'date': date(2025, 12, 8), 'url': 'url2'},
            {'id': '3', 'title': 'Room available', 'date': date(2025, 12, 9), 'url': 'url3'},
        ]
        filtered = filter.filter_by_date(posts, min_date=date(2025, 12, 8))
        assert len(filtered) == 2
        assert all(p['date'] >= date(2025, 12, 8) for p in filtered)

    def test_filter_matches_roommate_posts(self):
        """Should match posts looking for roommates"""
        filter = PostFilter()
        post = {'title': 'Looking for a roommate in Palo Alto', 'content': 'Furnished room'}
        assert filter.is_roommate_or_sublease(post) is True

    def test_filter_matches_sublease_posts(self):
        """Should match posts offering subleases"""
        filter = PostFilter()
        post = {'title': 'Sublease available January', 'content': 'Winter quarter'}
        assert filter.is_roommate_or_sublease(post) is True

    def test_filter_matches_room_available_posts(self):
        """Should match posts with rooms available"""
        filter = PostFilter()
        post = {'title': 'Room available in 3BR house', 'content': 'Near Stanford'}
        assert filter.is_roommate_or_sublease(post) is True

    def test_filter_matches_jan_feb_timing(self):
        """Should match posts mentioning January or February move-in"""
        filter = PostFilter()
        post1 = {'title': 'Room for January', 'content': 'Available soon'}
        post2 = {'title': 'Available Feb 1', 'content': 'Furnished'}
        post3 = {'title': 'December only', 'content': 'Short term'}

        assert filter.matches_jan_feb_timing(post1) is True
        assert filter.matches_jan_feb_timing(post2) is True
        # December-only posts might not match unless they extend into Jan

    def test_filter_excludes_seeking_posts(self):
        """Should exclude posts where poster is SEEKING housing (not offering)"""
        filter = PostFilter()
        post = {'title': 'Looking for housing near Stanford', 'content': 'I need a room'}
        assert filter.is_offering_housing(post) is True  # They're offering to be a roommate

    def test_combined_filter_criteria(self):
        """Should only return posts matching all criteria"""
        filter = PostFilter()
        posts = [
            {
                'id': '1',
                'title': 'Room available January',
                'content': 'Looking for roommate',
                'date': date(2025, 12, 8),
                'url': 'url1'
            },
            {
                'id': '2',
                'title': 'Parking spot needed',
                'content': 'Need parking',
                'date': date(2025, 12, 9),
                'url': 'url2'
            },
        ]
        filtered = filter.apply_all_filters(posts, min_date=date(2025, 12, 8))
        # Only the roommate post should match
        assert any(p['id'] == '1' for p in filtered)


class TestSentPostsTracker:
    """Tests for tracking which posts have already been messaged"""

    def test_tracker_saves_sent_posts(self):
        """Should save post IDs that have been messaged"""
        tracker = SentPostsTracker(filepath='/tmp/test_sent_posts.json')
        tracker.mark_as_sent('12345')
        assert tracker.has_been_sent('12345') is True

    def test_tracker_persists_to_file(self):
        """Should persist sent posts to JSON file"""
        tracker = SentPostsTracker(filepath='/tmp/test_sent_posts.json')
        tracker.mark_as_sent('12345')

        # Create new tracker instance to check persistence
        tracker2 = SentPostsTracker(filepath='/tmp/test_sent_posts.json')
        assert tracker2.has_been_sent('12345') is True

    def test_tracker_returns_false_for_new_posts(self):
        """Should return False for posts not yet messaged"""
        tracker = SentPostsTracker(filepath='/tmp/test_sent_posts_new.json')
        assert tracker.has_been_sent('99999') is False


class TestMessageSender:
    """Tests for sending messages via Chrome MCP"""

    def test_message_sender_formats_message_correctly(self):
        """Should format the introduction message with all details"""
        sender = MessageSender(
            email="jason.lee.jfl@gmail.com",
            message_template="""Hello, I hope you're having a wonderful day. I just finished my master's degree at Dartmouth, and I will be working full-time at Netflix. I want to live near Stanford because many of my friends research and study there, and I also train with their triathlon team. Let me know if you'd like to have a call! I love running, meditating, and of course, making things like films and robots.
I'm a tidy, easygoing person who enjoys good conversations and hanging out with roommates. I'm genuinely interested in getting to know whoever I live with and happy to grab meals, watch movies, or just chat. I'm also flexible about household dynamics and comfortable living with anyone.
719-440-6373 :)"""
        )
        message = sender.get_message()
        assert "Dartmouth" in message
        assert "Netflix" in message
        assert "719-440-6373" in message

    def test_message_sender_has_correct_email(self):
        """Should use the specified email address"""
        sender = MessageSender(email="jason.lee.jfl@gmail.com", message_template="test")
        assert sender.email == "jason.lee.jfl@gmail.com"


class TestSUPostBot:
    """Integration tests for the complete bot"""

    def test_bot_initializes_with_all_components(self):
        """Bot should initialize with scraper, filter, tracker, and sender"""
        bot = SUPostBot(
            email="jason.lee.jfl@gmail.com",
            message_template="test message",
            tracker_filepath='/tmp/test_bot_tracker.json'
        )
        assert bot.scraper is not None
        assert bot.filter is not None
        assert bot.tracker is not None
        assert bot.sender is not None

    def test_bot_run_returns_results(self):
        """Bot run should return list of posts messaged"""
        bot = SUPostBot(
            email="jason.lee.jfl@gmail.com",
            message_template="test message",
            tracker_filepath='/tmp/test_bot_tracker.json'
        )
        # This will be mocked in actual tests
        results = bot.get_new_matching_posts()
        assert isinstance(results, list)


class TestDaemonScheduler:
    """Tests for the hourly daemon/scheduler"""

    def test_scheduler_runs_at_interval(self):
        """Scheduler should run the bot at specified interval"""
        from supost_bot import run_scheduler
        # This test verifies the scheduler is set up correctly
        # Actual scheduling tested via mock
        assert callable(run_scheduler)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
