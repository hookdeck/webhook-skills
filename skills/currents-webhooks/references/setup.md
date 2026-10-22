# Setting Up Currents Webhooks

## Prerequisites

- A Currents account and project
- Permission to manage the project's integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 currents --path /webhooks/currents` locally)

## Choose Your Secret

Currents does not generate a secret. You invent one and add it as a custom header:

1. Generate a long random value, e.g. `openssl rand -hex 32`.
2. Pick a header name. `Authorization` is the default in this skill; any name works.
3. Store them as `CURRENTS_WEBHOOK_HEADER` and `CURRENTS_WEBHOOK_SECRET`.

`CURRENTS_WEBHOOK_SECRET` is the **exact, whole header value**. If you want a `Bearer` prefix,
include it in both Currents and the variable (`Bearer 3f9a...`); the handler does not parse it.

## Register Your Endpoint

1. In Currents, go to **Manage Project > Integrations**.
2. Add the **HTTP Webhook** integration.
3. **URL**: your endpoint, e.g. `https://yourserver.com/webhooks/currents`.
4. **Events** (optional): leave blank for all events, or pick from `RUN_START`, `RUN_FINISH`,
   `RUN_TIMEOUT`, `RUN_CANCELED`.
5. **Headers** (optional, but required for this skill): add your header name and secret value.
6. Click **Save**.

## Test

Replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/currents \
  -H "Content-Type: application/json" \
  -H "$CURRENTS_WEBHOOK_HEADER: $CURRENTS_WEBHOOK_SECRET" \
  -d '{"event":"RUN_FINISH","runUrl":"https://app.currents.dev/run/abc","buildId":"demo","tags":[],"overall":3,"passes":3,"failures":0,"pending":0,"skipped":0,"retries":0,"flaky":0}'
```

## Network Notes

The endpoint must be publicly accessible. Currents publishes no signature, so rely on the secret
header and HTTPS.
