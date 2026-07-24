"""
AI Analysis Service for Fashion Product Intelligence
Provider-agnostic architecture - can switch between Gemini, GPT-4.1, GPT-4o, etc.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import json
import base64
import os
import requests


class AIProvider(ABC):
    """Abstract base class for AI providers"""
    
    @abstractmethod
    def analyze_media(self, image_data: bytes, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze media image with context.
        
        Args:
            image_data: Binary image data
            context: Dictionary containing caption, likes, comments, engagement_rate,
                     media_type, publication_date, competitor_name, follower_count, etc.
        
        Returns:
            Structured JSON response with AI analysis matching the target schema.
        """
        pass


class GeminiProvider(AIProvider):
    """Gemini AI provider implementation using Google GenAI SDK"""
    
    def __init__(self):
        self.api_key = os.environ.get('GEMINI_API_KEY')
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        try:
            import google.genai as genai
            self.client = genai.Client(api_key=self.api_key)
        except ImportError:
            raise ImportError("google-genai package not installed. Install with: pip install google-genai")
    
    def analyze_media(self, image_data: bytes, context: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze media using Gemini"""
        import google.genai as genai
        
        # Prepare the prompt
        prompt = self._build_prompt(context)
        
        # Generate content using new API
        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                prompt,
                genai.types.Part.from_bytes(
                    data=image_data,
                    mime_type='image/jpeg'
                )
            ],
            config=genai.types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json"
            )
        )
        
        # Parse response
        try:
            return json.loads(response.text)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return self._parse_text_response(response.text)
    
    def _build_prompt(self, context: Dict[str, Any]) -> str:
        """Build the analysis prompt for fashion product intelligence"""
        caption = context.get('caption', '')
        likes = context.get('like_count', 0)
        comments = context.get('comments_count', 0)
        engagement_rate = context.get('engagement_rate', 0.0)
        media_type = context.get('media_type', 'IMAGE')
        competitor = context.get('competitor_username', 'Unknown')
        followers = context.get('follower_count', 0)
        
        prompt = f"""You are a Senior Fashion Buying Director and Marketing Strategist for OREAS, a premium Moroccan fashion brand and atelier. 
Analyze this Instagram post and decide whether to RECOMMEND or REJECT this product for production, focusing on commercial viability for the Moroccan premium market.

POST CONTEXT:
- Competitor Name: {competitor}
- Competitor Follower Count: {followers:,}
- Caption: "{caption}"
- Likes: {likes:,}
- Comments: {comments:,}
- Engagement Rate: {engagement_rate:.2%}
- Media Type: {media_type}

Write all textual fields (executive_summary, recommendations, descriptions, palettes, bullet points) in FRENCH.
Ensure all bullets are concise, scannable, and business-focused. Avoid long paragraphs.

EVALUATION CRITERIA:
1. Business Decision:
   - Decide either "RECOMMEND" or "REJECT".
   - Provide 3-4 short bulleted reasons in `decision_reasons`.
2. Confidence Score:
   - Provide an integer from 0 to 100 representing your buying confidence in this recommendation as `confidence_score`.
3. Scores:
   - Rate out of 100: purchase_intent_score, visual_quality_score, manufacturing_feasibility_score, trend_alignment_score.
4. Product Profile:
   - Identify:
     - commercial_potential ("Très élevé" or "Élevé" or "Moyen" or "Faible" or "Très faible")
     - market_segment
     - trend (description courte)
     - target_audience (cible courte)
     - manufacturing_difficulty (Facile/Moyen/Difficile)
     - production_risk (Faible/Moyen/Élevé)
     - recommended_price: An integer in MAD representing the recommended retail price. This MUST be based on the Moroccan market and OREAS's positioning as a premium ready-to-wear brand, constrained strictly by these reference ranges:
       * T-shirts / Tops: 150–300 MAD
       * Shirts: 200–350 MAD
       * Pants: 250–450 MAD
       * Dresses: 300–700 MAD
       * Two-piece sets: 350–600 MAD
       * Jackets: 450–900 MAD
       (Only recommend higher prices if the product clearly requires luxury fabrics like 100% natural silk, complex tailoring, or premium craftsmanship.)
       (The recommended price MUST end in 9 for psychological pricing, e.g. 299, 449).
     - suggested_price_range: A string representing a flexible suggested range matching the category constraints (e.g. "399–499 MAD").
     - recommendation (action courte)
5. Pourquoi ce produit mérite d'être testé:
   - Provide 4 short, punchy scannable reasons as `pourquoi_tester`.
6. Pourquoi maintenant ?:
   - Provide 3 short scannable bullets indicating why this moment is commercially optimal as `pourquoi_maintenant`.
7. Risques:
   - Provide 3 short scannable bullets indicating the main production or commercial risks as `risques`.
8. Opportunités d'amélioration:
   - Provide 4 short scannable bullets explaining how OREAS can improve this product (e.g., fabric upgrades, embroideries, premium decor shooting) as `opportunites_amelioration`.
9. Avantage Concurrentiel:
   - Provide 3-4 short scannable bullets explaining how OREAS can outperform the competitor (e.g. premium fabric, superior craftsmanship, luxurious branding) as `avantage_concurrentiel`.
10. Executive Summary:
    - Provide a short 2-3 sentence business summary that sounds like a professional fashion buying director as `executive_summary`.
11. Vision Intelligence & Manufacturing Intelligence:
    - Detail color_palette, background_quality, product_visibility, first_frame_impact, visual_distractions, lighting_quality, fabric_visibility.
    - Detail estimated_production_time, required_fabrics, required_accessories, pattern_complexity, suitable_for_mass_production.

RETURN STRUCTURED JSON ONLY. Do not include markdown formatting wrappers like ```json. The response must match this schema:
{{
  "business_decision": "RECOMMEND" or "REJECT",
  "decision_reasons": ["Raison courte 1 en français", "Raison courte 2 en français"],
  "confidence_score": <integer 0-100>,
  "scores": {{
    "purchase_intent_score": <integer 0-100>,
    "visual_quality_score": <integer 0-100>,
    "manufacturing_feasibility_score": <integer 0-100>,
    "trend_alignment_score": <integer 0-100>
  }},
  "product_profile": {{
    "commercial_potential": "Très élevé" or "Élevé" or "Moyen" or "Faible" or "Très faible",
    "market_segment": "Premium Fashion" or "Fast Fashion" or "Luxe",
    "trend": "Tendance courte",
    "target_audience": "Cible courte",
    "manufacturing_difficulty": "Facile" or "Moyen" or "Difficile",
    "production_risk": "Faible" or "Moyen" or "Élevé",
    "recommended_price": <integer e.g. 449>,
    "suggested_price_range": "399-499 MAD",
    "recommendation": "Action courte"
  }},
  "pourquoi_tester": [
    "Demande élevée détectée",
    "Fabrication simple"
  ],
  "pourquoi_maintenant": [
    "Le marché est orienté vers...",
    "Les ensembles enregistrent..."
  ],
  "risques": [
    "Marché concurrentiel",
    "Nécessite..."
  ],
  "opportunites_amelioration": [
    "Utiliser un tissu plus premium",
    "Ajouter une finition brodée"
  ],
  "avantage_concurrentiel": [
    "Tissus de qualité supérieure",
    "Finitions haut de gamme de l'atelier"
  ],
  "executive_summary": "Résumé exécutif court et axé business.",
  "vision_intelligence": {{
    "color_palette": ["Couleur 1", "Couleur 2"],
    "background_quality": "Arrière-plan...",
    "product_visibility": "Produit occupe...",
    "first_frame_impact": "Impact...",
    "visual_distractions": "Distractions...",
    "lighting_quality": "Éclairage...",
    "fabric_visibility": "Visibilité..."
  }},
  "manufacturing_intelligence": {{
    "estimated_production_time": "ex: 2-3 heures",
    "required_fabrics": ["Tissu 1", "Tissu 2"],
    "required_accessories": ["Accessoire 1", "Aucun"],
    "pattern_complexity": "Faible" or "Moyenne" or "Élevée",
    "suitable_for_mass_production": "OUI" or "NON"
  }},
  "strengths": ["Point fort 1", "Point fort 2"],
  "weaknesses": ["Risque 1", "Risque 2"]
}}
"""
        return prompt
    
    def _parse_text_response(self, text: str) -> Dict[str, Any]:
        """Fallback parser if JSON response fails"""
        # Try to extract JSON from text
        import re
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except:
                pass
        
        # Return fallback structure with new format
        return {
            "business_decision": "RECOMMEND",
            "decision_reasons": ["Raison technique : échec du parsing JSON"],
            "confidence_score": 75,
            "scores": {
                "purchase_intent_score": 50,
                "visual_quality_score": 50,
                "manufacturing_feasibility_score": 50,
                "trend_alignment_score": 50
            },
            "product_profile": {
                "commercial_potential": "Moyen",
                "market_segment": "Premium",
                "trend": "Inconnue",
                "target_audience": "Général",
                "manufacturing_difficulty": "Moyen",
                "production_risk": "Moyen",
                "recommended_price": 399,
                "suggested_price_range": "349-449 MAD",
                "recommendation": "Revue manuelle requise."
            },
            "pourquoi_tester": ["Validation technique à effectuer"],
            "pourquoi_maintenant": ["Tendance en cours de développement"],
            "risques": ["Analyse de risques non disponible"],
            "opportunites_amelioration": ["Amélioration des matières recommandée"],
            "avantage_concurrentiel": ["Savoir-faire de l'atelier"],
            "executive_summary": "Problème de parsing de la réponse. La fiche produit nécessite une revue manuelle.",
            "vision_intelligence": {
                "color_palette": ["Non détecté"],
                "background_quality": "Analyse non disponible",
                "product_visibility": "Analyse non disponible",
                "first_frame_impact": "Analyse non disponible",
                "visual_distractions": "Analyse non disponible",
                "lighting_quality": "Analyse non disponible",
                "fabric_visibility": "Analyse non disponible"
            },
            "manufacturing_intelligence": {
                "estimated_production_time": "Non estimé",
                "required_fabrics": ["Non détecté"],
                "required_accessories": ["Non détecté"],
                "pattern_complexity": "Moyenne",
                "suitable_for_mass_production": "NON"
            },
            "strengths": ["Données d'engagement stables"],
            "weaknesses": ["Échec d'analyse visuelle par l'IA"]
        }


class GPT4Provider(AIProvider):
    """GPT-4.1/GPT-4o provider implementation using direct HTTP requests"""
    
    def __init__(self, model="gpt-4o"):
        self.api_key = os.environ.get('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        self.model = model
    
    def analyze_media(self, image_data: bytes, context: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze media using GPT-4 Vision"""
        # Encode image to base64
        base64_image = base64.b64encode(image_data).decode('utf-8')
        
        # Build prompt using the same prompt structure
        gemini_prov = GeminiProvider.__new__(GeminiProvider)  # instantiate to use _build_prompt without full init
        prompt = gemini_prov._build_prompt(context)
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 2048,
            "response_format": { "type": "json_object" }
        }
        
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=45)
        response.raise_for_status()
        
        res_data = response.json()
        content = res_data["choices"][0]["message"]["content"]
        
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            # Instantiate an empty GeminiProvider just for fallback parsing
            gemini_prov.api_key = "dummy"
            return gemini_prov._parse_text_response(content)


class AIAnalysisService:
    """
    Main AI Analysis Service - provider-agnostic
    Handles switching between different AI providers
    """
    
    def __init__(self, provider: Optional[str] = None):
        """
        Initialize AI Analysis Service
        
        Args:
            provider: 'gemini', 'gpt4', or None (auto-detect from env)
        """
        if provider is None:
            # Auto-detect based on available API keys
            if os.environ.get('GEMINI_API_KEY'):
                provider = 'gemini'
            elif os.environ.get('OPENAI_API_KEY'):
                provider = 'gpt4'
            else:
                raise ValueError("No AI provider API key found. Set GEMINI_API_KEY or OPENAI_API_KEY")
        
        self.provider = self._create_provider(provider)
    
    def _create_provider(self, provider: str) -> AIProvider:
        """Factory method to create provider instance"""
        providers = {
            'gemini': GeminiProvider,
            'gpt4': GPT4Provider,
        }
        
        provider_class = providers.get(provider.lower())
        if not provider_class:
            raise ValueError(f"Unknown provider: {provider}. Available: {list(providers.keys())}")
        
        return provider_class()
    
    def analyze_competitor_media(self, media) -> Dict[str, Any]:
        """
        Analyze a competitor media post
        
        Args:
            media: InstagramCompetitorMedia instance
        
        Returns:
            Structured AI analysis
        """
        # Get image data
        image_url = media.thumbnail_url or media.media_url
        image_data = self._fetch_image(image_url)
        
        # Build context
        context = {
            'caption': media.caption,
            'like_count': media.like_count,
            'comments_count': media.comments_count,
            'engagement_rate': (media.like_count + media.comments_count) / max(media.competitor.followers_count, 1),
            'media_type': media.media_type,
            'publication_date': media.posted_at.isoformat(),
            'competitor_username': media.competitor.username,
            'follower_count': media.competitor.followers_count,
            'instagram_media_id': media.instagram_media_id
        }
        
        # Analyze
        return self.provider.analyze_media(image_data, context)
    
    def _fetch_image(self, image_url: str) -> bytes:
        """Fetch image from URL"""
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        return response.content
    
    def batch_analyze_top_candidates(self, limit: int = 5) -> Dict[str, Any]:
        """
        Analyze top candidates automatically
        
        Args:
            limit: Number of top candidates to analyze
        
        Returns:
            Dictionary with analysis results
        """
        from instagram.models import InstagramCompetitorMedia
        
        # Get top candidates by AI score
        top_media = InstagramCompetitorMedia.objects.filter(
            is_candidate=True
        ).order_by('-ai_score')[:limit]
        
        results = {}
        for media in top_media:
            try:
                analysis = self.analyze_competitor_media(media)
                results[media.id] = {
                    'success': True,
                    'analysis': analysis
                }
            except Exception as e:
                results[media.id] = {
                    'success': False,
                    'error': str(e)
                }
        
        return {
            'total_analyzed': len(top_media),
            'successful': sum(1 for r in results.values() if r['success']),
            'results': results
        }
