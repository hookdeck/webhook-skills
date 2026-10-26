import hashlib
import hmac
import itertools
import json
import os

# The secret_key entered in Wistia is used as-is (UTF-8 bytes)
SECRET = "wistia_test_secret_key"
os.environ["WISTIA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_wistia_signature  # noqa: E402

client = TestClient(app)
counter = itertools.count()

MEDIA = {
    "duration": 40.207,
    "id": "vpe2p82q64",
    "name": "Lenny Delivers Video!",
    "thumbnail": {
        "url": "https://embed-ssl.wistia.com/deliveries/e96ea382701bc172657d90bf269211beddbf6f7f.jpg?image_crop_resized=200x120"
    },
    "url": "https://harper.wistia.com/medias/vpe2p82q64",
}


def sign(raw_body: bytes, secret: str = SECRET) -> str:
    """Wistia's real algorithm: lowercase hex HMAC-SHA256 of the raw POST body."""
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def delivery(*events: dict) -> bytes:
    return json.dumps(
        {
            "hook": {"uuid": "a4ab9eb6-ab82-4dae-86f2-29f744f7d031"},
            "events": [
                {
                    "uuid": f"evt-{next(counter)}",
                    "metadata": {"account_id": "0sxav1wj8o"},
                    "generated_at": "2024-03-31T21:56:45Z",
                    **e,
                }
                for e in events
            ],
        }
    ).encode()


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/wistia",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


def test_accepts_media_ready_with_valid_signature(capsys):
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    res = post(body, {"X-Wistia-Signature": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Media ready: vpe2p82q64" in capsys.readouterr().out


def test_accepts_uppercase_hex_signature():
    body = delivery({"type": "media.created", "payload": {"media": MEDIA}})
    assert post(body, {"X-Wistia-Signature": sign(body).upper()}).status_code == 200


def test_handles_every_event_in_a_batched_delivery(capsys):
    body = delivery(
        {"type": "media.created", "payload": {"media": MEDIA}},
        {"type": "viewing_session.play", "payload": {"visitor": {"id": "v1"}, "viewing_session": {"id": "s1"}, "media": MEDIA}},
        {"type": "viewing_session.percent_watched", "payload": {"percent_watched": 25, "viewing_session": {"id": "s1"}, "media": MEDIA}},
    )
    assert post(body, {"X-Wistia-Signature": sign(body)}).status_code == 200
    out = capsys.readouterr().out
    assert "Media created: vpe2p82q64" in out
    assert "Play: s1 vpe2p82q64" in out
    assert "Percent watched: 25 vpe2p82q64" in out


def test_handles_live_event_registration(capsys):
    body = delivery(
        {"type": "live_event.registration", "payload": {"live_event": {"id": "abc123xyz"}, "registration": {"fields": {"email": "lenny@wistia.com"}}}}
    )
    assert post(body, {"X-Wistia-Signature": sign(body)}).status_code == 200
    assert "Live event registration: abc123xyz" in capsys.readouterr().out


def test_ignores_redelivered_event_uuid(capsys):
    body = json.dumps(
        {
            "hook": {"uuid": "h"},
            "events": [{"uuid": "dup-1", "type": "media.deleted", "payload": {"media": {"id": "f5diqltruh"}}, "generated_at": "2024-03-30T15:57:05Z"}],
        }
    ).encode()
    headers = {"X-Wistia-Signature": sign(body)}
    assert post(body, headers).status_code == 200
    assert post(body, headers).status_code == 200
    assert capsys.readouterr().out.count("Media deleted: f5diqltruh") == 1


def test_accepts_unknown_event_types():
    body = delivery({"type": "media.something_new", "payload": {}})
    assert post(body, {"X-Wistia-Signature": sign(body)}).status_code == 200


def test_verifies_body_for_any_content_type():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    res = post(body, {"X-Wistia-Signature": sign(body)}, content_type="text/plain")
    assert res.status_code == 200


def test_verifies_exact_bytes_not_decoded_string():
    raw = b'{"hook":{"uuid":"h"},"events":[],"note":"caf\xc3\xa9"}'
    assert post(raw, {"X-Wistia-Signature": sign(raw)}).status_code == 200
    # Not valid UTF-8, but a correct signature over the bytes must still verify
    assert verify_wistia_signature(b"\x7b\xff\xfe\x7d", sign(b"\x7b\xff\xfe\x7d"), SECRET) is True


def test_rejects_missing_signature_header():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    assert post(body).status_code == 401


def test_rejects_empty_signature_header():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    assert post(body, {"X-Wistia-Signature": ""}).status_code == 401


def test_rejects_wrong_secret():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    assert post(body, {"X-Wistia-Signature": sign(body, "other_secret")}).status_code == 401


def test_rejects_tampered_body():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    signature = sign(body)
    tampered = body.replace(b"vpe2p82q64", b"zzzzzzzzzz")
    assert post(tampered, {"X-Wistia-Signature": signature}).status_code == 401


def test_rejects_malformed_signatures():
    body = delivery({"type": "media.ready", "payload": {"media": MEDIA}})
    good = sign(body)
    for bad in (f"sha256={good}", good[:62], good + "00", "z" * 64):
        assert post(body, {"X-Wistia-Signature": bad}).status_code == 401


def test_returns_400_for_signed_non_json_body():
    body = b"not json"
    assert post(body, {"X-Wistia-Signature": sign(body)}).status_code == 400


def test_returns_400_for_signed_body_without_events():
    body = json.dumps({"hook": {"uuid": "h"}}).encode()
    assert post(body, {"X-Wistia-Signature": sign(body)}).status_code == 400


def test_fails_when_no_secret_configured():
    assert verify_wistia_signature(b"{}", sign(b"{}"), "") is False
