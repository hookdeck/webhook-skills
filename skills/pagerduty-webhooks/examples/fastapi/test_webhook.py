# Generated with: pagerduty-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the PagerDuty V3 webhook receiver.

Signatures are generated with the same algorithm PagerDuty uses: HMAC-SHA256
over the RAW body, keyed with the subscription secret used as-is, lowercase hex
(Base16), prefixed `v1=`.
"""

import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# PagerDuty generates this secret when the subscription is created and returns
# it as delivery_method.secret. It is an opaque ASCII string used as-is as the
# HMAC key.
SECRET = "cdrEvpoWXCGq3zdGkgFBdFKzLjzWLxNfLbhKnTfBNLNmPnFR"
os.environ["PAGERDUTY_WEBHOOK_SECRET"] = SECRET

from main import (  # noqa: E402  (import after env is set)
    app,
    describe_agent,
    extract_v1_signatures,
    verify_pagerduty_signature,
)

client = TestClient(app)

# PagerDuty's own documented incident.priority_updated example payload.
PRIORITY_UPDATED = {
    "event": {
        "id": "5ac64822-4adc-4fda-ade0-410becf0de4f",
        "event_type": "incident.priority_updated",
        "resource_type": "incident",
        "occurred_at": "2020-10-02T18:45:22.169Z",
        "agent": {
            "html_url": "https://acme.pagerduty.com/users/PLH1HKV",
            "id": "PLH1HKV",
            "self": "https://api.pagerduty.com/users/PLH1HKV",
            "summary": "Tenex Engineer",
            "type": "user_reference",
        },
        "client": {"name": "PagerDuty"},
        "data": {
            "id": "PGR0VU2",
            "type": "incident",
            "self": "https://api.pagerduty.com/incidents/PGR0VU2",
            "html_url": "https://acme.pagerduty.com/incidents/PGR0VU2",
            "number": 2,
            "status": "triggered",
            "incident_key": "d3640fbd41094207a1c11e58e46b1662",
            "created_at": "2020-04-09T15:16:27Z",
            "reopened_at": "2020-10-02T18:45:22Z",
            "title": "A little bump in the road",
            "service": {
                "html_url": "https://acme.pagerduty.com/services/PF9KMXH",
                "id": "PF9KMXH",
                "self": "https://api.pagerduty.com/services/PF9KMXH",
                "summary": "API Service",
                "type": "service_reference",
            },
            "assignees": [
                {
                    "html_url": "https://acme.pagerduty.com/users/PTUXL6G",
                    "id": "PTUXL6G",
                    "self": "https://api.pagerduty.com/users/PTUXL6G",
                    "summary": "User 123",
                    "type": "user_reference",
                }
            ],
            "escalation_policy": {
                "html_url": "https://acme.pagerduty.com/escalation_policies/PUS0KTE",
                "id": "PUS0KTE",
                "self": "https://api.pagerduty.com/escalation_policies/PUS0KTE",
                "summary": "Default",
                "type": "escalation_policy_reference",
            },
            "teams": [
                {
                    "html_url": "https://acme.pagerduty.com/teams/PFCVPS0",
                    "id": "PFCVPS0",
                    "self": "https://api.pagerduty.com/teams/PFCVPS0",
                    "summary": "Engineering",
                    "type": "team_reference",
                }
            ],
            "priority": {
                "html_url": "https://acme.pagerduty.com/account/incident_priorities",
                "id": "PSO75BM",
                "self": "https://api.pagerduty.com/priorities/PSO75BM",
                "summary": "P1",
                "type": "priority_reference",
            },
            "urgency": "high",
            "conference_bridge": {
                "conference_number": "+1 1234123412,,987654321#",
                "conference_url": "https://example.com",
            },
            "resolve_reason": None,
        },
    }
}

# PagerDuty's own documented service.updated example -- agent AND client null.
SERVICE_UPDATED = {
    "event": {
        "id": "01BRB6ZP4M6T8ZG4X6BP63ZB9O",
        "event_type": "service.updated",
        "resource_type": "service",
        "occurred_at": "2021-03-02T13:35:11.682Z",
        "agent": None,
        "client": None,
        "data": {
            "html_url": "https://acme.pagerduty.com/services/PF9KMXH",
            "id": "PF9KMXH",
            "self": "https://api.pagerduty.com/services/PF9KMXH",
            "summary": "testing service updates",
            "alert_creation": "create_alerts_and_incidents",
            "teams": [
                {"id": "PFCVPS0", "summary": "Engineering", "type": "team_reference"}
            ],
            "type": "service",
        },
    }
}

INCIDENT_TRIGGERED = {
    "event": {
        "id": "0d6ad1e1-5f09-4fbb-9f4d-9b14bd7bb1b7",
        "event_type": "incident.triggered",
        "resource_type": "incident",
        "occurred_at": "2024-05-01T09:12:00.000Z",
        "agent": None,  # automation, not a person
        "client": None,
        "data": {
            "id": "PGR0VU2",
            "type": "incident",
            "number": 2,
            "status": "triggered",
            "title": "A little bump in the road",
            "html_url": "https://acme.pagerduty.com/incidents/PGR0VU2",
            "service": {
                "id": "PF9KMXH",
                "summary": "API Service",
                "type": "service_reference",
            },
            "priority": None,  # priority CAN be null when none is set
            "urgency": "high",
            "assignees": [],
            "resolve_reason": None,
        },
    }
}

ROLE_ASSIGNED = {
    "event": {
        "id": "ff8b3a2e-2a61-4a0b-bc5a-2fd1cf2d7f5c",
        "event_type": "incident.role.assigned",
        "resource_type": "incident",
        "occurred_at": "2024-05-01T09:20:00.000Z",
        "agent": {"id": "PLH1HKV", "summary": "Tenex Engineer", "type": "user_reference"},
        "client": None,
        "data": {
            "type": "incident_role_assignment",
            "incident_role_assignments": [
                {
                    "assignee": {
                        "id": "P75B6QD",
                        "summary": "User 1810194",
                        "type": "user_reference",
                    },
                    "id": "af64b84c-137e-40c6-875c-5dd30a2afaaa",
                    "incident": {
                        "id": "PBAZLIU",
                        "summary": None,
                        "type": "incident_reference",
                    },
                    "old_assignee": None,
                    "role": {
                        "id": "P8PQO4R",
                        "summary": "Role Display Name",
                        "type": "role_reference",
                    },
                    "status": "active",
                    "type": "role_assignment_reference",
                }
            ],
        },
    }
}

ANNOTATED = {
    "event": {
        "id": "bb0f1b0e-5e9e-4a7e-9d3a-6e4f0f5a1c3d",
        "event_type": "incident.annotated",
        "resource_type": "incident",
        "occurred_at": "2024-05-01T09:25:00.000Z",
        "agent": {"id": "PLH1HKV", "summary": "Tenex Engineer", "type": "user_reference"},
        "client": {"name": "PagerDuty"},
        "data": {
            "incident": {
                "id": "PGR0VU2",
                "summary": "A little bump in the road",
                "type": "incident_reference",
            },
            "id": "P2LA89X",
            "content": "I sure am glad we are using PagerDuty!",
            "trimmed": False,
            "type": "incident_note",
        },
    }
}

_SENTINEL = object()


def sign(raw_body, secret: str = SECRET) -> str:
    """Build an X-PagerDuty-Signature value exactly as PagerDuty does."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"v1={digest}"


