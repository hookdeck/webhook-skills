# MeetGeek Webhooks Overview

## What Are MeetGeek Webhooks?

MeetGeek (meetgeek.ai) is an AI meeting recorder and note taker. Each user can set **one webhook URL** in the Public API section of the Integrations page. MeetGeek sends a `POST` to it when a meeting's analysis finishes.

## Common Event Types

MeetGeek has no event-name field or header. The two notifications differ only by body:

| Event | Body | Use cases |
|-------|------|-----------|
| `successful-analysis` | `{"message": "File analyzed successfully", "meeting_id": "9433976b-cfa3-4373-9afb-eb0b7a5915df"}` | Fetch transcript, summary and highlights via the Public API |
| `failed-analysis` | `{"message": "File analyzed failed"}` | Alert, or retry the upload |

Branch on `meeting_id`: present means success, absent means failure.

## Delivery

- Up to three POSTs. The second and third are retries, sent only when the first is not acknowledged with `200 OK` (no body needed).
- For team-shared meetings, every team member with view access receives the webhook.
- Deduplicate on `meeting_id`.

## Signature

Every delivery carries `X-MG-Signature`: hex HMAC-SHA256 of the raw body. See [verification.md](verification.md).

## Full Reference

[MeetGeek webhook documentation](https://docs.meetgeek.ai/api/api-reference/v1/appendix-webhooks)
