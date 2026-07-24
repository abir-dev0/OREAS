import os
from cryptography.fernet import Fernet
from django.conf import settings

# In production, configure ENCRYPTION_KEY in your env vars.
# Generate a key with: Fernet.generate_key()
DEFAULT_KEY = b'vS-d6WJ191cR2e_h7Y-hT7r46_zXg2Yt25jW6tGv_pA='
_key = os.getenv('ENCRYPTION_KEY', getattr(settings, 'FIELD_ENCRYPTION_KEY', DEFAULT_KEY))

if isinstance(_key, str):
    _key = _key.encode()

# Fernet key must be 32 url-safe base64-encoded bytes.
# If the provided key is invalid, we fallback to default key for development.
try:
    cipher_suite = Fernet(_key)
except Exception:
    cipher_suite = Fernet(DEFAULT_KEY)

def encrypt_value(value: str) -> str:
    if not value:
        return value
    return cipher_suite.encrypt(value.encode()).decode()

def decrypt_value(value: str) -> str:
    if not value:
        return value
    return cipher_suite.decrypt(value.encode()).decode()
