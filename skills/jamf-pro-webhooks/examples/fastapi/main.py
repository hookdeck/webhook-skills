# Generated with: jamf-pro-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os
from hmac import compare_digest

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

EVENT_LABELS = {
    "ComputerAdded": "Computer enrolled",
    "ComputerCheckIn": "Computer checked in",
    "ComputerInventoryCompleted": "Computer inventory completed",
    "ComputerPatchPolicyCompleted": "Computer patch policy completed",
    "ComputerPolicyFinished": "Computer policy finished",
    "ComputerPushCapabilityChanged": "Computer push capability changed",
    "DeviceAddedToDEP": "Device added to Automated Device Enrollment",
    "JSSShutdown": "Jamf Pro server shut down",
    "JSSStartup": "Jamf Pro server started",
    "MobileDeviceCheckIn": "Mobile device checked in",
    "MobileDeviceCommandCompleted": "Mobile device command completed",
    "MobileDeviceEnrolled": "Mobile device enrolled",
    "MobileDeviceInventoryCompleted": "Mobile device inventory completed",
    "MobileDevicePushSent": "Mobile device push sent",
    "MobileDeviceUnEnrolled": "Mobile device unenrolled",
    "PatchSoftwareTitleUpdated": "Patch software title updated",
    "PushSent": "Push notification sent",
    "RestAPIOperation": "Classic API operation performed",
    "SCEPChallenge": "SCEP challenge requested",
    "SmartGroupComputerMembershipChange": "Computer smart group membership changed",
    "SmartGroupMobileDeviceMembershipChange": "Mobile device smart group membership changed",
    "SmartGroupUserMembershipChange": "User smart group membership changed",
}


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_jamf_pro_request(headers, name=None, secret=None) -> bool:
    """Jamf Pro does not sign payloads. With Header Authentication you choose a header
    name and value; Jamf Pro sends them on every request. Compare the WHOLE value
    (do not strip a "Bearer " prefix). This authenticates the sender, not the body,
    and gives no replay protection.
    """
    name = name or os.environ.get("JAMF_PRO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("JAMF_PRO_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_jamf_pro_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_jamf_pro_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    webhook = payload.get("webhook") or {}
    event = payload.get("event") or {}
    webhook_event = webhook.get("webhookEvent")
    label = EVENT_LABELS.get(webhook_event)

    if not label:
        print(f"Unhandled event: {webhook_event}")
        return

    # TODO: act on `event` (its shape depends on webhookEvent), e.g.
    # ComputerAdded -> event["udid"] / event["serialNumber"] / event["jssID"]
    # MobileDeviceEnrolled -> event["udid"] / event["serialNumber"]
    print(f'{label} ({webhook_event}, webhook "{webhook.get("name")}")', list(event))


@app.post("/webhooks/jamf-pro", dependencies=[Depends(require_jamf_pro_header)])
async def jamf_pro_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    # JSON is assumed. Jamf Pro can also send XML: set the webhook's format to JSON.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body (set the Jamf Pro webhook format to JSON)")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Jamf Pro event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
