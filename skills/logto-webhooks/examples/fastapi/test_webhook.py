import hashlib
import hmac
import json
import os

SECRET = "test_logto_signing_key"
os.environ["LOGTO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
SIG = "logto-signature-sha-256"


def sign(body: str, secret: str = SECRET) -> str:
    # Logto: lowercase hex HMAC-SHA256 of the raw body, no prefix
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


# Payload shaped like the documented Grant.LimitExceeded sample
GRANT_LIMIT = json.dumps({
    "hookId": "hook_abc",
    "event": "Grant.LimitExceeded",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "ip": "192.168.0.1",
    "userAgent": "Mozilla/5.0",
    "userId": "u_001",
    "applicationId": "app_xyz",
    "application": {"id": "app_xyz", "type": "SPA", "name": "My app", "description": "My app description"},
    "maxAllowedGrants": 2,
    "preRevocationActiveGrantCount": 3,
    "revokedGrantIds": ["grant_001"],
})

SIGN_IN = json.dumps({
    "hookId": "hook_abc",
    "event": "PostSignIn",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "interactionEvent": "SignIn",
    "userIp": "192.168.0.1",
    "userId": "u_001",
    "user": {"id": "u_001", "primaryEmail": "jane@example.com"},
    "applicationId": "app_xyz",
    "application": {"id": "app_xyz", "type": "SPA", "name": "My app"},
})

USER_CREATED = json.dumps({
    "hookId": "hook_abc",
    "event": "User.Created",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "ip": "192.168.0.1",
    "path": "/users",
    "method": "POST",
    "status": 200,
    "data": {"id": "u_002", "primaryEmail": "new@example.com"},
})


def post(body: str, headers=None):
    return client.post("/webhooks/logto", content=body, headers=headers or {})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(GRANT_LIMIT, {SIG: sign(GRANT_LIMIT)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_exact_bytes_not_reserialized_json(self):
        pretty = json.dumps(json.loads(SIGN_IN), indent=2)
        assert post(pretty, {SIG: sign(pretty)}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        res = post(SIGN_IN, {SIG: sign(SIGN_IN), "content-type": "text/plain"})
        assert res.status_code == 200

    def test_accepts_uppercase_hex_digest(self):
        assert post(SIGN_IN, {SIG: sign(SIGN_IN).upper()}).status_code == 200

    def test_rejects_missing_header(self):
        assert post(SIGN_IN).status_code == 401

    def test_rejects_empty_header(self):
        assert post(SIGN_IN, {SIG: ""}).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(SIGN_IN, {SIG: sign(SIGN_IN, "other_key")}).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(SIGN_IN.replace("u_001", "u_999"), {SIG: sign(SIGN_IN)}).status_code == 401

    def test_rejects_sha256_prefixed_value(self):
        assert post(SIGN_IN, {SIG: f"sha256={sign(SIGN_IN)}"}).status_code == 401

    def test_rejects_wrong_length_digest(self):
        assert post(SIGN_IN, {SIG: sign(SIGN_IN)[:62]}).status_code == 401

    def test_rejects_non_hex_characters(self):
        assert post(SIGN_IN, {SIG: "z" * 64}).status_code == 401

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("LOGTO_WEBHOOK_SECRET")
        assert post(SIGN_IN, {SIG: sign(SIGN_IN)}).status_code == 500


class TestEventHandling:
    def test_handles_post_sign_in(self):
        assert post(SIGN_IN, {SIG: sign(SIGN_IN)}).status_code == 200

    def test_handles_user_created(self):
        assert post(USER_CREATED, {SIG: sign(USER_CREATED)}).status_code == 200

    def test_acknowledges_unhandled_events(self):
        body = json.dumps({"hookId": "hook_abc", "event": "Organization.Created", "data": {"id": "org_1"}})
        assert post(body, {SIG: sign(body)}).status_code == 200

    def test_does_not_classify_by_interaction_event(self, capsys):
        body = json.dumps({"event": "User.Data.Updated", "interactionEvent": "Register", "data": {"id": "u_1"}})
        assert post(body, {SIG: sign(body)}).status_code == 200
        assert "User updated: u_1" in capsys.readouterr().out

    def test_ignores_wrong_typed_nested_fields(self):
        bodies = [
            json.dumps({"event": "PostSignIn", "userId": 42, "user": "not-an-object", "application": ["nope"], "data": 7}),
            json.dumps({"event": "Grant.LimitExceeded", "revokedGrantIds": "x", "user": None}),
            json.dumps({"event": "User.Created", "data": ["x"]}),
        ]
        for body in bodies:
            assert post(body, {SIG: sign(body)}).status_code == 200


class TestPayloadValidation:
    def test_rejects_invalid_json(self):
        body = "not json"
        assert post(body, {SIG: sign(body)}).status_code == 400

    def test_rejects_non_object_body(self):
        for body in ["[]", "null", '"x"', "5"]:
            assert post(body, {SIG: sign(body)}).status_code == 400

    def test_rejects_missing_or_non_string_event(self):
        for body in [json.dumps({"hookId": "h"}), json.dumps({"event": 5})]:
            assert post(body, {SIG: sign(body)}).status_code == 400
