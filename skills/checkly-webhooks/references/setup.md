# Setting Up Checkly Webhooks

## Prerequisites

- Checkly account with permission to manage alert channels
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 checkly --path /webhooks/checkly` for local development)

## Create the Webhook Alert Channel

1. In the Checkly dashboard, open your alert channel settings and add a **Webhook** channel.
2. Set the **URL** to your endpoint, e.g. `https://example.com/webhooks/checkly`. Variables and secrets can be used with `{{NAME}}` syntax.
3. Set the method to `POST`.
4. Enter a **Webhook secret**. It is optional, but without it Checkly sends no `x-checkly-signature` header and nothing can be verified.
5. Paste a body template, for example:

   ```json
   {
     "alertType": "{{ALERT_TYPE}}",
     "checkName": "{{CHECK_NAME}}",
     "checkId": "{{CHECK_ID}}",
     "alertTitle": "{{ALERT_TITLE}}",
     "resultLink": "{{RESULT_LINK}}"
   }
   ```

6. Choose which alert types trigger the channel (failure, recovery, degraded, SSL) and attach it to checks or groups.
7. Store the secret as `CHECKLY_WEBHOOK_SECRET` in your server environment.

## Test the Webhook

Use the test message option in the webhook editor to inspect the rendered request before saving your alert channel.

## Notes

- The signature covers the body after rendering, so any edit to the template is automatically covered.
- Use triple braces (`{{{VAR}}}`) to avoid HTML escaping of variable values.
- Checkly retries up to 5 times (20 seconds apart) on a response above 399.
