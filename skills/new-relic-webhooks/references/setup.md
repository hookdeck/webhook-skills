# Setting Up a New Relic Webhook Destination

## Prerequisites

- A New Relic account with permission to manage Alerts destinations and workflows
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 new-relic --path /webhooks/new-relic` locally)

## Choose Your Credentials

Pick a username and a long random password and store them as `NEW_RELIC_WEBHOOK_USERNAME` and
`NEW_RELIC_WEBHOOK_PASSWORD`. New Relic does not generate them for you.

## Create the Destination

1. Go to **one.newrelic.com > All capabilities > Alerts**, then **Destinations**.
2. Select **Webhook**.
3. Fill in:
   - **Webhook name**: a reference name.
   - **Endpoint URL**: your endpoint, e.g. `https://example.com/webhooks/new-relic`.
   - **Use authorization**: enable **Basic authentication** and enter the username and password.
     Do not pick Bearer Token (it sends a different header and this skill doesn't cover it).
4. Save the destination.

## Add It to a Workflow

1. Go to **Alerts > Workflows** and create or edit a workflow.
2. Add a notification channel and select your Webhook destination.
3. Edit the payload. A template that matches the examples:

```handlebars
{
  "issueId": {{json issueId}},
  "title": {{json issueTitle}},
  "state": {{json state}},
  "acknowledged": {{json isAcknowledged}},
  "priority": {{json priority}},
  "issuePageUrl": {{json issuePageUrl}}
}
```

This is an illustrative template. You can rewrite it, but the example handlers read exactly
these fields and dispatch on `state` (`CREATED`, `ACTIVATED`, `CLOSED`, the issue life cycle values
New Relic documents), treating `acknowledged` (`isAcknowledged`, `true`/`false`) as a flag. See
New Relic's [workflow template variables](https://docs.newrelic.com/docs/alerts/get-notified/custom-variables-alert-event-workflows/).

4. Use **Send test notification** to check your endpoint, then save and activate the workflow.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/new-relic \
  -u "$NEW_RELIC_WEBHOOK_USERNAME:$NEW_RELIC_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"issueId":"1","title":"High CPU","state":"ACTIVATED","acknowledged":false,"priority":"CRITICAL","issuePageUrl":"https://one.newrelic.com"}'
```

## Rotating the Credential

Because the credential is static and unsigned, rotate it if it leaks: change it on the
destination and in `NEW_RELIC_WEBHOOK_USERNAME` / `NEW_RELIC_WEBHOOK_PASSWORD` together.
