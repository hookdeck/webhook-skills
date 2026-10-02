# Generated with: pagerduty-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""PagerDuty V3 webhook receiver.

PAGERDUTY V3 WEBHOOK VERIFICATION

  header : X-PagerDuty-Signature   (REQUIRED -- always sent on V3 deliveries)
  value  : one or MORE comma-separated signatures, each `v1=<hex>`
  digest : HMAC-SHA256 over the RAW request body, lowercase hex (Base16)
  key    : the subscription's delivery_method.secret, returned ONCE in the
           POST /webhook_subscriptions response. Used AS-IS as UTF-8 bytes.
           NOT an API key / REST token, NOT an Events API routing key.

WHY MULTIPLE SIGNATURES: zero-downtime secret rotation. During a rotation the
same body is signed once per active secret and the digests are concatenated.
ACCEPT A MATCH AGAINST ANY `v1=` ENTRY -- comparing the whole header string, or
only the first entry, works until the day someone rotates the secret.

THERE IS NO TIMESTAMP AND NO NONCE in the signed content, so there is NO replay
window to check. Do NOT add a tolerance/stale-time check. Replay protection is
de-duplication on the X-Webhook-Id header.

THERE IS NO HANDSHAKE. No challenge, no echo, no confirmation POST -- the secret
arrives in the API response, not over the wire.

PagerDuty's Python client (pdpyras) is a REST API client and ships NO webhook
verifier; neither does @pagerduty/pdjs. The only official verifier is Go's
webhookv3/webhookv3.go, which this mirrors:
https://github.com/PagerDuty/go-pagerduty/blob/master/webhookv3/webhookv3.go

This covers V3 webhook subscriptions only. NOT V1/V2 webhook extensions (V1 is
EOL; V2 is end-of-support and is not signed with X-PagerDuty-Signature), and NOT
the PagerDuty Events API v1/v2, which is INBOUND to PagerDuty.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pagerduty-webhooks")

app = FastAPI(title="PagerDuty V3 Webhooks")

SIGNATURE_HEADER = "x-pagerduty-signature"  # Starlette headers are case-insensitive
SIGNATURE_PREFIX = "v1="  # the current and only signature version


def extract_v1_signatures(signature_header: Optional[str]) -> List[str]:
    """Extract the usable ``v1=`` digests from X-PagerDuty-Signature.

    PagerDuty's Step 1: split on ``,``, keep only version ``v1`` entries and
    strip the ``v1=`` prefix.

    Entries with another prefix are IGNORED rather than fatal -- that is how a
    future ``v2=`` rolls out without breaking this receiver.

    An EMPTY result means a MALFORMED HEADER (HTTP 400 in PagerDuty's Go
    client), which is a different condition from "no valid signatures"
    (HTTP 403). Both are 4xx, which PagerDuty treats as PERMANENT, so neither
    is retried -- which is what you want for a forged request.
    """
    if not signature_header:
        return []

    digests = []
    for entry in signature_header.split(","):
        # Strip defensively. PagerDuty sends no space after the commas (the Go
        # client doesn't trim at all), so never DEPEND on a space being there.
        part = entry.strip()
        if not part.startswith(SIGNATURE_PREFIX):
            continue
        digests.append(part[len(SIGNATURE_PREFIX):])
    return digests


