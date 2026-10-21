# Generated with: drata-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Drata workflow webhook receiver.

Drata webhooks are the "Send webhook" step of a Drata workflow (Settings > Workflows).

1. There is no published signature or signing secret. Drata sends through Svix
   but does not document svix-* headers, so authenticate with a shared secret
   YOU add as a custom header (e.g. ``X-Webhook-Secret: <hex>``) and compare it
   in constant time.
2. The body is flat JSON: ``event_type`` (e.g. CONTROL_EVIDENCE_LINKED),
   ``timestamp``, ``organization_id``, ``workspace``, plus the control and
   trigger properties the admin selected in the step.
"""

import hmac
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("drata-webhooks")
logging.basicConfig(level=logging.INFO)

DEFAULT_HEADER = "X-Webhook-Secret"

# `event_type` values for control workflows, as listed in Drata's help center.
CONTROL_DETAILS_UPDATED = "CONTROL_DETAILS_UPDATED"
CONTROL_READINESS_CHANGED_TO_NOT_READY = "CONTROL_READINESS_CHANGED_TO_NOT_READY"
CONTROL_READINESS_CHANGED_TO_READY = "CONTROL_READINESS_CHANGED_TO_READY"
CONTROL_EVIDENCE_LINKED = "CONTROL_EVIDENCE_LINKED"
CONTROL_EVIDENCE_UNLINKED = "CONTROL_EVIDENCE_UNLINKED"
CONTROL_POLICY_LINKED = "CONTROL_POLICY_LINKED"
CONTROL_POLICY_UNLINKED = "CONTROL_POLICY_UNLINKED"
CONTROL_TEST_MAPPED = "CONTROL_TEST_MAPPED"
CONTROL_TEST_UNMAPPED = "CONTROL_TEST_UNMAPPED"
CONTROL_REQUIREMENT_MAPPED = "CONTROL_REQUIREMENT_MAPPED"
CONTROL_REQUIREMENT_UNMAPPED = "CONTROL_REQUIREMENT_UNMAPPED"
CONTROL_TEST_CHANGED_TO_PASS = "CONTROL_TEST_CHANGED_TO_PASS"
CONTROL_TEST_CHANGED_TO_FAIL = "CONTROL_TEST_CHANGED_TO_FAIL"
CONTROL_OWNER_UPDATED = "CONTROL_OWNER_UPDATED"
CONTROL_MARKED_IN_SCOPE = "CONTROL_MARKED_IN_SCOPE"
CONTROL_MARKED_OUT_OF_SCOPE = "CONTROL_MARKED_OUT_OF_SCOPE"

KNOWN_EVENTS = frozenset(
    {
        CONTROL_DETAILS_UPDATED,
        CONTROL_READINESS_CHANGED_TO_NOT_READY,
        CONTROL_READINESS_CHANGED_TO_READY,
        CONTROL_EVIDENCE_LINKED,
        CONTROL_EVIDENCE_UNLINKED,
        CONTROL_POLICY_LINKED,
        CONTROL_POLICY_UNLINKED,
        CONTROL_TEST_MAPPED,
        CONTROL_TEST_UNMAPPED,
        CONTROL_REQUIREMENT_MAPPED,
        CONTROL_REQUIREMENT_UNMAPPED,
        CONTROL_TEST_CHANGED_TO_PASS,
        CONTROL_TEST_CHANGED_TO_FAIL,
        CONTROL_OWNER_UPDATED,
        CONTROL_MARKED_IN_SCOPE,
        CONTROL_MARKED_OUT_OF_SCOPE,
    }
)

app = FastAPI()


def verify_drata_secret(header_value: str | None) -> bool:
    """Compare the shared secret from the custom header in constant time.

    Raises RuntimeError when DRATA_WEBHOOK_SECRET is unset (fail closed).
    """
    expected = os.environ.get("DRATA_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("DRATA_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


async def require_drata_secret(request: Request) -> None:
    """Dependency: check the shared-secret header before the body is read."""
    header_name = os.environ.get("DRATA_WEBHOOK_HEADER") or DEFAULT_HEADER
    try:
        # Starlette headers are case-insensitive.
        ok = verify_drata_secret(request.headers.get(header_name))
    except RuntimeError as err:
        logger.error("Drata webhook misconfigured: %s", err)
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not ok:
        logger.error("Drata webhook rejected: %s missing or wrong", header_name)
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


def dedupe_key(payload: dict[str, Any]) -> str | None:
    """Drata sends no delivery ID and retries failed steps, so dedupe on body fields."""
    control_id = payload.get("control_id")
    if not control_id:
        return None
    return f"{payload.get('event_type')}:{control_id}:{payload.get('timestamp') or ''}"


def _control_ref(payload: dict[str, Any]) -> Any:
    return payload.get("control_code") or payload.get("control_id") or "unknown"


async def handle_readiness_changed(payload: dict[str, Any]) -> None:
    logger.info("Control %s readiness: %s", _control_ref(payload), payload["event_type"])
    # TODO: open or close a ticket when a control becomes Not ready / Ready.


async def handle_evidence_changed(payload: dict[str, Any]) -> None:
    logger.info(
        "Control %s: %s (%s)",
        _control_ref(payload),
        payload["event_type"],
        payload.get("evidence_name", "unknown evidence"),
    )
    # TODO: sync evidence links into your system.


async def handle_test_result_changed(payload: dict[str, Any]) -> None:
    logger.info(
        "Control %s: %s (%s)",
        _control_ref(payload),
        payload["event_type"],
        payload.get("test_name", "unknown test"),
    )
    # TODO: alert the control owner when a mapped test starts failing.


async def handle_owner_updated(payload: dict[str, Any]) -> None:
    logger.info(
        "Control %s owner changed by %s", _control_ref(payload), payload.get("updated_by", "unknown")
    )
    # TODO: update ownership in your system.


async def handle_control_change(payload: dict[str, Any]) -> None:
    logger.info("Control %s: %s", _control_ref(payload), payload["event_type"])
    # TODO: handle details, policy, requirement and scope changes.


async def dispatch(payload: dict[str, Any]) -> bool:
    """Dispatch on `event_type`. Returns whether the event was recognised."""
    event = payload.get("event_type")
    if event in (CONTROL_READINESS_CHANGED_TO_NOT_READY, CONTROL_READINESS_CHANGED_TO_READY):
        await handle_readiness_changed(payload)
        return True
    if event in (CONTROL_EVIDENCE_LINKED, CONTROL_EVIDENCE_UNLINKED):
        await handle_evidence_changed(payload)
        return True
    if event in (CONTROL_TEST_CHANGED_TO_PASS, CONTROL_TEST_CHANGED_TO_FAIL):
        await handle_test_result_changed(payload)
        return True
    if event == CONTROL_OWNER_UPDATED:
        await handle_owner_updated(payload)
        return True
    if event in KNOWN_EVENTS:
        await handle_control_change(payload)
        return True
    # Risk, evidence and personnel workflows use other event_type values.
    # Acknowledge them so Drata doesn't retry.
    logger.warning("Unhandled Drata event: %s", event)
    return False


@app.post("/webhooks/drata", dependencies=[Depends(require_drata_secret)])
async def drata_webhook(request: Request):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict) or not isinstance(payload.get("event_type"), str):
        raise HTTPException(status_code=400, detail="Missing event_type field")

    logger.info("Drata webhook: event_type=%s key=%s", payload["event_type"], dedupe_key(payload))

    try:
        await dispatch(payload)
    except Exception as err:  # noqa: BLE001
        logger.error("Drata webhook processing failed: %s", err)
        # Non-2xx lets Drata retry the step (up to three times).
        raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
