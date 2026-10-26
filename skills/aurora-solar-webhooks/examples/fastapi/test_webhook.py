import os

# Set test environment variables before importing the app
os.environ["AURORA_SOLAR_WEBHOOK_SECRET"] = "test_aurora_token_2dbcbba1-9f64-4c07"
os.environ.pop("AURORA_SOLAR_WEBHOOK_HEADER", None)

import pytest
from fastapi.testclient import TestClient

from main import app, verify_aurora_solar_request

client = TestClient(app)

SECRET = os.environ["AURORA_SOLAR_WEBHOOK_SECRET"]
HEADER = "X-Aurora-Webhook-Token"
PATH = "/webhooks/aurora-solar"

EVENTS = [
    "agreement_download_url_job_completed", "agreement_status_changed", "ahj_lookup_completed",
    "ai_roof_job_completed", "app_status_changed", "asset_created", "auto_designer_job_completed",
    "consumption_profile_changed", "design_created", "design_deleted", "design_request_completed",
    "design_request_created", "design_request_rejected", "fire_pathway_placement_job_completed",
    "financier_contract_status_changed", "imagery_lidar_completed", "milestone_created",
    "milestone_shared", "order_created", "panel_irradiance_analysis_job_completed",
    "performance_simulation_job_completed", "plan_set_request_status_changed", "project_changed",
    "project_created", "project_deleted", "project_status_changed",
    "proposal_pdf_generation_job_completed", "site_survey_requested", "site_survey_status_changed",
    "utility_bill_upload_job_completed", "web_proposal_url_created", "web_proposal_viewed",
]

QUERY = {"event": "project_created", "project_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "source": "api"}


def get(headers=None, params=None):
    # Aurora fires GET requests with no body; the data is in the query string.
    return client.get(PATH, params=QUERY if params is None else params, headers=headers or {})


class TestHeaderVerification:
    def test_correct_token_on_get_with_no_body(self):
        res = get({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert get({"x-aurora-webhook-token": SECRET}).status_code == 200

    def test_wrong_token_same_length(self):
        assert get({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert get({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert get().status_code == 401

    def test_header_checked_before_query(self):
        assert get(params={}).status_code == 401

    def test_bearer_prefix_is_not_stripped(self):
        assert get({HEADER: f"Bearer {SECRET}"}).status_code == 401

    def test_whole_value_compared_when_secret_includes_bearer(self):
        assert verify_aurora_solar_request({HEADER: "Bearer abc123"}, secret="Bearer abc123") is True
        assert verify_aurora_solar_request({HEADER: "abc123"}, secret="Bearer abc123") is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_aurora_solar_request({HEADER: SECRET}, secret="") is False
        assert verify_aurora_solar_request({HEADER: SECRET}, secret=SECRET) is True

    def test_non_ascii_values_do_not_raise(self):
        assert verify_aurora_solar_request({HEADER: "tökén"}, secret="token") is False
        assert verify_aurora_solar_request({HEADER: "tökén"}, secret="tökén") is True

    def test_custom_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("AURORA_SOLAR_WEBHOOK_HEADER", "X-My-Aurora-Key")
        assert get({"X-My-Aurora-Key": SECRET}).status_code == 200
        assert get({HEADER: SECRET}).status_code == 401


class TestMethodsAndQuery:
    def test_post_accepted(self):
        res = client.post(PATH, params=QUERY, content="ignored", headers={HEADER: SECRET, "Content-Type": "text/plain"})
        assert res.status_code == 200

    def test_post_without_token_rejected(self):
        assert client.post(PATH, params=QUERY, content="{}").status_code == 401

    def test_missing_event_is_400(self):
        assert get({HEADER: SECRET}, params={"project_id": "abc"}).status_code == 400


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = get({HEADER: SECRET}, params={"event": event, "project_id": "p1", "design_id": "d1"})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        assert get({HEADER: SECRET}, params={"event": "something_new"}).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
