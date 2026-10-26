# Setting Up People Data Labs Webhooks

## Prerequisites

- A People Data Labs Enterprise API or Data License subscription
- A publicly reachable HTTPS endpoint (the target URL must use `https`). Locally, use
  `npx hookdeck-cli listen 3000 people-data-labs --path /webhooks/people-data-labs`

## Ask the PDL Team to Register the Webhook

The People Data Labs team registers webhooks for Enterprise customers. Ask them to include a
secret header.

Contact your Customer Success Manager with three things:

1. **Target URL**: your HTTPS endpoint, e.g. `https://example.com/webhooks/people-data-labs`.
2. **Headers**: PDL's docs say this "should contain a shared key for secure authorization".
   Pick a header name and a long random value, for example:
   `"Authorization": "Bearer pk_1312323123131231"`.
3. **Filters**: which updates you want (`job_change`, `work_email`, `location`, and so on).
   Consider one webhook per filter, since several filters on one webhook can repeat an ID.

## Configure Your Endpoint

Store the header name and the **exact, whole value** you gave PDL:

```bash
PEOPLE_DATA_LABS_WEBHOOK_HEADER=Authorization
PEOPLE_DATA_LABS_WEBHOOK_SECRET="Bearer pk_1312323123131231"
```

If you used a `Bearer ` prefix, it is part of the secret. The handler compares the whole header
value and never strips or parses the prefix.

## Test

PDL sends data once a month, so replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/people-data-labs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_1312323123131231" \
  -d '["9adnit66-hdZ5lkBbq-AOQ_0000","YraxDoP16jzyjfxtn-1XJQ_0000"]'
```

## Network Notes

If your endpoint doesn't return `200`, PDL does not resend on its own; ask your PDL team to
resend the batch. Rotating the shared key means asking them to update the registered header.
