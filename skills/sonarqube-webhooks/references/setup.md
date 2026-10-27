# Setting Up SonarQube Webhooks

## Prerequisites

- A SonarQube Server instance where you can administer the project (or global administration for global webhooks)
- A publicly reachable endpoint the SonarQube server can call (use the Hookdeck CLI locally)

## Set a Secret

**Set a secret on the SonarQube webhook. Without one, deliveries are unsigned and fail verification.**

SonarQube only sends the `X-Sonar-Webhook-HMAC-SHA256` header when the webhook has a Secret. Enter a random string in the Secret field. It is the HMAC key: store it as `SONARQUBE_WEBHOOK_SECRET` and use it as-is (its UTF-8 bytes, not hex- or base64-decoded).

## Register Your Endpoint

1. In SonarQube, open your project and go to **Project Settings > Webhooks** (or the global **Administration > Configuration > Webhooks**).
2. Click **Create** (or update an existing webhook).
3. Enter a **Name** and your endpoint **URL**, for example `https://your-server.com/webhooks/sonarqube`.
4. Enter a random string in the **Secret** field.
5. Save.

You can also manage webhooks with the `api/webhooks` Web API. A project can have up to 10 webhooks, and global webhooks fire as well.

## Alternative: Basic Auth in the URL

SonarQube also supports basic authentication by putting credentials in the URL, such as `https://myLogin:myPassword@my_server/foo`. Prefer the Secret: it signs the body, so tampering is detected.

## Local Development

```bash
npx hookdeck-cli listen 3000 sonarqube --path /webhooks/sonarqube
```

Use the Hookdeck URL as the webhook URL in SonarQube.

## Testing

Run an analysis on the project. SonarQube posts the result when it finishes, and you can see delivery status and the last response under the webhook in the UI. Failed deliveries are not retried.
