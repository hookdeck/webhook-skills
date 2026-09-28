# Generated with: grafana-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Grafana Alerting webhook receiver.

Signatures here are generated with the same algorithm Grafana uses
(grafana/alerting http/hmac.go), so these are real vectors, not mocks.
"""

import hashlib
import hmac
import json
import time
from typing import Optional

import pytest
from fastapi.testclient import TestClient

import main
from main import app, get_config, idempotency_key, verify_grafana_signature

# The contact point's HMAC secret is used AS-IS as UTF-8 bytes: no base64
# decode, no prefix. It is not a Grafana API key or service-account token.
SECRET = "grafana_test_hmac_secret"

# Default signature header name (constant `defaultHeaderName` in grafana/alerting
# http/hmac.go, and the UI placeholder). Overridable per contact point.
DEFAULT_SIG_HEADER = "X-Grafana-Alerting-Signature"

# The timestamp header has NO default name. This is just the name used in
# Grafana's provisioning docs example.
TS_HEADER = "X-Grafana-Alerting-Signature-Timestamp"

client = TestClient(app)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    """Body-only mode by default: no timestamp header configured."""
    monkeypatch.setenv("GRAFANA_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("GRAFANA_SIGNATURE_HEADER", raising=False)
    monkeypatch.delenv("GRAFANA_TIMESTAMP_HEADER", raising=False)
    monkeypatch.delenv("GRAFANA_MAX_AGE_SECONDS", raising=False)
    return monkeypatch


# --- Fixture: the docs' "Default JSON payload" shape ------------------------

NOTIFICATION = {
    "receiver": "My Super Webhook",
    "status": "firing",
    "orgId": 1,
    "alerts": [
        {
            "status": "firing",
            "labels": {"alertname": "High memory usage", "team": "blue", "zone": "us-1"},
            "annotations": {
                "description": "The system has high memory usage",
                "runbook_url": "https://myrunbook.com/runbook/1234",
                "summary": "This alert was triggered for zone us-1",
            },
            "startsAt": "2021-10-12T09:51:03.157076+02:00",
            # "0001-01-01T00:00:00Z" is Go's zero time -- the alert is still firing.
            "endsAt": "0001-01-01T00:00:00Z",
            "generatorURL": "https://play.grafana.org/alerting/1afz29v7z/edit",
            "fingerprint": "c6eadffa33fcdf37",
            "silenceURL": "https://play.grafana.org/alerting/silence/new?alertmanager=grafana",
            "dashboardURL": "",
            "panelURL": "",
            "values": {"B": 44.23943737541908, "C": 1},
        },
        {
            "status": "firing",
            "labels": {"alertname": "High CPU usage", "team": "blue", "zone": "eu-1"},
            "annotations": {
                "description": "The system has high CPU usage",
                "summary": "This alert was triggered for zone eu-1",
            },
            "startsAt": "2021-10-12T09:56:03.157076+02:00",
            "endsAt": "0001-01-01T00:00:00Z",
            "generatorURL": "https://play.grafana.org/alerting/d1rdpdv7k/edit",
            "fingerprint": "bc97ff14869b13e3",
            "silenceURL": "https://play.grafana.org/alerting/silence/new?alertmanager=grafana",
            "dashboardURL": "",
            "panelURL": "",
            "values": {"B": 44.23943737541908, "C": 1},
        },
    ],
    "groupLabels": {},
    "commonLabels": {"team": "blue"},
    "commonAnnotations": {},
    "externalURL": "https://play.grafana.org/",
    "version": "1",
    "groupKey": "{}:{}",
    "truncatedAlerts": 0,
    "title": "[FIRING:2]  (blue)",
    "state": "alerting",
    "message": "**Firing**\n\nValue: B=44.23943737541908, C=1",
}

# Grafana's Test button sends a NORMAL, signed notification with a synthetic
# alert -- not a handshake or challenge request.
TEST_NOTIFICATION = {
    **NOTIFICATION,
    "title": "[FIRING:1]  (TestAlert Grafana)",
    "alerts": [
        {
            "status": "firing",
            "labels": {"alertname": "TestAlert", "instance": "Grafana"},
            "annotations": {"summary": "Notification test"},
            "startsAt": "2024-01-01T00:00:00Z",
            "endsAt": "0001-01-01T00:00:00Z",
            "fingerprint": "fac0861a85de433a",
            "generatorURL": "",
            "silenceURL": "",
            "dashboardURL": "",
            "panelURL": "",
            "values": {},
        }
    ],
}

# Grafana's default body is Go json.Marshal output: compact, no trailing newline.
BODY = json.dumps(NOTIFICATION, separators=(",", ":")).encode("utf-8")


# --- Signing helpers: exactly what grafana/alerting http/hmac.go does --------


def sign(body: bytes, secret: str = SECRET) -> str:
    """Body-only mode: HMAC-SHA256(raw_body), lowercase hex, bare."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def sign_with_timestamp(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Timestamped mode: HMAC-SHA256(timestamp + ":" + raw_body). COLON, not dot."""
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(f"{timestamp}:".encode("utf-8"))
    mac.update(body)
    return mac.hexdigest()


