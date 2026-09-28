"""Tests for the AfterShip webhook handler.

Signatures are generated exactly the way AfterShip does:
base64(HMAC-SHA256(secret_as_utf8, raw_body)).
"""

import base64
import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# Set the secret BEFORE importing the app. AfterShip webhook secrets are opaque
# strings copied from the product's admin — used as UTF-8 bytes, never base64-decoded.
TEST_SECRET = "aftership_test_webhook_secret"
os.environ["AFTERSHIP_WEBHOOK_SECRET"] = TEST_SECRET

from main import (  # noqa: E402
    app,
    extract_signature,
    verify_aftership_signature,
)

client = TestClient(app, raise_server_exceptions=False)


def sign(raw_body: bytes, secret: str = TEST_SECRET) -> str:
    """Produce an AfterShip signature: base64(HMAC-SHA256(secret, raw_body))."""
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode()


def post(raw_body: bytes, headers: dict) -> "object":
    return client.post(
        "/webhooks/aftership",
        content=raw_body,
        headers={"Content-Type": "application/json", **headers},
    )


def body(payload: dict) -> bytes:
    return json.dumps(payload).encode()


# ---------------------------------------------------------------------------
# Doc-sourced payloads
# ---------------------------------------------------------------------------

# AfterShip Tracking webhook-specifications sample (version 2026-07), trimmed.
TRACKING_UPDATE = body(
    {
        "event": "tracking_update",
        "event_id": "94dadd60-ed26-46d0-aa52-3ced925a50ff",
        "is_tracking_first_tag": True,
        "msg": {
            "id": "00000000000000000000000000000000",
            "tracking_number": "0000000000000000",
            "slug": "usps",
            "tag": "InTransit",
            "subtag": "InTransit_001",
            "subtag_message": "In Transit",
            "title": "0000000000000000",
            "order_number": "string",
            "checkpoints": [
                {
                    "checkpoint_time": "2021-01-14T00:52:00",
                    "message": "Departed Shipping Partner Facility, USPS Awaiting Item",
                    "slug": "usps",
                    "tag": "InTransit",
                    "subtag": "InTransit_001",
                }
            ],
        },
        "ts": 1712741696,
    }
)


def tracking_body(tag: str) -> bytes:
    return body(
        {
            "event": "tracking_update",
            "event_id": "94dadd60-ed26-46d0-aa52-3ced925a50ff",
            "is_tracking_first_tag": False,
            "msg": {
                "id": "00000000000000000000000000000000",
                "tracking_number": "0000000000000000",
                "slug": "usps",
                "tag": tag,
                "subtag": f"{tag}_001",
                "subtag_message": tag,
                "order_number": "ORD-1001",
                "checkpoints": [],
            },
            "ts": 1712741696,
        }
    )


EDD_REVISE = body(
    {
        "event": "edd_revise",
        "event_id": "0a5f8c6f-0e4f-4ad9-9a0a-1b2c3d4e5f60",
        "is_tracking_first_tag": False,
        "msg": {
            "tracking_number": "0000000000000000",
            "slug": "usps",
            "tag": "InTransit",
            "aftership_estimated_delivery_date": {
                "estimated_delivery_date": "2026-10-02"
            },
        },
        "ts": 1712741700,
    }
)

TRACKING_PENDING_TIME = body(
    {
        "event": "tracking_pending_time",
        "event_id": "b1e1f9a2-3c44-4d55-8e66-7f8899aabbcc",
        "is_tracking_first_tag": False,
        "msg": {"tracking_number": "0000000000000000", "slug": "usps", "tag": "Pending"},
        "ts": 1712741800,
    }
)

# AfterShip Returns envelope: id, version, event, created_at, modified, data.
RETURN_APPROVED = body(
    {
        "id": "3df04d0cdf3c492fad33a15f753fb960",
        "version": "2026-07",
        "event": "return.approved",
        "created_at": "2026-09-28T07:34:56.000Z",
        # `modified` is event-specific; this shape is illustrative, not documented.
        "modified": {"approval_status": "approved"},
        "data": {
            "id": "ret_01HZX0000000000000000000",
            "rma_number": "RMA-1001",
            "approval_status": "approved",
        },
    }
)

