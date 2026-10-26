# Setting Up Sublime Security Webhooks

## Prerequisites

- A Sublime Security account with permission to manage Actions
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. In Sublime, open the **Actions** page and create a new **webhook** Action.
2. Enter your endpoint URL (the Hookdeck source URL, or your own `/webhooks/sublime-security` route).
3. Save the Action.
4. Attach the Action to the detection rules (or other triggers) that should send alerts. You can also send a message to it manually, which produces a `manual` delivery.

See [Sublime's webhook documentation](https://docs.sublime.security/docs/webhooks) for the current UI wording.

## Get Your Signing Secret

On the **Actions** page, select the webhook Action and click to reveal its signing secret. Set it as `SUBLIME_SECURITY_WEBHOOK_SECRET`. The secret is used as the HMAC key, as UTF-8 bytes, exactly as shown (no decoding, no whitespace).

## Authentication

Authentication is the signature alone (`X-Sublime-Signature`). There is no API key or basic auth from Sublime on incoming webhooks.

## Local Development

```bash
npx hookdeck-cli listen 3000 sublime-security --path /webhooks/sublime-security
```

Use the Hookdeck URL as the Action's URL, then trigger the Action on a flagged message or send a message to it manually.
