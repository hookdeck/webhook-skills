import base64
import hashlib
import hmac
import json
import os

import pytest

SECRET = "kfA18wgZKW30F7dL1JtlHq2judcJ0uoB"  # sample secret from Tokity's docs
# Set the environment before importing the app
os.environ["TOKITY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient

from main import app, verify_tokity_signature

client = TestClient(app)

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()).decode()


def to_bytes(body) -> bytes:
    if isinstance(body, bytes):
        return body
    return body.encode() if isinstance(body, str) else json.dumps(body).encode()


def post(body, headers=None):
    return client.post(
        "/webhooks/tokity",
        content=to_bytes(body),
        headers={"content-type": "application/json", **(headers or {})},
    )


def signed(body, extra=None):
    raw = to_bytes(body)
    return post(raw, {"x-dd-signature": f"sha256={sign(raw)}", **(extra or {})})


# Shapes follow Tokity's docs: chat webhooks send an array of chat sessions; ticket webhooks
# send the ticket plus `from` (its previous state, null on creation).
CHAT = [
    {
        "msp": "dd",
        "id": "1586985009-627B",
        "name": "Test",
        "type": "request",
        "status": "handled",
        "pastStatus": ["created", "handled"],
        "reference": {"type": "ticket", "id": "22282"},
        "creator": {"entityId": 106, "name": "Jason He", "userId": "dd~c~106"},
        "users": [],
        "lastModifiedDateTime": "2020-04-15T21:12:00.9897216Z",
    }
]
TICKET_CREATED = [{"id": 22282, "summary": "Printer is on fire", "status": "New", "from": None}]
TICKET_CHANGED = [
    {
        "id": 22282,
        "summary": "Printer is on fire",
        "status": "In Progress",
        "from": {"id": 22282, "summary": "Printer is on fire", "status": "New"},
    }
]
TICKET_FROM_EVENT = {"id": 22282, "summary": "Printer is on fire", "status": "New"}


class TestKnownVector:
    """Vector computed with openssl."""

    body = b'[{"id":"1586985009-627B","status":"handled"}]'
    expected = "oI30D2fE86nU2FUlgB5zxk3c7br+M2pfstL9KmGEd68="

    def test_matches_hmac_sha256_base64_of_raw_body(self):
        assert sign(self.body) == self.expected
        assert verify_tokity_signature(self.body, f"sha256={self.expected}", SECRET)

    def test_accepts_bare_digest(self):
        assert verify_tokity_signature(self.body, self.expected, SECRET)


class TestVerifyTokitySignature:
    body = b'{"id":1}'
    good = sign(b'{"id":1}')

    def test_rejects_missing_or_empty_header(self):
        for header in (None, "", "sha256="):
            assert not verify_tokity_signature(self.body, header, SECRET)

    def test_rejects_when_no_secret_configured(self, monkeypatch):
        assert not verify_tokity_signature(self.body, f"sha256={self.good}", "")
        monkeypatch.delenv("TOKITY_WEBHOOK_SECRET")
        assert not verify_tokity_signature(self.body, f"sha256={self.good}")

    def test_rejects_wrong_secret_and_tampered_body(self):
        assert not verify_tokity_signature(self.body, f"sha256={self.good}", "another-secret")
        assert not verify_tokity_signature(b'{"id":2}', f"sha256={self.good}", SECRET)

    def test_rejects_other_prefixes_and_hex_digests(self):
        assert not verify_tokity_signature(self.body, f"sha1={self.good}", SECRET)
        assert not verify_tokity_signature(self.body, f"SHA256={self.good}", SECRET)
        hexdigest = hmac.new(SECRET.encode(), self.body, hashlib.sha256).hexdigest()
        assert not verify_tokity_signature(self.body, f"sha256={hexdigest}", SECRET)

    def test_rejects_wrong_length_and_alphabet(self):
        assert not verify_tokity_signature(self.body, f"sha256={self.good[:-1]}", SECRET)
        assert not verify_tokity_signature(self.body, f"sha256={self.good}A", SECRET)
        # URL-safe base64 is not what Tokity sends. This known digest contains "+".
        known = TestKnownVector.body
        url_safe = TestKnownVector.expected.replace("+", "-")
        assert not verify_tokity_signature(known, f"sha256={url_safe}", SECRET)
        assert not verify_tokity_signature(self.body, f"sha256={self.good[:10]}!{self.good[11:]}", SECRET)
        # trailing newline: re.fullmatch (unlike "$") does not ignore it
        assert not verify_tokity_signature(self.body, f"sha256={self.good}\n", SECRET)
        # non-ASCII text that is not base64 must be rejected, never raise
        assert not verify_tokity_signature(self.body, "sha256=" + "é" * 44, SECRET)

    def test_rejects_non_canonical_last_character(self):
        variant = self.good[:42] + B64[B64.index(self.good[42]) ^ 1] + "="
        assert variant != self.good
        # A decoder would treat both as equal; the exact comparison does not.
        assert base64.b64decode(variant, validate=True) == base64.b64decode(self.good, validate=True)
        assert not verify_tokity_signature(self.body, f"sha256={variant}", SECRET)

    def test_verifies_exact_bytes(self):
        pretty = '[\n  { "id": 1, "name": "Zoë ☕" }\n]\n'.encode()
        assert verify_tokity_signature(pretty, f"sha256={sign(pretty)}", SECRET)
        compact = json.dumps(json.loads(pretty), ensure_ascii=False).encode()
        assert not verify_tokity_signature(compact, f"sha256={sign(pretty)}", SECRET)
        invalid_utf8 = bytes([0x5B, 0xFF, 0xFE, 0x5D])
        assert verify_tokity_signature(invalid_utf8, f"sha256={sign(invalid_utf8)}", SECRET)

    def test_secret_is_utf8_text_not_decoded(self):
        hex_looking = "deadbeefdeadbeefdeadbeefdeadbeef"
        good = base64.b64encode(hmac.new(hex_looking.encode(), self.body, hashlib.sha256).digest()).decode()
        assert verify_tokity_signature(self.body, f"sha256={good}", hex_looking)
        decoded = base64.b64encode(hmac.new(bytes.fromhex(hex_looking), self.body, hashlib.sha256).digest()).decode()
        assert not verify_tokity_signature(self.body, f"sha256={decoded}", hex_looking)


