# AiPrise Webhooks Overview

## What Are AiPrise Webhooks?

AiPrise is an identity verification platform for KYC (Know Your Customer) and KYB
(Know Your Business). As a verification case or profile moves through its
steps, when it reaches a final decision, and when a shared token changes state,
AiPrise notifies your server with a **callback**: a signed HTTP POST to a URL you
configure.

Callbacks let you react to verification outcomes asynchronously instead of polling
the AiPrise API. Every callback is signed with HMAC-SHA256 so you can confirm it
genuinely came from AiPrise (see [verification.md](verification.md)).

## Callback Destinations

AiPrise sends to these URLs, all signed identically:

| Destination | Configured via | Delivers | Event field |
|-------------|----------------|----------|-------------|
| Decision callback | `callback_url` (or template) | Final result of a session not linked to a profile; business profiles send one too | none |
| Event callbacks | `events_callback_url` (or template, or the profile) | Each step of a case or profile | `event_type`, `user_profile_event_type` or `business_profile_event_type` |
| Token sharing webhooks | The sharing agreement | Token sent, imported or failed to import | `token_sharing_event_type` |

When a session is linked to a user profile, its `callback_url` isn't used: everything
goes to the profile's `events_callback_url`.

URLs are set at the **template level** (Dashboard → View Templates → `{TemplateID}`)
or overridden per request via the `callback_url` / `events_callback_url` fields.
Request-level values take precedence over the template.

## Decision Results

A decision callback has no event field. Its outcome is in `aiprise_summary`; the API
reference defines `verification_result`:

| `verification_result` | Triggered When | Common Use Cases |
|-----------------------|----------------|------------------|
| `APPROVED` | The individual/business passed verification | Provision access, mark customer verified, unlock features |
| `DECLINED` | Verification failed | Block onboarding, request resubmission, flag for fraud review |
| `REVIEW` | The result needs manual review | Route to a human analyst / compliance queue |
| `UNKNOWN` | The result is indeterminate | Retry, investigate, or ask the user to try again |

AiPrise's callback pages print `aiprise_summary.decision` with `APPROVED`, `DECLINED`,
`MANUAL_REVIEW` or `FAILED` instead, so handle both fields. A run status such as
`COMPLETED`, `PENDING` or `FAILED` describes where the session is.

## Payload Structure

The signature page's example decision callback:

```json
{
  "verification_session_id": "123408f2-2bbb-415f-aafc-92212341234",
  "template_id": "123456-3434-2342-3453-b4218a4fb333",
  "client_reference_id": null,
  "aiprise_summary": {
    "tags": [],
    "reasons": [],
    "notes": [],
    "verification_result": "APPROVED"
  },
  "created_at": 1668974142818
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `verification_session_id` | AiPrise-generated ID for the verification session — your primary correlation key |
| `client_reference_id` | Optional ID you supplied when starting the session — correlate to your own records |
| `template_id` | The verification template that produced this callback |
| `aiprise_summary.verification_result` | The outcome: `APPROVED` / `DECLINED` / `REVIEW` / `UNKNOWN` |
| `aiprise_summary.tags` / `reasons` / `notes` | Additional context on the decision |
| `created_at` | Unix epoch milliseconds when the callback was created |

## Correlating Callbacks

Match a callback to a user or onboarding flow using:

1. `verification_session_id` — always present; store it when you create the session.
2. `client_reference_id` — optional; set it when starting a session to carry your own
   user/order identifier through to the callback.

## Full Event Reference

- [Callback Authentication](https://docs.aiprise.com/docs/callbacks-authentication)
- [Case event callbacks](https://docs.aiprise.com/docs/event-callbacks)
- [User profile event callbacks](https://docs.aiprise.com/docs/profile-event-callback)
- [Business profile event callbacks](https://docs.aiprise.com/docs/event-callback)
- [Token sharing webhooks](https://docs.aiprise.com/docs/token-sharing-webhooks)
