#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from instagram.models import InstagramCompetitor, InstagramCompetitorMedia
from instagram.services.ai_scoring import AIScoringService

# Run AI scoring on all existing competitor media
print("Starting AI scoring for all competitor media...")
ai_service = AIScoringService()
total_promoted = 0
total_scored = 0

competitors = InstagramCompetitor.objects.all()
print(f"Found {competitors.count()} competitors")

for comp in competitors:
    print(f"\nProcessing competitor: {comp.username}")
    result = ai_service.batch_score_competitor_media(comp.id, score_all=True)
    total_promoted += result['promoted_to_candidates']
    total_scored += result['total_analyzed']
    print(f"  Scored: {result['total_analyzed']} posts")
    print(f"  Promoted to candidates: {result['promoted_to_candidates']}")

print(f"\n{'='*50}")
print(f"Total posts scored: {total_scored}")
print(f"Total posts promoted to candidates: {total_promoted}")
print(f"{'='*50}")