class TestSignatureCheck:
    def test_401_when_header_missing(self):
        assert post(CHAT).status_code == 401

    def test_401_for_empty_header(self):
        assert post(CHAT, {"x-dd-signature": ""}).status_code == 401

    def test_401_for_wrong_secret(self):
        raw = to_bytes(CHAT)
        assert post(raw, {"x-dd-signature": f"sha256={sign(raw, 'wrong-secret')}"}).status_code == 401

    def test_401_when_body_changed_after_signing(self):
        sig = sign(to_bytes(CHAT))
        assert post(TICKET_CREATED, {"x-dd-signature": f"sha256={sig}"}).status_code == 401

    def test_401_for_malformed_signature(self):
        assert post(CHAT, {"x-dd-signature": "sha256=not-base64"}).status_code == 401

    def test_401_when_no_secret_configured(self, monkeypatch):
        monkeypatch.delenv("TOKITY_WEBHOOK_SECRET")
        assert signed(CHAT).status_code == 401

    def test_accepts_any_content_type(self):
        assert signed(CHAT, {"content-type": "text/plain"}).status_code == 200

    def test_accepts_bare_digest(self):
        raw = to_bytes(CHAT)
        assert post(raw, {"x-dd-signature": sign(raw)}).status_code == 200


class TestPayloads:
    def test_chat_session_array(self, capsys):
        res = signed(CHAT)
        assert res.status_code == 200
        assert res.json() == {"received": True}
        out = capsys.readouterr().out
        assert "Chat session 1586985009-627B is handled (past: created, handled)" in out
        assert "about ticket 22282" in out

    def test_created_ticket(self, capsys):
        assert signed(TICKET_CREATED).status_code == 200
        assert "Ticket 22282 created" in capsys.readouterr().out

    def test_diffs_from_against_current_ticket(self, capsys):
        assert signed(TICKET_CHANGED).status_code == 200
        assert "Ticket 22282 changed: status" in capsys.readouterr().out

    def test_single_ticket_object_without_from(self, capsys):
        assert signed(TICKET_FROM_EVENT).status_code == 200
        assert "Ticket 22282 event" in capsys.readouterr().out

    def test_empty_array(self):
        assert signed([]).status_code == 200


class TestUntrustedBody:
    """Valid signature, hostile or malformed body."""

    def test_400_for_invalid_json(self):
        assert signed("{not json").status_code == 400

    def test_400_for_invalid_utf8_and_empty_body(self):
        assert signed(b"\xff\xfe").status_code == 400
        assert signed(b"").status_code == 400

    @pytest.mark.parametrize("body", ['"hello"', "42", "null", "true"])
    def test_400_for_non_object_body(self, body):
        assert signed(body).status_code == 400

    def test_400_when_array_item_is_not_object(self):
        assert signed([CHAT[0], "oops"]).status_code == 400
        assert signed([None]).status_code == 400
        assert signed([[1]]).status_code == 400

    def test_wrong_typed_fields_are_ignored(self):
        weird = [
            {"id": {"a": 1}, "status": 5, "pastStatus": "created", "reference": "ticket", "from": "before"},
            {"id": [1], "status": "handled", "pastStatus": [1, None, "created"], "reference": {"type": "ticket", "id": {"x": 1}}},
            {"id": None, "from": [1, 2]},
            {"id": True, "from": {"nested": {"a": 1}}, "nested": "string"},
        ]
        assert signed(weird).status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
