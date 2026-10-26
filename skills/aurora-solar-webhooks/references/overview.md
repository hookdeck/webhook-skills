# Aurora Solar Webhooks Overview

## What Are Aurora Solar Webhooks?

Aurora notifies your application when an event occurs in your tenant: a project or design is
created, an Expert Design or AutoDesigner job finishes, a customer signs an agreement. A webhook
subscription (created in Aurora's UI or with the Webhooks API) names one **event**, a **URL
template** and optional **filters**.

Aurora webhooks are fired as **GET requests** to a URL built from your template. There is **no
body**: the data is the set of attributes your template selects, in the query string. Aurora only
sends proprietary identifiers and statuses, so fetch the full object from the Aurora API using the
ids you receive.

```
GET https://<hookdeck-url>?event=project_created&project_id=3fa85f64-5717-4562-b3fc-2c963f66afa6&source=api
X-Aurora-Webhook-Token: <your header_auth_value>
```

Requests are **not signed**. Authenticate them with the header token you set on the subscription
(see [verification.md](verification.md)).

## How Do I Tell Which Event I Got?

Each subscription is for one event, and the request does not carry the event name by itself. Put a
static parameter in the template (Aurora's docs show `?aurora_event=design_request_rejected`; these
skills use `event`):

```
https://<hookdeck-url>?event=project_created&project_id=<PROJECT_ID>&source=<SOURCE>
```

The handlers dispatch on the `event` query parameter and return `400` if it is missing.

## Event Types

Aurora documents 32 events. The URL attributes are the placeholders you can put in the template
(written `<PROJECT_ID>` in Aurora's syntax, shown here as the lower-case query parameter names).

| Event | Sent When | URL attributes |
|-------|-----------|----------------|
| `agreement_download_url_job_completed` | An agreement download URL job finishes (API-started jobs only) | `agreement_id`, `job_id`, `status`, `project_id`, `design_id` |
| `agreement_status_changed` | An agreement status changes (`sent`, `viewed`, `signed`, `cancel-pending`, `canceled`, `declined`, `error`) | `project_id`, `design_id`, `agreement_id`, `financing_id`, `status` |
| `ahj_lookup_completed` | The AHJ lookup run on project creation finishes | `project_id`, `ahj_id`, `status` |
| `ai_roof_job_completed` | An AI Roof job started from the API finishes | `design_id`, `job_id`, `status`, `source` |
| `app_status_changed` | A partner app is `enabled` or `disabled` | `app_id`, `status` |
| `asset_created` | An asset is created and ready for download | `design_id`, `asset_id`, `asset_type` |
| `auto_designer_job_completed` | An AutoDesigner job finishes | `design_id`, `job_id`, `status`, `source` |
| `consumption_profile_changed` | A consumption profile changes | `project_id` |
| `design_created` | A design is created (`app`, `api` or `expert_design_service`) | `project_id`, `design_id`, `source` |
| `design_deleted` | A design is deleted | `project_id`, `design_id` |
| `design_request_completed` | A design request becomes `designer_completed` | `design_request_id`, `status` |
| `design_request_created` | A design request is created | `design_request_id`, `source` |
| `design_request_rejected` | A design request becomes `designer_rejected` | `design_request_id`, `status` |
| `fire_pathway_placement_job_completed` | A fire pathway placement job finishes | `design_id`, `job_id`, `status`, `source` |
| `financier_contract_status_changed` | A financing partner (GoodLeap, LightReach, EnFin) reports a contract status change | `financing_id`, `external_provider_status`, `design_id` |
| `imagery_lidar_completed` | Default imagery and LiDAR finish loading for a new project | `project_id`, `status` |
| `milestone_created` | A milestone is created | `project_id`, `design_id`, `stage`, `source`, `change_types` |
| `milestone_shared` | A milestone is shared with your tenant | `project_id`, `design_id`, `stage`, `source`, `change_types` |
| `order_created` | A consumer order is created | `order_id` |
| `panel_irradiance_analysis_job_completed` | A panel irradiance analysis job finishes | `design_id`, `job_id`, `status`, `source` |
| `performance_simulation_job_completed` | A performance simulation job finishes | `design_id`, `job_id`, `status`, `source` |
| `plan_set_request_status_changed` | A plan set request is `submitted`, `completed` or `rejected` | `plan_set_request_id`, `status` |
| `project_changed` | Selected project attributes (name, customer fields, status, ...) change | `project_id`, `source`, `attributes` |
| `project_created` | A project is created | `project_id`, `source`, `order_id` |
| `project_deleted` | A project is deleted | `project_id`, `source` |
| `project_status_changed` | A project status changes (any string) | `project_id`, `status` |
| `proposal_pdf_generation_job_completed` | A proposal PDF job started from the API finishes | `design_id`, `job_id`, `status`, `source` |
| `site_survey_requested` | A site survey is requested in the Aurora app | `site_survey_request_id` |
| `site_survey_status_changed` | A site survey becomes `completed` | `site_survey_id`, `status` |
| `utility_bill_upload_job_completed` | A utility bill upload and parse job finishes | `job_id`, `utility_bill_id`, `project_id`, `status`, `source` |
| `web_proposal_url_created` | A web proposal URL is generated or re-generated | `design_id`, `source` |
| `web_proposal_viewed` | A web proposal is viewed (every view; filter on `is_first_view`) | `design_id`, `project_id`, `is_first_view` |

`status` is `succeeded` or `failed` for job events. `source` is `app` or `api` (design_created
also has `expert_design_service`).

## Delivery Behaviour

- Respond within **10 seconds**. A timeout or a 3xx/4xx/5xx response is retried **5 more times**
  at roughly 30 seconds, 5 minutes, 30 minutes, 3 hours and 20 hours (about 24 hours in total).
- If every retry fails within 48 hours (and there were at least 50 attempts), Aurora disables the
  subscription. Re-enable it in the webhooks dashboard or with the Webhooks API.
- Ordering is not guaranteed, and duplicates are possible. Make handlers idempotent using ids such
  as `job_id` or `design_request_id`.
- Up to 5 subscriptions per event per tenant.

## Full Event Reference

For the complete list of events, attributes and filters, see
[Aurora's events reference](https://docs.aurorasolar.com/reference/events) and
[webhooks documentation](https://docs.aurorasolar.com/reference/webhooks).
