# Generated with: aurora-solar-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

DEFAULT_HEADER = "X-Aurora-Webhook-Token"


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Both sides are encoded to bytes (compare_digest raises on
    non-ASCII str) and hashed to equal-length digests so the secret's length isn't leaked."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_aurora_solar_request(headers, secret=None, header_name=None) -> bool:
    """Aurora Solar does not sign webhooks. You add a secret header to the subscription
    (header_auth_key / header_auth_value) and Aurora sends it on every GET. The header name
    is user-chosen; the whole value is compared as-is (no Bearer parsing).
    """
    secret = secret if secret is not None else os.environ.get("AURORA_SOLAR_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("AURORA_SOLAR_WEBHOOK_HEADER") or DEFAULT_HEADER
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_aurora_solar_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the query string is read."""
    if not verify_aurora_solar_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook auth header")


# Every event the Aurora Solar docs list (https://docs.aurorasolar.com/reference/events).
EVENT_LABELS = {
    "agreement_download_url_job_completed": "Agreement download URL ready",
    "agreement_status_changed": "Agreement status changed",
    "ahj_lookup_completed": "AHJ lookup completed",
    "ai_roof_job_completed": "AI Roof job completed",
    "app_status_changed": "Partner app status changed",
    "asset_created": "Asset created",
    "auto_designer_job_completed": "AutoDesigner job completed",
    "consumption_profile_changed": "Consumption profile changed",
    "design_created": "Design created",
    "design_deleted": "Design deleted",
    "design_request_completed": "Design request completed",
    "design_request_created": "Design request created",
    "design_request_rejected": "Design request rejected",
    "fire_pathway_placement_job_completed": "Fire pathway placement job completed",
    "financier_contract_status_changed": "Financier contract status changed",
    "imagery_lidar_completed": "Imagery and LiDAR completed",
    "milestone_created": "Milestone created",
    "milestone_shared": "Milestone shared",
    "order_created": "Order created",
    "panel_irradiance_analysis_job_completed": "Panel irradiance analysis completed",
    "performance_simulation_job_completed": "Performance simulation completed",
    "plan_set_request_status_changed": "Plan set request status changed",
    "project_changed": "Project changed",
    "project_created": "Project created",
    "project_deleted": "Project deleted",
    "project_status_changed": "Project status changed",
    "proposal_pdf_generation_job_completed": "Proposal PDF generated",
    "site_survey_requested": "Site survey requested",
    "site_survey_status_changed": "Site survey status changed",
    "utility_bill_upload_job_completed": "Utility bill upload completed",
    "web_proposal_url_created": "Web proposal URL created",
    "web_proposal_viewed": "Web proposal viewed",
}


def handle_event(event: str, params: dict) -> None:
    label = EVENT_LABELS.get(event)
    if label is None:
        print(f"Unhandled event: {event}")
        return
    print(f"{label}: {params}")
    # TODO: the payload is only identifiers and statuses; fetch the object from the
    # Aurora API using params["project_id"] / params["design_id"] / params["job_id"].


def handle_request(request: Request) -> dict:
    # Aurora sends GET with no body; the data is in the query string. Each subscription is
    # for one event: the URL template carries a static `event`. First value wins on repeats.
    params = {key: request.query_params.get(key) for key in request.query_params.keys()}
    event = params.get("event")
    if not event:
        raise HTTPException(status_code=400, detail="Missing event query parameter")

    try:
        handle_event(event, params)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Aurora Solar event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/webhooks/aurora-solar", dependencies=[Depends(require_aurora_solar_header)])
async def aurora_solar_webhook(request: Request):
    return handle_request(request)


# Accepted for flexibility; Aurora itself sends GET. Any body is ignored.
@app.post("/webhooks/aurora-solar", dependencies=[Depends(require_aurora_solar_header)])
async def aurora_solar_webhook_post(request: Request):
    return handle_request(request)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