def now_seconds() -> int:
    return int(time.time())


def post(body: bytes, headers: Optional[dict] = None):
    return client.post(
        "/webhooks/grafana",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


# --- get_config -------------------------------------------------------------


class TestGetConfig:
    def test_defaults_signature_header(self):
        assert get_config()["signature_header"] == DEFAULT_SIG_HEADER

    def test_no_default_timestamp_header(self):
        """Body-only signing is the default -- the timestamp header has no name."""
        config = get_config()
        assert config["timestamp_header"] == ""
        assert config["timestamp_required"] is False

    def test_timestamp_header_switches_mode(self, env):
        env.setenv("GRAFANA_TIMESTAMP_HEADER", TS_HEADER)
        config = get_config()
        assert config["timestamp_header"] == TS_HEADER
        assert config["timestamp_required"] is True

    def test_custom_signature_header(self, env):
        env.setenv("GRAFANA_SIGNATURE_HEADER", "X-My-Grafana-Signature")
        assert get_config()["signature_header"] == "X-My-Grafana-Signature"

    def test_default_replay_window_is_ours_not_grafanas(self):
        assert get_config()["max_age_seconds"] == 300


# --- Verification unit tests (body-only mode) -------------------------------


class TestVerifyBodyOnly:
    def test_accepts_correct_signature(self):
        assert verify_grafana_signature(BODY, sign(BODY), None, SECRET) is True

    def test_digest_is_bare_lowercase_hex(self):
        digest = sign(BODY)
        assert len(digest) == 64
        assert digest == digest.lower()
        assert not digest.startswith("sha256=")

    def test_accepts_uppercased_hex(self):
        # Harmless normalisation; guards against a proxy that upcases the value.
        assert verify_grafana_signature(BODY, sign(BODY).upper(), None, SECRET) is True

    def test_rejects_tampered_body(self):
        tampered = json.dumps(
            {**NOTIFICATION, "status": "resolved"}, separators=(",", ":")
        ).encode("utf-8")
        assert verify_grafana_signature(tampered, sign(BODY), None, SECRET) is False

    def test_rejects_wrong_secret(self):
        assert (
            verify_grafana_signature(BODY, sign(BODY, "wrong_secret"), None, SECRET)
            is False
        )

    def test_rejects_missing_signature(self):
        assert verify_grafana_signature(BODY, None, None, SECRET) is False

    def test_fails_closed_without_secret(self):
        assert verify_grafana_signature(BODY, sign(BODY), None, None) is False

    def test_rejects_short_signature_without_raising(self):
        assert verify_grafana_signature(BODY, "abc", None, SECRET) is False

    def test_rejects_non_ascii_signature_without_raising(self):
        # hmac.compare_digest raises TypeError on non-ASCII str input, so the
        # verifier must compare bytes. A forged header must be a clean False.
        forged = "\u00ff" * 64
        assert verify_grafana_signature(BODY, forged, None, SECRET) is False

    def test_rejects_base64_digest(self):
        import base64

        b64 = base64.b64encode(
            hmac.new(SECRET.encode(), BODY, hashlib.sha256).digest()
        ).decode()
        assert verify_grafana_signature(BODY, b64, None, SECRET) is False

    def test_rejects_sha256_prefixed_digest(self):
        assert verify_grafana_signature(BODY, f"sha256={sign(BODY)}", None, SECRET) is False

    def test_rejects_signature_over_reserialized_json(self):
        # Custom Payload templates can emit pretty-printed JSON. Signing parsed-
        # and-re-serialized JSON is the classic bug: same object, different bytes.
        pretty = json.dumps(NOTIFICATION, indent=2).encode("utf-8")
        assert verify_grafana_signature(pretty, sign(BODY), None, SECRET) is False
        assert verify_grafana_signature(pretty, sign(pretty), None, SECRET) is True

    def test_secret_used_as_is_not_transformed(self):
        # Grafana keys the HMAC with []byte(secret) -- the literal UTF-8 bytes.
        # Common mangles (base64-encoding or hex-encoding the secret first) all
        # produce a different key and must fail.
        import base64

        for wrong_key in (
            base64.b64encode(SECRET.encode("utf-8")),
            SECRET.encode("utf-8").hex().encode("ascii"),
            SECRET.upper().encode("utf-8"),
        ):
            wrong = hmac.new(wrong_key, BODY, hashlib.sha256).hexdigest()
            assert verify_grafana_signature(BODY, wrong, None, SECRET) is False

        assert verify_grafana_signature(BODY, sign(BODY), None, SECRET) is True


# --- Verification unit tests (timestamped mode) -----------------------------


class TestVerifyTimestamped:
    OPTS = {"timestamp_required": True, "max_age_seconds": 300}

    def test_accepts_timestamp_colon_body(self):
        ts = str(now_seconds())
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, ts), ts, SECRET, **self.OPTS
            )
            is True
        )

    def test_rejects_dot_separator(self):
        """Stripe-style `timestamp.body` -- Grafana uses a COLON."""
        ts = str(now_seconds())
        mac = hmac.new(SECRET.encode(), digestmod=hashlib.sha256)
        mac.update(f"{ts}.".encode())
        mac.update(BODY)
        assert (
            verify_grafana_signature(BODY, mac.hexdigest(), ts, SECRET, **self.OPTS)
            is False
        )

    def test_rejects_body_only_signature(self):
        ts = str(now_seconds())
        assert verify_grafana_signature(BODY, sign(BODY), ts, SECRET, **self.OPTS) is False

    def test_rejects_missing_timestamp_no_silent_downgrade(self):
        assert verify_grafana_signature(BODY, sign(BODY), None, SECRET, **self.OPTS) is False

    def test_rejects_stale_timestamp(self):
        stale = str(now_seconds() - 600)
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, stale), stale, SECRET, **self.OPTS
            )
            is False
        )

    def test_accepts_timestamp_inside_window(self):
        recent = str(now_seconds() - 120)
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, recent), recent, SECRET, **self.OPTS
            )
            is True
        )

    def test_rejects_millisecond_timestamp(self):
        """Grafana sends seconds (strconv of Now().Unix()), never milliseconds."""
        ms = str(int(time.time() * 1000))
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, ms), ms, SECRET, **self.OPTS
            )
            is False
        )

    def test_rejects_non_numeric_timestamp(self):
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, "nope"), "nope", SECRET, **self.OPTS
            )
            is False
        )

    def test_rejects_swapped_timestamp(self):
        ts = str(now_seconds())
        other = str(now_seconds() - 1)
        assert (
            verify_grafana_signature(
                BODY, sign_with_timestamp(BODY, ts), other, SECRET, **self.OPTS
            )
            is False
        )


