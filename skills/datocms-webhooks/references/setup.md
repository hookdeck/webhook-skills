# Setting Up DatoCMS Webhooks

## Prerequisites

- A DatoCMS project and permission to manage its webhooks (Project Settings)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 datocms --path /webhooks/datocms`)

## Choose Your Credentials

DatoCMS does not generate a secret. Pick a username and a long random password yourself and
store them as `DATOCMS_WEBHOOK_USERNAME` and `DATOCMS_WEBHOOK_PASSWORD`:

```bash
openssl rand -hex 32   # use as the password
```

## Register Your Endpoint

1. In DatoCMS, go to **Project Settings > Webhooks** and create a new webhook.
2. Give it a name and enter the URL, e.g. `https://example.com/webhooks/datocms`.
3. Under HTTP basic auth, enter the username and password from above.
4. Add triggers: pick an entity (Record, Model, Upload, Build trigger, Environment, Maintenance
   mode, SSO user, CDA cache tags) and its events. Record and Model triggers can be limited to
   specific records or models.
5. Optionally enable **Automatic Retry** (up to 7 retries over about 3 days) or a **custom
   payload** (see [overview.md](overview.md)).
6. Save. Custom headers are also available but are not used by this skill.

The same webhook can be managed through the Content Management API webhook resource
(`http_basic_user`, `http_basic_password`, `events`, `auto_retry`, ...).

## Test

Trigger an event (save a record) and check the **Webhooks activity log** under Project
Settings. You can **Resend now** from a call's details. Or replay locally:

```bash
curl -X POST http://localhost:3000/webhooks/datocms \
  -u "$DATOCMS_WEBHOOK_USERNAME:$DATOCMS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"item","event_type":"publish","entity":{"id":"1","type":"item"}}'
```

## Network Notes

Always use an `https://` URL: Basic credentials are base64, not encrypted, and are visible to
anyone who can read the request in transit.
