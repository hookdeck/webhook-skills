# Setting Up Dynatrace Webhooks

## Prerequisites

- A Dynatrace environment with permission to configure problem notifications
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 dynatrace --path /webhooks/dynatrace` locally)

## Send the Secret in a Header, Not the URL

**Send the secret in a custom header, not as a token in the webhook URL.** Dynatrace allows a
token in the URL, but Hookdeck can't check it and URLs end up in logs.

## Register Your Endpoint

1. In Dynatrace, open the problem notifications settings (Classic) and add a **Custom integration**
   (webhook) notification.
2. Enter your webhook URL (e.g. `https://example.com/webhooks/dynatrace`), with no secret in it.
3. Under **Additional HTTP headers**, add a header with a name and secret value of your choosing,
   e.g. `X-Webhook-Secret: <long random value>` (or `Authorization: Bearer <value>`).
4. Write the **Custom payload** template. Include `{State}` so you can tell an opened problem
   (`OPEN`) from a resolved one (the docs don't show the resolved value), for example:

   ```json
   {
     "ProblemID": "{ProblemID}",
     "State": "{State}",
     "ProblemTitle": "{ProblemTitle}",
     "ImpactedEntity": "{ImpactedEntity}"
   }
   ```

5. Set `DYNATRACE_WEBHOOK_HEADER` to the header name and `DYNATRACE_WEBHOOK_SECRET` to the **exact,
   whole header value** you typed, including any `Bearer ` prefix.
6. Save, and attach the notification to an alerting profile.

## Test

Use the notification's test option in Dynatrace, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/dynatrace \
  -H "Content-Type: application/json" \
  -H "$DYNATRACE_WEBHOOK_HEADER: $DYNATRACE_WEBHOOK_SECRET" \
  -d '{"ProblemID":"P-2401","State":"OPEN","ProblemTitle":"Response time degradation"}'
```
