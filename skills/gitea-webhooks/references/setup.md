# Setting Up Gitea Webhooks

## Prerequisites

- A Gitea instance (self-hosted or Gitea Cloud) and admin access to the repository, organization, or instance
- Your application's webhook endpoint URL (use `npx hookdeck-cli listen 3000 gitea --path /webhooks/gitea` locally)
- If the instance restricts outbound hosts, your endpoint host must be allowed (see `ALLOWED_HOST_LIST` in the `[webhook]` section of `app.ini`)

## Register Your Endpoint

1. Open the repository, then **Settings → Webhooks** (`/:username/:reponame/settings/hooks`). Organizations, users, and site administration have equivalent pages.
2. Click **Add Webhook → Gitea**.
3. Set **Target URL** to your endpoint, e.g. `https://example.com/webhooks/gitea`.
4. Set **HTTP Method** to `POST`.
5. Choose **POST Content Type**: `application/json` (recommended) or `application/x-www-form-urlencoded`.
6. Enter a **Secret**.
7. Under **Trigger On**, pick **Push Events**, **All Events**, or a custom selection (push, pull request, issues, issue comment, create, delete, release, ...).
8. Optionally set a **Branch Filter** (glob; applies only to ref-bearing events like `push`, `create`, `delete`).
9. Keep **Active** checked and save.

## Get Your Signing Secret

The signing secret is the **Secret** you typed in step 6. Store it as `GITEA_WEBHOOK_SECRET`. If you leave it blank, Gitea still sends `X-Gitea-Signature` but with an empty value, and nothing can be verified.

The optional **Authorization Header** field sends a custom `Authorization` header with each request; it is independent of the secret.

## Test Mode vs Live Mode

There is no test mode. Use **Test Delivery** on the webhook page to send a synthetic `push` event, **Recent Deliveries** to inspect requests and responses, and **Redelivery** to replay an earlier delivery.
