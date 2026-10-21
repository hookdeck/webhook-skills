import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

# CallRail signing keys are random 32-char hex strings, but used as plain strings
SIGNING_KEY = "072e77e426f92738a72fe23c4d1953b4"  # key from the CallRail docs test vector
os.environ["CALLRAIL_SIGNING_KEY"] = SIGNING_KEY

from main import (  # noqa: E402
    app,
    classify_callrail_event,
    is_timestamp_fresh,
    verify_callrail_signature,
)

client = TestClient(app)

# Request body from the CallRail docs (compact, no trailing newline)
DOCS_BODY = "{\"answered\":false,\"business_phone_number\":\"\",\"call_type\":\"voicemail\",\"company_id\":155920786,\"company_name\":\"Boost Marketing\",\"company_time_zone\":\"America/Los_Angeles\",\"created_at\":\"2018-02-19T13:41:00.252-05:00\",\"customer_city\":\"Rochester\",\"customer_country\":\"US\",\"customer_name\":\"Kaylah Mills\",\"customer_phone_number\":\"+12148654559\",\"customer_state\":\"PA\",\"device_type\":\"\",\"direction\":\"inbound\",\"duration\":\"13\",\"first_call\":false,\"formatted_call_type\":\"Voicemail\",\"formatted_customer_location\":\"Rochester, PA\",\"formatted_business_phone_number\":\"\",\"formatted_customer_name\":\"Kaylah Mills\",\"prior_calls\":16,\"formatted_customer_name_or_phone_number\":\"Kaylah Mills\",\"formatted_customer_phone_number\":\"214-865-4559\",\"formatted_duration\":\"13s\",\"formatted_tracking_phone_number\":\"404-555-8514\",\"formatted_tracking_source\":\"Google Paid\",\"formatted_value\":\"--\",\"good_lead_call_id\":715587840,\"good_lead_call_time\":\"2016-06-17T10:23:33.363-04:00\",\"id\":766970532,\"lead_status\":\"previously_marked_good_lead\",\"note\":\"\",\"recording\":\"https://app.callrail.com/calls/766970532/recording/redirect?access_key=aaaaccccddddeeee\",\"recording_duration\":8,\"source_name\":\"Google AdWords\",\"start_time\":\"2018-02-19T13:41:00.236-05:00\",\"tags\":[],\"total_calls\":17,\"tracking_phone_number\":\"+14045558514\",\"transcription\":\"\",\"value\":\"\",\"voicemail\":true,\"tracker_id\":354024023,\"keywords\":\"\",\"medium\":\"\",\"referring_url\":\"\",\"landing_page_url\":\"\",\"last_requested_url\":\"\",\"referrer_domain\":\"\",\"conversational_transcript\":\"\",\"utm_source\":\"google\",\"utm_medium\":\"cpc\",\"utm_term\":\"\",\"utm_content\":\"\",\"utm_campaign\":\"Google AdWords\",\"utma\":\"\",\"utmb\":\"\",\"utmc\":\"\",\"utmv\":\"\",\"utmz\":\"\",\"ga\":\"\",\"gclid\":\"\",\"integration_data\":[{\"integration\":\"Webhooks\",\"data\":null}],\"keywords_spotted\":\"\",\"recording_player\":\"https://app.callrail.com/calls/766970532/recording?access_key=aaaabbbbccccdddd\",\"speaker_percent\":\"\",\"call_highlights\":[],\"callercity\":\"Rochester\",\"callercountry\":\"US\",\"callername\":\"Kaylah Mills\",\"callernum\":\"+12148654559\",\"callerstate\":\"PA\",\"callsource\":\"google_paid\",\"campaign\":\"\",\"custom\":\"\",\"datetime\":\"2018-02-19 18:41:00\",\"destinationnum\":\"\",\"ip\":\"\",\"kissmetrics_id\":\"\",\"landingpage\":\"\",\"referrer\":\"\",\"referrermedium\":\"\",\"score\":1,\"tag\":\"\",\"trackingnum\":\"+14045558514\",\"timestamp\":\"2018-02-19T13:41:00.236-05:00\"}"
DOCS_SIGNATURE = "UZAHbUdfm3GqL7qzilGozGzWV64="

TEXT_RECEIVED = {
    "id": 879204976,
    "resource_id": "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
    "source_number": "770-555-5555",
    "destination_number": "770-123-4567",
    "content": "CallRail is the best! ",
    "message_type": "sms",
    "media_urls": [],
    "timestamp": "2017-10-23T15:57:18.826-04:00",
    "lead_status": None,
    "conversation_id": "crpLH",
    "company_resource_id": "COM834847e9f4bb4f9h8ll29eb173fe658e",
    "person_resource_id": "PERb122rc301ec45f5yy021d4jj180c1a79",
}


