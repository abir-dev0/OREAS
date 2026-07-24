#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from instagram.models import InstagramCompetitorMedia
from instagram.services.ai_scoring import AIScoringService

# Check scores for a sample of posts
print("Checking AI scores for sample posts...")
ai_service = AIScoringService()

posts = InstagramCompetitorMedia.objects.all()[:10]
print(f"\nSample of {posts.count()} posts:")
print("-" * 80)

for post in posts:
    result = ai_service.score_media(post)
    print(f"\nPost ID: {post.instagram_media_id}")
    print(f"Competitor: {post.competitor.username}")
    print(f"Likes: {post.like_count}, Comments: {post.comments_count}")
    print(f"AI Score: {result['total_score']:.2f}")
    print(f"Breakdown: {result['breakdown']}")
    print(f"Is Candidate (threshold 85): {result['is_candidate']}")