# AfterShip Warranty: same header as Returns, own envelope (data.warranty + current_context).
# Shape follows the Warranty webhook reference example.
WARRANTY_CREATED = body(
    {
        "id": "c82422a62a69b4fb17c1c4a35bfcd734b",
        "event": "warranty.created",
        "version": "2024-01",
        "created_at": "2024-02-01T21:29:47.218678282Z",
        "data": {"warranty": {"id": "102a899f79c82422c99b1fdc417e01010"}},
        "current_context": {
            "id": "102a899f79c82422c99b1fdc417e01010",
            "rma_number": "AABBCCF1",
            "status": "under_review",
        },
    }
)

# AfterShip Shipping (Postmen): event_type, date_time, meta, data.
CREATE_A_LABEL = body(
    {
        "event_type": "create_a_label",
        "date_time": "2026-09-28T07:34:56.000Z",
        "meta": {"code": 200, "message": "OK", "details": []},
        "data": {
            "id": "lbl_01HZX0000000000000000000",
            "status": "created",
            "files": {
                "label": {
                    "url": "https://sandbox-api.postmen.com/download/labels/label.pdf"
                }
            },
        },
    }
)


@pytest.fixture(autouse=True)
def restore_secret():
    os.environ["AFTERSHIP_WEBHOOK_SECRET"] = TEST_SECRET
    yield
    os.environ["AFTERSHIP_WEBHOOK_SECRET"] = TEST_SECRET


@pytest.fixture(autouse=True)
def capture_logs(caplog):
    caplog.set_level(logging.INFO, logger="main")
    return caplog


