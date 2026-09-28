# Generated with: circleci-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the CircleCI outbound webhook receiver."""

import copy
import hashlib
import hmac
import json
import os
import uuid

import pytest

# CircleCI's Secret token is a plain string you type into the webhook form. It
# is used as UTF-8 bytes directly -- no prefix, no base64.
TEST_SECRET = "circleci_test_signing_secret"
WRONG_SECRET = "not_the_signing_secret"

os.environ["CIRCLECI_WEBHOOK_SECRET"] = TEST_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    app,
    extract_vcs_info,
    verify_circleci_signature,
)

client = TestClient(app)


# --- Fixtures ----------------------------------------------------------------

# workflow-completed, GitHub OAuth pipeline (carries `pipeline.vcs`).
# Straight from CircleCI's outbound webhooks reference.
WORKFLOW_COMPLETED = {
    "id": "3888f21b-eaa7-38e3-8f3d-75a63bba8895",
    "type": "workflow-completed",
    "happened_at": "2021-09-01T22:49:34.317Z",
    "webhook": {"id": "cf8c4fdd-0587-4da1-b4ca-4846e9640af9", "name": "Sample Webhook"},
    "project": {
        "id": "84996744-a854-4f5e-aea3-04e2851dc1d2",
        "name": "webhook-service",
        "slug": "github/circleci/webhook-service",
    },
    "organization": {"id": "f22b6566-597d-46d5-ba74-99ef5bb3d85c", "name": "circleci"},
    "workflow": {
        "id": "fda08377-fe7e-46b1-8992-3a7aaecac9c3",
        "name": "build-test-deploy",
        "created_at": "2021-09-01T22:49:03.616Z",
        "stopped_at": "2021-09-01T22:49:34.170Z",
        "url": (
            "https://app.circleci.com/pipelines/github/circleci/webhook-service/130"
            "/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3"
        ),
        "status": "success",
    },
    "pipeline": {
        "id": "1285fe1d-d3a6-44fc-8886-8979558254c4",
        "number": 130,
        "created_at": "2021-09-01T22:49:03.544Z",
        "trigger": {"type": "webhook"},
        "vcs": {
            "provider_name": "github",
            "origin_repository_url": "https://github.com/circleci/webhook-service",
            "target_repository_url": "https://github.com/circleci/webhook-service",
            "revision": "1dc6aa69429bff4806ad6afe58d3d8f57e25973e",
            "commit": {
                "subject": "Description of change",
                "body": "More details about the change",
                "author": {"name": "Author Name", "email": "author.email@example.com"},
                "authored_at": "2021-09-01T22:48:53Z",
                "committer": {
                    "name": "Committer Name",
                    "email": "committer.email@example.com",
                },
                "committed_at": "2021-09-01T22:48:53Z",
            },
            "branch": "main",
        },
    },
}

# job-completed adds `job` -- and its `workflow` has NO `status`.
JOB_COMPLETED = copy.deepcopy(WORKFLOW_COMPLETED)
JOB_COMPLETED["id"] = "8bd71c28-4969-3677-8940-3e3a61c46660"
JOB_COMPLETED["type"] = "job-completed"
JOB_COMPLETED["workflow"].pop("status")
JOB_COMPLETED["job"] = {
    "id": "8b91f9a8-7975-4e60-916c-f0152ccbc937",
    "name": "test",
    "started_at": "2021-09-01T22:49:28.841Z",
    "stopped_at": "2021-09-01T22:49:34.170Z",
    "status": "success",
    "number": 136,
}

