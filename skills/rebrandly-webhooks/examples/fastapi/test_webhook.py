import copy
import json
import os

# Set test environment variables before importing the app
os.environ["REBRANDLY_WEBHOOK_HEADER"] = "X-Rebrandly-Secret"
os.environ["REBRANDLY_WEBHOOK_SECRET"] = "Bearer test_rebrandly_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_rebrandly_request

client = TestClient(app)

HEADER = os.environ["REBRANDLY_WEBHOOK_HEADER"]
SECRET = os.environ["REBRANDLY_WEBHOOK_SECRET"]

# Clickstream payload as shown in Rebrandly's docs
CLICKSTREAM = json.loads('{"data": [{"timestamp": "2019-07-02T14:07:06.981094Z", "client": {"language": "pt", "location": {"country": "br"}, "agent": {"browser": {"name": "facebook-app", "version": "227.0.0.43.158"}, "os": {"name": "android", "version": "android-9.0-pie"}, "device": {"name": "smartphone"}, "type": "human"}, "session": {"started": "2019-07-02T14:07:06.981094Z", "first": true}}, "referral": {"hostname": "m.facebook.com", "protocol": "http", "path": "/", "origin": {"type": "social", "name": "facebook"}}, "route": {"id": "a1ec86bf91bfe763ad02f602259ea0a9", "slashtag": "", "creator": {"id": "wf09bfww4eb9jkw2844555e1ce9af4f2", "workspace": {"id": "d88bfe5fgd14b2ghb44538b9aekpw89", "name": ""}}, "domain": {"id": "9a5ae320f3e247ef8c9b6061131bb517", "raw": ""}, "destination": {"raw": "https://www.yourdestination.com/?utm_source=cs_facebook_post&utm_medium=customersuccess", "protocol": "https", "hostname": "www.yourdestination.com", "path": "/", "params": {"query": {"utm_source": ["cs_facebook_post"], "utm_medium": ["customersuccess"]}}}}}], "key": "abcxyz123"}')

METHODS = ["get", "post", "put", "patch", "delete"]


def send(method="post", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(CLICKSTREAM)
    return client.request(
        method.upper(),
        "/webhooks/rebrandly",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_accepts_correct_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True, "clicks": 1}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={HEADER.upper(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer(self):
        assert send(headers={HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_secret_in_other_header(self):
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        assert not verify_rebrandly_request({HEADER: "caf\u00e9"}, SECRET, HEADER)
        assert verify_rebrandly_request({HEADER: "caf\u00e9"}, "caf\u00e9", HEADER)

    def test_rejects_when_secret_unset(self):
        assert not verify_rebrandly_request({HEADER: SECRET}, "", HEADER)


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_credential(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_credential_first(self, method):
        assert send(method).status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send(headers={HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_empty_body(self):
        res = send("put", headers={HEADER: SECRET}, body="")
        assert res.status_code == 200
        assert res.json() == {"received": True, "clicks": 0}

    def test_loops_over_every_click(self):
        body = copy.deepcopy(CLICKSTREAM)
        body["data"] = body["data"] * 2
        res = send(headers={HEADER: SECRET}, body=json.dumps(body))
        assert res.json()["clicks"] == 2

    def test_invalid_json_returns_400(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_returns_400(self):
        assert send(headers={HEADER: SECRET}, body="[1]").status_code == 400

    def test_data_not_array_returns_400(self):
        assert send(headers={HEADER: SECRET}, body='{"data": "x"}').status_code == 400
