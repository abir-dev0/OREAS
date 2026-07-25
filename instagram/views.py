from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from core.models import Brand
from products.models import Product
from instagram.models import InstagramAccount, InstagramMedia, InstagramComment, InstagramCompetitor, InstagramCompetitorMedia
from instagram.serializers import (
    InstagramAccountSerializer, InstagramMediaSerializer, 
    InstagramCommentSerializer, InstagramCompetitorSerializer, InstagramCompetitorMediaSerializer
)
from instagram.services.oauth_service import get_oauth_login_url, complete_oauth_flow
from instagram.tasks import sync_recent_media_for_account, sync_competitor_data

class InstagramAccountViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InstagramAccount.objects.all()
    serializer_class = InstagramAccountSerializer

    @action(detail=True, methods=['post'], url_path='sync')
    def sync_data(self, request, pk=None):
        account = get_object_or_404(InstagramAccount, pk=pk)
        sync_recent_media_for_account.delay(account.id)
        return Response({"status": "Sync task scheduled in background."}, status=status.HTTP_202_ACCEPTED)

class InstagramMediaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InstagramMedia.objects.all().order_by('-posted_at')
    serializer_class = InstagramMediaSerializer

    @action(detail=False, methods=['get'], url_path='candidates')
    def list_candidates(self, request):
        """
        List candidate media ordered by final score.
        """
        candidates = InstagramMedia.objects.filter(is_candidate=True).select_related('analysis', 'linked_product').order_by('-analysis__final_score')
        page = self.paginate_queryset(candidates)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(candidates, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='comments')
    def list_comments(self, request, pk=None):
        media = get_object_or_404(InstagramMedia, pk=pk)
        comments = media.comments.all().order_by('-posted_at')
        page = self.paginate_queryset(comments)
        if page is not None:
            serializer = InstagramCommentSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = InstagramCommentSerializer(comments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='link-product')
    def link_product(self, request, pk=None):
        media = get_object_or_404(InstagramMedia, pk=pk)
        product_id = request.data.get('product_id')
        if not product_id:
            return Response({"error": "product_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        product = get_object_or_404(Product, pk=product_id)
        media.linked_product = product
        media.save()
        return Response({
            "message": "Product successfully linked.",
            "media": InstagramMediaSerializer(media).data
        })

    @action(detail=True, methods=['post'], url_path='create-shopify-product')
    def create_shopify_product(self, request, pk=None):
        media = get_object_or_404(InstagramMedia, pk=pk)
        if not media.linked_product:
            return Response({"error": "No linked product found. Associate a product first."}, status=status.HTTP_400_BAD_REQUEST)
            
        product = media.linked_product
        # In a fully integrated workflow, this would trigger a Shopify celery task.
        # For Phase 1, we return the mock creation success payload.
        return Response({
            "status": "scheduled",
            "message": f"Shopify test-product creation task triggered for product: {product.title}.",
            "shopify_draft_product": {
                "title": f"[TEST] {product.title}",
                "body_html": f"Test product created from Instagram Media {media.instagram_media_id}. Original caption: {media.caption}",
                "vendor": "OREAS",
                "status": "draft",
                "price": str(product.price or 0.00),
                "images": [{"src": media.media_url}]
            }
        }, status=status.HTTP_202_ACCEPTED)

from rest_framework.permissions import AllowAny

class OAuthConnectView(APIView):
    """
    Endpoint to fetch Meta login redirect URL for OAuth.
    Accepts query parameters: brand_slug and redirect_uri
    """
    permission_classes = [AllowAny]

    def get(self, request):
        brand_slug = request.query_params.get('brand_slug')
        redirect_uri = request.query_params.get('redirect_uri')
        if not brand_slug or not redirect_uri:
            return Response({"error": "brand_slug and redirect_uri parameters are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        url = get_oauth_login_url(brand_slug, redirect_uri)
        return Response({"url": url})

class OAuthCallbackView(APIView):
    """
    Callback endpoint that exchanges code for access token and binds account.
    Accepts POST payload: { "brand_slug": "...", "redirect_uri": "...", "code": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        brand_slug = request.data.get('brand_slug')
        redirect_uri = request.data.get('redirect_uri')
        code = request.data.get('code')
        
        if not all([brand_slug, redirect_uri, code]):
            return Response({"error": "brand_slug, redirect_uri, and code are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        brand = get_object_or_404(Brand, slug=brand_slug)
        try:
            account = complete_oauth_flow(brand, redirect_uri, code)
            # Trigger immediate media synchronization in background
            sync_recent_media_for_account.delay(account.id)
            return Response({
                "message": "Account successfully linked and synchronization started.",
                "account": InstagramAccountSerializer(account).data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class InstagramCompetitorViewSet(viewsets.ModelViewSet):
    queryset = InstagramCompetitor.objects.all().order_by('-created_at')
    serializer_class = InstagramCompetitorSerializer

    def perform_create(self, serializer):
        # Default to the 'oreas' brand for competitor profiles
        brand = get_object_or_404(Brand, slug='oreas')
        competitor = serializer.save(brand=brand)
        # Try async Celery task; fall back to inline sync if Celery isn't running
        try:
            sync_competitor_data.delay(competitor.id)
        except Exception:
            from instagram.services.discovery import InstagramDiscoveryService
            from instagram.models import InstagramAccount
            account = InstagramAccount.objects.filter(is_active=True).first()
            service = InstagramDiscoveryService(account)
            service.sync_competitor(competitor)

    @action(detail=True, methods=['post'], url_path='sync')
    def sync_data(self, request, pk=None):
        competitor = get_object_or_404(InstagramCompetitor, pk=pk)
        # Run synchronously in-process so data is ready before the HTTP response
        from instagram.services.discovery import InstagramDiscoveryService
        from instagram.models import InstagramAccount
        account = InstagramAccount.objects.filter(is_active=True).first()
        service = InstagramDiscoveryService(account)
        service.sync_competitor(competitor)
        # Re-fetch from DB to get the latest saved values (followers_count, last_sync_at)
        competitor.refresh_from_db()
        from instagram.serializers import InstagramCompetitorSerializer as CS
        return Response({
            "status": f"Sync complete for competitor: {competitor.username}.",
            "competitor": CS(competitor).data
        }, status=status.HTTP_200_OK)

class InstagramCompetitorMediaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InstagramCompetitorMedia.objects.all().order_by('-posted_at')
    serializer_class = InstagramCompetitorMediaSerializer
    # No pagination — return ALL posts so the frontend can see new posts.
    # With PAGE_SIZE=20 and ordering by engagement, newly published posts
    # (low likes, low engagement) were permanently hidden on page 2+.
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset()
        competitor_id = self.request.query_params.get('competitor_id')
        sort_by = self.request.query_params.get('sort_by')
        days = self.request.query_params.get('days')

        if competitor_id:
            queryset = queryset.filter(competitor_id=competitor_id)

        if days and days.isdigit():
            from django.utils import timezone
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=int(days))
            queryset = queryset.filter(posted_at__gte=cutoff)

        # Default to newest first — users want to see what competitors posted recently
        if sort_by == 'engagement':
            queryset = queryset.order_by('-engagement_score')
        else:
            queryset = queryset.order_by('-posted_at')

        return queryset

    @action(detail=False, methods=['get'], url_path='candidates')
    def list_candidates(self, request):
        """
        Return the Top 4 posts by OREAS Score across all analyzed posts.
        No manual promotion required — the pipeline auto-selects the best.
        """
        candidates = InstagramCompetitorMedia.objects.filter(
            ai_score__isnull=False
        ).select_related('competitor').order_by('-ai_score')[:4]
        
        serializer = self.get_serializer(candidates, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='promote-candidate')
    def promote_to_candidate(self, request, pk=None):
        """
        Manually promote a competitor media post to candidates.
        """
        media = get_object_or_404(InstagramCompetitorMedia, pk=pk)
        
        # Calculate AI score if not already scored
        from instagram.services.ai_scoring import AIScoringService
        ai_service = AIScoringService()
        scoring_result = ai_service.score_media(media)
        
        media.ai_score = scoring_result['total_score']
        media.ai_score_details = scoring_result['breakdown']
        media.is_candidate = True
        media.selection_source = 'user'
        media.selected_at = timezone.now()
        media.save()
        
        return Response({
            "message": "Media promoted to candidates successfully.",
            "media": InstagramCompetitorMediaSerializer(media).data
        })

    @action(detail=True, methods=['post'], url_path='remove-candidate')
    def remove_from_candidates(self, request, pk=None):
        """
        Manually remove a competitor media post from candidates.
        """
        media = get_object_or_404(InstagramCompetitorMedia, pk=pk)
        media.is_candidate = False
        media.selection_source = None
        media.selected_at = None
        media.save()
        
        return Response({
            "message": "Media removed from candidates successfully.",
            "media": InstagramCompetitorMediaSerializer(media).data
        })

    @action(detail=True, methods=['post'], url_path='ai-analyze')
    def ai_analyze(self, request, pk=None):
        """
        Trigger AI analysis for a competitor media post.
        Returns structured fashion product intelligence and saves it to the database.
        """
        media = get_object_or_404(InstagramCompetitorMedia, pk=pk)
        
        try:
            from instagram.services.ai_analysis import AIAnalysisService
            ai_service = AIAnalysisService()
            analysis = ai_service.analyze_competitor_media(media)
            
            # Calculate base score for hybrid scoring
            from instagram.services.ai_scoring import AIScoringService
            scoring_service = AIScoringService()
            base_score = scoring_service.score_media(media)['total_score']
            
            # Store analysis and update scores
            media.ai_analysis = analysis
            
            ai_scores = analysis.get('scores', {})
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
            
            # Update candidate promotion status based on the business decision
            decision = analysis.get('business_decision', 'RECOMMEND').upper()
            if decision == 'REJECT':
                media.is_candidate = False
                media.selection_source = 'ai_rejected'
                media.selected_at = None
            else:
                media.is_candidate = True
                if not media.selection_source or media.selection_source == 'ai_rejected':
                    media.selection_source = 'ai'
                if not media.selected_at:
                    media.selected_at = timezone.now()
            
            media.save()
            
            return Response({
                "success": True,
                "media_id": media.id,
                "analysis": analysis
            })
        except Exception as e:
            return Response({
                "success": False,
                "error": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'], url_path='ai-analyze-top')
    def ai_analyze_top_candidates(self, request):
        """
        Automatically analyze top candidates with AI.
        Query param: limit (default 5)
        """
        limit = int(request.query_params.get('limit', 5))
        
        try:
            from instagram.services.ai_analysis import AIAnalysisService
            ai_service = AIAnalysisService()
            results = ai_service.batch_analyze_top_candidates(limit)
            
            return Response(results)
        except Exception as e:
            return Response({
                "success": False,
                "error": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='import-candidate')
    def import_as_candidate(self, request, pk=None):
        comp_media = get_object_or_404(InstagramCompetitorMedia, pk=pk)
        
        # Find the active Instagram account for OREAS
        account = InstagramAccount.objects.filter(is_active=True).first()
        if not account:
            return Response({"error": "No active connected Instagram account found to bind candidate to."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Create or update InstagramMedia representing this candidate
        media_id = f"comp_{comp_media.instagram_media_id}"
        
        from instagram.models import MediaAnalysis
        media, created = InstagramMedia.objects.update_or_create(
            instagram_media_id=media_id,
            defaults={
                "account": account,
                "caption": f"[Veille - @{comp_media.competitor.username}] {comp_media.caption}",
                "media_type": comp_media.media_type,
                "media_url": comp_media.media_url,
                "thumbnail_url": comp_media.thumbnail_url,
                "permalink": comp_media.permalink,
                "posted_at": comp_media.posted_at,
                "like_count": comp_media.like_count,
                "comments_count": comp_media.comments_count,
                "is_candidate": True,
                "sync_status": "synced"
            }
        )
        
        # Create a default MediaAnalysis with final_score equal to the computed competitor score
        analysis, _ = MediaAnalysis.objects.get_or_create(media=media)
        analysis.comments_count = comp_media.comments_count
        analysis.final_score = comp_media.engagement_score
        analysis.save()
        
        return Response({
            "message": f"Successfully imported competitor post as Runway candidate.",
            "id": media.id
        }, status=status.HTTP_200_OK)
