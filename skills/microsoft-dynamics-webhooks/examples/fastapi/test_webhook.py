import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Dataverse does not sign webhooks. The "secret" is a random value YOU register
# under the HttpHeader authentication option; tests send it the same way.
SECRET = "3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e"
os.environ["DYNAMICS_WEBHOOK_SECRET"] = SECRET
os.environ.pop("DYNAMICS_WEBHOOK_HEADER", None)

from main import (  # noqa: E402
    CREATE,
    DELETE,
    UPDATE,
    app,
    dedupe_key,
    dispatch,
    flatten_attributes,
    get_target,
    verify_dynamics_secret,
)

client = TestClient(app)
PATH = "/webhooks/microsoft-dynamics"
CONTACT_ID = "6d81597f-0f9f-e711-8122-000d3aa2331c"


@pytest.fixture(autouse=True)
def _reset_env():
    os.environ["DYNAMICS_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DYNAMICS_WEBHOOK_HEADER", None)
    yield
    os.environ["DYNAMICS_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DYNAMICS_WEBHOOK_HEADER", None)


def context(message_name, **overrides):
    """A trimmed RemoteExecutionContext, shaped like the example in Microsoft's docs."""
    body = {
        "MessageName": message_name,
        "PrimaryEntityName": "contact",
        "PrimaryEntityId": CONTACT_ID,
        "OperationId": "4af10637-4ea2-e711-8122-000d3aa2331c",
        "OrganizationName": "OrgName",
        "Stage": 40,
        "Mode": 1,
        "InputParameters": [
            {
                "key": "Target",
                "value": {
                    "__type": "Entity:http://schemas.microsoft.com/xrm/2011/Contracts",
                    "Id": CONTACT_ID,
                    "LogicalName": "contact",
                    "Attributes": [
                        {"key": "firstname", "value": "James"},
                        {"key": "fullname", "value": "James Glynn (sample)"},
                    ],
                },
            }
        ],
        "OwningExtension": {
            "Id": "75417616-4ea2-e711-8122-000d3aa2331c",
            "LogicalName": "sdkmessageprocessingstep",
        },
    }
    body.update(overrides)
    return body


def send(body, header="X-Webhook-Secret", secret=SECRET, content_type="application/json", extra=None):
    headers = {"Content-Type": content_type, **(extra or {})}
    if secret is not None:
        headers[header] = secret
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(PATH, content=data, headers=headers)


class TestVerifyDynamicsSecret:
    def test_accepts_matching_secret(self):
        assert verify_dynamics_secret(SECRET) is True

    def test_rejects_wrong_secret_same_length(self):
        assert verify_dynamics_secret("a" * len(SECRET)) is False

    def test_rejects_different_length_without_raising(self):
        assert verify_dynamics_secret("short") is False
        assert verify_dynamics_secret(SECRET + "x") is False

    def test_rejects_missing_header(self):
        assert verify_dynamics_secret(None) is False

    def test_raises_when_secret_not_configured(self):
        del os.environ["DYNAMICS_WEBHOOK_SECRET"]
        with pytest.raises(RuntimeError, match="not set"):
            verify_dynamics_secret(SECRET)


class TestContextHelpers:
    def test_flattens_key_value_attributes(self):
        attrs = flatten_attributes(get_target(context(UPDATE)))
        assert attrs == {"firstname": "James", "fullname": "James Glynn (sample)"}

    def test_no_target_when_input_parameters_removed(self):
        ctx = context(UPDATE)
        del ctx["InputParameters"]
        assert get_target(ctx) is None
        assert flatten_attributes(get_target(ctx)) == {}

    def test_dedupe_key_uses_operation_and_step_id(self):
        assert dedupe_key(context(CREATE)) == (
            "4af10637-4ea2-e711-8122-000d3aa2331c:75417616-4ea2-e711-8122-000d3aa2331c"
        )
        assert dedupe_key({"MessageName": CREATE}) is None


class TestWebhookEndpoint:
    @pytest.mark.parametrize("name", [CREATE, UPDATE, DELETE])
    def test_accepts_handled_events(self, name):
        res = send(context(name))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_acknowledges_unknown_message(self):
        assert send(context("Assign")).status_code == 200

    def test_accepts_payload_with_input_parameters_removed(self):
        ctx = context(UPDATE)
        del ctx["InputParameters"]
        res = send(ctx, extra={"x-ms-dynamics-msg-size-exceeded": "true"})
        assert res.status_code == 200

    def test_header_name_is_case_insensitive(self):
        assert send(context(CREATE), header="x-webhook-secret").status_code == 200

    def test_honours_dynamics_webhook_header(self):
        os.environ["DYNAMICS_WEBHOOK_HEADER"] = "X-Dynamics-Key"
        assert send(context(CREATE), header="X-Dynamics-Key").status_code == 200
        assert send(context(CREATE)).status_code == 401

    def test_accepts_non_json_content_type(self):
        assert send(context(CREATE), content_type="text/plain").status_code == 200

    def test_rejects_missing_secret_with_401(self):
        assert send(context(CREATE), secret=None).status_code == 401

    def test_rejects_wrong_secret_with_401(self):
        assert send(context(CREATE), secret="wrong").status_code == 401

    def test_checks_secret_before_parsing_body(self):
        assert send("not json", secret="wrong").status_code == 401

    def test_returns_500_when_secret_not_configured(self):
        del os.environ["DYNAMICS_WEBHOOK_SECRET"]
        assert send(context(CREATE)).status_code == 500

    def test_rejects_invalid_json_with_400(self):
        assert send("{not json").status_code == 400

    def test_rejects_missing_message_name_with_400(self):
        assert send({"PrimaryEntityName": "contact"}).status_code == 400

    def test_tolerates_malformed_input_parameters(self):
        assert send(context(CREATE, InputParameters="broken")).status_code == 200


class TestDispatch:
    def test_returns_true_for_handled_and_false_otherwise(self):
        assert asyncio.run(dispatch(context(CREATE))) is True
        assert asyncio.run(dispatch(context(UPDATE))) is True
        assert asyncio.run(dispatch(context(DELETE))) is True
        assert asyncio.run(dispatch(context("Assign"))) is False


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