# --- Route tests (body-only mode, the default config) -----------------------


class TestRouteBodyOnly:
    def test_accepts_signed_firing_notification(self):
        response = post(BODY, {DEFAULT_SIG_HEADER: sign(BODY)})
        assert response.status_code == 200
        assert response.text == "OK"

    def test_accepts_resolved_notification(self):
        body = json.dumps(
            {
                **NOTIFICATION,
                "status": "resolved",
                "state": "ok",
                "title": "[RESOLVED]  (blue)",
                "alerts": [
                    {**a, "status": "resolved", "endsAt": "2021-10-12T10:51:03+02:00"}
                    for a in NOTIFICATION["alerts"]
                ],
            },
            separators=(",", ":"),
        ).encode("utf-8")

        assert post(body, {DEFAULT_SIG_HEADER: sign(body)}).status_code == 200

    def test_accepts_firing_group_containing_resolved_alert(self):
        # The group status is `firing` if ANY member fires, so a firing
        # notification can carry resolved instances.
        body = json.dumps(
            {
                **NOTIFICATION,
                "alerts": [
                    NOTIFICATION["alerts"][0],
                    {
                        **NOTIFICATION["alerts"][1],
                        "status": "resolved",
                        "endsAt": "2021-10-12T10:00:00Z",
                    },
                ],
            },
            separators=(",", ":"),
        ).encode("utf-8")

        assert post(body, {DEFAULT_SIG_HEADER: sign(body)}).status_code == 200

    def test_accepts_test_button_notification(self):
        body = json.dumps(TEST_NOTIFICATION, separators=(",", ":")).encode("utf-8")
        assert post(body, {DEFAULT_SIG_HEADER: sign(body)}).status_code == 200

    def test_accepts_truncated_alerts(self):
        body = json.dumps(
            {**NOTIFICATION, "truncatedAlerts": 3}, separators=(",", ":")
        ).encode("utf-8")
        assert post(body, {DEFAULT_SIG_HEADER: sign(body)}).status_code == 200

    def test_rejects_missing_signature_header(self):
        response = post(BODY)
        assert response.status_code == 400
        assert "Missing" in response.text

    def test_rejects_invalid_signature(self):
        response = post(BODY, {DEFAULT_SIG_HEADER: "f" * 64})
        assert response.status_code == 400
        assert response.text == "Invalid signature"

    def test_rejects_non_ascii_signature_header_with_400(self):
        response = post(BODY, {DEFAULT_SIG_HEADER: ("\u00ff" * 64).encode("latin-1")})
        assert response.status_code == 400

    def test_rejects_tampered_body(self):
        tampered = json.dumps(
            {**NOTIFICATION, "status": "resolved"}, separators=(",", ":")
        ).encode("utf-8")
        assert post(tampered, {DEFAULT_SIG_HEADER: sign(BODY)}).status_code == 400

    def test_rejects_signed_non_json_body(self):
        body = b"not json at all"
        response = post(body, {DEFAULT_SIG_HEADER: sign(body)})
        assert response.status_code == 400
        assert response.text == "Invalid JSON body"

    def test_fails_closed_without_secret(self, env):
        env.delenv("GRAFANA_WEBHOOK_SECRET", raising=False)
        response = post(BODY, {DEFAULT_SIG_HEADER: sign(BODY)})
        assert response.status_code == 500