def verify_pagerduty_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-PagerDuty-Signature against the raw body.

    Args:
        raw_body: RAW, unparsed request body bytes.
        signature_header: The ``X-PagerDuty-Signature`` header value.
        secret: ``PAGERDUTY_WEBHOOK_SECRET``.

    Returns:
        True only when at least one ``v1=`` signature matches.
    """
    # Fail closed: a missing header or an unconfigured secret is a rejection.
    if not signature_header or not secret:
        return False

    # HMAC over the RAW BODY BYTES. PagerDuty: "Verifying PagerDuty webhook
    # signatures requires the unaltered raw body of the request sent to you.
    # Ensure that any frameworks or middleware you are using have not
    # manipulated or formatted the request body."
    #
    # The secret is used AS-IS as UTF-8 bytes. PagerDuty's own sample does
    # key.encode("ASCII"); ASCII is a subset of UTF-8 and the secrets are
    # ASCII, so this is equivalent -- and safe if that ever changes.
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()  # HEX (Base16), lowercase -- not base64
    expected_bytes = expected.encode("ascii")

    # Accept a match against ANY v1= entry (secret rotation).
    matched = False
    for digest in extract_v1_signatures(signature_header):
        # compare_digest is constant-time AND tolerates unequal lengths --
        # unlike Node's crypto.timingSafeEqual, which needs a length guard. It
        # does REQUIRE bytes once a value can be non-ASCII: given two str
        # arguments it raises TypeError on any character above U+007F, and
        # Starlette decodes headers as latin-1, so a junk signature byte would
        # otherwise turn a 403 into an unhandled 500.
        #
        # Lowercase the candidate: PagerDuty emits lowercase hex, and the Go
        # client hex-DECODES (case-insensitively), so accept either case.
        #
        # No early `break`: finishing the loop keeps the work independent of
        # which entry matched.
        if hmac.compare_digest(digest.lower().encode("utf-8"), expected_bytes):
            matched = True
    return matched


def describe_agent(event: Dict[str, Any]) -> str:
    """Describe the actor behind an event.

    ``event.agent`` and ``event.client`` CAN BOTH BE None -- PagerDuty's own
    documented service.updated example has both. A null agent "might indicate
    an event triggered via automation rather than a specific person". Never
    reach for event["agent"]["id"] unguarded.
    """
    agent = event.get("agent")
    if not agent:
        return "automation"
    return f"{agent.get('summary') or agent.get('id')} ({agent.get('type')})"


def _json_response(payload: Dict[str, Any], status_code: int) -> Response:
    return Response(
        content=json.dumps(payload),
        status_code=status_code,
        media_type="application/json",
    )


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/pagerduty")
async def pagerduty_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> Response:
    """Receive a PagerDuty V3 webhook.

    Reads the RAW body FIRST -- ``await request.json()`` before verifying would
    leave a parsed object you cannot re-serialise byte for byte, and PagerDuty
    signs the exact bytes it sent.
    """
    raw_body = await request.body()

    signature_header = request.headers.get(SIGNATURE_HEADER)
    secret = os.environ.get("PAGERDUTY_WEBHOOK_SECRET")

    # FAIL CLOSED on misconfiguration. 500 (not 4xx) because this is YOUR
    # problem, and a 5xx gets retried for 48 hours -- so the event isn't lost
    # while you fix the config. Verification is never silently skipped.
    if not secret:
        logger.error(
            "PAGERDUTY_WEBHOOK_SECRET is not set -- refusing to accept "
            "unverified webhooks"
        )
        return _json_response(
            {"error": "Webhook secret not configured"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Malformed header -> 400 (ErrMalformedHeader in PagerDuty's Go client).
    # There is NO handshake or unsigned validation request to allow through:
    # every genuine V3 delivery carries X-PagerDuty-Signature.
    if not extract_v1_signatures(signature_header):
        logger.error("Missing or malformed X-PagerDuty-Signature header")
        return _json_response(
            {"error": "Missing or malformed X-PagerDuty-Signature header"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Empty body -> 400 (ErrMalformedBody in the Go client).
    if not raw_body:
        logger.error("Empty request body")
        return _json_response(
            {"error": "Empty request body"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Signature mismatch -> 403 (ErrNoValidSignatures; PagerDuty's Go client
    # recommends 403 "to prevent redelivery"). 401 is equally fine -- what
    # matters is that it is a 4xx, so PagerDuty does NOT retry it.
    if not verify_pagerduty_signature(raw_body, signature_header, secret):
        logger.error("PagerDuty webhook signature verification failed")
        return _json_response(
            {"error": "Invalid signature"},
            status.HTTP_403_FORBIDDEN,
        )

    # Verified -- only now is it safe to parse. Decode as UTF-8 explicitly:
    # PagerDuty payloads support unicode characters.
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        logger.error("Verified request had an unparseable body: %s", exc)
        return _json_response({"error": "Invalid JSON"}, status.HTTP_400_BAD_REQUEST)

    event = payload.get("event") if isinstance(payload, dict) else None
    if not isinstance(event, dict) or not isinstance(event.get("event_type"), str):
        # A V3 payload always wraps a single `event` object. (A `messages[]`
        # array means you are looking at a legacy V1/V2 extension payload.)
        logger.error("Verified request had no event object")
        return _json_response(
            {"error": "Missing event object"},
            status.HTTP_400_BAD_REQUEST,
        )

    # IDEMPOTENCY KEY.
    #
    # Delivery is AT-LEAST-ONCE. PagerDuty: the X-Webhook-Id header "is unique
    # to the webhook but is repeated for each delivery attempt, so it may be
    # used to ignore subsequent delivery attempts after an initial success."
    #
    # Retain seen ids for AT LEAST 48 HOURS -- the length of the retry window.
    # event["id"] works too, but X-Webhook-Id is the documented de-dup key.
    #
    # There is NO documented X-PagerDuty-Event header, no delivery-timestamp
    # header and no documented V3 User-Agent. Don't key on undocumented ones.
    webhook_id = request.headers.get("x-webhook-id") or event.get("id")

    logger.info(
        "Verified PagerDuty webhook: %s (event %s, delivery %s) at %s",
        event.get("event_type"),
        event.get("id"),
        webhook_id,
        event.get("occurred_at"),
    )

    # Respond inside PagerDuty's 5-second budget (16 seconds for webhooks
    # generated from Custom Incident Actions), then work asynchronously.
    # PagerDuty: "Return a 202 Accepted once you receive a payload and then
    # process... Asynchronous processing will help prevent the connection from
    # timing out."
    background_tasks.add_task(handle_event, event)

    return _json_response({"received": True}, status.HTTP_202_ACCEPTED)


def handle_event(event: Dict[str, Any]) -> None:
    """Dispatch a verified PagerDuty V3 event.

    Route on ``event["event_type"]``; use ``event["data"]["type"]`` to pick the
    data schema. ``event["resource_type"]`` is the root resource (incident or
    service) and can differ from the more specific ``data["type"]``.
    """
    # TODO: check the X-Webhook-Id / event["id"] against your store and return
    # early if seen. Keep ids for 48+ hours.
    #   if store.has(webhook_id): return

    event_type = event.get("event_type")
    data = event.get("data") or {}
    incident = data.get("incident") or {}
    who = describe_agent(event)

    def ref(obj: Optional[Dict[str, Any]], key: str = "summary") -> str:
        return (obj or {}).get(key) or "unknown"

    # --- Incident lifecycle (data["type"] == "incident") --------------------
    if event_type == "incident.triggered":
        # data["priority"] CAN BE None when no priority is set.
        priority = data.get("priority")
        logger.info(
            "Incident triggered: #%s %s [%s, %s urgency] on %s -- %s",
            data.get("number"),
            data.get("title"),
            ref(priority) if priority else "no priority",
            data.get("urgency"),
            ref(data.get("service")),
            data.get("html_url"),
        )
    elif event_type == "incident.acknowledged":
        logger.info("Incident acknowledged: #%s by %s", data.get("number"), who)
    elif event_type == "incident.unacknowledged":
        logger.info("Incident unacknowledged: #%s", data.get("number"))
    elif event_type == "incident.resolved":
        logger.info(
            "Incident resolved: #%s by %s (reason: %s)",
            data.get("number"),
            who,
            data.get("resolve_reason") or "none",
        )
    elif event_type == "incident.reopened":
        logger.info(
            "Incident reopened: #%s at %s", data.get("number"), data.get("reopened_at")
        )
    elif event_type == "incident.escalated":
        # Escalated to another user in the SAME escalation level.
        logger.info(
            "Incident escalated within level: #%s -> %s",
            data.get("number"),
            ", ".join(ref(a) for a in data.get("assignees") or []),
        )
    elif event_type == "incident.delegated":
        # Reassigned to another ESCALATION POLICY (not a user).
        logger.info(
            "Incident delegated to escalation policy %s: #%s",
            ref(data.get("escalation_policy")),
            data.get("number"),
        )
    elif event_type == "incident.reassigned":
        # Reassigned to another USER.
        logger.info(
            "Incident reassigned: #%s -> %s",
            data.get("number"),
            ", ".join(ref(a) for a in data.get("assignees") or []),
        )
    elif event_type == "incident.priority_updated":
        priority = data.get("priority")
        logger.info(
            "Incident priority updated: #%s -> %s",
            data.get("number"),
            ref(priority) if priority else "none",
        )
    elif event_type == "incident.service_updated":
        # NOTE THE UNDERSCORE. This is the incident's SERVICE changing, and is
        # a DIFFERENT event from `service.updated` below.
        logger.info(
            "Incident service changed: #%s -> %s",
            data.get("number"),
            ref(data.get("service")),
        )
    elif event_type == "incident.incident_type.changed":
        logger.info(
            "Incident type changed: #%s -> %s",
            data.get("number"),
            ref(data.get("incident_type"), "name"),
        )

    # --- Notes, status updates, bridges, custom fields ----------------------
    elif event_type == "incident.annotated":
        # data["type"] == "incident_note". NOT named `incident.note.created`.
        logger.info("Note added to %s: %s", incident.get("id"), data.get("content"))
    elif event_type == "incident.status_update_published":
        # data["type"] == "incident_status_update"
        logger.info("Status update on %s: %s", incident.get("id"), data.get("message"))
    elif event_type == "incident.conference_bridge.updated":
        # data["type"] == "incident_conference_bridge". Note conference_numbers
        # is an ARRAY of {label, number} here, unlike the single
        # conference_bridge.conference_number string on an `incident`.
        logger.info(
            "Conference bridge updated on %s: %s %s",
            incident.get("id"),
            ", ".join(
                str(n.get("number")) for n in data.get("conference_numbers") or []
            ),
            data.get("conference_url") or "",
        )
    elif event_type == "incident.custom_field_values.updated":
        # data["type"] == "incident_field_values"
        logger.info(
            "Incident custom fields updated on %s: %s",
            incident.get("id"),
            ", ".join(
                f"{f.get('name')}={f.get('value')}"
                for f in data.get("changed_custom_fields") or []
            ),
        )

    # --- Responders and roles ------------------------------------------------
    elif event_type == "incident.responder.added":
        # data["type"] == "incident_responder". state is "pending" when added.
        logger.info(
            'Responder requested on %s: %s (%s) -- "%s"',
            incident.get("id"),
            ref(data.get("user")),
            data.get("state"),
            data.get("message"),
        )
    elif event_type == "incident.responder.replied":
        logger.info(
            "Responder replied on %s: %s -> %s",
            incident.get("id"),
            ref(data.get("user")),
            data.get("state"),
        )
    elif event_type == "incident.role.assigned":
        # data["type"] == "incident_role_assignment". THIS ALSO COVERS
        # UNASSIGNMENT -- the assignments live in an ARRAY, and old_assignee
        # can be None.
        for assignment in data.get("incident_role_assignments") or []:
            assignee = assignment.get("assignee")
            old_assignee = assignment.get("old_assignee")
            logger.info(
                "Role %s on %s: %s (was %s, status %s)",
                ref(assignment.get("role")),
                (assignment.get("incident") or {}).get("id"),
                ref(assignee) if assignee else "unassigned",
                ref(old_assignee) if old_assignee else "nobody",
                assignment.get("status"),
            )

    # --- Tasks ---------------------------------------------------------------
    elif event_type in (
        "incident.task.created",
        "incident.task.updated",
        "incident.task.completed",
    ):
        # data["type"] == "incident_task"
        logger.info(
            'Task %s on %s: "%s" [%s]',
            event_type.rsplit(".", 1)[-1],
            incident.get("id"),
            data.get("name"),
            data.get("status"),
        )

    # --- Automation action invocations ---------------------------------------
    elif event_type in (
        "incident.action_invocation.created",
        "incident.action_invocation.updated",
        "incident.action_invocation.terminated",
    ):
        # data["type"] == "incident_action_invocation"
        logger.info(
            "Action invocation %s on %s: %s (%s)",
            data.get("state"),
            incident.get("id"),
            ref(data.get("action")),
            data.get("id"),
        )

    # --- Incident workflows (need the incident_workflows.read OAuth scope) ---
    elif event_type in ("incident.workflow.started", "incident.workflow.completed"):
        # data["type"] == "incident_workflow_instance"
        logger.info(
            "Workflow %s on %s: %s",
            "started" if event_type.endswith("started") else "completed",
            incident.get("id"),
            ref(data.get("incident_workflow")),
        )

    # --- Services (data["type"] == "service" / "service_field_values") -------
    elif event_type == "service.created":
        logger.info("Service created: %s (%s)", data.get("summary"), data.get("id"))
    elif event_type == "service.updated":
        # DIFFERENT from `incident.service_updated`. Both agent and client are
        # null in PagerDuty's documented example for this event.
        logger.info(
            "Service updated: %s (%s) alert_creation=%s by %s",
            data.get("summary"),
            data.get("id"),
            data.get("alert_creation"),
            who,
        )
    elif event_type == "service.deleted":
        logger.info("Service deleted: %s (%s)", data.get("summary"), data.get("id"))
    elif event_type == "service.custom_field_values.updated":
        # data["type"] == "service_field_values"
        logger.info(
            "Service custom fields updated on %s: %s",
            (data.get("service") or {}).get("id"),
            ", ".join(
                f"{f.get('name')}={json.dumps(f.get('value'))}"
                for f in data.get("custom_fields") or []
            ),
        )

    else:
        # REQUIRED. PagerDuty: "Additional event types may be added to this
        # list over time", and it also ships Early Access events that are
        # "subject to change at any moment, without notice". Log and
        # acknowledge -- never raise on an unrecognised event_type.
        logger.info(
            "Unhandled PagerDuty event type: %s (resource_type=%s, data.type=%s)",
            event_type,
            event.get("resource_type"),
            data.get("type"),
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    if not os.environ.get("PAGERDUTY_WEBHOOK_SECRET"):
        logger.warning("PAGERDUTY_WEBHOOK_SECRET is not set")
        logger.warning("Every delivery will be rejected until you set it")
        logger.warning(
            "Get it from delivery_method.secret in the "
            "POST /webhook_subscriptions response"
        )
    uvicorn.run(app, host="0.0.0.0", port=port)
