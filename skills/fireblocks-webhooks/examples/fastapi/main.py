# Generated with: fireblocks-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import json
import os

import requests
from fastapi import Depends, FastAPI, Request, Response
from jwcrypto import jwk, jws

# Regional JWKS endpoints. Keys rotate automatically; we fetch and cache the set,
# and jwcrypto selects the correct key by the JWS `kid`.
JWKS_URLS = {
    "production": "https://keys.fireblocks.io/.well-known/jwks.json",
    "eu": "https://eu-keys.fireblocks.io/.well-known/jwks.json",
    "eu2": "https://eu2-keys.fireblocks.io/.well-known/jwks.json",
    "sandbox": "https://sandbox-keys.fireblocks.io/.well-known/jwks.json",
}


class FireblocksVerifier:
    """Verifies Fireblocks Webhooks v2 detached JWS (RS512) signatures.

    Pass ``jwks_set`` to inject a key set (used in tests); otherwise the set is
    fetched from ``jwks_url`` and cached.
    """

    def __init__(self, jwks_url: str | None = None, jwks_set: "jwk.JWKSet | None" = None):
        self._url = jwks_url
        self._jwks = jwks_set

    def _get_jwks(self) -> "jwk.JWKSet":
        if self._jwks is None:
            resp = requests.get(self._url, timeout=10)
            resp.raise_for_status()
            self._jwks = jwk.JWKSet.from_json(resp.text)
        return self._jwks

    def verify(self, raw_body: bytes, signature_header: str) -> dict:
        """Verify the signature over the RAW body and return the parsed event.

        ``Fireblocks-Webhook-Signature`` is a *detached* compact JWS
        (``<header>..<signature>``). We reinsert the raw body (base64url) as the
        payload, then verify. Raises on any failure.
        """
        parts = signature_header.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed Fireblocks-Webhook-Signature header")
        header, _, signature = parts

        payload = base64.urlsafe_b64encode(raw_body).rstrip(b"=").decode()
        full_jws = f"{header}.{payload}.{signature}"

        token = jws.JWS()
        token.deserialize(full_jws)
        # Pin the algorithm to RS512 to avoid algorithm-confusion attacks.
        token.verify(self._get_jwks(), alg="RS512")

        return json.loads(raw_body)


def create_verifier() -> FireblocksVerifier:
    env = os.environ.get("FIREBLOCKS_WEBHOOK_ENV", "production")
    url = os.environ.get("FIREBLOCKS_JWKS_URL") or JWKS_URLS.get(env, JWKS_URLS["production"])
    return FireblocksVerifier(jwks_url=url)


verifier = create_verifier()


def get_verifier() -> FireblocksVerifier:
    """Dependency — override in tests with ``app.dependency_overrides``."""
    return verifier


app = FastAPI()


@app.post("/webhooks/fireblocks")
async def fireblocks_webhook(
    request: Request, v: FireblocksVerifier = Depends(get_verifier)
):
    signature = request.headers.get("Fireblocks-Webhook-Signature")
    if not signature:
        return Response("Missing Fireblocks-Webhook-Signature header", status_code=400)

    # Read the RAW body bytes — do not parse JSON before verifying.
    raw_body = await request.body()

    try:
        event = v.verify(raw_body, signature)
    except Exception as err:  # noqa: BLE001 — any failure is an invalid signature
        print(f"Fireblocks webhook verification failed: {err}")
        return Response("Invalid signature", status_code=400)

    # Dispatch on `eventType`; the resource is in `event["data"]`.
    event_type = event.get("eventType")
    data = event.get("data") or {}

    if event_type == "transaction.created":
        print(f"Transaction created: {data.get('id') or event.get('resourceId')}")
        # Your code: record the pending transaction
    elif event_type == "transaction.status.updated":
        print(
            f"Transaction status updated: {data.get('id') or event.get('resourceId')} "
            f"-> {data.get('status')}"
        )
        # Your code: update settlement state; credit balances on COMPLETED
    elif event_type == "transaction.approval_status.updated":
        print(
            f"Transaction approval status updated: {data.get('id') or event.get('resourceId')}"
        )
        # Your code: notify approvers / gate release of funds
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly. Fireblocks expects a 200; do heavy work async.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
