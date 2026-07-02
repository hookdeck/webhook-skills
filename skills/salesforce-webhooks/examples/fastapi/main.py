# Generated with: salesforce-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import logging
import os
import xml.etree.ElementTree as ET

from fastapi import FastAPI, Request, Response

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("salesforce-webhooks")

app = FastAPI()

# Salesforce Outbound Message namespaces.
OUTBOUND_NS = "http://soap.sforce.com/2005/09/outbound"
XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"

# The exact SOAP ack Salesforce expects. Without <Ack>true</Ack> it retries for 24h.
ACK_RESPONSE = """<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>true</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>"""


def _localname(tag: str) -> str:
    """Strip the {namespace} prefix from an ElementTree tag."""
    return tag.split("}", 1)[-1]


def _find_first(root: ET.Element, name: str):
    """Find the first element (namespace-agnostic) with the given local name."""
    for el in root.iter():
        if _localname(el.tag) == name:
            return el
    return None


def verify_outbound_message(raw_xml: bytes, expected_org_id: str) -> ET.Element:
    """
    Parse the Outbound Message SOAP body and validate the OrganizationId.

    Salesforce Outbound Messages have NO signature — the OrganizationId, together
    with HTTPS + IP allowlisting at the edge, is how you authenticate the sender.
    Returns the parsed root element, or raises ValueError on mismatch/absence.
    """
    root = ET.fromstring(raw_xml)  # raises ET.ParseError on malformed XML

    notifications = _find_first(root, "notifications")
    if notifications is None:
        raise ValueError("Not a Salesforce Outbound Message")

    org_el = _find_first(root, "OrganizationId")
    org_id = (org_el.text or "") if org_el is not None else ""
    if not hmac.compare_digest(org_id, expected_org_id):
        raise ValueError("OrganizationId mismatch")

    return root


def sobject_type(sobject: ET.Element) -> str:
    """Read the sObject type from its xsi:type attribute (e.g. 'sf:Account' -> 'Account')."""
    raw = sobject.get(XSI_TYPE, "") if sobject is not None else ""
    return raw.split(":")[-1] if ":" in raw else raw


def _child_text(sobject: ET.Element, name: str):
    for child in sobject:
        if _localname(child.tag) == name:
            return child.text
    return None


@app.post("/webhooks/salesforce")
async def salesforce_webhook(request: Request):
    expected_org_id = os.environ.get("SALESFORCE_ORG_ID")
    if not expected_org_id:
        logger.error("Missing SALESFORCE_ORG_ID environment variable")
        return Response(content="Server misconfigured", status_code=500, media_type="text/xml")

    # Salesforce sends Content-Type: text/xml — read the RAW body, parse XML ourselves.
    raw_xml = await request.body()

    try:
        root = verify_outbound_message(raw_xml, expected_org_id)
    except (ValueError, ET.ParseError) as err:
        # Reject spoofed/unknown senders. Do NOT ack — we don't want retries for these.
        logger.warning("Rejected Outbound Message: %s", err)
        return Response(content="Unauthorized", status_code=401, media_type="text/xml")

    try:
        # A message carries 1–100 <Notification> elements.
        for notification in root.iter():
            if _localname(notification.tag) != "Notification":
                continue

            sobject = next(
                (c for c in notification if _localname(c.tag) == "sObject"), None
            )
            if sobject is None:
                continue

            obj_type = sobject_type(sobject)
            record_id = _child_text(sobject, "Id")

            # Handle idempotently on record_id — messages can be redelivered.
            if obj_type == "Account":
                logger.info("Account changed: %s %s", record_id, _child_text(sobject, "Name"))
            elif obj_type == "Contact":
                logger.info("Contact changed: %s", record_id)
            elif obj_type == "Lead":
                logger.info("Lead changed: %s", record_id)
            elif obj_type == "Opportunity":
                logger.info("Opportunity changed: %s %s", record_id, _child_text(sobject, "StageName"))
            elif obj_type == "Case":
                logger.info("Case changed: %s", record_id)
            else:
                logger.info("Unhandled sObject type: %s %s", obj_type, record_id)

        # Acknowledge so Salesforce marks the message delivered.
        return Response(content=ACK_RESPONSE, status_code=200, media_type="text/xml")
    except Exception as err:  # noqa: BLE001
        # Processing failed — return non-200 so Salesforce retries (up to 24h).
        logger.error("Error processing Outbound Message: %s", err)
        return Response(content="Processing error", status_code=500, media_type="text/xml")


@app.get("/health")
async def health():
    return {"status": "healthy"}
