# Generated with: polytomic-webhooks skill
# https://github.com/hookdeck/webhook-skills
import ast
import copy
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    normalize_record,
    parse_envelope,
    timestamp_is_fresh,
    verify_bearer_token,
)

# Polytomic does NOT sign its webhooks, so there are NO SIGNATURES TO GENERATE in
# these tests — no HMAC, no digest, nothing to compute. The only credential is the
# static shared bearer token (the connection Secret), which Polytomic echoes back
# verbatim in the Authorization header.
#
# This value mirrors the shape of the token in Polytomic's documented example,
# which happens to decode as an HS256 JWT with claims
# {"aud":"webhook","jti":"<uuid>","iss":"https://app.polytomic-local.com:8443/"}.
# That is an observation about the documented example, not a documented format —
# the handler treats the whole string as an OPAQUE SECRET and never decodes it.
SECRET = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJhdWQiOiJ3ZWJob29rIiwianRpIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwiaXNzIjoiaHR0cHM6Ly9hcHAucG9seXRvbWljLWxvY2FsLmNvbTo4NDQzLyJ9."
    "FBSU_fC1YFyWhMSPErRono4BPfkIeT3MkRdZrepiP3c"
)
WRONG_SECRET = SECRET[:-1] + "X"  # same length, last char differs

PATH = "/webhooks/polytomic"

client = TestClient(app)

