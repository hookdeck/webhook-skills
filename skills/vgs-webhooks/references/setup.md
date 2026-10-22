# Setting Up VGS Webhooks

## Prerequisites

- A VGS account with an **Activated** organization (if notifications aren't enabled, the dashboard tells you to contact VGS support)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint (VGS Dashboard, preferred)

1. Go to **Organization Settings > Notifications**.
2. Click **Create new**.
3. Enter your HTTPS destination URL.
4. Choose the event and its source. Sources can be tenants, users, or organizations, in Sandbox or Live.
5. Save, then open the notification to edit it, delete it, or toggle it active/inactive.

### Legacy Vault Dashboard

**Administration > Organization Settings > Notifications > Add Notifications**. Enter the HTTPS URL, then pick events from the dropdown. Optionally limit them to specific vaults or users; if none is selected, all of them trigger notifications.

## Get Your Secret

VGS generates a unique secret for each webhook integration. Set it as `VGS_WEBHOOK_SECRET`. It is used as a UTF-8 string, exactly as shown.

## Limits

20 integrations per organization by default (raise it through VGS support).

## Testing

```bash
npx hookdeck-cli listen 3000 vgs --path /webhooks/vgs
```

Use the Hookdeck URL as the destination in VGS. Trigger a real event (for example, update a route in a sandbox vault) to see a delivery. Respond `200` quickly; VGS retries up to 8 times on any other status.
