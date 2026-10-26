import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "testuser"
PASSWORD = "te:st+pass/ü"  # contains ':' and non-ASCII on purpose
os.environ["THREE_SIXTY_DIALOG_WEBHOOK_USERNAME"] = USERNAME
os.environ["THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD"] = PASSWORD

from fastapi.testclient import TestClient

from main import app, extract_events, parse_basic_auth, verify_360dialog_request

client = TestClient(app)


def basic(user: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


GOOD = basic(USERNAME, PASSWORD)

METADATA = {"display_phone_number": "15550783881", "phone_number_id": "106540352242922"}


def wrap(field, value):
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "102290129340398",
                "changes": [
                    {"value": {"messaging_product": "whatsapp", "metadata": METADATA, **value}, "field": field}
                ],
            }
        ],
    }


# Shapes from 360dialog's Webhook Reference
INBOUND = wrap(
    "messages",
    {
        "contacts": [{"profile": {"name": "Kerry"}, "wa_id": "16315551234"}],
        "messages": [
            {"from": "16315551234", "id": "wamid.ID", "timestamp": "1504902988", "text": {"body": "Hello"}, "type": "text"}
        ],
    },
)
STATUS = wrap(
    "messages",
    {"statuses": [{"id": "wamid.ID", "status": "delivered", "timestamp": "1504902988", "recipient_id": "16315551234"}]},
)
ECHOES = wrap(
    "smb_message_echoes",
    {
        "message_echoes": [
            {"from": "15550783881", "to": "16315551234", "id": "wamid.ECHO", "timestamp": "1504902988", "type": "text", "text": {"body": "Hi"}}
        ]
    },
)
STATE_SYNC = {
    "id": "DM3",
    "event": "smb_app_state_sync",
    "data": {"id": "WABA_ID", "messaging_product": "whatsapp", "metadata": METADATA, "state_sync": [{"type": "contact", "action": "add"}]},
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else INBOUND
    if not isinstance(content, str):
        content = json.dumps(content)
    return client.post(
        "/webhooks/360dialog",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthentication:
    def test_accepts_correct_basic_credentials(self):
        res = post(headers={"Authorization": GOOD})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme(self):
        assert post(headers={"Authorization": GOOD.replace("Basic", "basic")}).status_code == 200

    def test_parses_docs_example_header(self):
        # 'Basic dGVzdHVzZXI6dGVzdHBhc3M=' is testuser:testpass
        assert parse_basic_auth("Basic dGVzdHVzZXI6dGVzdHBhc3M=") == (b"testuser", b"testpass")

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_username(self):
        assert post(headers={"Authorization": basic("nope", PASSWORD)}).status_code == 401

    def test_rejects_wrong_password(self):
        assert post(headers={"Authorization": basic(USERNAME, "wrong")}).status_code == 401

    def test_rejects_malformed_headers(self):
        for value in [
            "Basic",
            "Basic !!!not-base64!!!",
            "Basic " + base64.b64encode(b"nocolon").decode(),
            "Bearer " + base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode(),
        ]:
            assert post(headers={"Authorization": value}).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        # compare_digest would raise TypeError on non-ASCII str; bytes must be used
        assert verify_360dialog_request(basic("tëst", "pässwörd"), "tëst", "pässwörd") is True
        assert verify_360dialog_request(basic("tëst", "pässwörd"), "tëst", "other") is False

    def test_authenticates_before_parsing_body(self):
        res = post("{not json", headers={"Authorization": basic(USERNAME, "wrong")})
        assert res.status_code == 401

    def test_returns_500_when_not_configured(self):
        saved = os.environ.pop("THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD")
        try:
            assert post(headers={"Authorization": GOOD}).status_code == 500
            assert verify_360dialog_request(GOOD, USERNAME, None) is False
        finally:
            os.environ["THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD"] = saved


class TestHandling:
    auth = {"Authorization": GOOD}

    def test_accepts_any_content_type(self):
        assert post(headers=self.auth, content_type="text/plain").status_code == 200
        assert post(headers=self.auth, content_type="application/vnd.api+json").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post("{not json", headers=self.auth).status_code == 400

    def test_non_object_returns_400(self):
        assert post("[1,2]", headers=self.auth).status_code == 400
        assert post('"text"', headers=self.auth).status_code == 400

    def test_dispatch(self):
        assert [e["kind"] for e in extract_events(INBOUND)] == ["message"]
        assert [e["kind"] for e in extract_events(STATUS)] == ["status"]
        assert extract_events(STATUS)[0]["status"]["status"] == "delivered"
        assert [e["kind"] for e in extract_events(ECHOES)] == ["smb_message_echoes"]
        assert [e["kind"] for e in extract_events(wrap("history", {"history": []}))] == ["history"]
        assert [e["kind"] for e in extract_events(STATE_SYNC)] == ["smb_app_state_sync"]
        assert extract_events({"hello": "world"}) == []

    def test_handles_every_documented_shape(self):
        for body in [INBOUND, STATUS, ECHOES, STATE_SYNC, {"hello": "world"}]:
            assert post(body, headers=self.auth).status_code == 200
