# Setting Up HCP Terraform Notification Webhooks

## Prerequisites

- An HCP Terraform or Terraform Enterprise workspace with **admin** access
- A publicly reachable HTTP or HTTPS endpoint that accepts POST requests (use the
  Hookdeck CLI for local development)

## Choose a Token (Signing Secret)

The token is an arbitrary secret string you choose. HCP Terraform uses it as the
HMAC key when signing notifications. It is **optional**, and without one **no
signature is sent**, so always set one. You can't view it after saving, so store it
in your handler's configuration (`TERRAFORM_NOTIFICATION_TOKEN`) first.

```bash
openssl rand -hex 32
```

## Register Your Endpoint

1. Open the workspace and go to **Settings > Notifications**.
2. Click **Create a notification**.
3. Set **Destination** to **Webhook** (the generic type).
4. Enter a **Name**, your **Webhook URL**, and the **Token**.
5. Choose **Workspace Events** and **Run Events**, either all or specific ones:
   - Run: Created, Planning, Needs Attention, Applying, Completed, Errored
   - Workspace: Check failed, Drift detected, Health assessment errored, Auto destroy
     reminder, Auto destroy results
6. Click **Create a notification**.

To apply one configuration to every workspace in a project, create it under the
project's notification settings instead. The API (`POST
/workspaces/:workspace_id/notification-configurations`) takes `destination-type:
"generic"`, `url`, `token`, `enabled`, and a `triggers` array such as
`["run:completed", "run:errored"]`.

## Enabling and Verifying

Toggle the configuration to **Enabled**. HCP Terraform sends a test message
(`notifications[0].trigger` of `"verification"`) and enables the configuration only
if your endpoint answers **2xx**. If verification fails, the error is shown and the
configuration stays disabled. Open the **Last Response** box to see what your
endpoint returned, or use **Send a test** to re-send.

The verification request is signed when a token is set, so the handler must already
hold the token and verify it like any other request.

## Test Mode vs Live Mode

There is no separate test mode. Use a dedicated workspace with a throwaway
configuration, or trigger a plan in a non-production workspace.