def post(payload=None, signature=_SENTINEL, raw_body=None, webhook_id=None):
    """POST to the handler.

    ``signature`` unset signs the body correctly; ``None`` omits the header
    entirely; a string is sent verbatim.
    """
    body = raw_body if raw_body is not None else json.dumps(payload)
    if isinstance(body, str):
        body = body.encode("utf-8")

    headers = {"Content-Type": "application/json"}
    sig = sign(body) if signature is _SENTINEL else signature
    if sig is not None:
        # Send the header as raw latin-1 BYTES. HTTP headers are bytes on the
        # wire and Starlette decodes them as latin-1; httpx refuses to
        # ascii-encode a str value, so a non-ASCII signature would otherwise
        # blow up in the test client instead of reaching the handler.
        headers["X-PagerDuty-Signature"] = (
            sig.encode("latin-1") if isinstance(sig, str) else sig
        )
    if webhook_id:
        headers["X-Webhook-Id"] = webhook_id

    return client.post("/webhooks/pagerduty", content=body, headers=headers)


@pytest.fixture(autouse=True)
def restore_secret():
    """Keep the secret set for every test, whatever a test did to it."""
    yield
    os.environ["PAGERDUTY_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_a_valid_signature_and_returns_202(self):
        res = post(PRIORITY_UPDATED)
        # PagerDuty recommends 202 Accepted + async processing.
        assert res.status_code == 202
        assert res.json() == {"received": True}

    def test_rejects_a_tampered_body_with_the_original_signature(self):
        original = json.dumps(PRIORITY_UPDATED)
        signature = sign(original)
        tampered = json.dumps(
            {
                "event": {
                    **PRIORITY_UPDATED["event"],
                    "data": {
                        **PRIORITY_UPDATED["event"]["data"],
                        "title": "A catastrophic outage",
                    },
                }
            }
        )
        res = post(raw_body=tampered, signature=signature)
        assert res.status_code == 403
        assert res.json()["error"] == "Invalid signature"

    def test_rejects_a_signature_made_with_the_wrong_secret(self):
        body = json.dumps(PRIORITY_UPDATED)
        res = post(raw_body=body, signature=sign(body, "not-the-secret"))
        assert res.status_code == 403

    def test_returns_400_when_the_header_is_missing(self):
        # There is NO handshake or unsigned validation request -- every genuine
        # V3 delivery is signed, so an unsigned request is malformed.
        res = post(PRIORITY_UPDATED, signature=None)
        assert res.status_code == 400
        assert res.json()["error"] == "Missing or malformed X-PagerDuty-Signature header"

    def test_returns_400_not_403_for_a_header_with_no_v1_entry(self):
        # Mirrors the Go client's ErrMalformedHeader vs ErrNoValidSignatures.
        res = post(PRIORITY_UPDATED, signature="garbage")
        assert res.status_code == 400

    def test_returns_400_when_every_entry_is_a_non_v1_version(self):
        res = post(PRIORITY_UPDATED, signature="v2=abc,v3=def")
        assert res.status_code == 400

    def test_rejects_a_bare_digest_with_no_v1_prefix(self):
        body = json.dumps(PRIORITY_UPDATED)
        bare = hmac.new(
            SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        res = post(raw_body=body, signature=bare)
        assert res.status_code == 400  # no parseable v1= entry at all

    def test_rejects_a_base64_digest(self):
        import base64

        body = json.dumps(PRIORITY_UPDATED)
        b64 = base64.b64encode(
            hmac.new(
                SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256
            ).digest()
        ).decode()
        res = post(raw_body=body, signature=f"v1={b64}")
        assert res.status_code == 403

    def test_rejects_a_truncated_hex_digest(self):
        res = post(PRIORITY_UPDATED, signature="v1=deadbeef")
        assert res.status_code == 403

    def test_rejects_non_hex_characters_without_raising(self):
        res = post(PRIORITY_UPDATED, signature="v1=" + "z" * 64)
        assert res.status_code == 403

    def test_rejects_a_non_ascii_signature_without_raising(self):
        # compare_digest raises TypeError on str arguments containing non-ASCII,
        # and Starlette decodes headers as latin-1 -- so this would be a 500
        # instead of a 403 if the comparison were done on str.
        res = post(PRIORITY_UPDATED, signature="v1=" + "é" * 64)
        assert res.status_code == 403

    def test_accepts_uppercase_hex(self):
        # Hex decoding is case-insensitive in PagerDuty's Go client, so accept
        # either case for the DIGEST.
        body = json.dumps(PRIORITY_UPDATED)
        upper = "v1=" + sign(body)[3:].upper()
        res = post(raw_body=body, signature=upper)
        assert res.status_code == 202

    def test_rejects_an_uppercased_v1_prefix_as_malformed(self):
        body = json.dumps(PRIORITY_UPDATED)
        res = post(raw_body=body, signature=sign(body).upper())
        assert res.status_code == 400

    def test_verifies_raw_bytes_not_a_reserialized_body(self):
        # Semantically identical but formatted differently -- a handler that
        # re-serialized before hashing would compute another digest.
        pretty = json.dumps(PRIORITY_UPDATED, indent=2)
        res = post(raw_body=pretty, signature=sign(pretty))
        assert res.status_code == 202

    def test_verifies_a_utf8_body_with_unicode_characters(self):
        # PagerDuty: "PagerDuty webhook payloads support unicode characters...
        # ensure that you are using the proper UTF-8 character encoding."
        payload = {
            "event": {
                **PRIORITY_UPDATED["event"],
                "data": {
                    **PRIORITY_UPDATED["event"]["data"],
                    "title": "Dégradation du café ☕ — 緊急",
                },
            }
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        res = post(raw_body=body, signature=sign(body))
        assert res.status_code == 202

    def test_latin1_encoded_body_does_not_match_a_utf8_signature(self):
        # The gotcha PagerDuty warns about: the same characters, different
        # bytes. Signing the UTF-8 bytes and sending latin-1 bytes must fail.
        text = json.dumps(
            {
                "event": {
                    **PRIORITY_UPDATED["event"],
                    "data": {**PRIORITY_UPDATED["event"]["data"], "title": "café"},
                }
            },
            ensure_ascii=False,
        )
        utf8_signature = sign(text.encode("utf-8"))
        res = post(raw_body=text.encode("latin-1"), signature=utf8_signature)
        assert res.status_code == 403

    def test_returns_400_for_a_verified_unparseable_body(self):
        body = "not json at all"
        res = post(raw_body=body, signature=sign(body))
        assert res.status_code == 400
        assert res.json()["error"] == "Invalid JSON"

    def test_returns_400_for_valid_json_with_no_event_object(self):
        # The legacy V1/V2 extension shape.
        body = json.dumps({"messages": [{"event": "incident.trigger"}]})
        res = post(raw_body=body, signature=sign(body))
        assert res.status_code == 400
        assert res.json()["error"] == "Missing event object"


class TestMultiSignatureRotation:
    OLD_SECRET = "old-secret-being-rotated-out"

    def test_accepts_when_the_first_of_two_signatures_matches(self):
        body = json.dumps(PRIORITY_UPDATED)
        header = f"{sign(body)},{sign(body, self.OLD_SECRET)}"
        res = post(raw_body=body, signature=header)
        assert res.status_code == 202

    def test_accepts_when_the_second_of_two_signatures_matches(self):
        # This is the case a "compare the whole header" verifier gets wrong.
        body = json.dumps(PRIORITY_UPDATED)
        header = f"{sign(body, self.OLD_SECRET)},{sign(body)}"
        res = post(raw_body=body, signature=header)
        assert res.status_code == 202

    def test_rejects_when_neither_signature_matches(self):
        body = json.dumps(PRIORITY_UPDATED)
        header = f"{sign(body, self.OLD_SECRET)},{sign(body, 'another-wrong-secret')}"
        res = post(raw_body=body, signature=header)
        assert res.status_code == 403

    def test_accepts_without_a_space_after_the_comma(self):
        # This is what PagerDuty actually sends.
        body = json.dumps(PRIORITY_UPDATED)
        header = f"{sign(body, self.OLD_SECRET)},{sign(body)}"
        assert ", " not in header
        res = post(raw_body=body, signature=header)
        assert res.status_code == 202

    def test_tolerates_whitespace_around_the_comma(self):
        body = json.dumps(PRIORITY_UPDATED)
        header = f" {sign(body, self.OLD_SECRET)} , {sign(body)} "
        res = post(raw_body=body, signature=header)
        assert res.status_code == 202

    def test_ignores_an_unknown_future_version_alongside_a_valid_v1(self):
        # A future v2= must not break this receiver.
        body = json.dumps(PRIORITY_UPDATED)
        header = f"v2={'a' * 64},{sign(body)}"
        res = post(raw_body=body, signature=header)
        assert res.status_code == 202

    def test_handles_the_documented_two_signature_header(self):
        # The docs' own example value, verbatim (it will not match our secret).
        header = (
            "v1=f03de6f61df6e454f3620c4d6aca17ad072d3f8bbb2760eac3b2ad391b5e8073,"
            "v1=130dcacb53a94d983a37cf2acba98e805a1c37185309ba56fdcccbcf00d6dd8b"
        )
        assert len(extract_v1_signatures(header)) == 2
        res = post(PRIORITY_UPDATED, signature=header)
        assert res.status_code == 403  # parseable, just not ours


class TestFailClosed:
    def test_returns_500_when_the_secret_is_unset(self):
        del os.environ["PAGERDUTY_WEBHOOK_SECRET"]
        res = post(PRIORITY_UPDATED, signature="v1=" + "a" * 64)
        assert res.status_code == 500
        assert res.json()["error"] == "Webhook secret not configured"

    def test_verifier_returns_false_without_a_secret(self):
        body = json.dumps(PRIORITY_UPDATED).encode("utf-8")
        assert verify_pagerduty_signature(body, sign(body), None) is False
        assert verify_pagerduty_signature(body, sign(body), "") is False


class TestEventHandling:
    def test_handles_incident_triggered_with_null_agent_and_priority(self):
        res = post(INCIDENT_TRIGGERED)
        assert res.status_code == 202
        assert INCIDENT_TRIGGERED["event"]["agent"] is None
        assert INCIDENT_TRIGGERED["event"]["data"]["priority"] is None

    def test_handles_service_updated_with_null_agent_and_client(self):
        res = post(SERVICE_UPDATED)
        assert res.status_code == 202
        assert SERVICE_UPDATED["event"]["agent"] is None
        assert SERVICE_UPDATED["event"]["client"] is None

    def test_handles_role_assigned_array_wrapper(self):
        res = post(ROLE_ASSIGNED)
        assert res.status_code == 202
        assert isinstance(
            ROLE_ASSIGNED["event"]["data"]["incident_role_assignments"], list
        )

    def test_handles_incident_annotated(self):
        res = post(ANNOTATED)
        assert res.status_code == 202
        assert ANNOTATED["event"]["data"]["type"] == "incident_note"

    def test_acknowledges_an_unknown_event_type_with_202(self):
        # "Additional event types may be added to this list over time", plus
        # unannounced Early Access events.
        res = post(
            {
                "event": {
                    "id": "d2d1d0cf-1111-2222-3333-444455556666",
                    "event_type": "incident.something.brand_new",
                    "resource_type": "incident",
                    "occurred_at": "2026-01-01T00:00:00.000Z",
                    "agent": None,
                    "client": None,
                    "data": {"type": "incident", "id": "PGR0VU2"},
                }
            }
        )
        assert res.status_code == 202

    def test_dedup_key_comes_from_x_webhook_id(self):
        res = post(PRIORITY_UPDATED, webhook_id="01E2DXWJ4XQ8KQ4F0GZQ3W2P9Y")
        assert res.status_code == 202

    def test_v3_event_names_are_past_tense_unlike_v2(self):
        # V2 extensions sent `incident.trigger` (singular, no `d`) inside a
        # messages[] array. V3 sends `incident.triggered` in a single event.
        assert INCIDENT_TRIGGERED["event"]["event_type"] == "incident.triggered"
        assert INCIDENT_TRIGGERED["event"]["event_type"] != "incident.trigger"


class TestVerifyPagerDutySignatureUnit:
    body = json.dumps(PRIORITY_UPDATED).encode("utf-8")

    def test_returns_true_for_a_matching_signature(self):
        assert verify_pagerduty_signature(self.body, sign(self.body), SECRET) is True

    def test_returns_false_when_the_header_is_none(self):
        assert verify_pagerduty_signature(self.body, None, SECRET) is False

    def test_uses_the_secret_as_is(self):
        # A base64-decoded secret produces a different digest.
        import base64

        decoded_key = base64.b64decode(SECRET + "==", validate=False)
        decoded = (
            "v1="
            + hmac.new(decoded_key, b"{}", hashlib.sha256).hexdigest()
        )
        assert sign(b"{}") != decoded
        assert verify_pagerduty_signature(b"{}", decoded, SECRET) is False

    def test_produces_a_v1_prefixed_64_char_lowercase_hex_digest(self):
        import re

        assert re.fullmatch(r"v1=[0-9a-f]{64}", sign(b"{}"))

    def test_signs_the_raw_body_with_nothing_prepended(self):
        # A Stripe-style "{timestamp}.{body}" signed payload must NOT match.
        stripe_style = (
            "v1="
            + hmac.new(
                SECRET.encode("utf-8"), b"1600000000.{}", hashlib.sha256
            ).hexdigest()
        )
        assert verify_pagerduty_signature(b"{}", stripe_style, SECRET) is False


class TestExtractV1Signatures:
    def test_keeps_only_v1_entries(self):
        assert extract_v1_signatures(None) == []
        assert extract_v1_signatures("") == []
        assert extract_v1_signatures("garbage") == []
        assert extract_v1_signatures("v2=abc") == []
        assert extract_v1_signatures("v1=abc") == ["abc"]
        assert extract_v1_signatures("v1=abc,v1=def") == ["abc", "def"]
        assert extract_v1_signatures("v2=abc,v1=def") == ["def"]
        assert extract_v1_signatures(" v1=abc , v1=def ") == ["abc", "def"]


class TestDescribeAgent:
    def test_falls_back_to_automation_for_a_null_agent(self):
        assert describe_agent(SERVICE_UPDATED["event"]) == "automation"
        assert describe_agent({"agent": None}) == "automation"
        assert describe_agent({}) == "automation"

    def test_describes_a_user_agent(self):
        assert describe_agent(PRIORITY_UPDATED["event"]) == (
            "Tenex Engineer (user_reference)"
        )


class TestHealth:
    def test_health_returns_ok(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
