"""
GazeConnect Pro — ALS Knowledge Service
Serves curated ALS/MND medical content from local JSON.
No internet required. Compassionate, accurate, simple language.
"""

import json
import logging
from typing import List, Dict, Optional
from pathlib import Path

logger = logging.getLogger('GazeConnect.Knowledge')


class KnowledgeService:
    """Serves ALS knowledge from local JSON file."""

    def __init__(self, data_dir: str = './data'):
        self._data: Dict = {'categories': []}
        self._articles_index: Dict[str, Dict] = {}
        self._load(data_dir)

    def _load(self, data_dir: str):
        """Load knowledge base from JSON."""
        try:
            candidates = [
                Path(data_dir) / 'als_knowledge.json',
                Path(__file__).resolve().parents[1] / 'data' / 'als_knowledge.json',
                Path.cwd() / 'python' / 'data' / 'als_knowledge.json',
            ]

            filepath = next((p for p in candidates if p.exists()), None)
            if not filepath:
                logger.info(
                    "Optional knowledge file not found. Checked: %s",
                    ", ".join(str(p) for p in candidates),
                )
                return

            with open(filepath, 'r', encoding='utf-8') as f:
                self._data = json.load(f)
            for cat in self._data.get('categories', []):
                for article in cat.get('articles', []):
                    self._articles_index[article['id']] = {
                        **article,
                        'category_id': cat['id'],
                        'category_title': cat['title']
                    }
            logger.info(f"Loaded {len(self._articles_index)} knowledge articles from {filepath}")
        except Exception as e:
            logger.error(f"Failed to load knowledge base: {e}")

    def get_categories(self) -> List[Dict]:
        """Get list of categories with article counts."""
        return [
            {
                'id': cat['id'],
                'title': cat['title'],
                'titleHi': cat.get('titleHi', ''),
                'icon': cat.get('icon', 'info'),
                'color': cat.get('color', '#58A6FF'),
                'article_count': len(cat.get('articles', []))
            }
            for cat in self._data.get('categories', [])
        ]

    def get_articles(self, category_id: str, limit: int = 6) -> List[Dict]:
        """Get articles for a specific category (without full content)."""
        for cat in self._data.get('categories', []):
            if cat['id'] == category_id:
                articles = cat.get('articles', [])[:limit]
                return [
                    {
                        'id': a['id'],
                        'title': a['title'],
                        'titleHi': a.get('titleHi', ''),
                        'summary': a['summary'],
                        'source': a.get('source', 'GazeConnect'),
                        'lastUpdated': a.get('lastUpdated', '2025-12'),
                    }
                    for a in articles
                ]
        return []

    def get_article(self, article_id: str) -> Optional[Dict]:
        """Get full article content by ID."""
        return self._articles_index.get(article_id)

    def search(self, query: str) -> List[Dict]:
        """Simple keyword search across titles and summaries."""
        if not query or len(query) < 2:
            return []
        query_lower = query.lower()
        results = []
        for article in self._articles_index.values():
            title = article.get('title', '').lower()
            summary = article.get('summary', '').lower()
            content = article.get('content', '').lower()
            if query_lower in title or query_lower in summary or query_lower in content:
                results.append({
                    'id': article['id'],
                    'title': article['title'],
                    'summary': article['summary'],
                    'category_id': article.get('category_id', ''),
                    'category_title': article.get('category_title', ''),
                })
        return results[:6]
