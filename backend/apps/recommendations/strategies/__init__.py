"""Strategy package -- one module per recommendation source.

Every module exports a single ``*Strategy`` class. Imported by
``apps.recommendations.views`` and by the Celery tasks.
"""
from apps.recommendations.strategies.content_based import ContentBasedStrategy
from apps.recommendations.strategies.co_occurrence import CoOccurrenceStrategy
from apps.recommendations.strategies.personalized import PersonalizedStrategy
from apps.recommendations.strategies.recently_viewed import RecentlyViewedStrategy
from apps.recommendations.strategies.trending import TrendingStrategy

__all__ = [
    "ContentBasedStrategy",
    "CoOccurrenceStrategy",
    "PersonalizedStrategy",
    "RecentlyViewedStrategy",
    "TrendingStrategy",
]