# GitLab / GitHub App pipelines carry trigger_parameters and NO vcs.
GITLAB_PIPELINE = {
    "id": "5678fe1d-d3a6-44fc-8886-8979558254c4",
    "number": 42,
    "created_at": "2026-09-28T10:00:00.000Z",
    "trigger": {"type": "gitlab"},
    # trigger_parameters verbatim from CircleCI's "workflow-completed for GitLab
    # and GitHub App" sample in the outbound webhooks reference.
    "trigger_parameters": {
        "gitlab": {
            "web_url": "https://gitlab.com/circleci/hello-world",
            "commit_author_name": "Commit Author",
            "user_id": "9534789",
            "user_name": "User name",
            "user_username": "username",
            "branch": "main",
            "commit_title": "Update README.md",
            "commit_message": "Update README.md",
            "repo_url": "git@gitlab.com:circleci/hello-world.git",
            "user_avatar": "https://secure.gravatar.com/avatar",
            "type": "push",
            "project_id": "33852820",
            "ref": "refs/heads/main",
            "repo_name": "hello-world",
            "commit_author_email": "committer.email@example.com",
            "checkout_sha": "850a1519f25d14e968649cc420d1bd381715c05c",
            "commit_timestamp": "2022-04-13T11:10:16+00:00",
            "commit_sha": "850a1519f25d14e968649cc420d1bd381715c05c",
        },
        "git": {
            "tag": "",
            "checkout_sha": "850a1519f25d14e968649cc420d1bd381715c05c",
            "ref": "refs/heads/main",
            "branch": "main",
            "checkout_url": "git@gitlab.com:circleci/hello-world.git",
        },
        "circleci": {
            "event_time": "2022-04-13T11:10:18.349Z",
            "actor_id": "6a19122c-40e0-4d56-a875-aac6ccc27700",
            "event_type": "push",
            "trigger_type": "gitlab",
        },
    },
}


def sign(body, secret: str = TEST_SECRET) -> str:
    """Sign exactly as CircleCI does: HMAC-SHA256 hex over the RAW BODY ONLY."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def signature_header(body, secret: str = TEST_SECRET) -> str:
    """Build the `circleci-signature` header value for a body."""
    return f"v1={sign(body, secret)}"


def fresh_body(event: dict, **overrides) -> str:
    """Give each delivery a fresh event id so dedupe doesn't interfere."""
    payload = {**event, "id": str(uuid.uuid4()), **overrides}
    return json.dumps(payload)


_SENTINEL = object()


def post(body: str, signature=_SENTINEL, event_type=_SENTINEL):
    """POST a signed delivery through the real FastAPI stack."""
    headers = {"Content-Type": "application/json"}

    sig = signature_header(body) if signature is _SENTINEL else signature
    if sig is not None:
        headers["circleci-signature"] = sig

    etype = event_type
    if etype is _SENTINEL:
        try:
            etype = json.loads(body).get("type")
        except (json.JSONDecodeError, AttributeError):
            etype = None
    if etype:
        headers["circleci-event-type"] = etype

    return client.post("/webhooks/circleci", content=body.encode("utf-8"), headers=headers)


# --- Documented known-answer vectors -----------------------------------------
#
# From CircleCI's "Validate webhooks" guide. These pin the algorithm itself,
# independently of any framework body handling.

VECTORS = [
    ("hello world", "secret", "734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a"),
    (
        "lalala",
        "another-secret",
        "daa220016c8f29a8b214fbfc3671aeec2145cfb1e6790184ffb38b6d0425fa00",
    ),
    (
        "an-important-request-payload",
        "hunter123",
        "9be2242094a9a8c00c64306f382a7f9d691de910b4a266f67bd314ef18ac49fa",
    ),
    ("foo", "secret", "773ba44693c7553d6ee20f61ea5d2757a9a4f4a44d2841ae4e95b52e4cd62db4"),
]


@pytest.mark.parametrize("body,secret,expected", VECTORS)
def test_documented_vectors(body, secret, expected):
    assert sign(body, secret) == expected
    assert verify_circleci_signature(body.encode("utf-8"), f"v1={expected}", secret) is True


@pytest.mark.parametrize("body,secret,expected", VECTORS)
def test_documented_vectors_reject_wrong_secret(body, secret, expected):
    assert verify_circleci_signature(body.encode("utf-8"), f"v1={expected}", secret + "x") is False


