import base64
import hashlib
import json
import logging
import os
import time

import jwt
import pytest
from fastapi.testclient import TestClient

API_KEY = "APItestkey123"
# LiveKit API secrets are long random strings; keep the test one >= 32 bytes
API_SECRET = "test_livekit_api_secret_0123456789abcdefghij"
os.environ["LIVEKIT_API_KEY"] = API_KEY
os.environ["LIVEKIT_API_SECRET"] = API_SECRET

from main import app  # noqa: E402

client = TestClient(app)

_MISSING = object()


def now() -> int:
    return int(time.time())


def sha256_b64(body: bytes) -> str:
    return base64.b64encode(hashlib.sha256(body).digest()).decode()


def sign(body: bytes, key=API_KEY, secret=API_SECRET, alg="HS256", sha256=_MISSING, iat=None, ttl=300, omit_exp=False) -> str:
    """Mint a token the way LiveKit's sender does: HS256 with the API secret, iss = API key,
    nbf = now, exp = now + 5 minutes, and sha256 = base64(SHA-256(raw body))."""
    iat = now() if iat is None else iat
    claims = {"iss": key, "nbf": iat, "video": {}}
    if not omit_exp:
        claims["exp"] = iat + ttl
    if sha256 is _MISSING:
        claims["sha256"] = sha256_b64(body)
    elif sha256 is not None:
        claims["sha256"] = sha256
    return jwt.encode(claims, secret, algorithm=alg)


def payload(event: str, **extra) -> bytes:
    # protojson-style body: lowerCamelCase, int64 as strings, enums as names, defaults omitted
    return json.dumps({"event": event, "id": "EV_3xV9FhQm7kTa", "createdAt": str(now()), **extra}).encode()


ROOM = {"sid": "RM_hycBMAjmt6Ub", "name": "demo-room", "emptyTimeout": 300, "creationTime": "1700000000"}
PARTICIPANT = {"sid": "PA_39FqBjKZ2xyC", "identity": "alice", "name": "Alice", "state": "ACTIVE", "joinedAt": "1700000005"}
TRUNCATED = {"room": {"sid": ROOM["sid"], "name": ROOM["name"]}, "participant": {"sid": PARTICIPANT["sid"], "identity": "alice"}}
EVENTS = [
    ("room_started", {"room": ROOM}),
    ("room_finished", {"room": ROOM}),
    ("participant_joined", {"room": ROOM, "participant": PARTICIPANT}),
    ("participant_left", {"room": ROOM, "participant": {**PARTICIPANT, "state": "DISCONNECTED"}}),
    ("participant_connection_aborted", {"room": ROOM, "participant": PARTICIPANT}),
    ("track_published", {**TRUNCATED, "track": {"sid": "TR_AMkSJbBTnhXv", "type": "VIDEO", "source": "CAMERA"}}),
    ("track_unpublished", {**TRUNCATED, "track": {"sid": "TR_VC7ZnFsVsxZ9", "source": "MICROPHONE"}}),
    ("egress_started", {"egressInfo": {"egressId": "EG_hesu4g2G7Jm6", "roomName": "demo-room", "status": "EGRESS_ACTIVE"}}),
    ("egress_updated", {"egressInfo": {"egressId": "EG_hesu4g2G7Jm6", "roomName": "demo-room", "status": "EGRESS_ACTIVE"}}),
    ("egress_ended", {"egressInfo": {"egressId": "EG_hesu4g2G7Jm6", "roomName": "demo-room", "status": "EGRESS_COMPLETE"}}),
    ("ingress_started", {"ingressInfo": {"ingressId": "IN_Kx2vY3cXoGz7", "roomName": "demo-room"}}),
    ("ingress_ended", {"ingressInfo": {"ingressId": "IN_Kx2vY3cXoGz7", "roomName": "demo-room"}}),
    ("agent_job_pending", {"job": {"id": "AJ_5mGHkLz7rT2d"}}),
    ("agent_job_started", {"job": {"id": "AJ_5mGHkLz7rT2d"}}),
    ("agent_job_ended", {"job": {"id": "AJ_5mGHkLz7rT2d"}}),
]


def post(body: bytes, authorization=None):
    headers = {"Content-Type": "application/webhook+json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/livekit", content=body, headers=headers)


@pytest.fixture(autouse=True)
def restore_env():
    yield
    os.environ["LIVEKIT_API_KEY"] = API_KEY
    os.environ["LIVEKIT_API_SECRET"] = API_SECRET


@pytest.mark.parametrize("event,extra", EVENTS)
def test_accepts_signed_event(event, extra):
    body = payload(event, **extra)
    response = post(body, sign(body))
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_unknown_event_is_acknowledged():
    body = payload("some_future_event")
    assert post(body, sign(body)).status_code == 200


def test_numeric_created_at_is_accepted():
    body = json.dumps({"event": "room_started", "id": "EV_1", "createdAt": now(), "room": ROOM}).encode()
    assert post(body, sign(body)).status_code == 200


def test_num_dropped_logs_warning(caplog):
    body = payload("room_started", room=ROOM, numDropped=3)
    with caplog.at_level(logging.WARNING):
        assert post(body, sign(body)).status_code == 200
    assert "dropped 3" in caplog.text


def test_bearer_prefix_tolerated():
    body = payload("room_started", room=ROOM)
    assert post(body, f"Bearer {sign(body)}").status_code == 200


def test_expired_within_clock_tolerance_is_accepted():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, iat=now() - 305)).status_code == 200


def test_missing_authorization_is_401():
    assert post(payload("room_started", room=ROOM)).status_code == 401


def test_wrong_secret_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, secret="another_secret_0123456789abcdefghijklmn")).status_code == 401


def test_wrong_issuer_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, key="APIotherkey")).status_code == 401


def test_expired_token_is_401():
    # LiveKit tokens live 5 minutes: verify at receipt, not later
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, iat=now() - 600)).status_code == 401


def test_missing_exp_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, omit_exp=True)).status_code == 401


def test_missing_sha256_claim_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, sha256=None)).status_code == 401


def test_tampered_body_is_401():
    token = sign(payload("room_started", room=ROOM))
    assert post(payload("room_finished", room=ROOM), token).status_code == 401


def test_reserialised_body_is_401():
    original = b'{"event": "room_started", "id": "EV_1", "createdAt": "1700000000"}'
    reserialised = json.dumps(json.loads(original), separators=(",", ":")).encode()
    assert post(reserialised, sign(original)).status_code == 401


def test_hex_digest_claim_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, sha256=hashlib.sha256(body).hexdigest())).status_code == 401


# The minting side warns that the 44-byte test key is short for HS512; irrelevant here
@pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning")
def test_hs512_token_is_401():
    body = payload("room_started", room=ROOM)
    assert post(body, sign(body, alg="HS512")).status_code == 401


def test_alg_none_token_is_401():
    body = payload("room_started", room=ROOM)
    token = jwt.encode({"iss": API_KEY, "exp": now() + 300, "sha256": sha256_b64(body)}, None, algorithm="none")
    assert post(body, token).status_code == 401


def test_garbage_authorization_is_401():
    assert post(payload("room_started", room=ROOM), "not-a-jwt").status_code == 401


def test_unset_credentials_fail_closed():
    body = payload("room_started", room=ROOM)
    token = sign(body)
    os.environ.pop("LIVEKIT_API_SECRET")
    assert post(body, token).status_code == 401


def test_signed_invalid_json_is_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
