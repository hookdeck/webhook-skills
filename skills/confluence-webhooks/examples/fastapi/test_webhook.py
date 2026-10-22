import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app

SECRET = "test_secret_up_to_255_chars"
client = TestClient(app)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("CONFLUENCE_WEBHOOK_SECRET", SECRET)


def sign(body: bytes, secret: str = SECRET) -> str:
    # Same scheme Confluence uses: HMAC-SHA256 hex of the raw body.
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/confluence",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


PAGE_CREATED = json.dumps(
    {
        "timestamp": 1596182511300,
        "event": "page_created",
        "userKey": "ff80818154ec9913015501e194f601d8",
        "page": {"id": 309264476},
    }
).encode()


def test_valid_prefixed_signature():
    res = post(PAGE_CREATED, {"X-Hub-Signature": f"sha256={sign(PAGE_CREATED)}"})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_valid_unprefixed_signature():
    assert post(PAGE_CREATED, {"X-Hub-Signature": sign(PAGE_CREATED)}).status_code == 200


def test_raw_body_for_non_json_content_type():
    res = post(
        PAGE_CREATED,
        {"content-type": "text/plain", "X-Hub-Signature": f"sha256={sign(PAGE_CREATED)}"},
    )
    assert res.status_code == 200


def test_wrong_secret():
    res = post(PAGE_CREATED, {"X-Hub-Signature": f"sha256={sign(PAGE_CREATED, 'other')}"})
    assert res.status_code == 400


def test_tampered_body():
    res = post(
        PAGE_CREATED.replace(b"309264476", b"1"),
        {"X-Hub-Signature": f"sha256={sign(PAGE_CREATED)}"},
    )
    assert res.status_code == 400


def test_other_algorithm_prefix():
    assert post(PAGE_CREATED, {"X-Hub-Signature": f"sha1={sign(PAGE_CREATED)}"}).status_code == 400


def test_missing_signature():
    assert post(PAGE_CREATED).status_code == 400


def test_malformed_signature():
    assert post(PAGE_CREATED, {"X-Hub-Signature": "sha256=abc"}).status_code == 400


@pytest.mark.parametrize(
    "event,extra",
    [
        ("page_updated", {"page": {"id": 1}}),
        ("page_removed", {"page": {"id": 1}}),
        ("blog_created", {"blog": {"id": 2}}),
        ("comment_created", {"comment": {"id": 3}}),
        ("space_created", {"space": {"key": "DOC"}}),
        ("label_added", {}),
    ],
)
def test_handles_events(event, extra):
    body = json.dumps({"timestamp": 1, "event": event, **extra}).encode()
    assert post(body, {"X-Hub-Signature": f"sha256={sign(body)}"}).status_code == 200


def test_signed_invalid_json():
    body = b"not json"
    res = post(body, {"content-type": "text/plain", "X-Hub-Signature": f"sha256={sign(body)}"})
    assert res.status_code == 400