# --- Route tests with a custom header configuration -------------------------


class TestRouteCustomHeaders:
    @pytest.fixture(autouse=True)
    def timestamped(self, env):
        env.setenv("GRAFANA_SIGNATURE_HEADER", "X-My-Grafana-Signature")
        env.setenv("GRAFANA_TIMESTAMP_HEADER", TS_HEADER)
        return env

    def test_accepts_timestamped_signature_on_custom_headers(self):
        ts = str(now_seconds())
        response = post(
            BODY,
            {"X-My-Grafana-Signature": sign_with_timestamp(BODY, ts), TS_HEADER: ts},
        )
        assert response.status_code == 200

    def test_rejects_missing_timestamp_header(self):
        response = post(BODY, {"X-My-Grafana-Signature": sign(BODY)})
        assert response.status_code == 400
        assert response.text == "Invalid signature"

    def test_rejects_stale_timestamp(self):
        stale = str(now_seconds() - 3600)
        response = post(
            BODY,
            {
                "X-My-Grafana-Signature": sign_with_timestamp(BODY, stale),
                TS_HEADER: stale,
            },
        )
        assert response.status_code == 400

    def test_ignores_signature_on_default_header_name(self):
        ts = str(now_seconds())
        response = post(
            BODY, {DEFAULT_SIG_HEADER: sign_with_timestamp(BODY, ts), TS_HEADER: ts}
        )
        assert response.status_code == 400
        assert "Missing" in response.text

    def test_honours_widened_replay_window(self, timestamped):
        timestamped.setenv("GRAFANA_MAX_AGE_SECONDS", "7200")
        old = str(now_seconds() - 3600)
        response = post(
            BODY,
            {"X-My-Grafana-Signature": sign_with_timestamp(BODY, old), TS_HEADER: old},
        )
        assert response.status_code == 200


# --- Idempotency ------------------------------------------------------------


class TestIdempotencyKey:
    def test_stable_for_same_group(self):
        assert idempotency_key(NOTIFICATION) == idempotency_key({**NOTIFICATION})

    def test_ignores_alert_ordering(self):
        reordered = {**NOTIFICATION, "alerts": list(reversed(NOTIFICATION["alerts"]))}
        assert idempotency_key(reordered) == idempotency_key(NOTIFICATION)

    def test_differs_between_firing_and_resolved(self):
        assert idempotency_key({**NOTIFICATION, "status": "resolved"}) != idempotency_key(
            NOTIFICATION
        )


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_default_signature_header_constant():
    """The default header name comes from grafana/alerting http/hmac.go."""
    assert main.DEFAULT_SIGNATURE_HEADER == "X-Grafana-Alerting-Signature"
