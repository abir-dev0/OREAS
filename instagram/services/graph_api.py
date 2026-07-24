import logging
import requests
from django.utils import timezone
from datetime import timedelta
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v18.0"
BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

class MetaGraphClient:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.is_instagram_basic = access_token.startswith("IGAA")
        self.base_url = "https://graph.instagram.com" if self.is_instagram_basic else f"https://graph.facebook.com/{GRAPH_API_VERSION}"
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {access_token}"})

    def get(self, path: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        url = f"{self.base_url}/{path}"
        try:
            response = self.session.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Meta Graph API request error: {e}")
            if 'response' in locals() and response is not None:
                logger.error(f"Response: {response.text}")
            raise e

    def fetch_recent_media(self, ig_business_account_id: str) -> List[Dict[str, Any]]:
        """
        Fetches media for a given Instagram account.
        """
        if self.is_instagram_basic:
            params = {
                "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username",
                "limit": 50
            }
            path = "me/media"
        else:
            params = {
                "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                "limit": 50
            }
            path = f"{ig_business_account_id}/media"
            
        result = self.get(path, params=params)
        return result.get("data", [])

    def fetch_comments(self, instagram_media_id: str) -> List[Dict[str, Any]]:
        """
        Fetches comments for a specific Media ID. (Skipped for Instagram Basic Display API)
        """
        if self.is_instagram_basic:
            return []
            
        params = {
            "fields": "id,text,username,timestamp",
            "limit": 100
        }
        path = f"{instagram_media_id}/comments"
        
        comments = []
        result = self.get(path, params=params)
        comments.extend(result.get("data", []))
        
        # Simple paginator to fetch next page if it exists
        while "paging" in result and "next" in result["paging"]:
            next_url = result["paging"]["next"]
            try:
                response = requests.get(next_url)
                response.raise_for_status()
                result = response.json()
                comments.extend(result.get("data", []))
            except Exception as e:
                logger.error(f"Error fetching next page of comments: {e}")
                break
                
        return comments

def exchange_code_for_long_lived_token(
    client_id: str, 
    client_secret: str, 
    redirect_uri: str, 
    code: str
) -> Dict[str, Any]:
    """
    Exchanges OAuth code for a short-lived token, then exchanges that for a 60-day long-lived token.
    """
    oauth_url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/oauth/access_token"
    
    # 1. Exchange code for short-lived token
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "client_secret": client_secret,
        "code": code
    }
    
    response = requests.get(oauth_url, params=params)
    if not response.ok:
        try:
            error_body = response.json()
            meta_error = error_body.get("error", {})
            msg = meta_error.get("message", response.text)
            error_type = meta_error.get("type", "")
            error_code = meta_error.get("code", response.status_code)
            raise ValueError(f"Meta token exchange failed [{error_type} #{error_code}]: {msg}")
        except ValueError:
            raise
        except Exception:
            raise requests.HTTPError(f"Meta token exchange failed {response.status_code}: {response.text}", response=response)

    short_token_data = response.json()
    short_token = short_token_data.get("access_token")
    
    if not short_token:
        raise ValueError(f"Meta did not return an access_token. Response: {short_token_data}")
    
    # 2. Exchange short-lived token for long-lived token
    params = {
        "grant_type": "fb_exchange_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "fb_exchange_token": short_token
    }
    
    response = requests.get(oauth_url, params=params)
    if not response.ok:
        try:
            error_body = response.json()
            meta_error = error_body.get("error", {})
            msg = meta_error.get("message", response.text)
            raise ValueError(f"Meta long-lived token exchange failed: {msg}")
        except ValueError:
            raise
        except Exception:
            raise requests.HTTPError(f"Meta long-lived token exchange failed {response.status_code}: {response.text}", response=response)

    long_token_data = response.json()
    
    expires_in = long_token_data.get("expires_in", 5184000)
    expires_at = timezone.now() + timedelta(seconds=expires_in)
    
    return {
        "access_token": long_token_data.get("access_token"),
        "expires_at": expires_at
    }

