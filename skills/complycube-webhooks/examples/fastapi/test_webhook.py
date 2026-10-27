import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["COMPLYCUBE_WEBHOOK_SECRET"] = "complycube_test_webhook_secret"

from main import app, verify_complycube_signature  # noqa: E402

SECRET = os.environ["COMPLYCUBE_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_event(event_type: str, resource_type: str = "check") -> bytes:
    # Shape taken from ComplyCube's documented sample event
    return json.dumps(
        {
            "id": "5ed170fe99c81a0007b9a3d3",
            "type": event_type,
            "resourceType": resource_type,
            "payload": {
                "id": "5ed3918fbf06f30008e552c9",
                "outcome": "clear",
                "status": "complete",
                "createdAt": "2020-01-01T11:14:23.964Z",
                "updatedAt": "2020-01-01T11:14:23.964Z",
            },
            "createdAt": "2020-01-01T11:14:23.964Z",
        }
    ).encode()


BODY = make_event("check.completed.clear")


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/complycube", content=body, headers={"Content-Type": content_type, **(headers or {})}
    )


class TestVerify:
    def test_valid_either_case(self):
        assert verify_complycube_signature(BODY, sign(BODY), SECRET)
        assert verify_complycube_signature(BODY, sign(BODY).upper(), SECRET)

    def test_invalid_variants(self):
        assert not verify_complycube_signature(BODY, sign(BODY, "other"), SECRET)
        assert not verify_complycube_signature(BODY, None, SECRET)
        assert not verify_complycube_signature(BODY, "", SECRET)
        assert not verify_complycube_signature(BODY, "abcd", SECRET)
        assert not verify_complycube_signature(BODY, "zz" * 32, SECRET)
        assert not verify_complycube_signature(BODY, "sha256=" + sign(BODY), SECRET)
        assert not verify_complycube_signature(BODY, "é" * 64, SECRET)
        # fullmatch must not accept a trailing newline
        assert not verify_complycube_signature(BODY, sign(BODY) + "\n", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "event_type,resource_type",
        [
            ("check.completed.clear", "check"),
            ("check.completed", "check"),
            ("check.failed", "check"),
            ("client.created", "client"),
            ("workflow.session.completed", "workflowSession"),
            ("address.created", "address"),
        ],
    )
    def test_signed_event(self, event_type, resource_type):
        body = make_event(event_type, resource_type)
        res = post(body, {"ComplyCube-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_exact_bytes_and_other_content_type(self):
        pretty = json.dumps(json.loads(BODY), indent=2).encode()
        res = post(pretty, {"ComplyCube-Signature": sign(pretty)}, content_type="text/plain")
        assert res.status_code == 200

    def test_unsigned_rejected(self):
        assert post(BODY).status_code == 401

    def test_bad_signature_rejected(self):
        assert post(BODY, {"ComplyCube-Signature": sign(BODY, "wrong")}).status_code == 401

    def test_malformed_signature_rejected(self):
        assert post(BODY, {"ComplyCube-Signature": "not-hex"}).status_code == 401

    def test_tampered_body_rejected(self):
        res = post(BODY.replace(b"clear", b"rejected"), {"ComplyCube-Signature": sign(BODY)})
        assert res.status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/complycube",
            content=BODY,
            headers={"Content-Type": "application/json", "ComplyCube-Signature": "é".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_malformed_signed_json(self):
        bad = b"{not json"
        assert post(bad, {"ComplyCube-Signature": sign(bad)}).status_code == 400

    @pytest.mark.parametrize("bad", [b"null", b"42", b'{"id":"x"}'])
    def test_signed_non_event_is_400(self, bad):
        assert post(bad, {"ComplyCube-Signature": sign(bad)}).status_code == 400
