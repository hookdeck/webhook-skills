import hashlib
import hmac
import json
import os

SECRET = "agentset_test_secret_0123456789"

# Set test environment variables before importing the app
os.environ["AGENTSET_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_agentset_signature

client = TestClient(app)

# Payloads follow Agentset's documented examples.
DOCUMENT_READY = {
    "id": "evt_pqr678stu901",
    "event": "document.ready",
    "createdAt": "2024-08-26T16:50:00.000Z",
    "data": {
        "id": "doc_k8f2m9x3n4p1",
        "name": "product-guide.pdf",
        "namespaceId": "ns_j7h3k9m2n5p8",
        "organizationId": "org_x9y8z7w6v5u4",
        "status": "READY",
        "source": {"type": "FILE", "fileUrl": "https://example.com/sample.pdf"},
        "totalCharacters": 45230,
        "totalChunks": 32,
        "totalPages": 15,
        "error": None,
        "createdAt": "2024-08-26T16:41:52.084Z",
        "updatedAt": "2024-08-26T16:50:00.000Z",
    },
}

DOCUMENT_ERROR = {
    "id": "evt_mno345pqr678",
    "event": "document.error",
    "createdAt": "2024-08-26T16:45:00.000Z",
    "data": {
        "id": "doc_r5t6u7v8w9x0",
        "name": "corrupted-file.pdf",
        "namespaceId": "ns_j7h3k9m2n5p8",
        "organizationId": "org_x9y8z7w6v5u4",
        "status": "FAILED",
        "source": {"type": "FILE", "fileUrl": "https://example.com/sample.pdf"},
        "error": "Failed to parse PDF: file appears to be corrupted",
    },
}

INGEST_JOB_QUEUED = {
    "id": "evt_aaa111bbb222",
    "event": "ingest_job.queued",
    "createdAt": "2024-08-26T20:00:00.000Z",
    "data": {
        "id": "job_q1w2e3r4t5y6",
        "name": "Website crawl - docs.example.com",
        "namespaceId": "ns_j7h3k9m2n5p8",
        "organizationId": "org_x9y8z7w6v5u4",
        "status": "QUEUED",
        "error": None,
    },
}


def sign(body, secret=SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


_UNSET = object()


def send(method="POST", body=_UNSET, signature=_UNSET, content_type="application/json"):
    if body is _UNSET:
        body = json.dumps(DOCUMENT_READY)
    headers = {}
    if signature is _UNSET:
        signature = sign(body if body is not None else "")
    if signature is not None:
        headers["agentset-signature"] = signature
    if body is None:
        return client.request(method, "/webhooks/agentset", headers=headers)
    headers["Content-Type"] = content_type
    return client.request(method, "/webhooks/agentset", content=body, headers=headers)


class TestSignatureVerification:
    def test_valid_signature(self):
        res = send()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_uppercase_hex_signature(self):
        body = json.dumps(DOCUMENT_READY)
        assert send(body=body, signature=sign(body).upper()).status_code == 200

    def test_missing_signature(self):
        assert send(signature=None).status_code == 401

    def test_empty_signature(self):
        assert send(signature="").status_code == 401

    def test_wrong_signature_of_right_shape(self):
        assert send(signature="a" * 64).status_code == 401

    def test_other_secret(self):
        body = json.dumps(DOCUMENT_READY)
        assert send(body=body, signature=sign(body, "other")).status_code == 401

    def test_sha256_prefix_rejected(self):
        body = json.dumps(DOCUMENT_READY)
        assert send(body=body, signature="sha256=" + sign(body)).status_code == 401

    @pytest.mark.parametrize(
        "mutate",
        [
            lambda s: s[:63],
            lambda s: s + "0",
            lambda s: s[:63] + "z",
            lambda s: f'"{s}"',
            lambda s: s + "\n",
        ],
        ids=["too-short", "too-long", "non-hex", "quoted", "trailing-newline"],
    )
    def test_malformed_signature(self, mutate):
        body = json.dumps(DOCUMENT_READY)
        assert send(body=body, signature=mutate(sign(body))).status_code == 401

    def test_tampered_body(self):
        signature = sign(json.dumps(DOCUMENT_READY))
        tampered = json.dumps({**DOCUMENT_READY, "event": "document.deleted"})
        assert send(body=tampered, signature=signature).status_code == 401

    def test_exact_bytes_not_reserialized(self):
        spaced = json.dumps(DOCUMENT_READY, indent=2)
        assert send(body=spaced).status_code == 200
        assert send(body=spaced, signature=sign(json.dumps(DOCUMENT_READY))).status_code == 401

    def test_no_timestamp_needed(self):
        assert send().status_code == 200

    def test_unconfigured_secret_rejects_everything(self):
        body = b"{}"
        assert verify_agentset_signature(body, sign(body), "") is False
        assert verify_agentset_signature(body, None, SECRET) is False
        assert verify_agentset_signature(body, sign(body), SECRET) is True

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/agentset",
            content=b"{}",
            headers={"agentset-signature": "é".encode("latin-1"), "Content-Type": "application/json"},
        )
        assert res.status_code == 401


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_signed_methods(self, method):
        assert send(method).status_code == 200

    def test_get_without_body_verified_over_zero_bytes(self):
        res = send("GET", body=None, signature=sign(b""))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_without_body_bad_signature(self):
        assert send("GET", body=None, signature="a" * 64).status_code == 401

    def test_verifies_before_looking_at_body(self):
        assert send("DELETE", signature=None).status_code == 401

    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream"])
    def test_any_content_type(self, content_type):
        assert send(content_type=content_type).status_code == 200

    def test_signed_non_json_is_400(self):
        assert send(body="not json").status_code == 400

    @pytest.mark.parametrize("body", ["[]", '"text"', "42", "null"])
    def test_signed_non_object_is_400(self, body):
        assert send(body=body).status_code == 400


class TestEventHandling:
    @pytest.mark.parametrize(
        "payload,expected",
        [
            (DOCUMENT_READY, "Document ready: doc_k8f2m9x3n4p1"),
            (DOCUMENT_ERROR, "Document failed: doc_r5t6u7v8w9x0"),
            ({**DOCUMENT_READY, "event": "document.deleted"}, "Document deleted: doc_k8f2m9x3n4p1"),
            ({**INGEST_JOB_QUEUED, "event": "ingest_job.ready"}, "Ingest job ready: job_q1w2e3r4t5y6"),
            ({**INGEST_JOB_QUEUED, "event": "ingest_job.error"}, "Ingest job failed: job_q1w2e3r4t5y6"),
        ],
    )
    def test_handled_events(self, payload, expected, capsys):
        assert send(body=json.dumps(payload)).status_code == 200
        assert expected in capsys.readouterr().out

    def test_unhandled_event_is_logged(self, capsys):
        assert send(body=json.dumps(INGEST_JOB_QUEUED)).status_code == 200
        assert "Unhandled event: ingest_job.queued" in capsys.readouterr().out

    @pytest.mark.parametrize(
        "payload",
        [
            {"event": "document.ready", "data": "oops"},
            {"event": "document.error", "data": [1, 2]},
            {"event": "ingest_job.error", "data": None},
            {"event": 5, "data": {}},
            {"event": "document.ready", "data": {"id": 7, "name": {}, "error": []}},
            {"data": {}},
        ],
    )
    def test_wrong_typed_fields_do_not_500(self, payload):
        assert send(body=json.dumps(payload)).status_code == 200
