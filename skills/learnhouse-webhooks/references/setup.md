# Setting Up LearnHouse Webhooks

## Prerequisites

- A LearnHouse organization on a plan with webhooks (a Pro feature), cloud or self-hosted
- A user with permission to manage the organization's webhooks
- A publicly reachable HTTPS endpoint. `localhost` and private IPs are rejected, so for local development run `npx hookdeck-cli listen 3000 learnhouse --path /webhooks/learnhouse` and use the tunnel URL.

## Get Your Signing Secret

Create an endpoint in the organization settings, or through the API with a user JWT:

```bash
curl -X POST "https://<your-learnhouse-host>/api/v1/orgs/<org_id>/webhooks" \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/webhooks/learnhouse",
    "events": ["course_completed", "course_enrolled", "user_signed_up"]
  }'
```

The response contains `secret` (prefixed `whsec_`) **exactly once**. Store it; it cannot be retrieved again, only rotated with `POST /orgs/{org_id}/webhooks/{webhook_uuid}/regenerate-secret`.

Set it as `LEARNHOUSE_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. LearnHouse uses it as a plain HMAC key.

If you use a Hookdeck `LearnHouse` source, paste the same full secret into the source's verification settings.

## Register Your Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/orgs/{org_id}/webhooks/events` | List every event type and payload schema |
| `POST` | `/orgs/{org_id}/webhooks` | Create an endpoint |
| `GET` | `/orgs/{org_id}/webhooks` | List endpoints |
| `PUT` | `/orgs/{org_id}/webhooks/{webhook_uuid}` | Update URL, events, active state |
| `DELETE` | `/orgs/{org_id}/webhooks/{webhook_uuid}` | Delete an endpoint |
| `POST` | `/orgs/{org_id}/webhooks/{webhook_uuid}/regenerate-secret` | Rotate the secret |
| `POST` | `/orgs/{org_id}/webhooks/{webhook_uuid}/test` | Send a `ping` event |
| `GET` | `/orgs/{org_id}/webhooks/{webhook_uuid}/deliveries` | Recent delivery logs |

All paths are under `/api/v1`. Recommended events to start: `course_enrolled`, `course_completed`, `assignment_submitted`, `user_signed_up`.

## Test Your Endpoint

Call `POST .../test` to send a `ping` event, then `GET .../deliveries` to see what was sent and how your endpoint responded. There is no separate test mode.