def sign(body: str, key: str = SIGNING_KEY) -> str:
    """Sign like CallRail: base64(HMAC-SHA1(signingKey, rawBody))."""
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("ascii")


def post(body: str, signature=None, query: str = ""):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["Signature"] = signature
    return client.post(f"/webhooks/callrail{query}", content=body, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CALLRAIL_SIGNING_KEY", SIGNING_KEY)
    monkeypatch.delenv("CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


class TestVerifyCallRailSignature:
    def test_reproduces_docs_test_vector(self):
        assert sign(DOCS_BODY) == DOCS_SIGNATURE
        assert verify_callrail_signature(DOCS_BODY.encode(), DOCS_SIGNATURE, SIGNING_KEY)

    def test_rejects_wrong_key_tampered_body_and_missing_inputs(self):
        assert not verify_callrail_signature(DOCS_BODY.encode(), DOCS_SIGNATURE, "wrong-key")
        assert not verify_callrail_signature((DOCS_BODY + " ").encode(), DOCS_SIGNATURE, SIGNING_KEY)
        assert not verify_callrail_signature(DOCS_BODY.encode(), None, SIGNING_KEY)
        assert not verify_callrail_signature(DOCS_BODY.encode(), DOCS_SIGNATURE, None)

    def test_length_mismatch_returns_false(self):
        assert not verify_callrail_signature(DOCS_BODY.encode(), "short", SIGNING_KEY)


class TestTimestampFresh:
    now = datetime.fromisoformat("2018-02-19T13:50:00.000-05:00")

    def test_disabled_when_tolerance_is_zero(self):
        assert is_timestamp_fresh({"timestamp": "2001-01-01T00:00:00Z"}, 0, self.now)

    def test_accepts_recent_and_rejects_old(self):
        payload = {"timestamp": "2018-02-19T13:41:00.236-05:00"}
        assert is_timestamp_fresh(payload, 3600, self.now)
        assert not is_timestamp_fresh(payload, 60, self.now)

    def test_uses_submitted_at_and_rejects_missing(self):
        assert is_timestamp_fresh({"submitted_at": "2018-02-19T13:41:00.000-05:00"}, 3600, self.now)
        assert not is_timestamp_fresh({}, 3600, self.now)


class TestClassifyEvent:
    def test_honors_known_hint(self):
        assert classify_callrail_event({"call_type": "x"}, "post_call") == "post_call"

    def test_infers_from_payload_shape(self):
        assert classify_callrail_event(TEXT_RECEIVED) == "sms_received"
        assert classify_callrail_event({**TEXT_RECEIVED, "agent": "Keith Rail"}) == "sms_sent"
        assert classify_callrail_event({"form_data": {"a": "b"}}) == "form_captured"
        assert classify_callrail_event({"call_type": "voicemail", "changes": ["note"]}) == "updated_call"
        assert (
            classify_callrail_event({"call_type": "x", "direction": "outbound", "changes": ["tags"]})
            == "updated_outbound_call"
        )
        assert classify_callrail_event({"call_type": "x", "direction": "outbound"}) == "post_outbound_call"
        assert classify_callrail_event(json.loads(DOCS_BODY)) == "call"
        assert (
            classify_callrail_event(
                {"answers": [1], "last_interaction_resource_id": "CAL1", "person_resource_id": "PER1"}
            )
            == "convert_assist_complete"
        )


class TestWebhookEndpoint:
    def test_accepts_docs_test_vector(self):
        res = post(DOCS_BODY, DOCS_SIGNATURE, "?callrail_event=post_call")
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "post_call"}

    def test_accepts_text_message_without_hint(self):
        body = json.dumps(TEXT_RECEIVED)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json()["event"] == "sms_received"

    def test_rejects_missing_signature(self):
        assert post(DOCS_BODY).status_code == 400

    def test_rejects_invalid_signature(self):
        assert post(DOCS_BODY, sign(DOCS_BODY, "another-key")).status_code == 400

    def test_rejects_signed_malformed_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_enforces_optional_timestamp_tolerance(self, monkeypatch):
        monkeypatch.setenv("CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS", "600")
        # The docs vector is from 2018, so it is outside a 10 minute window
        assert post(DOCS_BODY, DOCS_SIGNATURE).status_code == 400

        fresh = json.dumps({**TEXT_RECEIVED, "timestamp": datetime.now(timezone.utc).isoformat()})
        assert post(fresh, sign(fresh)).status_code == 200

    def test_returns_500_without_signing_key(self, monkeypatch):
        monkeypatch.delenv("CALLRAIL_SIGNING_KEY")
        assert post(DOCS_BODY, DOCS_SIGNATURE).status_code == 500
