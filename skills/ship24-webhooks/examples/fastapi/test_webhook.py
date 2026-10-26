import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["SHIP24_WEBHOOK_SECRET"] = "test_ship24_webhook_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, processed_message_ids, verify_ship24_request

client = TestClient(app)

SECRET = os.environ["SHIP24_WEBHOOK_SECRET"]
BEARER = f"Bearer {SECRET}"

_counter = itertools.count(1)


def tracking_item(topic="tracking/events", message_id=None):
    base = {
        "metadata": {
            "generatedAt": "2025-03-04T17:13:35.000Z",
            "messageId": message_id or f"msg-{next(_counter)}",
            "topic": topic,
        },
        "tracker": {
            "trackerId": "26148317-7502-d3ac-44a9-546d240ac0dd",
            "trackingNumber": "9400115901047177598206",
            "isSubscribed": True,
        },
    }
    if topic == "tracking/pod":
        return {**base, "data": {"status": "found", "courier": "ups-tracking",
                                 "content": {"type": "text/plain", "text": "J. Doe"}}}
    return {
        **base,
        "shipment": {"shipmentId": "f4f888d7-d140-423f-9a48-e0689d27e098"},
        "events": [{"eventId": "ee8ebe96", "status": "Delivered to the addressee",
                    "occurrenceDatetime": "2025-03-04T17:12:57"}],
        "statistics": {},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps({"trackings": [tracking_item()]})
    return client.post(
        "/webhooks/ship24",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


@pytest.fixture(autouse=True)
def reset_state():
    processed_message_ids.clear()


class TestBearerVerification:
    def test_accepts_correct_secret(self):
        res = post({"Authorization": BEARER})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("scheme", ["bearer", "BEARER", "bEaReR"])
    def test_accepts_scheme_in_any_case(self, scheme):
        assert post({"Authorization": f"{scheme} {SECRET}"}).status_code == 200

    def test_rejects_wrong_secret_of_same_length(self):
        assert post({"Authorization": "Bearer " + "x" * len(SECRET)}).status_code == 401

    def test_rejects_secret_of_different_length(self):
        assert post({"Authorization": "Bearer short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    @pytest.mark.parametrize("value", [f"Basic {SECRET}", f"Token {SECRET}", SECRET])
    def test_rejects_wrong_scheme(self, value):
        assert post({"Authorization": value}).status_code == 401

    def test_rejects_empty_secret_after_scheme(self):
        assert post({"Authorization": "Bearer "}).status_code == 401

    def test_authenticates_before_parsing_body(self):
        assert post(body="not json").status_code == 401

    def test_does_not_trim_the_secret(self):
        assert verify_ship24_request({"authorization": f"Bearer {SECRET} "}, SECRET) is False
        assert verify_ship24_request({"authorization": f"Bearer {SECRET}"}, f"{SECRET} ") is False
        assert verify_ship24_request({"authorization": "Bearer  s3cret"}, " s3cret") is True

    def test_fails_closed_when_unconfigured(self):
        assert verify_ship24_request({"authorization": BEARER}, "") is False
        assert verify_ship24_request({"authorization": "Bearer "}, "Bearer ") is False

    def test_strips_bearer_prefix_from_configured_value(self):
        assert verify_ship24_request({"authorization": BEARER}, f"Bearer {SECRET}") is True
        assert verify_ship24_request({"authorization": BEARER}, f"bearer {SECRET}") is True

    def test_non_ascii_secret_compares_bytes_without_raising(self):
        wire = "sécret".encode("utf-8").decode("latin-1")  # how a server decodes the raw header
        assert verify_ship24_request({"authorization": f"Bearer {wire}"}, "sécret") is True
        assert verify_ship24_request({"authorization": "Bearer secret"}, "sécret") is False
        assert verify_ship24_request({"authorization": "Bearer €"}, "secret") is False


class TestRawBody:
    @pytest.mark.parametrize("content_type", ["application/json", "text/plain", "application/octet-stream"])
    def test_accepts_any_content_type(self, content_type):
        body = json.dumps({"trackings": [tracking_item()]})
        assert post({"Authorization": BEARER}, body, content_type).status_code == 200

    def test_rejects_invalid_json(self):
        assert post({"Authorization": BEARER}, "{nope").status_code == 400

    @pytest.mark.parametrize("body", ["{}", "[]", '{"trackings":{}}', '{"trackings":[{}]}', "null"])
    def test_rejects_body_without_trackings(self, body):
        assert post({"Authorization": BEARER}, body).status_code == 400


class TestTopics:
    def test_handles_tracking_events(self, capsys):
        body = json.dumps({"trackings": [tracking_item("tracking/events")]})
        assert post({"Authorization": BEARER}, body).status_code == 200
        assert "Tracking update for 9400115901047177598206: Delivered to the addressee" in capsys.readouterr().out

    def test_handles_tracking_pod(self, capsys):
        body = json.dumps({"trackings": [tracking_item("tracking/pod")]})
        assert post({"Authorization": BEARER}, body).status_code == 200
        assert "Proof of delivery for 9400115901047177598206: found" in capsys.readouterr().out

    def test_acknowledges_unknown_topics(self, capsys):
        body = json.dumps({"trackings": [tracking_item("tracking/other")]})
        assert post({"Authorization": BEARER}, body).status_code == 200
        assert "Unhandled topic: tracking/other" in capsys.readouterr().out

    def test_loops_over_grouped_trackings(self, capsys):
        body = json.dumps({"trackings": [tracking_item(), tracking_item()]})
        assert post({"Authorization": BEARER}, body).status_code == 200
        assert capsys.readouterr().out.count("Tracking update") == 2


class TestDeduplication:
    def test_skips_message_id_already_handled(self, capsys):
        body = json.dumps({"trackings": [tracking_item("tracking/events", "dup-1")]})
        assert post({"Authorization": BEARER}, body).status_code == 200
        assert post({"Authorization": BEARER}, body).status_code == 200
        out = capsys.readouterr().out
        assert out.count("Tracking update") == 1
        assert "Duplicate message dup-1, skipping" in out
