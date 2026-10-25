# Generated with: act-on-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"act-on-test-signing-key-0123456").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-signing-key-012345678").decode()

os.environ["ACT_ON_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, classify_payload  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Svix (which delivers Act-On's webhooks)."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/act-on", content=raw_body, headers=headers)


# Payloads follow the examples in Act-On's "Outgoing Webhook Event Types" page.
CONTACT_ADDED = {
    "contact": {"E-mail Address": "johndoe@example.com", "First Name": "John", "Company": "Act-On"},
    "contactReportLink": "https://example.actonsoftware.com/acton/ng-ui/contact?email=johndoe@example.com",
    "email": "johndoe@example.com",
    "timestamp": 1689343863,
}
HARD_BOUNCE = {
    "bounceDiagnostic": "User upload",
    "categoryReason": "User",
    "email": "contact@test.com",
    "isHardBounce": True,
    "msgId": "s-002e-2303",
    "timestamp": 1689559644,
}
SOFT_BOUNCE = {"email": "contact@test.com", "isHardBounce": True}
SPAM = {"email": "contact@test.com", "msgId": "s-002e-2303", "recId": "l-0001:14", "srcId": "l-0001", "timestamp": 1689343863}
OPT_OUT = {"email": "contact@test.com", "hasOptedOut": True, "timestamp": 1689559644}
OPT_IN = {"email": "contact@test.com", "hasOptedOut": False, "timestamp": 1689559644}
FORM_SUBMITTED = {
    "contact": {"email": "johndoe@example.com", "firstName": "John", "lastName": "Doe"},
    "cookieId": "0076d7",
    "formId": "e23a97da-3346-4c32-9bc9-15ab0dc9ca8a",
    "formName": "Form name",
    "referrer": "referrer example",
    "submissionTime": 1234567890,
}
PROGRAM_STARTED = {"name": "Program Name Example", "entryType": "Manual", "startedTime": 1686597624671, "waitingCount": 0}
PROGRAM_STOPPED = {"name": "Program Name Example", "entryType": "Manual", "stoppedTime": 1686597624671, "waitingCount": 0}
CATEGORY_OPT_IN = {
    "categoryChecked": True,
    "categoryDescription": "News about our best offers",
    "categoryId": "1",
    "categoryName": "Discounts",
    "email": "contact@test.com",
    "timestamp": 1689343863,
}
CATEGORY_OPT_OUT = {**CATEGORY_OPT_IN, "categoryChecked": False}
CATEGORY_CHANGED = {"checked": True, "description": "News about our best offers", "id": "1", "name": "Discounts", "timestamp": 1689343863}
CRM_CONNECTED = {"crmDisplayName": "Salesforce", "detail": "Successful connection", "timestamp": 1689343863}
LEAD_SCORE = {
    "contactReportLink": "https://example.actonsoftware.com/acton/ng-ui/contact?recid=l-unified-contacts:1b",
    "email": "johndoe@example.com",
    "fields": {"firstName": "John"},
    "leadScore": 150,
    "scoresheetId": "ss-default",
}
EMAIL_SCHEDULED = {"accountId": "4", "messageId": "s-002e-2303", "scheduledTimestamp": "1694004008962", "subject": "subject", "title": "Title", "numTargetedRecipients": "2"}

CASES = [
    ("contact added or updated", CONTACT_ADDED, ["contact.added", "contact.updated"], "Contact added or updated: johndoe@example.com"),
    ("hard bounce", HARD_BOUNCE, ["contact-bounce.hard"], "Hard bounce: contact@test.com"),
    ("soft bounce", SOFT_BOUNCE, ["contact-bounce.soft"], "Soft bounce: contact@test.com"),
    ("spam complaint", SPAM, ["contact-email.marked-as-spam"], "Spam complaint: contact@test.com"),
    ("global opt-out", OPT_OUT, ["contact-opt.global-opt-out"], "Global opt-out: contact@test.com"),
    ("global opt-in", OPT_IN, ["contact-opt.global-opt-in"], "Global opt-in: contact@test.com"),
    ("form submitted", FORM_SUBMITTED, ["form.submitted"], "Form submitted: Form name"),
    ("program started", PROGRAM_STARTED, ["automated-program.started"], "Automated Program started: Program Name Example"),
    ("program stopped", PROGRAM_STOPPED, ["automated-program.stopped"], "Automated Program stopped: Program Name Example"),
    ("category opt-in", CATEGORY_OPT_IN, ["subscription-category.opt-in"], "subscription-category.opt-in: contact@test.com"),
    ("category opt-out", CATEGORY_OPT_OUT, ["subscription-category.opt-out"], "subscription-category.opt-out: contact@test.com"),
    (
        "category changed",
        CATEGORY_CHANGED,
        ["subscription-category.added", "subscription-category.deleted", "subscription-category.updated"],
        "Subscription category changed: Discounts",
    ),
    ("crm connection", CRM_CONNECTED, ["crm.connected", "crm.disconnected"], "CRM connection event: Salesforce"),
    ("lead score", LEAD_SCORE, ["contact-lead-score.upper-threshold-surpassed"], "Lead score 150 passed the threshold"),
    ("email scheduled", EMAIL_SCHEDULED, ["email-message.scheduled"], 'Email scheduled: "Title"'),
]


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("ACT_ON_WEBHOOK_SECRET", SECRET)


@pytest.mark.parametrize("name,payload,expected,_logged", CASES, ids=[c[0] for c in CASES])
def test_classify_payload(name, payload, expected, _logged):
    assert classify_payload(payload) == expected


def test_classify_payload_unknown_shape():
    assert classify_payload({"something": "else"}) == []
    assert classify_payload(None) == []


@pytest.mark.parametrize("name,payload,_expected,logged", CASES, ids=[c[0] for c in CASES])
def test_accepts_validly_signed_payload(name, payload, _expected, logged, caplog):
    raw = json.dumps(payload)
    with caplog.at_level(logging.INFO, logger="act-on-webhooks"):
        res = post(raw, signed_headers(raw))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert logged in caplog.text


def test_accepts_any_content_type():
    raw = json.dumps(CONTACT_ADDED)
    assert post(raw, signed_headers(raw, content_type="text/plain")).status_code == 200


def test_accepts_secret_without_whsec_prefix(monkeypatch):
    bare = SECRET.removeprefix("whsec_")
    monkeypatch.setenv("ACT_ON_WEBHOOK_SECRET", bare)
    raw = json.dumps(OPT_OUT)
    assert post(raw, signed_headers(raw, secret=bare)).status_code == 200


def test_accepts_when_one_of_several_signatures_is_valid():
    raw = json.dumps(CONTACT_ADDED)
    msg_id, ts = "msg_multi", str(now())
    signature = "v1," + base64.b64encode(b"not-a-real-signature").decode() + " " + sign(raw, msg_id, ts)
    assert post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature)).status_code == 200


