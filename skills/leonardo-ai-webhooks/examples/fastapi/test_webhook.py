import json
import os

# Set test environment variables before importing the app
os.environ["LEONARDO_AI_WEBHOOK_SECRET"] = "test_leonardo_callback_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_leonardo_request

SECRET = os.environ["LEONARDO_AI_WEBHOOK_SECRET"]
BEARER = f"Bearer {SECRET}"
URL = "/webhooks/leonardo-ai"

client = TestClient(app)


# Based on the payload shown in Leonardo.Ai's webhook callback guide (trimmed).
def sample_payload(event_type="image_generation.complete"):
    return {
        "type": event_type,
        "object": "generation",
        "timestamp": 1699490546932,
        "api_version": "v1",
        "data": {
            "object": {
                "id": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
                "status": "COMPLETE",
                "prompt": "An oil painting of a cat",
                "images": [
                    {
                        "id": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
                        "url": "https://cdn.leonardo.ai/users/x/generations/y/Leonardo_Creative_An_oil_painting_of_a_cat_0.jpg",
                        "generationId": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
                    }
                ],
            }
        },
    }


def post(body=None, headers=None, content_type="application/json"):
    body = json.dumps(sample_payload()) if body is None else body
    all_headers = {"content-type": content_type, **(headers or {})}
    return client.post(URL, content=body, headers=all_headers)


class TestAuthorizationBearer:
    def test_accepts_correct_key(self):
        res = post(headers={"Authorization": BEARER})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("scheme", ["bearer", "BEARER", "BeArEr"])
    def test_scheme_is_case_insensitive(self, scheme):
        assert post(headers={"Authorization": f"{scheme} {SECRET}"}).status_code == 200

    def test_rejects_wrong_key_same_length(self):
        res = post(headers={"Authorization": "Bearer " + "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_key_of_different_length(self):
        assert post(headers={"Authorization": "Bearer short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_bare_key_without_scheme(self):
        assert post(headers={"Authorization": SECRET}).status_code == 401

    def test_rejects_different_scheme(self):
        assert post(headers={"Authorization": f"Basic {SECRET}"}).status_code == 401

    def test_does_not_trim_key(self):
        headers = {"authorization": BEARER}
        assert verify_leonardo_request(headers, SECRET + " ") is False
        assert verify_leonardo_request(headers, SECRET) is True

    def test_rejects_non_ascii_without_raising(self):
        assert verify_leonardo_request({"authorization": "Bearer café"}, SECRET) is False
        assert verify_leonardo_request({"authorization": BEARER}, "café") is False

    def test_rejects_everything_when_unconfigured(self):
        assert verify_leonardo_request({"authorization": BEARER}, "") is False

    def test_strips_bearer_prefix_from_configured_secret(self):
        assert verify_leonardo_request({"authorization": BEARER}, f"bearer {SECRET}") is True
        assert verify_leonardo_request({"authorization": BEARER}, "Bearer ") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(headers={"Authorization": BEARER}, content_type="text/plain")
        assert res.status_code == 200

    def test_400_for_invalid_json_after_auth(self):
        assert post(body="{not json", headers={"Authorization": BEARER}).status_code == 400

    def test_400_for_non_object_json(self):
        assert post(body="[1,2]", headers={"Authorization": BEARER}).status_code == 400

    def test_401_not_400_for_invalid_json_without_key(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    def test_handles_image_generation_complete(self, capsys):
        res = post(headers={"Authorization": BEARER})
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "COMPLETE: 1 image(s)" in out
        assert "Unhandled" not in out

    def test_acknowledges_unknown_events(self, capsys):
        res = post(body=json.dumps(sample_payload("something.new")), headers={"Authorization": BEARER})
        assert res.status_code == 200
        assert "Unhandled event: something.new" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
