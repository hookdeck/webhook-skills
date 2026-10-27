import hashlib
import hmac
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from main import app, verify_signature, get_event_names

vector = json.loads(Path(__file__).with_name("vector.json").read_text())
prefix = json.loads('"v1="')
timestamped = json.loads('false')
field = json.loads('"eventType"')
client = TestClient(app)


def sign(body, secret=vector["secret"], timestamp="1721856000"):
    raw = body if isinstance(body, bytes) else body.encode("utf-8")
    message = timestamp.encode() + b"." + raw if timestamped else raw
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}" if timestamped else (prefix or "") + digest


def send(body, signature="AUTO", content_type="application/json"):
    if signature == "AUTO":
        signature = sign(body)
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["x-preczn-signature"] = signature
    return client.post("/webhooks/preczn", content=body.encode() if isinstance(body, str) else body, headers=headers)


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.setenv("PRECZN_WEBHOOK_SECRET", vector["secret"])
    monkeypatch.setenv("PRECZN_WEBHOOK_TOLERANCE_SECONDS", "0")
    monkeypatch.setenv("UPPROMOTE_WEBHOOK_TOPIC", "transaction.approved")


def test_fixed_core_vector_and_event_routing(caplog):
    assert verify_signature(vector["body"].encode(), vector["signature"], vector["secret"])
    assert get_event_names(json.loads(vector["body"])) == vector["events"]
    with caplog.at_level("INFO"):
        assert send(vector["body"], vector["signature"]).status_code == 200
    assert vector["events"][0] in caplog.text


def test_raw_bytes_unicode_and_content_type():
    assert send(vector["body"], vector["signature"], "application/octet-stream").status_code == 200
    assert send(vector["body"] + " ", vector["signature"]).status_code == 401
    assert send(vector["body"], sign(vector["body"], "wrong-secret")).status_code == 401
    binary = bytes([255, 0, 195, 40])
    assert verify_signature(binary, sign(binary), vector["secret"])
    assert not verify_signature(binary.decode("utf-8", errors="replace").encode(), sign(binary), vector["secret"])


def test_missing_and_malformed_signatures():
    assert send(vector["body"], None).status_code == 401
    for value in ["", "abc", "g" * 64, "0" * 63, "0" * 65, vector["signature"] + "garbage"]:
        assert not verify_signature(vector["body"].encode(), value, vector["secret"])
    assert not verify_signature(vector["body"].encode(), sign(vector["body"]).split("=")[-1] + "\n", vector["secret"])


def test_uppercase_hex():
    signature = vector["signature"]
    digest = signature.split("=")[-1]
    assert send(vector["body"], signature.replace(digest, digest.upper())).status_code == 200


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("PRECZN_WEBHOOK_SECRET")
    assert send(vector["body"]).status_code == 500


def test_signed_invalid_json():
    assert send("{broken").status_code == 400
    assert send("{broken", vector["signature"]).status_code == 401


@pytest.mark.parametrize("payload", [None, [], 1, True, "text"])
def test_signed_non_object(payload):
    assert send(json.dumps(payload)).status_code == 400


def test_wrong_nested_types_and_unknown_events():
    for value in [None, [], 1, True, "unknown.event", {"type": None}, {"type": []}, {"toString": None}]:
        payload = json.loads(vector["body"])
        for key in ([field.split(".")[0]] if field else []) + ["event", "identification", "data", "resourceType"]:
            payload[key] = value
        assert send(json.dumps(payload)).status_code == 200
    assert send("{}").status_code == 200


@pytest.mark.skipif(prefix != "v1=" and not timestamped, reason="No versioned signature list")
def test_rotation_and_unknown_versions():
    body = vector["body"].encode()
    digest = vector["signature"].split("=")[-1]
    start = "t=1721856000, " if timestamped else ""
    assert verify_signature(body, start + "v1=" + "0" * 64 + ", v1=" + digest, vector["secret"])
    assert not verify_signature(body, start + "v0=" + digest, vector["secret"])
    assert verify_signature(body, start + "v1=bad, v1=" + digest, vector["secret"])


@pytest.mark.skipif(prefix not in ["v1=", "sha256="], reason="Not a prefixed body-only digest")
def test_core_bare_digest():
    assert verify_signature(vector["body"].encode(), vector["signature"].split("=")[-1], vector["secret"])


@pytest.mark.skipif(not timestamped, reason="No signed timestamp")
def test_timestamp_parsing():
    body = vector["body"].encode()
    assert verify_signature(body, sign(body, timestamp="001721856000"), vector["secret"])
    for header in ["v1=" + vector["signature"].split("=")[-1], "t=x," + vector["signature"], vector["signature"] + ",t=1721856000", sign(body, timestamp="invalid")]:
        assert not verify_signature(body, header, vector["secret"])


@pytest.mark.skipif(not timestamped, reason="No signed timestamp")
def test_optional_age_policy(monkeypatch):
    body = vector["body"].encode()
    assert verify_signature(body, vector["signature"], vector["secret"], 0)
    assert not verify_signature(body, vector["signature"], vector["secret"], 300)
    assert verify_signature(body, sign(body, timestamp=str(int(time.time()))), vector["secret"], 300)
    assert not verify_signature(body, sign(body, timestamp=str(int(time.time())+1000)), vector["secret"], 300)
    monkeypatch.setenv("PRECZN_WEBHOOK_TOLERANCE_SECONDS", "bad")
    assert send(vector["body"]).status_code == 500