def test_accepts_webhook_prefixed_headers():
    raw = json.dumps(CONTACT_ADDED)
    headers = {name.replace("svix-", "webhook-"): value for name, value in signed_headers(raw).items()}
    res = post(raw, headers)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_acknowledges_redelivery_without_handling_it_twice():
    raw = json.dumps(SPAM)
    headers = signed_headers(raw)
    first = post(raw, headers)
    second = post(raw, headers)
    assert first.json() == {"received": True}
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


def test_rejects_tampered_body():
    raw = json.dumps(CONTACT_ADDED)
    headers = signed_headers(raw)
    assert post(raw.replace("John", "Jane"), headers).status_code == 400


def test_rejects_signature_from_another_secret():
    raw = json.dumps(CONTACT_ADDED)
    assert post(raw, signed_headers(raw, secret=OTHER_SECRET)).status_code == 400


def test_rejects_timestamp_older_than_five_minutes():
    raw = json.dumps(CONTACT_ADDED)
    assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400


def test_rejects_timestamp_more_than_five_minutes_in_the_future():
    raw = json.dumps(CONTACT_ADDED)
    assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400


@pytest.mark.parametrize("header", ["svix-id", "svix-timestamp", "svix-signature"])
def test_rejects_missing_header(header):
    raw = json.dumps(CONTACT_ADDED)
    headers = signed_headers(raw)
    del headers[header]
    res = post(raw, headers)
    assert res.status_code == 400
    assert "Missing" in res.json()["detail"]


def test_fails_closed_when_no_secret_is_configured(monkeypatch):
    monkeypatch.delenv("ACT_ON_WEBHOOK_SECRET")
    raw = json.dumps(CONTACT_ADDED)
    assert post(raw, signed_headers(raw)).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
