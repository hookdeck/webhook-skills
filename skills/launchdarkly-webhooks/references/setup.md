# Setting Up LaunchDarkly Webhooks

## Prerequisites

- LaunchDarkly account with permission to manage integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 launchdarkly --path /webhooks/launchdarkly` locally)

## Create the Webhook and Get Your Secret

1. Click the gear icon (Organization settings) → **Integrations**.
2. Find the **Webhooks** integration → **Add integration**.
3. (Optional) Enter a **Name**, then the absolute **URL** of your endpoint.
4. **Check "Sign this webhook".** Without a secret, deliveries are unsigned and cannot be verified.
5. Add a **policy** to filter events (below), accept the Integration Terms and Conditions, and **Save settings**.
6. Copy the secret (auto-generated, or supply your own on create/edit) into `LAUNCHDARKLY_WEBHOOK_SECRET`.

Via REST API: `POST https://app.launchdarkly.com/api/v2/webhooks` with `url`, `sign: true` (or `secret`), `on`, and `statements`.

## Filter Events with a Policy

By default LaunchDarkly sends all flag change events in the production environment. Customize with policy statements:

```json
[{ "effect": "allow", "actions": ["*"], "resources": ["proj/*:env/production:flag/*"] }]
```

```json
[{ "effect": "allow", "actions": ["createApprovalRequest"], "resources": ["proj/*:env/production:flag/*"] }]
```

## Test

Toggle the webhook with the On/Off switch on the Integrations page; make a change to a flag matching the policy to trigger a delivery. Use Pipedream or Insomnia to inspect payloads.

## Retries

A non-2xx response is retried once. Respond quickly with 200.
