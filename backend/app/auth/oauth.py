import hashlib
import base64
import os
import secrets

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


def _client_id() -> str:
    return os.environ["GOOGLE_OAUTH_CLIENT_ID"]


def _client_secret() -> str:
    return os.environ["GOOGLE_OAUTH_CLIENT_SECRET"]


def _redirect_uri() -> str:
    return os.environ["GOOGLE_OAUTH_REDIRECT_URI"]


def generate_pkce_pair() -> tuple[str, str]:
    """Returns (code_verifier, code_challenge) using S256 method."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def generate_state() -> str:
    return secrets.token_urlsafe(32)


def _challenge_from_verifier(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


async def build_authorization_url(state: str, code_verifier: str) -> str:
    code_challenge = _challenge_from_verifier(code_verifier)
    client = AsyncOAuth2Client(
        client_id=_client_id(),
        redirect_uri=_redirect_uri(),
        scope="openid email profile",
    )
    url, _ = client.create_authorization_url(
        GOOGLE_AUTH_ENDPOINT,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    return url


async def exchange_code(code: str, code_verifier: str) -> dict:
    async with AsyncOAuth2Client(
        client_id=_client_id(),
        client_secret=_client_secret(),
        redirect_uri=_redirect_uri(),
    ) as client:
        token = await client.fetch_token(
            GOOGLE_TOKEN_ENDPOINT,
            code=code,
            code_verifier=code_verifier,
            grant_type="authorization_code",
        )
    return dict(token)


async def fetch_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()
