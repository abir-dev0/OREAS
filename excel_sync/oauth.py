import os
import secrets
import hashlib
import base64
import requests
import logging
from django.conf import settings
from excel_sync.models import OneDriveToken

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
SCOPES = ["Files.ReadWrite", "offline_access", "User.Read"]

def generate_pkce_pair() -> tuple[str, str]:
    """
    Generates a cryptographically random code_verifier and code_challenge for OAuth PKCE.
    """
    code_verifier = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(code_verifier.encode('ascii')).digest()
    code_challenge = base64.urlsafe_b64encode(hashed).decode('utf-8').replace('=', '')
    return code_verifier, code_challenge

def get_ms_client_id() -> str:
    return os.getenv('MS_CLIENT_ID', getattr(settings, 'MS_CLIENT_ID', ''))

def get_ms_redirect_uri() -> str:
    default_uri = "http://localhost:8000/api/excel-sync/oauth/callback/"
    return os.getenv('MS_REDIRECT_URI', getattr(settings, 'MS_REDIRECT_URI', default_uri))

def build_authorization_url(state: str = '') -> tuple[str, str]:
    """
    Builds the Microsoft Graph OAuth 2.0 PKCE authorization URL.
    Returns (authorization_url, code_verifier).
    """
    client_id = get_ms_client_id()
    redirect_uri = get_ms_redirect_uri()
    code_verifier, code_challenge = generate_pkce_pair()

    params = {
        'client_id': client_id,
        'response_type': 'code',
        'redirect_uri': redirect_uri,
        'response_mode': 'query',
        'scope': ' '.join(SCOPES),
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
    }
    if state:
        params['state'] = state

    req = requests.Request('GET', AUTHORIZE_URL, params=params)
    prepared = req.prepare()
    return prepared.url, code_verifier

def exchange_code_for_tokens(code: str, code_verifier: str) -> dict:
    """
    Exchanges authorization code for access_token and refresh_token via PKCE.
    """
    client_id = get_ms_client_id()
    redirect_uri = get_ms_redirect_uri()

    payload = {
        'client_id': client_id,
        'scope': ' '.join(SCOPES),
        'code': code,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
        'code_verifier': code_verifier,
    }

    response = requests.post(TOKEN_URL, data=payload, timeout=15)
    response.raise_for_status()
    return response.json()

def refresh_access_token(refresh_token: str) -> dict:
    """
    Uses refresh_token to acquire a new access_token and new refresh_token.
    """
    client_id = get_ms_client_id()

    payload = {
        'client_id': client_id,
        'scope': ' '.join(SCOPES),
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token',
    }

    response = requests.post(TOKEN_URL, data=payload, timeout=15)
    response.raise_for_status()
    return response.json()

def ensure_valid_token(token_record: OneDriveToken) -> str:
    """
    Checks if token_record's access_token is valid. If expiring soon, silently refreshes it.
    Returns valid access_token string.
    """
    if token_record.is_access_token_valid:
        return token_record.get_access_token()

    logger.info("Access token is expiring/expired. Refreshing using refresh_token...")
    old_refresh = token_record.get_refresh_token()
    token_data = refresh_access_token(old_refresh)

    access_token = token_data['access_token']
    new_refresh = token_data.get('refresh_token', old_refresh)
    expires_in = token_data.get('expires_in', 3600)

    token_record.set_tokens(access_token, new_refresh, expires_in)
    token_record.save()

    return access_token
