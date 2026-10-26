import base64
import json
import os

# Set test environment variables before importing the app
os.environ["AWS_EVENTBRIDGE_WEBHOOK_USERNAME"] = "eventbridge-user"
os.environ["AWS_EVENTBRIDGE_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_aws_eventbridge_request

client = TestClient(app)

USER = os.environ["AWS_EVENTBRIDGE_WEBHOOK_USERNAME"]
PASS = os.environ["AWS_EVENTBRIDGE_WEBHOOK_PASSWORD"]


def basic(user=USER, password=PASS, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


EC2_EVENT = {
    "version": "0",
    "id": "7bf73129-1428-4cd3-a780-95db273d1602",
    "detail-type": "EC2 Instance State-change Notification",
    "source": "aws.ec2",
    "account": "123456789012",
    "time": "2019-10-02T17:40:17Z",
    "region": "us-east-1",
    "resources": ["arn:aws:ec2:us-east-1:123456789012:instance/i-abcd1111"],
    "detail": {"instance-id": "i-abcd1111", "state": "pending"},
}
S3_EVENT = {**EC2_EVENT, "detail-type": "Object Created", "source": "aws.s3",
            "detail": {"bucket": {"name": "my-bucket"}, "object": {"key": "a/b.txt"}}}
ORDER_EVENT = {**EC2_EVENT, "detail-type": "OrderCreated", "source": "com.example.orders",
               "detail": {"orderId": "1234"}}


def send(method, auth="default", body=None, content_type="application/json"):
    headers = {}
    if auth == "default":
        headers["Authorization"] = basic()
    elif auth:
        headers["Authorization"] = auth
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, "/webhooks/aws-eventbridge", content=body, headers=headers)


class TestBasicAuthentication:
    def test_accepts_correct_credentials(self):
        res = send("POST", body=json.dumps(EC2_EVENT))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme(self):
        assert send("POST", basic(scheme="basic"), json.dumps(EC2_EVENT)).status_code == 200

    def test_splits_on_first_colon_only(self):
        assert parse_basic_auth(basic("u", "a:b:c")) == ("u", "a:b:c")

    def test_accepts_non_ascii_credentials(self, monkeypatch):
        monkeypatch.setenv("AWS_EVENTBRIDGE_WEBHOOK_PASSWORD", "pässwörd-✓")
        assert send("POST", basic(USER, "pässwörd-✓"), "{}").status_code == 200

    def test_non_ascii_mismatch_is_401_not_500(self):
        assert send("POST", basic(USER, "pässwörd-✓"), "{}").status_code == 401

    def test_rejects_wrong_password(self):
        assert send("POST", basic(USER, "wrong"), "{}").status_code == 401

    def test_rejects_wrong_username(self):
        assert send("POST", basic("someone", PASS), "{}").status_code == 401

    def test_rejects_both_wrong_and_different_lengths(self):
        assert send("POST", basic("x", "y"), "{}").status_code == 401
        assert send("POST", basic("x" * 200, "y" * 200), "{}").status_code == 401

    def test_rejects_missing_header(self):
        assert send("POST", None, json.dumps(EC2_EVENT)).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert send("POST", f"Bearer {PASS}", "{}").status_code == 401

    def test_rejects_malformed_base64_and_missing_colon(self):
        assert send("POST", "Basic !!!not-base64!!!", "{}").status_code == 401
        no_colon = "Basic " + base64.b64encode(b"nocolon").decode()
        assert send("POST", no_colon, "{}").status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        headers = {"authorization": basic()}
        assert verify_aws_eventbridge_request(headers, "", "") is False
        assert verify_aws_eventbridge_request(headers, USER, "") is False

    def test_empty_get_without_credentials_is_401(self):
        assert send("GET", None).status_code == 401


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_methods_with_body(self, method):
        assert send(method, body=json.dumps(EC2_EVENT)).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_accepts_methods_with_empty_body(self, method):
        res = send(method)
        assert res.status_code == 200
        assert res.json() == {"received": True}


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert send("POST", body=json.dumps(EC2_EVENT), content_type="text/plain").status_code == 200

    def test_acknowledges_transformed_json(self, capsys):
        assert send("POST", body=json.dumps({"text": "hello"})).status_code == 200
        assert "transformed" in capsys.readouterr().out

    def test_acknowledges_transformed_text(self):
        assert send("POST", body="instance i-1 changed state", content_type="text/plain").status_code == 200

    def test_authenticates_before_parsing(self):
        assert send("POST", None, "{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", [EC2_EVENT, S3_EVENT, ORDER_EVENT],
                             ids=["ec2", "s3", "order"])
    def test_handles_event(self, event, capsys):
        assert send("POST", body=json.dumps(event)).status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self, capsys):
        event = {**EC2_EVENT, "source": "aws.other", "detail-type": "Something New"}
        assert send("POST", body=json.dumps(event)).status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
