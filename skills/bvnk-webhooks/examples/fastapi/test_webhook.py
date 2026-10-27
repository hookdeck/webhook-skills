import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# BVNK's published test vector (docs: "Validate webhooks"). The secret looks like base64 but is used
# as its UTF-8 string bytes.
SECRET = "JUL5QkQrpZYwW+Kf03QSrb70CG+ea/j8E/JfslENaXhd0AGBDbAtYYP2MdjkYDqiwjBtrtQXsUIbtAf7IGEGfg=="
VECTOR_BODY = "{\"event\":\"bvnk:ledger:report:ready\",\"eventId\":\"0198a8bb-7d56-79ef-92b2-2aed247c21b4\",\"timestamp\":\"2025-08-14T13:18:36.374620938Z\",\"data\":{\"id\":\"8d942264-e27e-44d9-a048-5ed66ac5129f\",\"url\":\"https://bvnk-staging-reports.s3.eu-west-1.amazonaws.com/transaction/8d942264-e27e-44d9-a048-5ed66ac5129f_7b2f87b9-1335-4b1e-bbeb-6a59ba1dc6df.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20250814T131836Z&X-Amz-SignedHeaders=host&X-Amz-Credential=AKIAZP6R7NJUFAGFGMNA%2F20250814%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Expires=604800&X-Amz-Signature=5c861e552b3e253be28f8e02c818b3c5e00269b9b50b6d4957d5281825d31a67\",\"type\":\"TRANSACTION\",\"status\":\"READY\"}}"
VECTOR_SIGNATURE = "VWEtiJu/7dLrq0ZtXS0HbGDPy6Re86oZeTnEEc9mlxg="
os.environ["BVNK_WEBHOOK_SECRET"] = SECRET

from main import app, verify_bvnk  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("BVNK_WEBHOOK_SECRET", SECRET)


def sign(body: str, secret: str = SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def event(name: str = "payment:v2:payin:status-change") -> str:
    return json.dumps(
        {
            "event": name,
            "eventId": "0198a8bb-7d56-79ef-92b2-2aed247c21b4",
            "timestamp": "2025-08-14T13:18:36.374620938Z",
            "data": {"id": "8d942264-e27e-44d9-a048-5ed66ac5129f", "status": "COMPLETE"},
        }
    )


def post(body: str, signature=None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-signature"] = signature
    return client.post("/webhooks/bvnk", content=body.encode("utf-8"), headers=headers)


class TestVerifyBvnk:
    def test_accepts_published_test_vector(self):
        assert verify_bvnk(VECTOR_BODY.encode("utf-8"), VECTOR_SIGNATURE, SECRET) is True

    def test_computes_published_signature(self):
        assert sign(VECTOR_BODY) == VECTOR_SIGNATURE

    def test_secret_is_not_base64_decoded(self):
        digest = hmac.new(base64.b64decode(SECRET), VECTOR_BODY.encode(), hashlib.sha256).digest()
        assert base64.b64encode(digest).decode() != VECTOR_SIGNATURE

    def test_rejects_non_canonical_base64(self):
        # The last character before "=" carries 2 unused bits: "h" decodes to the same bytes as "g"
        variant = VECTOR_SIGNATURE.replace("g=", "h=")
        assert base64.b64decode(variant, validate=True) == base64.b64decode(VECTOR_SIGNATURE, validate=True)
        assert verify_bvnk(VECTOR_BODY.encode(), variant, SECRET) is False

    @pytest.mark.parametrize(
        "value",
        [
            None,
            "",
            "abc=",
            VECTOR_SIGNATURE[:43],
            VECTOR_SIGNATURE.replace("/", "_"),
            VECTOR_SIGNATURE + " ",
            "sha256=" + VECTOR_SIGNATURE,
            VECTOR_SIGNATURE.replace("W", "\u00e9"),
        ],
    )
    def test_rejects_malformed_signature(self, value):
        assert verify_bvnk(VECTOR_BODY.encode(), value, SECRET) is False


class TestWebhookEndpoint:
    def test_accepts_published_test_vector(self):
        res = post(VECTOR_BODY, VECTOR_SIGNATURE)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_content_type(self):
        body = event()
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(event()).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(event(), "not-a-signature").status_code == 401

    def test_rejects_wrong_secret(self):
        body = event()
        assert post(body, sign(body, "another-secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(VECTOR_BODY.replace("READY", "FAILED"), VECTOR_SIGNATURE).status_code == 401

    def test_rejects_re_serialized_body(self):
        pretty = json.dumps(json.loads(VECTOR_BODY), indent=2)
        assert post(pretty, VECTOR_SIGNATURE).status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.setenv("BVNK_WEBHOOK_SECRET", "")
        assert post(VECTOR_BODY, VECTOR_SIGNATURE).status_code == 500

    def test_returns_400_for_signed_non_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    @pytest.mark.parametrize(
        "name",
        [
            "payment:v2:payin:status-change",
            "bvnk:payment:channel:created",
            "bvnk:payment:channel:transaction-confirmed",
            "bvnk:payment:channel:transaction-on-hold",
            "bvnk:payment:crypto:transaction-on-hold",
            "bvnk:ledger:report:ready",
            "platform:accounts:customer:created",
            "platform:accounts:customer:status-change",
            "bvnk:customers:status-change",
            "bvnk:something:else",
        ],
    )
    def test_handles_events(self, name):
        body = event(name)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
