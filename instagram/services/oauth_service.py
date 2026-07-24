from django.conf import settings
from django.urls import reverse
from core.models import Brand
from instagram.models import InstagramAccount
from .graph_api import exchange_code_for_long_lived_token, MetaGraphClient
import requests

def get_oauth_login_url(brand_slug: str, redirect_uri: str) -> str:
    """
    Builds Meta login redirect URL for OAuth.
    Requests permissions for reading media, managing comments, page engagement etc.
    """
    client_id = getattr(settings, "META_CLIENT_ID", "MOCK_META_CLIENT_ID")
    scopes = [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
        "instagram_manage_comments"
    ]
    scope_str = ",".join(scopes)
    
    # We pass the brand_slug as the 'state' to identify the Brand upon callback.
    url = (
        f"https://www.facebook.com/v18.0/dialog/oauth?"
        f"client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&state={brand_slug}"
        f"&scope={scope_str}"
    )
    return url

def complete_oauth_flow(brand: Brand, redirect_uri: str, code: str) -> InstagramAccount:
    """
    Completes the OAuth flow: exchanges code for long-lived access token,
    queries Facebook Pages / Instagram Business Account meta details,
    and updates/creates the InstagramAccount record for the Brand.
    """
    client_id = getattr(settings, "META_CLIENT_ID", "MOCK_META_CLIENT_ID")
    client_secret = getattr(settings, "META_CLIENT_SECRET", "MOCK_META_CLIENT_SECRET")
    
    # For development/testing/mock fallback if credentials are placeholder
    if client_id == "MOCK_META_CLIENT_ID" or code == "mock_code":
        # Fallback to mock account binding
        import datetime
        from django.utils import timezone
        
        account, created = InstagramAccount.objects.get_or_create(
            brand=brand,
            instagram_business_account_id="mock_ig_biz_acc_12345",
            defaults={
                "facebook_page_id": "mock_fb_page_12345",
                "facebook_page_name": "Oreas Store FB Page",
                "instagram_username": "oreas_clothing",
                "token_expires_at": timezone.now() + datetime.timedelta(days=60),
                "is_active": True
            }
        )
        account.set_access_token("mock_long_lived_token_abcdefghijklmnopqrstuvwxyz")
        account.save()
        return account

    # 1. Exchange OAuth code for long-lived token
    token_info = exchange_code_for_long_lived_token(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        code=code
    )
    access_token = token_info["access_token"]
    expires_at = token_info["expires_at"]
    
    if access_token.startswith("IGAA"):
        raise ValueError("Invalid token type received: Expected a Facebook Login token (EAA...), but got an Instagram Login token (IGAA...). Please use Facebook Login.")
    
    # 2. Query page / business account info via the user token
    client = MetaGraphClient(access_token)
    pages_data = client.get("me/accounts", params={"fields": "id,name,instagram_business_account{id,username}"})
    pages_list = pages_data.get("data", [])
    
    if not pages_list:
        raise ValueError("No Facebook Pages or connected Instagram Business Accounts found.")
    
    target_page = None
    target_ig_account = None
    
    for page in pages_list:
        ig_business = page.get("instagram_business_account")
        if ig_business:
            target_page = page
            target_ig_account = ig_business
            break
            
    if not target_ig_account:
        raise ValueError("Could not find any Instagram Business Account connected to your Facebook Pages.")
        
    facebook_page_id = target_page["id"]
    facebook_page_name = target_page.get("name", "")
    instagram_business_account_id = target_ig_account["id"]
    instagram_username = target_ig_account["username"]
    
    # 3. Create or update the InstagramAccount model
    account, created = InstagramAccount.objects.get_or_create(
        brand=brand,
        instagram_business_account_id=instagram_business_account_id,
        defaults={
            "facebook_page_id": facebook_page_id,
            "facebook_page_name": facebook_page_name,
            "instagram_username": instagram_username,
            "token_expires_at": expires_at,
            "is_active": True
        }
    )
    
    account.set_access_token(access_token)
    account.token_expires_at = expires_at
    if not created:
        account.facebook_page_id = facebook_page_id
        account.facebook_page_name = facebook_page_name
        account.instagram_username = instagram_username
        account.is_active = True
        
    account.save()
    return account
