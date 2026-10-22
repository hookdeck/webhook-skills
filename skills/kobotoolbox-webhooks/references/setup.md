# Setting Up KoboToolbox REST Services

## Prerequisites

- A KoboToolbox account and a deployed project you can manage
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 kobotoolbox --path /webhooks/kobotoolbox` locally)

## Choose Your Credentials

KoboToolbox does not generate a secret. Pick a username and a long random password yourself and
store them as `KOBOTOOLBOX_WEBHOOK_USERNAME` and `KOBOTOOLBOX_WEBHOOK_PASSWORD`. The same values
go into the REST Service so KoboToolbox sends them as HTTP Basic auth.

## Register Your Endpoint

1. Open the project and go to its **Settings** and the **REST Services** section.
2. Register a new service and give it a name.
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/kobotoolbox`.
4. Choose the format: **JSON** or **XML**.
5. Enter the username and password under authentication (Basic auth).
6. Optionally restrict the payload to a subset of fields, or (JSON only) set a custom wrapper.
7. Save. New submissions are posted to the URL.

The exact labels in the KoboToolbox UI may differ slightly between releases; the
[official guide](https://support.kobotoolbox.org/rest_services.html) has tutorial videos for
creation, subset of fields, failure/retry and the custom wrapper.

## Test

Submit a test record to the project (web form or KoboCollect) and check that your endpoint logs a
new submission. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/kobotoolbox \
  -u "$KOBOTOOLBOX_WEBHOOK_USERNAME:$KOBOTOOLBOX_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"_id":1234,"_uuid":"1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11","_xform_id_string":"aXyZ123","name":"Amina"}'
```

## Failures

If your endpoint returns an error, KoboToolbox retries 3 times (after 60, 600 and 6,000 seconds).
Enable email notifications on the REST Service to receive a failure report. Editing a submission
sends nothing, so don't expect update events.