def test_digest_is_64_char_lowercase_hex_not_base64():
    digest = sign("hello world", "secret")
    assert len(digest) == 64
    assert all(c in "0123456789abcdef" for c in digest)


# --- Signature verification ---------------------------------------------------


def test_accepts_signed_workflow_completed():
    res = post(fresh_body(WORKFLOW_COMPLETED))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_signed_job_completed():
    res = post(fresh_body(JOB_COMPLETED))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_rejects_wrong_secret():
    body = fresh_body(WORKFLOW_COMPLETED)
    res = post(body, signature=signature_header(body, WRONG_SECRET))
    assert res.status_code == 400
    assert res.json() == {"error": "Invalid signature"}


def test_rejects_tampered_body():
    body = fresh_body(WORKFLOW_COMPLETED)
    signature = signature_header(body)
    # Flip "success" to "failed" after signing -- the classic forgery.
    tampered = json.loads(body)
    tampered["workflow"]["status"] = "failed"

    res = post(json.dumps(tampered), signature=signature)
    assert res.status_code == 400


def test_rejects_missing_signature_header():
    # CircleCI's Secret token is OPTIONAL in the UI, so unsigned deliveries are
    # possible. They must be refused, never trusted.
    res = post(fresh_body(WORKFLOW_COMPLETED), signature=None)
    assert res.status_code == 400
    assert res.json() == {"error": "Missing signature header"}


def test_fails_closed_without_secret():
    body = json.dumps(WORKFLOW_COMPLETED)
    assert verify_circleci_signature(body.encode(), signature_header(body), None) is False
    assert verify_circleci_signature(body.encode(), signature_header(body), "") is False


def test_returns_500_when_secret_env_unset():
    saved = os.environ.pop("CIRCLECI_WEBHOOK_SECRET")
    try:
        res = post(fresh_body(WORKFLOW_COMPLETED))
        # 500 makes CircleCI retry once the secret is set; a 200 would silently
        # swallow real events.
        assert res.status_code == 500
        assert res.json() == {"error": "Webhook secret not configured"}
    finally:
        os.environ["CIRCLECI_WEBHOOK_SECRET"] = saved


def test_does_not_raise_on_wrong_length_signature():
    # compare_digest is length-safe, but the guard is asserted explicitly so a
    # future refactor to a manual == comparison can't reintroduce a 500.
    body = json.dumps(WORKFLOW_COMPLETED)
    assert verify_circleci_signature(body.encode(), "v1=short", TEST_SECRET) is False


def test_non_ascii_signature_is_rejected_not_raised():
    # Header values are attacker-controlled. hmac.compare_digest raises
    # TypeError on a non-ASCII str, so the verifier must compare bytes.
    body = json.dumps(WORKFLOW_COMPLETED)
    assert verify_circleci_signature(body.encode(), "v1=\xe9", TEST_SECRET) is False


def test_non_ascii_signature_header_returns_400_not_500():
    # Starlette decodes raw header bytes as latin-1, so b"\xe9" arrives as "é".
    body = json.dumps(WORKFLOW_COMPLETED)
    response = client.post(
        "/webhooks/circleci",
        content=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "circleci-event-type": "workflow-completed",
            "circleci-signature": b"v1=\xe9",
        },
    )
    assert response.status_code == 400


def test_rejects_base64_digest():
    import base64

    body = json.dumps(WORKFLOW_COMPLETED)
    b64 = base64.b64encode(
        hmac.new(TEST_SECRET.encode(), body.encode(), hashlib.sha256).digest()
    ).decode()
    assert verify_circleci_signature(body.encode(), f"v1={b64}", TEST_SECRET) is False