class TestHealth:
    def test_health_endpoint(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestVerifyAfterShipSignature:
    def test_accepts_tracking_header(self):
        headers = {"aftership-hmac-sha256": sign(TRACKING_UPDATE)}
        result = verify_aftership_signature(TRACKING_UPDATE, headers, TEST_SECRET)
        assert result["valid"] is True
        assert result["product"] == "tracking"

    def test_accepts_returns_warranty_header(self):
        headers = {"as-signature-hmac-sha256": sign(RETURN_APPROVED)}
        result = verify_aftership_signature(RETURN_APPROVED, headers, TEST_SECRET)
        assert result["valid"] is True
        assert result["product"] == "returns/warranty"

    def test_accepts_shipping_header_with_prefix(self):
        headers = {"am-webhook-signature": f"hmac-sha256={sign(CREATE_A_LABEL)}"}
        result = verify_aftership_signature(CREATE_A_LABEL, headers, TEST_SECRET)
        assert result["valid"] is True
        assert result["product"] == "shipping"

    def test_accepts_bare_digest_in_am_webhook_signature(self):
        headers = {"am-webhook-signature": sign(CREATE_A_LABEL)}
        assert verify_aftership_signature(CREATE_A_LABEL, headers, TEST_SECRET)["valid"]

    def test_digest_is_standard_base64_not_hex(self):
        digest = sign(TRACKING_UPDATE)
        assert len(digest) == 44
        base64.b64decode(digest)  # raises if it is not valid base64

    def test_rejects_wrong_secret(self):
        headers = {"aftership-hmac-sha256": sign(TRACKING_UPDATE, "a_different_secret")}
        result = verify_aftership_signature(TRACKING_UPDATE, headers, TEST_SECRET)
        assert result["valid"] is False
        assert result["reason"] == "signature_mismatch"

    def test_rejects_missing_header(self):
        result = verify_aftership_signature(
            TRACKING_UPDATE, {"content-type": "application/json"}, TEST_SECRET
        )
        assert result["valid"] is False
        assert result["reason"] == "missing_signature_header"

    def test_fails_closed_without_secret(self):
        headers = {"aftership-hmac-sha256": sign(TRACKING_UPDATE)}
        result = verify_aftership_signature(TRACKING_UPDATE, headers, None)
        assert result["valid"] is False
        assert result["reason"] == "missing_secret"

    def test_does_not_raise_on_length_mismatch(self):
        headers = {"aftership-hmac-sha256": "short"}
        result = verify_aftership_signature(TRACKING_UPDATE, headers, TEST_SECRET)
        assert result["valid"] is False

    def test_prefers_tracking_header_when_several_present(self):
        found = extract_signature(
            {
                "aftership-hmac-sha256": "tracking-sig",
                "as-signature-hmac-sha256": "returns-sig",
                "am-webhook-signature": "hmac-sha256=shipping-sig",
            }
        )
        assert found == {
            "header": "aftership-hmac-sha256",
            "product": "tracking",
            "signature": "tracking-sig",
        }


class TestSignatureHandling:
    def test_valid_tracking_signature(self):
        response = post(TRACKING_UPDATE, {"aftership-hmac-sha256": sign(TRACKING_UPDATE)})
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_documented_mixed_case_header(self):
        # HTTP header names are case-insensitive; the docs render it Aftership-Hmac-Sha256.
        response = post(TRACKING_UPDATE, {"Aftership-Hmac-Sha256": sign(TRACKING_UPDATE)})
        assert response.status_code == 200

    def test_valid_returns_signature(self):
        response = post(
            RETURN_APPROVED, {"as-signature-hmac-sha256": sign(RETURN_APPROVED)}
        )
        assert response.status_code == 200

    def test_valid_shipping_signature_with_prefix(self):
        response = post(
            CREATE_A_LABEL,
            {"am-webhook-signature": f"hmac-sha256={sign(CREATE_A_LABEL)}"},
        )
        assert response.status_code == 200

    def test_legacy_returns_delivery(self):
        # Organizations created before Oct 25, 2022 get the Shipping-style header.
        response = post(
            RETURN_APPROVED,
            {"am-webhook-signature": f"hmac-sha256={sign(RETURN_APPROVED)}"},
        )
        assert response.status_code == 200

    def test_wrong_secret_returns_401(self):
        response = post(
            TRACKING_UPDATE,
            {"aftership-hmac-sha256": sign(TRACKING_UPDATE, "wrong_secret")},
        )
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        signature = sign(TRACKING_UPDATE)
        tampered = TRACKING_UPDATE.replace(b'"InTransit"', b'"Delivered"')
        assert tampered != TRACKING_UPDATE
        response = post(tampered, {"aftership-hmac-sha256": signature})
        assert response.status_code == 401

    def test_missing_signature_header_returns_401(self):
        response = post(TRACKING_UPDATE, {})
        assert response.status_code == 401

    def test_missing_secret_returns_500(self):
        del os.environ["AFTERSHIP_WEBHOOK_SECRET"]
        response = post(TRACKING_UPDATE, {"aftership-hmac-sha256": sign(TRACKING_UPDATE)})
        assert response.status_code == 500

    def test_signed_non_json_returns_400(self):
        raw = b"not json at all"
        response = post(raw, {"aftership-hmac-sha256": sign(raw)})
        assert response.status_code == 400


class TestTrackingEvents:
    def test_tracking_update_routes_on_tag(self, capture_logs):
        response = post(TRACKING_UPDATE, {"aftership-hmac-sha256": sign(TRACKING_UPDATE)})
        assert response.status_code == 200
        assert "tracking_update" in capture_logs.text
        assert "94dadd60-ed26-46d0-aa52-3ced925a50ff" in capture_logs.text
        assert "In transit" in capture_logs.text

    @pytest.mark.parametrize(
        "tag,expected",
        [
            ("Pending", "Pending"),
            ("InfoReceived", "Info received"),
            ("InTransit", "In transit"),
            ("OutForDelivery", "Out for delivery"),
            ("AttemptFail", "Delivery attempt failed"),
            ("Delivered", "Delivered"),
            ("AvailableForPickup", "Available for pickup"),
            ("Exception", "Exception on"),
            ("Expired", "Expired"),
        ],
    )
    def test_each_tag(self, tag, expected, capture_logs):
        raw = tracking_body(tag)
        response = post(raw, {"aftership-hmac-sha256": sign(raw)})
        assert response.status_code == 200
        assert expected in capture_logs.text

    def test_edd_revise(self, capture_logs):
        response = post(EDD_REVISE, {"aftership-hmac-sha256": sign(EDD_REVISE)})
        assert response.status_code == 200
        assert "EDD revised" in capture_logs.text

    def test_tracking_pending_time(self, capture_logs):
        response = post(
            TRACKING_PENDING_TIME, {"aftership-hmac-sha256": sign(TRACKING_PENDING_TIME)}
        )
        assert response.status_code == 200
        assert "pending past the configured threshold" in capture_logs.text

    def test_unknown_tracking_event_acknowledged(self, capture_logs):
        raw = body({"event": "some_future_event", "event_id": "x", "msg": {}, "ts": 1})
        response = post(raw, {"aftership-hmac-sha256": sign(raw)})
        assert response.status_code == 200
        assert "Unhandled Tracking event" in capture_logs.text

    def test_unknown_tag_acknowledged(self, capture_logs):
        raw = tracking_body("SomeFutureTag")
        response = post(raw, {"aftership-hmac-sha256": sign(raw)})
        assert response.status_code == 200
        assert "Unhandled tracking tag" in capture_logs.text

    def test_logs_webhook_version_header(self, capture_logs):
        response = post(
            TRACKING_UPDATE,
            {
                "aftership-hmac-sha256": sign(TRACKING_UPDATE),
                "as-webhook-version": "2026-07",
            },
        )
        assert response.status_code == 200
        assert "version 2026-07" in capture_logs.text


class TestReturnsAndWarrantyEvents:
    def test_return_approved(self, capture_logs):
        response = post(
            RETURN_APPROVED, {"as-signature-hmac-sha256": sign(RETURN_APPROVED)}
        )
        assert response.status_code == 200
        assert "return.approved" in capture_logs.text
        assert "RMA-1001" in capture_logs.text

    def test_warranty_created(self, capture_logs):
        response = post(
            WARRANTY_CREATED, {"as-signature-hmac-sha256": sign(WARRANTY_CREATED)}
        )
        assert response.status_code == 200
        assert "warranty.created" in capture_logs.text

    def test_unknown_returns_event_acknowledged(self, capture_logs):
        # AfterShip's docs say to treat enum values as open strings.
        raw = body({"id": "x", "event": "return.something.new", "data": {}})
        response = post(raw, {"as-signature-hmac-sha256": sign(raw)})
        assert response.status_code == 200
        assert "Unhandled Returns event" in capture_logs.text


class TestShippingEvents:
    def test_create_a_label(self, capture_logs):
        response = post(
            CREATE_A_LABEL,
            {"am-webhook-signature": f"hmac-sha256={sign(CREATE_A_LABEL)}"},
        )
        assert response.status_code == 200
        assert "create_a_label" in capture_logs.text
        assert "label.pdf" in capture_logs.text

    def test_failed_operation_from_meta_code(self, capture_logs):
        raw = body(
            {
                "event_type": "create_a_label",
                "date_time": "2026-09-28T07:34:56.000Z",
                "meta": {"code": 4153, "message": "Invalid shipper account", "details": []},
                "data": {},
            }
        )
        response = post(raw, {"am-webhook-signature": f"hmac-sha256={sign(raw)}"})
        assert response.status_code == 200
        assert "Invalid shipper account" in capture_logs.text

    @pytest.mark.parametrize(
        "event_type", ["calculate_rates", "cancel_a_label", "manifest_a_label"]
    )
    def test_other_shipping_events(self, event_type, capture_logs):
        raw = body(
            {
                "event_type": event_type,
                "date_time": "2026-09-28T07:34:56.000Z",
                "meta": {"code": 200, "message": "OK", "details": []},
                "data": {"id": "obj_1", "status": "done", "rates": []},
            }
        )
        response = post(raw, {"am-webhook-signature": f"hmac-sha256={sign(raw)}"})
        assert response.status_code == 200
        assert event_type in capture_logs.text
