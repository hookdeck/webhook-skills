import os

# Set test environment variables before importing the app
SECRET = "mn_test_api_key_0123456789"
os.environ["MIGHTY_NETWORKS_WEBHOOK_SECRET"] = SECRET

import json  # noqa: E402
from itertools import count  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    app,
    normalize_event_type,
    seen_event_ids,
    verify_mighty_networks_request,
)

client = TestClient(app)
BEARER = f"Bearer {SECRET}"

EVENTS = [
    "MemberJoined", "MemberLeft", "MemberPurchased", "MemberPurchaseRequested",
    "MemberSubscriptionRenewed", "MemberSubscriptionCanceled", "MemberPlanChanged",
    "MemberRemovedFromPlan", "PostCreated", "PostUpdated", "CommentCreated", "RsvpCreated",
    "EventCreated", "EventCanceled", "ReportedContentCreated",
]

_counter = count(1)


@pytest.fixture(autouse=True)
def _clear_seen():
    seen_event_ids.clear()


def sample_payload(event_type="PostCreatedHook"):
    return {
        "event_id": f"00000000-0000-4000-8000-{next(_counter):012d}",
        "event_timestamp": "2024-01-15T10:30:00Z",
        "event_type": event_type,
        "payload": {"id": 12345, "title": "Example post title", "space_id": 111},
    }


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    return client.post(
        "/webhooks/mighty-networks",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthorizationBearer:
    def test_accepts_the_correct_key(self):
        res = post(headers={"Authorization": BEARER})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("scheme", ["bearer", "BEARER", "BeArEr"])
    def test_matches_scheme_case_insensitively(self, scheme):
        res = post(headers={"Authorization": f"{scheme} {SECRET}"})
        assert res.status_code == 200

    def test_rejects_wrong_key_of_same_length(self):
        res = post(headers={"Authorization": f"Bearer {'x' * len(SECRET)}"})
        assert res.status_code == 401

    def test_rejects_key_of_different_length(self):
        res = post(headers={"Authorization": "Bearer short"})
        assert res.status_code == 401

    def test_compares_key_case_sensitively(self):
        res = post(headers={"Authorization": f"Bearer {SECRET.upper()}"})
        assert res.status_code == 401

    def test_does_not_alter_the_key(self):
        assert verify_mighty_networks_request({"authorization": f"Bearer {SECRET} "}) is False
        assert verify_mighty_networks_request({"authorization": f"Bearer  {SECRET}"}) is False

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_bare_key_without_scheme(self):
        assert post(headers={"Authorization": SECRET}).status_code == 401

    def test_rejects_different_scheme(self):
        assert post(headers={"Authorization": f"Basic {SECRET}"}).status_code == 401

    def test_non_ascii_key_does_not_raise(self):
        # compare_digest raises TypeError on non-ASCII str, so the check compares bytes.
        assert verify_mighty_networks_request({"authorization": "Bearer clé-secrète"}) is False
        assert verify_mighty_networks_request({"authorization": "Bearer clé-secrète"}, "clé-secrète") is True

    def test_rejects_everything_when_secret_unset(self):
        assert verify_mighty_networks_request({"authorization": BEARER}, "") is False
        saved = os.environ.pop("MIGHTY_NETWORKS_WEBHOOK_SECRET")
        try:
            assert verify_mighty_networks_request({"authorization": BEARER}) is False
        finally:
            os.environ["MIGHTY_NETWORKS_WEBHOOK_SECRET"] = saved

    def test_strips_bearer_from_configured_secret(self):
        assert verify_mighty_networks_request({"authorization": BEARER}, f"Bearer {SECRET}") is True
        assert verify_mighty_networks_request({"authorization": BEARER}, f"bearer {SECRET}") is True

    def test_rejects_empty_bearer_key(self):
        assert verify_mighty_networks_request({"authorization": "Bearer "}, "Bearer ") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(json.dumps(sample_payload()), {"Authorization": BEARER}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post("{not json", {"Authorization": BEARER}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[]", {"Authorization": BEARER}).status_code == 400

    def test_invalid_json_without_key_returns_401(self):
        assert post("{not json").status_code == 401


class TestEvents:
    @pytest.mark.parametrize("name", EVENTS)
    def test_handles_event_sent_with_hook_suffix(self, name):
        res = post(json.dumps(sample_payload(f"{name}Hook")), {"Authorization": BEARER})
        assert res.status_code == 200

    def test_handles_event_without_hook_suffix(self):
        res = post(json.dumps(sample_payload("MemberJoined")), {"Authorization": BEARER})
        assert res.status_code == 200

    def test_accepts_events_without_a_handler(self):
        res = post(json.dumps(sample_payload("GiftLeaderboardUpdatedHook")), {"Authorization": BEARER})
        assert res.status_code == 200

    def test_normalizes_hook_suffix(self):
        assert normalize_event_type("PostCreatedHook") == "PostCreated"
        assert normalize_event_type("PostCreated") == "PostCreated"
        assert normalize_event_type(None) == ""


class TestIdempotency:
    def test_acknowledges_repeated_event_id(self):
        body = json.dumps(sample_payload("MemberJoinedHook"))
        first = post(body, {"Authorization": BEARER})
        second = post(body, {"Authorization": BEARER})
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
