#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from instagram.models import InstagramCompetitorMedia
from instagram.services.ai_scoring import AIScoringService

# Get the two posts with different engagement but unexpected scores
high_likes = InstagramCompetitorMedia.objects.filter(like_count=12779).first()
lower_likes = InstagramCompetitorMedia.objects.filter(like_count=2048).first()

ai = AIScoringService()

print("=" * 80)
print("POST WITH 12779 LIKES (Score: 81.00)")
print("=" * 80)
result1 = ai.score_media(high_likes)
print(f"Total Score: {result1['total_score']:.2f}")
print(f"Breakdown:")
for key, value in result1['breakdown'].items():
    print(f"  {key}: {value:.2f}")
print(f"\nCompetitor: {high_likes.competitor.username}")
print(f"Followers: {high_likes.competitor.followers_count}")
print(f"Engagement rate: {(high_likes.like_count + high_likes.comments_count) / high_likes.competitor.followers_count * 100:.4f}%")

print("\n" + "=" * 80)
print("POST WITH 2048 LIKES (Score: 89.00)")
print("=" * 80)
result2 = ai.score_media(lower_likes)
print(f"Total Score: {result2['total_score']:.2f}")
print(f"Breakdown:")
for key, value in result2['breakdown'].items():
    print(f"  {key}: {value:.2f}")
print(f"\nCompetitor: {lower_likes.competitor.username}")
print(f"Followers: {lower_likes.competitor.followers_count}")
print(f"Engagement rate: {(lower_likes.like_count + lower_likes.comments_count) / lower_likes.competitor.followers_count * 100:.4f}%")

print("\n" + "=" * 80)
print("COMPARISON")
print("=" * 80)
print(f"12779 likes post: {result1['total_score']:.2f} (expected higher)")
print(f"2048 likes post: {result2['total_score']:.2f} (expected lower)")
print(f"Difference: {result2['total_score'] - result1['total_score']:.2f}")
