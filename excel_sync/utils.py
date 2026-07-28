import re
import base64
import urllib.parse
import requests
import io

def convert_share_url_to_download_url(url: str) -> str:
    """
    Converts various OneDrive, SharePoint, Google Sheets, or Dropbox shareable links
    into a direct downloadable Excel binary stream URL.
    """
    if not url:
        return ""
    
    url = url.strip()

    # 1. Google Sheets Link
    if "docs.google.com/spreadsheets" in url:
        match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
        if match:
            doc_id = match.group(1)
            return f"https://docs.google.com/spreadsheets/d/{doc_id}/export?format=xlsx"

    # 2. Dropbox Link
    if "dropbox.com" in url:
        return url.replace("dl=0", "dl=1")

    # 3. Follow shortlink redirects (e.g. 1drv.ms)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    resolved_url = url
    if "1drv.ms" in url:
        try:
            r = requests.head(url, headers=headers, allow_redirects=True, timeout=10)
            resolved_url = r.url
        except Exception:
            resolved_url = url

    # 4. OneDrive / SharePoint URLs
    if "onedrive.live.com" in resolved_url or "sharepoint.com" in resolved_url or "1drv.ms" in resolved_url:
        # Check for download.aspx transform
        if "view.aspx" in resolved_url:
            resolved_url = resolved_url.replace("view.aspx", "download.aspx")
        elif "edit.aspx" in resolved_url:
            resolved_url = resolved_url.replace("edit.aspx", "download.aspx")

        if "download=1" not in resolved_url:
            delim = "&" if "?" in resolved_url else "?"
            resolved_url = f"{resolved_url}{delim}download=1"
            
        return resolved_url

    # Fallback to base64 API URL if not matched
    try:
        encoded_bytes = base64.b64encode(url.encode('utf-8'))
        encoded_str = encoded_bytes.decode('utf-8').rstrip('=').replace('/', '_').replace('+', '-')
        b64_share = 'u!' + encoded_str
        return f"https://api.onedrive.com/v1.0/shares/{b64_share}/root/content"
    except Exception:
        return url


def fetch_excel_bytes_from_url(share_url: str) -> tuple[bytes, str]:
    """
    Downloads Excel file content bytes from a shareable link.
    Returns (bytes, filename).
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    download_url = convert_share_url_to_download_url(share_url)
    
    # Try fetching from transformed URL
    resp = requests.get(download_url, headers=headers, allow_redirects=True, timeout=30)
    
    # Check if we got valid binary zip/xlsx bytes (starts with PK\x03\x04)
    content = resp.content
    is_valid_excel = content.startswith(b'PK\x03\x04') or content.startswith(b'\xd0\xcf\x11\xe0')

    # If transformed URL didn't return valid excel, try Microsoft Graph share API
    if not is_valid_excel:
        try:
            encoded_bytes = base64.b64encode(share_url.encode('utf-8'))
            encoded_str = encoded_bytes.decode('utf-8').rstrip('=').replace('/', '_').replace('+', '-')
            graph_share_url = f"https://api.onedrive.com/v1.0/shares/u!{encoded_str}/root/content"
            g_resp = requests.get(graph_share_url, headers=headers, allow_redirects=True, timeout=30)
            if g_resp.status_code == 200 and (g_resp.content.startswith(b'PK\x03\x04') or g_resp.content.startswith(b'\xd0\xcf\x11\xe0')):
                resp = g_resp
                content = resp.content
                is_valid_excel = True
        except Exception:
            pass

    if not is_valid_excel:
        if content.startswith(b'<!DOCTYPE') or content.startswith(b'<html') or b'<head>' in content[:500].lower():
            raise ValueError(
                "Le lien fourni renvoie une page web HTML au lieu du fichier Excel. "
                "Assurez-vous de cliquer sur 'Partager' dans Excel Online, puis de choisir "
                "'Toute personne disposant du lien peut afficher' avant de copier le lien."
            )
        raise ValueError(f"Le serveur a renvoyé un format non supporté (HTTP {resp.status_code}).")

    # Extract filename from Content-Disposition header if present
    filename = "Excel_Sync.xlsx"
    cd = resp.headers.get('content-disposition', '')
    if cd and 'filename=' in cd:
        match = re.search(r'filename=["\']?([^"\';]+)["\']?', cd)
        if match:
            filename = match.group(1)

    return content, filename
