import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 5f1c0f3e8b7a4d2c9e6a1b3d"
os.environ["HARBOR_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, normalize, verify_harbor_request

client = TestClient(app)

# Shapes taken from Harbor's documented sample payloads (trimmed)
REPOSITORY = {
    "name": "alpine",
    "namespace": "harbor",
    "repo_full_name": "harbor/alpine",
    "repo_type": "private",
}
PUSH_ARTIFACT = {
    "type": "PUSH_ARTIFACT",
    "occur_at": 1680501893,
    "operator": "harbor-jobservice",
    "event_data": {
        "resources": [
            {
                "digest": "sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4",
                "tag": "sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4",
                "resource_url": "localhost/harbor/alpine@sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4",
            }
        ],
        "repository": REPOSITORY,
    },
}
SCANNING_COMPLETED = {
    "type": "SCANNING_COMPLETED",
    "occur_at": 1680502375,
    "operator": "auto",
    "event_data": {"resources": [{"digest": "sha256:954b378c"}], "repository": REPOSITORY},
}
QUOTA_EXCEED = {
    "type": "QUOTA_EXCEED",
    "occur_at": 1680505484,
    "operator": "",
    "event_data": {
        "resources": [{"digest": "sha256:402d21757a03a114"}],
        "repository": REPOSITORY,
        "custom_attributes": {"Details": "will exceed the configured upper limit of 10.0 MiB."},
    },
}
CLOUDEVENTS_PUSH = {
    "specversion": "1.0",
    "id": "66e18103-09c1-41f6-982f-37df223f3eeb",
    "source": "/projects/2/webhook/policies/15",
    "type": "harbor.artifact.pushed",
    "datacontenttype": "application/json",
    "time": "2023-04-03T06:04:46Z",
    "data": PUSH_ARTIFACT["event_data"],
    "operator": "harbor-jobservice",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PUSH_ARTIFACT)
    return client.post(
        "/webhooks/harbor",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHarborWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_rejects_token_without_prefix(self):
        res = post(headers={"Authorization": AUTH.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_non_ascii_header_is_rejected_not_an_error(self):
        # compare_digest on str raises TypeError for non-ASCII; bytes must not.
        res = post(headers={"Authorization": "Bearer café".encode("utf-8")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(PUSH_ARTIFACT), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_handles_default_format_events(self, capsys):
        assert post(json.dumps(SCANNING_COMPLETED), {"Authorization": AUTH}).status_code == 200
        assert post(json.dumps(QUOTA_EXCEED), {"Authorization": AUTH}).status_code == 200
        out = capsys.readouterr().out
        assert "Scan completed for harbor/alpine" in out
        assert "Project quota exceeded at harbor/alpine" in out

    def test_handles_cloudevents_format_by_type(self, capsys):
        res = post(json.dumps(CLOUDEVENTS_PUSH), {"Authorization": AUTH})
        assert res.status_code == 200
        assert "Artifact pushed to harbor/alpine" in capsys.readouterr().out


class TestHelpers:
    def test_normalizes_both_formats_to_the_same_event_name(self):
        assert normalize(PUSH_ARTIFACT)[0] == "PUSH_ARTIFACT"
        assert normalize(CLOUDEVENTS_PUSH)[0] == "PUSH_ARTIFACT"
        assert normalize({"foo": 1}) == (None, None)

    def test_never_accepts_when_unconfigured(self):
        assert verify_harbor_request({"authorization": "Bearer x"}, {}) is False
        assert verify_harbor_request({"authorization": ""}, {"HARBOR_AUTHORIZATION": ""}) is False
