from datetime import datetime
from django.utils import timezone
from django.db import models
from instagram.models import InstagramCompetitorMedia, InstagramCompetitor
from core.models import PlatformSettings


class AIScoringService:
    """
    AI scoring service for competitor media posts.
    Calculates credible AI scores using multiple weighted signals:
    - Engagement rate relative to competitor's average (30%)
    - Likes/comments normalized by follower count (25%)
    - Media type performance (15%)
    - Caption quality and commercial intent (15%)
    - Freshness of post (10%)
    - Historical performance vs competitor's own posts (5%)
    """
    
    def __init__(self, candidate_threshold=None):
        # Get threshold from PlatformSettings if not provided
        if candidate_threshold is None:
            try:
                settings = PlatformSettings.objects.first()
                candidate_threshold = settings.candidate_threshold if settings else 40.0
            except:
                candidate_threshold = 40.0
        self.candidate_threshold = candidate_threshold
    
    def score_media(self, media):
        """
        Calculate AI score for a single media post (0-100).
        Returns score and detailed breakdown.
        """
        scores = {}
        
        # 1. Engagement Rate Relative to Competitor Average (0-30 points)
        scores['engagement_relative'] = self._calculate_relative_engagement_score(media)
        
        # 2. Normalized Engagement by Follower Count (0-25 points)
        scores['engagement_normalized'] = self._calculate_normalized_engagement_score(media)
        
        # 3. Media Type Performance (0-15 points)
        scores['media_type_performance'] = self._calculate_media_type_score(media)
        
        # 4. Caption Quality and Commercial Intent (0-15 points)
        scores['caption_quality'] = self._calculate_caption_score(media)
        
        # 5. Freshness of Post (0-10 points)
        scores['freshness'] = self._calculate_freshness_score(media)
        
        # 6. Historical Performance vs Competitor's Posts (0-5 points)
        scores['historical_performance'] = self._calculate_historical_performance_score(media)
        
        # Calculate total score
        total_score = sum(scores.values())
        
        return {
            'total_score': min(total_score, 100.0),
            'breakdown': scores,
            'is_candidate': total_score >= self.candidate_threshold
        }
    
    def _calculate_relative_engagement_score(self, media):
        """Calculate engagement score relative to competitor's average performance."""
        score = 0.0
        
        # Get competitor's average engagement
        competitor_media = InstagramCompetitorMedia.objects.filter(
            competitor=media.competitor
        ).exclude(id=media.id)
        
        if competitor_media.count() < 3:
            # Not enough data, use baseline based on raw engagement
            current_engagement = media.like_count + media.comments_count
            if current_engagement > 10000:
                return 25.0
            elif current_engagement > 5000:
                return 20.0
            elif current_engagement > 1000:
                return 15.0
            elif current_engagement > 100:
                return 10.0
            else:
                return 5.0
        
        avg_likes = competitor_media.aggregate(avg_likes=models.Avg('like_count'))['avg_likes'] or 0
        avg_comments = competitor_media.aggregate(avg_comments=models.Avg('comments_count'))['avg_comments'] or 0
        avg_engagement = avg_likes + avg_comments
        
        current_engagement = media.like_count + media.comments_count
        
        if avg_engagement > 0:
            engagement_ratio = current_engagement / avg_engagement
            
            # More granular scoring to differentiate performance
            if engagement_ratio >= 5.0:
                score = 30.0  # Exceptional - 5x average
            elif engagement_ratio >= 3.0:
                score = 28.0  # Very exceptional - 3x average
            elif engagement_ratio >= 2.0:
                score = 25.0  # Exceptional - 2x average
            elif engagement_ratio >= 1.5:
                score = 22.0  # Very strong - 1.5x average
            elif engagement_ratio >= 1.2:
                score = 18.0  # Above average - 1.2x average
            elif engagement_ratio >= 1.0:
                score = 15.0  # Average
            elif engagement_ratio >= 0.8:
                score = 12.0  # Below average
            elif engagement_ratio >= 0.5:
                score = 8.0   # Poor
            else:
                score = 5.0   # Very poor
        else:
            score = 15.0  # Neutral if no average data
        
        return score
    
    def _calculate_normalized_engagement_score(self, media):
        """Calculate engagement normalized by follower count."""
        score = 0.0
        
        if media.competitor.followers_count <= 0:
            return 10.0  # Neutral if no follower data
        
        # Calculate engagement rate
        engagement_rate = (media.like_count + media.comments_count) / media.competitor.followers_count
        
        # More sensitive scoring based on actual engagement rate
        # Scale: 0% = 0 points, 10% = 25 points (linear scaling with bonus for high rates)
        score = min(engagement_rate * 250, 25.0)
        
        # Bonus for exceptional engagement rates
        if engagement_rate > 0.10:  # >10% engagement
            score += 5
        elif engagement_rate > 0.05:  # >5% engagement
            score += 3
        
        # Bonus for high comment-to-like ratio (indicates purchase intent)
        if media.like_count > 0:
            comment_ratio = media.comments_count / media.like_count
            if comment_ratio > 0.1:  # 10% comment ratio
                score += 3
            elif comment_ratio > 0.05:  # 5% comment ratio
                score += 2
        
        return min(score, 25.0)
    
    def _calculate_media_type_score(self, media):
        """Calculate score based on media type performance."""
        # Base scores by media type (can be adjusted based on industry benchmarks)
        media_type_scores = {
            'CAROUSEL_ALBUM': 15.0,  # Carousels often show more product details
            'REEL': 14.0,            # Reels have high engagement potential
            'IMAGE': 12.0,           # Images are standard but effective
            'VIDEO': 13.0            # Videos have good engagement
        }
        
        return media_type_scores.get(media.media_type, 10.0)
    
    def _calculate_caption_score(self, media):
        """Calculate score based on caption quality and commercial intent."""
        score = 0.0
        caption = media.caption or ''
        
        # Caption length (optimal: 50-300 characters)
        caption_length = len(caption)
        if 50 <= caption_length <= 300:
            score += 5  # Optimal length
        elif 300 < caption_length <= 500:
            score += 3  # Good but slightly long
        elif caption_length > 500:
            score += 1  # Too long, may reduce engagement
        
        # Commercial intent keywords
        commercial_keywords = [
            'collection', 'new', 'launch', 'available', 'shop',
            'price', 'order', 'delivery', 'limited', 'exclusive',
            'sale', 'discount', 'offer', 'buy', 'purchase',
            'stock', 'available now', 'link in bio', 'dm to order'
        ]
        
        keyword_count = sum(1 for keyword in commercial_keywords if keyword.lower() in caption.lower())
        score += min(keyword_count * 2, 5)  # Max 5 points for keywords
        
        # Emoji usage (indicates engaging content)
        emoji_count = len([c for c in caption if ord(c) > 127])
        if 1 <= emoji_count <= 5:
            score += 2  # Good emoji usage
        elif emoji_count > 5:
            score += 1  # Too many emojis
        
        # Hashtag quality
        hashtags = [word for word in caption.split() if word.startswith('#')]
        if 3 <= len(hashtags) <= 10:
            score += 3  # Good hashtag strategy
        elif len(hashtags) > 10:
            score += 1  # Too many hashtags
        
        return min(score, 15.0)
    
    def _calculate_freshness_score(self, media):
        """Calculate score based on post freshness."""
        score = 0.0
        
        # Calculate days since post
        days_since_post = (timezone.now() - media.posted_at).days
        
        # Fresher posts get higher scores
        if days_since_post <= 1:
            score = 10.0  # Very fresh
        elif days_since_post <= 3:
            score = 8.0   # Recent
        elif days_since_post <= 7:
            score = 6.0   # This week
        elif days_since_post <= 14:
            score = 4.0   # Last 2 weeks
        elif days_since_post <= 30:
            score = 2.0   # Last month
        else:
            score = 1.0   # Older
        
        return score
    
    def _calculate_historical_performance_score(self, media):
        """Calculate score based on historical performance vs competitor's posts."""
        score = 0.0
        
        # Get competitor's top performing posts
        competitor_media = InstagramCompetitorMedia.objects.filter(
            competitor=media.competitor
        ).exclude(id=media.id)
        
        if competitor_media.count() < 5:
            return 2.5  # Neutral if not enough data
        
        # Calculate percentile rank
        all_engagement = [(m.like_count + m.comments_count) for m in competitor_media]
        current_engagement = media.like_count + media.comments_count
        
        # Sort and find percentile
        all_engagement.sort()
        rank = len([e for e in all_engagement if e < current_engagement])
        percentile = (rank / len(all_engagement)) * 100
        
        # Score based on percentile
        if percentile >= 90:
            score = 5.0  # Top 10%
        elif percentile >= 75:
            score = 4.0  # Top 25%
        elif percentile >= 50:
            score = 3.0  # Top 50%
        elif percentile >= 25:
            score = 2.0  # Top 75%
        else:
            score = 1.0  # Bottom 25%
        
        return score
    
    def promote_to_candidates(self, media, source='ai'):
        """
        Promote a media post to candidates if it meets the threshold.
        AI analysis is run automatically only for Top Candidates.
        """
        # 1. Calculate the base metadata/engagement score
        scoring_result = self.score_media(media)
        base_score = scoring_result['total_score']
        
        # 2. Check if it meets the threshold
        meets_threshold = base_score >= self.candidate_threshold
        
        # If it meets the threshold and hasn't been analyzed yet, analyze automatically
        if meets_threshold and (not media.ai_analysis or 'business_decision' not in media.ai_analysis):
            try:
                from instagram.services.ai_analysis import AIAnalysisService
                ai_service = AIAnalysisService()
                ai_analysis = ai_service.analyze_competitor_media(media)
                
                # Store AI analysis
                media.ai_analysis = ai_analysis
                
                # Compute Hybrid OREAS Score:
                # 30% Engagement Score, 25% Purchase Intent, 20% Visual Quality, 15% Mfg Feasibility, 10% Trend Alignment
                engagement_score = base_score
                ai_scores = ai_analysis.get('scores', {})
                purchase_intent = ai_scores.get('purchase_intent_score', 50)
                visual_quality = ai_scores.get('visual_quality_score', 50)
                mfg_feasibility = ai_scores.get('manufacturing_feasibility_score', 50)
                trend_alignment = ai_scores.get('trend_alignment_score', 50)
                
                hybrid_score = (
                    engagement_score * 0.30 +
                    purchase_intent * 0.25 +
                    visual_quality * 0.20 +
                    mfg_feasibility * 0.15 +
                    trend_alignment * 0.10
                )
                media.ai_score = round(hybrid_score, 1)
                
                # Handle AI decision
                decision = ai_analysis.get('business_decision', 'RECOMMEND').upper()
                if decision == 'REJECT':
                    media.is_candidate = False
                    media.selection_source = 'ai_rejected'
                    media.selected_at = None
                else:
                    media.is_candidate = True
                    media.selection_source = source
                    media.selected_at = timezone.now()
                
            except Exception as e:
                print(f"Automatic AI analysis failed for media {media.id}: {e}")
                # Fall back to base scoring
                media.ai_score = base_score
                media.is_candidate = True
                media.selection_source = source
                media.selected_at = timezone.now()
        else:
            # If it has already been analyzed (either manually or in a previous run),
            # preserve the candidate status based on the analysis recommendation
            if media.ai_analysis and ('business_decision' in media.ai_analysis or 'scores' in media.ai_analysis):
                ai_scores = media.ai_analysis.get('scores', {})
                purchase_intent = ai_scores.get('purchase_intent_score', 50)
                visual_quality = ai_scores.get('visual_quality_score', 50)
                mfg_feasibility = ai_scores.get('manufacturing_feasibility_score', 50)
                trend_alignment = ai_scores.get('trend_alignment_score', 50)
                
                hybrid_score = (
                    base_score * 0.30 +
                    purchase_intent * 0.25 +
                    visual_quality * 0.20 +
                    mfg_feasibility * 0.15 +
                    trend_alignment * 0.10
                )
                media.ai_score = round(hybrid_score, 1)
                
                decision = media.ai_analysis.get('business_decision', 'RECOMMEND').upper()
                if decision == 'REJECT':
                    media.is_candidate = False
                else:
                    media.is_candidate = True
            else:
                media.ai_score = base_score
                media.is_candidate = False
                media.selection_source = None
                media.selected_at = None
                
        media.ai_score_details = scoring_result['breakdown']
        media.save()
        return media.ai_score
    
    def batch_score_competitor_media(self, competitor_id, score_all=True):
        """
        Score all media for a competitor and promote qualifying posts to candidates.
        If score_all=True, scores all posts regardless of candidate status.
        """
        competitor = InstagramCompetitor.objects.get(id=competitor_id)
        
        if score_all:
            media_list = InstagramCompetitorMedia.objects.filter(competitor=competitor)
        else:
            media_list = InstagramCompetitorMedia.objects.filter(
                competitor=competitor,
                is_candidate=False
            )
        
        promoted_count = 0
        total_scored = 0
        
        for media in media_list:
            # For batch syncing, we run the promote logic
            self.promote_to_candidates(media, source='ai')
            if media.is_candidate:
                promoted_count += 1
            total_scored += 1
        
        return {
            'total_analyzed': total_scored,
            'promoted_to_candidates': promoted_count
        }
