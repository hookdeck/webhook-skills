import base64
import hashlib
import hmac
import json
import os

import msgpack
import pytest
from fastapi.testclient import TestClient

# Ably API keys look like appId.keyId:keyValue. Only keyValue is the HMAC key.
KEY_ID = "aBCdEf.gHiJkL"
KEY_VALUE = "mNoPqRsTuVwXyZ0123456789abcdefABCDEFghijkl"
API_KEY = f"{KEY_ID}:{KEY_VALUE}"
os.environ["ABLY_API_KEY"] = API_KEY

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, key_value: str = KEY_VALUE) -> str:
    """Ably: base64 HMAC-SHA256 of the raw body bytes, keyed with keyValue."""
    return base64.b64encode(hmac.new(key_value.encode(), body, hashlib.sha256).digest()).decode()


def post(body, content_type="application/json", signature="auto", key=KEY_ID, extra=None):
    if isinstance(body, str):
        body = body.encode()
    headers = {"Content-Type": content_type, **(extra or {})}
    sig = sign(body) if signature == "auto" else signature
    if sig:
        headers["X-Ably-Signature"] = sig
    if key:
        headers["X-Ably-Key"] = key
    return client.post("/webhooks/ably", content=body, headers=headers)


def envelope(source, **extra):
    return {"source": source, "appId": "aBCdEf", "channel": "my-channel",
            "site": "eu-central-1-A", "ruleId": "1-a2Bc", **extra}


def test_enveloped_message(capsys):
    body = json.dumps(envelope("channel.message", messages=[
        {"id": "A:1:0", "clientId": "user-3", "name": "greeting", "data": "hi"}]))
    res = post(body)
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert 'Message "greeting" on my-channel from user-3' in capsys.readouterr().out


def test_presence_decodes_numeric_action(capsys):
    body = json.dumps(envelope("channel.presence", presence=[
        {"id": "A:1:0", "clientId": "bob", "action": 4}]))
    assert post(body).status_code == 200
    assert "Presence update: bob on my-channel" in capsys.readouterr().out


def test_batched_lifecycle(capsys):
    body = json.dumps({"items": [{
        "webhookId": "ABcDEf", "source": "channel.lifecycle", "name": "channel.opened",
        "data": {"channelId": "my-channel-5", "status": {"isActive": True}}}]})
    assert post(body).status_code == 200
    assert "Channel lifecycle channel.opened on my-channel-5" in capsys.readouterr().out


def test_batch_processes_every_item(capsys):
    body = json.dumps({"items": [
        {"source": "channel.message", "name": "channel.message",
         "data": {"channelId": "c1", "messages": [{"name": "a", "clientId": "x"}]}},
        {"source": "channel.occupancy", "name": "channel.occupancy", "data": {"channelId": "c2"}},
    ]})
    assert post(body).status_code == 200
    out = capsys.readouterr().out
    assert 'Message "a" on c1 from x' in out
    assert "Occupancy changed on c2" in out


def test_occupancy(capsys):
    assert post(json.dumps(envelope("channel.occupancy"))).status_code == 200
    assert "Occupancy changed on my-channel" in capsys.readouterr().out


def test_msgpack_signed_as_raw_bytes(capsys):
    body = msgpack.packb(envelope("channel.message", messages=[{"name": "packed", "clientId": "u"}]))
    res = post(body, content_type="application/x-msgpack")
    assert res.status_code == 200
    assert 'Message "packed" on my-channel from u' in capsys.readouterr().out


def test_non_enveloped_any_content_type(capsys):
    res = post("plain text payload", content_type="text/plain", extra={
        "X-Ably-Envelope-Source": "channel.message",
        "X-Ably-Envelope-Channel": "my_channel",
        "X-Ably-Message-Name": "publish",
    })
    assert res.status_code == 200
    assert 'Message "publish" on my_channel' in capsys.readouterr().out


def test_rejects_signature_made_with_whole_api_key():
    body = json.dumps(envelope("channel.message"))
    assert post(body, signature=sign(body.encode(), API_KEY)).status_code == 400


def test_rejects_invalid_signature():
    res = post(json.dumps(envelope("channel.message")), signature="aW52YWxpZA==")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_tampered_body():
    body = json.dumps(envelope("channel.message", messages=[{"name": "a"}]))
    res = post(body.replace('"a"', '"b"'), signature=sign(body.encode()))
    assert res.status_code == 400


def test_rejects_missing_signature():
    res = post(json.dumps(envelope("channel.message")), signature="")
    assert res.status_code == 400
    assert "Missing X-Ably-Signature" in res.json()["detail"]


def test_rejects_different_key():
    assert post(json.dumps(envelope("channel.message")), key="aBCdEf.other").status_code == 400


def test_rejects_unparseable_signed_body():
    res = post("not json")
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid payload"
