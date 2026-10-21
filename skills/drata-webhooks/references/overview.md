# What Are Drata Webhooks?

## What Are Drata Webhooks?

Drata is a compliance automation platform. Its **Workflows** feature runs
steps when something changes in Drata: a control becomes Not ready, evidence is
linked, a risk's treatment changes, personnel go out of compliance. One of the
step types is **Send webhook**, which "transmits structured data from Drata to
external systems" so tools like Zapier, Torq, Make or ServiceNow (or your own
service) can react.

When a workflow triggers, Drata sends a `POST` to the endpoint you configured.
You can add authentication as custom headers, extra context headers, and pick
the properties that go in the body.

Drata's help center notes that Drata uses Svix to send webhooks, but it
documents no Svix headers and no signing secret. Authenticate with a shared
secret header you add yourself (see [verification.md](verification.md)).

## Workflow Basics

- Create workflows in **Settings → Workflows** (Admin or Workspace Manager role).
- A workflow has one **start** (which controls, risks, evidence or personnel it
  applies to), one **trigger**, and any number of **steps**.
- Steps run in parallel. If one fails, the others still run, and Drata retries
  the failed step up to three times.
- Step types: Create task, Send email, Send Slack message, Send MS Teams
  message, **Send webhook**.

## Which `event_type` Values Are Documented?

Drata's "Create Workflow for Control" article lists these for control workflows:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CONTROL_DETAILS_UPDATED` | Control details are edited | Audit trail, sync to a GRC mirror |
| `CONTROL_READINESS_CHANGED_TO_NOT_READY` | A control becomes Not ready | Open a ticket, page the owner |
| `CONTROL_READINESS_CHANGED_TO_READY` | A control becomes Ready | Close the ticket |
| `CONTROL_EVIDENCE_LINKED` | Evidence is linked to a control | Trigger an evidence review in Zapier or Make |
| `CONTROL_EVIDENCE_UNLINKED` | Evidence is unlinked | Flag coverage gaps |
| `CONTROL_POLICY_LINKED` | A policy is linked | Track policy coverage |
| `CONTROL_POLICY_UNLINKED` | A policy is unlinked | Track policy coverage |
| `CONTROL_TEST_MAPPED` | A test is mapped to a control | Keep a test inventory in sync |
| `CONTROL_TEST_UNMAPPED` | A test is unmapped | Keep a test inventory in sync |
| `CONTROL_REQUIREMENT_MAPPED` | A framework requirement is mapped | Track framework coverage |
| `CONTROL_REQUIREMENT_UNMAPPED` | A requirement is unmapped | Track framework coverage |
| `CONTROL_TEST_CHANGED_TO_PASS` | A mapped test starts passing | Resolve an alert |
| `CONTROL_TEST_CHANGED_TO_FAIL` | A mapped test starts failing | Alert the owner, open an incident |
| `CONTROL_OWNER_UPDATED` | The control owner changes | Update ownership in other systems |
| `CONTROL_MARKED_IN_SCOPE` | A control is marked in scope | Update scope reports |
| `CONTROL_MARKED_OUT_OF_SCOPE` | A control is marked out of scope | Update scope reports |

Risk, evidence and personnel workflows (triggers such as "Treatment option
changed", "Upcoming renewal", "Out of compliance", "Status changed") can also
send webhooks. The pages this skill was written from don't list their
`event_type` strings, so don't hard-code names for them. Log what arrives.

## Payload Structure

Drata describes the body as base properties plus the control and trigger
properties you selected in the step.

**Base properties (all events):** `event_type`, `timestamp`, `organization_id`,
`workspace`.

**Control properties (selectable):** `control_name`, `control_code`,
`control_id`, `control_owners` (name and email list), `control_readiness`,
`control_description`, `control_approval_status`, `control_approvers`,
`control_mapped_requirements`, `control_mapped_tests`, `control_evidence`,
`control_policies`, `control_notes`, `control_custom_fields`,
`control_workspace_name`, `control_workspace_id`.

**Trigger-specific properties** (examples):

| Event | Extra properties |
|-------|------------------|
| `CONTROL_DETAILS_UPDATED` | `updated_by` |
| `CONTROL_READINESS_CHANGED_TO_*` | `date_changed` |
| `CONTROL_EVIDENCE_LINKED` / `_UNLINKED` | `evidence_artifact`, `evidence_id`, `evidence_implementation_guidance`, `evidence_name`, `evidence_owner_name`, `evidence_status`, `linked_by` / `unlinked_by` |
| `CONTROL_POLICY_LINKED` / `_UNLINKED` | `policy_doc`, `policy_id`, `policy_name`, `policy_owner`, `policy_status`, `linked_by` / `unlinked_by` |
| `CONTROL_TEST_MAPPED` / `_UNMAPPED` | `test_description`, `test_name`, `test_result`, `test_type` |
| `CONTROL_REQUIREMENT_MAPPED` / `_UNMAPPED` | `requirement_framework`, `requirement_name`, `mapped_by` / `unmapped_by` |
| `CONTROL_TEST_CHANGED_TO_PASS` / `_FAIL` | `test_description`, `test_name`, `test_type` |
| `CONTROL_OWNER_UPDATED` | `new_control_owner`, `old_control_owner`, `updated_by` |
| `CONTROL_MARKED_IN_SCOPE` / `_OUT_OF_SCOPE` | `changed_by`, `date_changed` |

Data formats: object arrays are JSON, dates are ISO strings, booleans are
`true`/`false`. Custom fields look like `[{"key": "field_name", "value": "field_value"}]`.

An illustrative body (assembled from the property names above, not copied from
Drata):

```json
{
  "event_type": "CONTROL_EVIDENCE_LINKED",
  "timestamp": "2026-10-21T09:30:00.000Z",
  "organization_id": "org_123",
  "workspace": { "id": 1, "name": "Main" },
  "control_id": 42,
  "control_code": "DCF-101",
  "control_name": "Access reviews performed quarterly",
  "evidence_name": "Q3 access review",
  "linked_by": "Amy Doe"
}
```

## Full Event Reference

See Drata's [Create Workflow for Control](https://help.drata.com/en/articles/12876602-create-workflow-for-control)
and [Automate Actions with Drata's Workflows](https://help.drata.com/en/articles/11751113-automate-actions-with-drata-s-workflows).