# The documented payload, verbatim from
# https://docs.polytomic.com/docs/webhooks-connections
#
# `fields` holds `email` / `last_login` because that is what THAT customer's sync
# selected — the keys are user-defined, not a Polytomic schema.
DOCUMENTED_PAYLOAD: Dict[str, Any] = {
    "event": "sync.records",
    "object": {
        "id": "1ea8f90a-b22e-4218-86d5-c3c109e1fbb7",
        "name": "Webhook HTTP Endpoint sync",
        "records": [
            {
                "hash": "b7421c6c57bd49f7",
                "fields": {
                    "email": "nathan@polytomic.com",
                    "last_login": "2020-12-02T00:00:00Z",
                },
            }
        ],
        "metadata": {},
    },
}


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    """Every test starts with a correctly configured secret and no tolerance
    override. Tests that need otherwise override it explicitly."""
    monkeypatch.setenv("POLYTOMIC_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def rfc3339_now(offset_seconds: int = 0) -> str:
    """RFC 3339 / ISO 8601 UTC, e.g. "2021-06-01T22:55:36Z" — the documented format."""
    moment = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def payload() -> Dict[str, Any]:
    return copy.deepcopy(DOCUMENTED_PAYLOAD)


def post(
    body: Optional[Dict[str, Any]] = None,
    secret: Optional[str] = SECRET,
    timestamp: Optional[str] = None,
    raw: Optional[str] = None,
):
    headers = {"Content-Type": "application/json"}
    if secret is not None:
        headers["Authorization"] = f"Bearer {secret}"
    headers["Polytomic-Signature-Timestamp"] = (
        timestamp if timestamp is not None else rfc3339_now()
    )

    if raw is not None:
        return client.post(PATH, content=raw, headers=headers)
    return client.post(PATH, json=body if body is not None else payload(), headers=headers)


# ---------------------------------------------------------------------------
# Bearer token authentication (there is no signature)
# ---------------------------------------------------------------------------


def test_accepts_documented_payload_with_matching_token():
    response = post()
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_rejects_mismatched_token_with_401():
    response = post(secret=WRONG_SECRET)
    assert response.status_code == 401


def test_rejects_missing_authorization_header_with_401():
    response = post(secret=None)
    assert response.status_code == 401


def test_fails_closed_with_500_when_secret_unset(monkeypatch):
    # On a provider with no signature, the bearer token is the entire security
    # boundary. "Unconfigured" must never mean "accept everything".
    monkeypatch.delenv("POLYTOMIC_WEBHOOK_SECRET", raising=False)
    response = post()
    assert response.status_code == 500


def test_strips_exactly_one_bearer_prefix_case_insensitively():
    # RFC 7235: the scheme is case-insensitive.
    assert verify_bearer_token(f"Bearer {SECRET}", SECRET) is True
    assert verify_bearer_token(f"bearer {SECRET}", SECRET) is True
    assert verify_bearer_token(f"BEARER {SECRET}", SECRET) is True
    # Only ONE prefix is stripped, so a doubled scheme must not authenticate.
    assert verify_bearer_token(f"Bearer Bearer {SECRET}", SECRET) is False


def test_accepts_bare_token_with_no_scheme():
    assert verify_bearer_token(SECRET, SECRET) is True


def test_compares_token_case_sensitively():
    assert verify_bearer_token(f"Bearer {SECRET.upper()}", SECRET) is False


def test_returns_false_on_length_mismatch_without_raising():
    # hmac.compare_digest handles unequal lengths without raising, but it must
    # still report a mismatch rather than truncating.
    assert verify_bearer_token("Bearer short", SECRET) is False
    assert verify_bearer_token(f"Bearer {SECRET}extra", SECRET) is False


def test_returns_none_when_secret_unset_so_caller_can_fail_closed():
    assert verify_bearer_token(f"Bearer {SECRET}", "") is None
    assert verify_bearer_token(f"Bearer {SECRET}", None) is None


def test_returns_false_for_missing_authorization_value():
    assert verify_bearer_token(None, SECRET) is False
    assert verify_bearer_token("", SECRET) is False


def test_handles_non_ascii_authorization_without_raising():
    # hmac.compare_digest() raises TypeError on str values containing non-ASCII
    # characters, so the implementation must encode to bytes first. The header is
    # attacker-supplied, so this is reachable.
    assert verify_bearer_token("Bearer tökén-wîth-ünicode", SECRET) is False


def test_does_not_treat_the_token_as_a_jwt():
    # A JWT-aware verifier would reject this or raise. An opaque byte-for-byte
    # comparison accepts it, which is correct: real workspace secrets need not be
    # JWTs at all.
    opaque = "not-a-jwt-at-all-just-an-opaque-shared-secret"
    assert verify_bearer_token(f"Bearer {opaque}", opaque) is True


# ---------------------------------------------------------------------------
# Polytomic-Signature-Timestamp (a timestamp, NOT a signature)
# ---------------------------------------------------------------------------


def test_accepts_fresh_rfc3339_timestamp():
    assert timestamp_is_fresh(rfc3339_now(), 300) is True


def test_parses_the_documented_format():
    # The docs' example: "2021-06-01T22:55:36Z" — parseable, but long stale.
    assert timestamp_is_fresh("2021-06-01T22:55:36Z", 0) is True  # check disabled
    assert timestamp_is_fresh("2021-06-01T22:55:36Z", 300) is False  # genuinely stale


def test_handles_trailing_z_on_python_39_and_310():
    # datetime.fromisoformat() only accepts a literal "Z" natively on 3.11+, so
    # the implementation normalises it to "+00:00".
    assert timestamp_is_fresh(rfc3339_now(), 300) is True
    # An explicit offset must work too.
    explicit = datetime.now(timezone.utc).isoformat()
    assert timestamp_is_fresh(explicit, 300) is True


def test_rejects_timestamp_older_than_tolerance():
    assert timestamp_is_fresh(rfc3339_now(-600), 300) is False


def test_rejects_timestamp_too_far_in_the_future():
    assert timestamp_is_fresh(rfc3339_now(600), 300) is False


def test_is_not_parsed_as_a_unix_epoch_integer():
    # int("2021-06-01T22:55:36Z") raises, and a bare epoch value is NOT the
    # documented format — it must not be accepted as fresh.
    epoch_seconds = str(int(datetime.now(timezone.utc).timestamp()))
    assert timestamp_is_fresh(epoch_seconds, 300) is False


def test_rejects_unparseable_timestamp():
    assert timestamp_is_fresh("not-a-timestamp", 300) is False
    assert timestamp_is_fresh("", 300) is False
    assert timestamp_is_fresh(None, 300) is False


def test_skips_check_when_tolerance_is_zero_or_negative():
    assert timestamp_is_fresh(None, 0) is True
    assert timestamp_is_fresh("garbage", 0) is True
    assert timestamp_is_fresh("garbage", -1) is True


def test_rejects_stale_delivery_with_400_over_http():
    response = post(timestamp=rfc3339_now(-3600))
    assert response.status_code == 400


def test_authenticates_before_checking_freshness():
    # A bad token is 401, not 400 — authentication comes first.
    response = post(secret=WRONG_SECRET, timestamp=rfc3339_now(-3600))
    assert response.status_code == 401


def test_honours_tolerance_env_var_of_zero(monkeypatch):
    monkeypatch.setenv("POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS", "0")
    response = post(timestamp="2021-06-01T22:55:36Z")
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Event dispatch (exactly one documented event: sync.records)
# ---------------------------------------------------------------------------


def test_processes_sync_records():
    response = post()
    assert response.status_code == 200


def test_ignores_unknown_event_with_200():
    # The docs anticipate future event types. A 4xx/5xx "will cause the sync to
    # appear as a failure", so unknown events must be acknowledged.
    body = payload()
    body["event"] = "some.future.event"
    del body["object"]["records"]
    response = post(body)
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_rejects_missing_event_with_400():
    body = payload()
    del body["event"]
    response = post(body)
    assert response.status_code == 400


def test_rejects_missing_object_envelope_with_400():
    response = post({"event": "sync.records"})
    assert response.status_code == 400


def test_rejects_invalid_json_with_400():
    response = post(raw="{not json")
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# The batch (object.records is a LIST, default size 100)
# ---------------------------------------------------------------------------


def test_handles_a_multi_record_batch():
    body = payload()
    body["object"]["records"] = [
        {
            "hash": f"hash{i}",
            "fields": {"email": f"user{i}@example.com", "last_login": "2020-12-02T00:00:00Z"},
        }
        for i in range(250)
    ]
    response = post(body)
    assert response.status_code == 200

    envelope, error = parse_envelope(body)
    assert error is None
    # Batch size is user-configurable, so a handler must never assume 1.
    assert len(envelope["records"]) == 250


def test_handles_an_empty_batch():
    body = payload()
    body["object"]["records"] = []
    response = post(body)
    assert response.status_code == 200


def test_rejects_non_array_records_with_400():
    body = payload()
    body["object"]["records"] = "not-an-array"
    response = post(body)
    assert response.status_code == 400


def test_exposes_hash_and_sync_id_for_idempotency():
    envelope, error = parse_envelope(payload())
    assert error is None
    assert envelope["sync_id"] == "1ea8f90a-b22e-4218-86d5-c3c109e1fbb7"
    assert envelope["sync_name"] == "Webhook HTTP Endpoint sync"
    # Dedupe key: f"{sync_id}:{hash}". hash is a CONTENT digest for dedupe only —
    # never a credential.
    assert normalize_record(envelope["records"][0])["hash"] == "b7421c6c57bd49f7"


# ---------------------------------------------------------------------------
# records[].fields has user-defined keys
# ---------------------------------------------------------------------------


def test_passes_through_whatever_keys_the_sync_selected():
    # A completely different sync configuration — no `email`, no `last_login`.
    record = normalize_record(
        {
            "hash": "abc123",
            "fields": {"account_id": 42, "mrr": 199.5, "is_churned": False, "plan": None},
        }
    )
    assert sorted(record["fields"].keys()) == ["account_id", "is_churned", "mrr", "plan"]
    # None values survive — the handler must tolerate them, not assume strings.
    assert record["fields"]["plan"] is None


def test_defaults_fields_to_empty_dict_when_absent_or_malformed():
    assert normalize_record({"hash": "h"})["fields"] == {}
    assert normalize_record({"hash": "h", "fields": None})["fields"] == {}
    assert normalize_record({"hash": "h", "fields": "nope"})["fields"] == {}
    assert normalize_record({"hash": "h", "fields": []})["fields"] == {}


def test_tolerates_a_record_with_no_hash():
    assert normalize_record({"fields": {"a": 1}})["hash"] is None


def test_returns_none_for_a_non_dict_record():
    assert normalize_record(None) is None
    assert normalize_record("nope") is None
    assert normalize_record([]) is None


def test_does_not_drop_a_batch_because_one_record_is_malformed():
    body = payload()
    body["object"]["records"] = [DOCUMENTED_PAYLOAD["object"]["records"][0], None, "nope"]
    response = post(body)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# object.metadata may be a dict, None, or absent
# ---------------------------------------------------------------------------


def test_metadata_accepts_a_dict():
    envelope, _ = parse_envelope(payload())
    assert envelope["metadata"] == {}  # the documented example sends {}

    body = payload()
    body["object"]["metadata"] = {"env": "production", "tenant": "acme"}
    envelope, _ = parse_envelope(body)
    assert envelope["metadata"] == {"env": "production", "tenant": "acme"}


def test_metadata_accepts_none():
    # None is the Advanced settings default.
    body = payload()
    body["object"]["metadata"] = None
    envelope, _ = parse_envelope(body)
    assert envelope["metadata"] is None


def test_metadata_accepts_being_absent():
    body = payload()
    del body["object"]["metadata"]
    envelope, _ = parse_envelope(body)
    assert envelope["metadata"] is None
    response = post(body)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# No HMAC anywhere in the verify path
# ---------------------------------------------------------------------------


def test_handler_computes_no_hmac_and_imports_no_hashlib():
    """
    Polytomic sends no signature, so there is nothing to digest. A verifier that
    computes an HMAC here is comparing against nothing.

    `hmac.compare_digest` IS allowed — that is a constant-time byte comparison,
    not an HMAC. What must not appear is `hmac.new(...)` or any `hashlib` use.

    This walks the AST rather than grepping the text, so the prose comments that
    name these functions in order to forbid them don't trip the assertion.
    """
    source = open(os.path.join(os.path.dirname(__file__), "main.py")).read()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            callee = ast.unparse(node.func)
            assert callee != "hmac.new", "no HMAC should be computed — there is no signature"
            assert not callee.startswith("hashlib."), f"unexpected hashlib call: {callee}"
        elif isinstance(node, ast.Import):
            assert all(alias.name != "hashlib" for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.module != "hashlib"


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
