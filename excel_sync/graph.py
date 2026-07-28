import requests
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"

class MicrosoftGraphFilesClient:
    """
    Microsoft Graph Files API client for personal OneDrive accounts.
    Strictly performs read-only file content downloads and webhook subscriptions.
    """

    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "OREAS-Orders-Sync/1.0"
        }

    def get_user_profile(self) -> dict:
        """
        Fetches authenticated user profile metadata.
        """
        url = f"{GRAPH_BASE_URL}/me"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json()

    def download_workbook(self, item_id: str) -> bytes:
        """
        Downloads raw .xlsx binary file from OneDrive using Files API.
        Endpoint: GET /me/drive/items/{item-id}/content
        """
        url = f"{GRAPH_BASE_URL}/me/drive/items/{item_id}/content"
        res = requests.get(url, headers=self.headers, timeout=60, allow_redirects=True)
        res.raise_for_status()
        return res.content

    def get_item_metadata(self, item_id: str) -> dict:
        """
        Retrieves Drive item metadata (e.g. parent folder id, name, last modified).
        """
        url = f"{GRAPH_BASE_URL}/me/drive/items/{item_id}"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json()

    def create_change_subscription(self, item_id: str, notification_url: str, client_state: str) -> dict:
        """
        Subscribes to OneDrive change notifications (webhooks).
        Note: Personal OneDrive webhooks target the parent folder of the file or root.
        """
        # Fetch item to discover parent reference
        metadata = self.get_item_metadata(item_id)
        parent_id = metadata.get("parentReference", {}).get("id") or item_id

        # Personal OneDrive subscriptions max TTL is 4230 minutes (~2.9 days)
        expiration_time = (timezone.now() + timezone.timedelta(days=2, hours=18)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        payload = {
            "changeType": "updated",
            "notificationUrl": notification_url,
            "resource": f"/me/drive/items/{parent_id}/children",
            "expirationDateTime": expiration_time,
            "clientState": client_state,
        }

        url = f"{GRAPH_BASE_URL}/subscriptions"
        res = requests.post(url, headers=self.headers, json=payload, timeout=15)
        res.raise_for_status()
        return res.json()

    def renew_change_subscription(self, subscription_id: str) -> dict:
        """
        Renews an existing change notification subscription before it expires.
        """
        expiration_time = (timezone.now() + timezone.timedelta(days=2, hours=18)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        payload = {
            "expirationDateTime": expiration_time
        }

        url = f"{GRAPH_BASE_URL}/subscriptions/{subscription_id}"
        res = requests.patch(url, headers=self.headers, json=payload, timeout=15)
        res.raise_for_status()
        return res.json()