def test_rejects_digest_over_timestamp_dot_body():
    # CircleCI signs the RAW BODY ALONE -- no timestamp, no id, no delimiter.
    import time

    body = json.dumps(WORKFLOW_COMPLETED)
    prefixed = hmac.new(
        TEST_SECRET.encode(), f"{int(time.time())}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    assert verify_circleci_signature(body.encode(), f"v1={prefixed}", TEST_SECRET) is False


def test_rejects_base64_decoded_secret():
    # The secret is used as UTF-8 bytes DIRECTLY. Base64-decoding it first (the
    # habit picked up from whsec_-style providers) is a bug. Uses a secret that
    # happens to be valid base64 so the wrong path actually runs.
    import base64

    b64_secret = "Y2lyY2xlY2ktc2VjcmV0"  # base64 of "circleci-secret"
    body = json.dumps(WORKFLOW_COMPLETED)

    correct = hmac.new(b64_secret.encode("utf-8"), body.encode(), hashlib.sha256).hexdigest()
    wrong = hmac.new(base64.b64decode(b64_secret), body.encode(), hashlib.sha256).hexdigest()

    assert correct != wrong
    assert verify_circleci_signature(body.encode(), f"v1={correct}", b64_secret) is True
    assert verify_circleci_signature(body.encode(), f"v1={wrong}", b64_secret) is False


def test_handles_non_ascii_bodies():
    payload = copy.deepcopy(WORKFLOW_COMPLETED)
    payload["pipeline"]["vcs"]["commit"]["subject"] = "fix: émoji 👋 support"
    body = json.dumps(payload, ensure_ascii=False)
    raw = body.encode("utf-8")
    assert verify_circleci_signature(raw, signature_header(raw), TEST_SECRET) is True


# --- Versioned signature list -------------------------------------------------


def test_accepts_v1_with_trailing_garbage_versions():
    # "Only check the latest signature type" -- unknown versions are ignored,
    # not tripped over.
    body = json.dumps(WORKFLOW_COMPLETED)
    header = f"v1={sign(body)},v2=garbage"
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is True


def test_accepts_v1_anywhere_in_the_list():
    body = json.dumps(WORKFLOW_COMPLETED)
    header = f"v0=deadbeef,v1={sign(body)},v2=garbage,v3=more-garbage"
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is True


def test_rejects_v2_only_downgrade():
    # v2/v3 do not exist yet and their algorithm is unknown. Falling back to one
    # is exactly the downgrade the docs warn against.
    body = json.dumps(WORKFLOW_COMPLETED)
    assert verify_circleci_signature(body.encode(), f"v2={sign(body)}", TEST_SECRET) is False


def test_rejects_when_only_unknown_versions_present():
    body = json.dumps(WORKFLOW_COMPLETED)
    valid = sign(body)
    header = f"v2={valid},v3={valid}"
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is False


def test_tolerates_whitespace_around_pairs():
    body = json.dumps(WORKFLOW_COMPLETED)
    header = f" v1 = {sign(body)} , v2 = garbage "
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is True


def test_splits_each_pair_on_first_equals_only():
    # A naive split("=")[1] would truncate a value containing '='. The first v1
    # entry wins, and here it is deliberately wrong.
    body = json.dumps(WORKFLOW_COMPLETED)
    header = f"v1=a=b,v1={sign(body)}"
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is False


@pytest.mark.parametrize("header", ["garbage", "v1", "", "v1="])
def test_rejects_malformed_headers(header):
    body = json.dumps(WORKFLOW_COMPLETED)
    assert verify_circleci_signature(body.encode(), header, TEST_SECRET) is False


# --- Raw body -----------------------------------------------------------------


def test_rejects_reserialized_body():
    # Pretty-printing is semantically identical and cryptographically different.
    # This is why verification must run against await request.body().
    compact = json.dumps(WORKFLOW_COMPLETED)
    pretty = json.dumps(WORKFLOW_COMPLETED, indent=2)
    assert verify_circleci_signature(pretty.encode(), signature_header(compact), TEST_SECRET) is False


def test_verifies_pretty_body_when_that_is_what_was_signed():
    pretty = json.dumps(WORKFLOW_COMPLETED, indent=2)
    assert verify_circleci_signature(pretty.encode(), signature_header(pretty), TEST_SECRET) is True


def test_rejects_trailing_newline_added_after_signing():
    body = json.dumps(WORKFLOW_COMPLETED)
    assert (
        verify_circleci_signature((body + "\n").encode(), signature_header(body), TEST_SECRET)
        is False
    )


# --- No timestamp, no replay window -------------------------------------------


def test_accepts_years_old_happened_at():
    # CircleCI's scheme signs no timestamp and documents no tolerance.
    # happened_at is EVENT time; a legitimate (undocumented-timing) retry carries the
    # original value. Rejecting on it silently drops real deliveries.
    res = post(fresh_body(WORKFLOW_COMPLETED, happened_at="2019-01-01T00:00:00.000Z"))
    assert res.status_code == 200
    assert res.json() == {"received": True}


# --- Deduplication ------------------------------------------------------------


def test_deduplicates_on_payload_id():
    # "Webhook requests may be duplicated." There is no delivery-id header, so
    # the payload `id` is the dedupe key.
    body = fresh_body(WORKFLOW_COMPLETED)

    first = post(body)
    assert first.status_code == 200
    assert first.json() == {"received": True}

    second = post(body)
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


# --- Payload shapes -----------------------------------------------------------


def test_extracts_vcs_from_pipeline_vcs():
    info = extract_vcs_info(WORKFLOW_COMPLETED["pipeline"])

    assert info["source"] == "vcs"
    assert info["provider"] == "github"
    assert info["branch"] == "main"
    assert info["revision"] == "1dc6aa69429bff4806ad6afe58d3d8f57e25973e"
    assert info["subject"] == "Description of change"
    assert info["author_name"] == "Author Name"


def test_extracts_vcs_from_trigger_parameters():
    # These pipelines have NO `pipeline.vcs` at all -- a handler doing
    # pipeline["vcs"]["branch"] raises KeyError on them.
    assert "vcs" not in GITLAB_PIPELINE

    info = extract_vcs_info(GITLAB_PIPELINE)
    assert info["source"] == "trigger_parameters"
    assert info["provider"] == "gitlab"
    assert info["branch"] == "main"
    assert info["tag"] is None  # documented as "" on branch builds
    assert info["revision"] == "850a1519f25d14e968649cc420d1bd381715c05c"
    assert info["subject"] == "Update README.md"
    assert info["author_name"] == "Commit Author"
    assert info["repository_url"] == "https://gitlab.com/circleci/hello-world"


def test_extract_vcs_handles_empty_pipeline():
    assert extract_vcs_info({})["branch"] is None
    assert extract_vcs_info(None)["branch"] is None


def test_job_completed_has_no_workflow_status():
    # Workflow status belongs to workflow-level webhooks only.
    assert "status" not in JOB_COMPLETED["workflow"]
    assert JOB_COMPLETED["job"]["status"] == "success"


def test_accepts_unknown_extra_fields():
    # Payloads are "open maps": new fields may be added without notice.
    res = post(
        fresh_body(
            WORKFLOW_COMPLETED,
            some_future_field={"nested": True},
            workflow={**WORKFLOW_COMPLETED["workflow"], "brand_new_key": "value"},
        )
    )
    assert res.status_code == 200


def test_acknowledges_community_observed_ping():
    # header `circleci-event-type: ping`, body with only type/id/happened_at/
    # webhook -- no project, organization, workflow or pipeline. Community
    # observation, NOT documented by CircleCI.
    body = json.dumps(
        {
            "type": "ping",
            "id": str(uuid.uuid4()),
            "happened_at": "2022-09-19T15:59:36.507435Z",
            "webhook": {"id": "d4ab06bc-eb79-463d-8aa4-47d066382d3b", "name": "fly.io"},
        }
    )

    res = post(body, event_type="ping")
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_acknowledges_unknown_event_type():
    res = post(fresh_body(WORKFLOW_COMPLETED, type="something-new"), event_type="something-new")
    assert res.status_code == 200


def test_returns_400_on_unparseable_body():
    res = post("not json at all", event_type=None)
    assert res.status_code == 400
    assert res.json() == {"error": "Invalid JSON"}


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
