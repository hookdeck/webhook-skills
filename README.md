# Webhook Skills

This repository contains webhook-related skills for AI coding agents that need to **receive, verify signatures, handle events, retry deliveries, or debug webhook integrations** from various providers ([see Provider Webhook Skills table below](#provider-webhook-skills)).

Skills provide step-by-step instructions, signature verification code, and runnable examples for Express, Next.js, and FastAPI.

Works with [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [VS Code Copilot](https://github.com/features/copilot), and other AI coding assistants that support the [Agent Skills specification](https://agentskills.io).

## When Should an Agent Use These Skills?

Use these webhook skills when:

- You need to **receive webhooks** from third-party providers (Stripe, Shopify, GitHub, etc.)
- You need to **verify webhook signatures** to ensure authenticity
- You need to **handle webhook event payloads** and extract data
- You need to **implement idempotency** for webhook handlers
- You need to **retry or replay** failed webhook deliveries
- You need **provider-specific webhook handling logic** (e.g., Stripe checkout events, GitHub push events)

## Skill Discovery

These skills are designed to be discoverable by agents using skill registries and tools like `find-skills`, where an agent searches for webhook-related capabilities by provider or task.

## Available Webhook Skills

### Provider Webhook Skills

Skills for receiving and verifying webhooks from specific providers. Each includes setup guides, webhook signature verification, and runnable examples.

| Provider | Skill | What It Does |
|----------|-------|--------------|
| [Chargebee](https://www.chargebee.com/docs/2.0/events_and_webhooks.html) | [`chargebee-webhooks`](skills/chargebee-webhooks/) | Receive and verify Chargebee webhooks (Basic Auth), handle subscription billing events |
| [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/webhooks) | [`claude-managed-agents-webhooks`](skills/claude-managed-agents-webhooks/) | Verify Anthropic Claude Managed Agents webhook signatures (`X-Webhook-Signature`), handle session lifecycle and outcome evaluation events |
| [Clerk](https://clerk.com/docs/integrations/webhooks/overview) | [`clerk-webhooks`](skills/clerk-webhooks/) | Verify Clerk webhook signatures, handle user, session, and organization events |
| [Cursor](https://docs.cursor.com/account/cloud-agent-webhooks) | [`cursor-webhooks`](skills/cursor-webhooks/) | Verify Cursor Cloud Agent webhook signatures, handle agent status events |
| [Deepgram](https://developers.deepgram.com/reference) | [`deepgram-webhooks`](skills/deepgram-webhooks/) | Receive and verify Deepgram transcription callbacks |
| [Discord](https://docs.discord.com/developers/events/webhook-events) | [`discord-webhooks`](skills/discord-webhooks/) | Verify Discord webhook event signatures (Ed25519), handle application and entitlement events |
| [ElevenLabs](https://elevenlabs.io/docs/overview/administration/webhooks) | [`elevenlabs-webhooks`](skills/elevenlabs-webhooks/) | Verify ElevenLabs webhook signatures, handle call transcription events |
| [FusionAuth](https://fusionauth.io/docs/extend/events-and-webhooks/) | [`fusionauth-webhooks`](skills/fusionauth-webhooks/) | Verify FusionAuth JWT webhook signatures, handle user, login, and registration events |
| [GitHub](https://docs.github.com/en/webhooks) | [`github-webhooks`](skills/github-webhooks/) | Verify GitHub webhook signatures, handle push, pull_request, and issue events |
| [GitLab](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html) | [`gitlab-webhooks`](skills/gitlab-webhooks/) | Verify GitLab webhook tokens, handle push, merge_request, issue, and pipeline events |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/webhooks) | [`gemini-webhooks`](skills/gemini-webhooks/) | Verify Gemini API webhook signatures (Standard Webhooks HMAC + JWKS modes), handle batch and long-running operation events |
| [HubSpot](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests) | [`hubspot-webhooks`](skills/hubspot-webhooks/) | Verify HubSpot v3 webhook signatures (HMAC-SHA256 with timestamp), handle contact, deal, and company events |
| [Hugging Face](https://huggingface.co/docs/hub/webhooks) | [`huggingface-webhooks`](skills/huggingface-webhooks/) | Authenticate Hugging Face webhooks (`X-Webhook-Secret`), handle repo, discussion, and comment events |
| [Intercom](https://developers.intercom.com/docs/webhooks) | [`intercom-webhooks`](skills/intercom-webhooks/) | Verify Intercom `X-Hub-Signature` (HMAC-SHA1), handle conversation, contact, and ticket events |
| [Linear](https://linear.app/developers/webhooks) | [`linear-webhooks`](skills/linear-webhooks/) | Verify Linear webhook signatures (HMAC-SHA256), handle issue, comment, and project events |
| [Mailgun](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks) | [`mailgun-webhooks`](skills/mailgun-webhooks/) | Verify Mailgun webhook signatures (HMAC-SHA256), handle email delivered, failed, opened, clicked, unsubscribed, and complained events |
| [Notion](https://developers.notion.com/reference/webhooks) | [`notion-webhooks`](skills/notion-webhooks/) | Verify Notion webhook signatures (HMAC-SHA256, `X-Notion-Signature`), complete handshake, handle page and comment events |
| [OpenAI](https://platform.openai.com/docs/guides/webhooks) | [`openai-webhooks`](skills/openai-webhooks/) | Verify OpenAI webhooks for fine-tuning, batch, and realtime async events |
| [OpenClaw](https://docs.openclaw.ai/automation/webhook) | [`openclaw-webhooks`](skills/openclaw-webhooks/) | Verify OpenClaw Gateway webhook tokens, handle agent hook and wake event payloads |
| [Paddle](https://developer.paddle.com/webhooks/overview) | [`paddle-webhooks`](skills/paddle-webhooks/) | Verify Paddle webhook signatures, handle subscription and billing events |
| [PayPal](https://developer.paypal.com/api/rest/webhooks/) | [`paypal-webhooks`](skills/paypal-webhooks/) | Verify PayPal webhook signatures (RSA-SHA256 with cert), handle payment, subscription, and order events |
| [Postmark](https://postmarkapp.com/developer/webhooks/webhooks-overview) | [`postmark-webhooks`](skills/postmark-webhooks/) | Authenticate Postmark webhooks (Basic Auth/Token), handle email delivery, bounce, open, click, and spam events |
| [Replicate](https://replicate.com/docs/webhooks) | [`replicate-webhooks`](skills/replicate-webhooks/) | Verify Replicate webhook signatures, handle ML prediction lifecycle events |
| [Resend](https://resend.com/docs/webhooks) | [`resend-webhooks`](skills/resend-webhooks/) | Verify Resend webhook signatures, handle email delivery and bounce events |
| [Scrapfly](https://scrapfly.io/docs/scrape-api/webhook) | [`scrapfly-webhooks`](skills/scrapfly-webhooks/) | Verify Scrapfly webhook signatures (HMAC-SHA256, uppercase/lowercase hex), dispatch scrape, extraction, and screenshot jobs |
| [SendGrid](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event) | [`sendgrid-webhooks`](skills/sendgrid-webhooks/) | Verify SendGrid webhook signatures (ECDSA), handle email delivery events |
| [Shopify](https://shopify.dev/docs/apps/build/webhooks) | [`shopify-webhooks`](skills/shopify-webhooks/) | Verify Shopify HMAC signatures, handle order and product webhook events |
| [Slack](https://docs.slack.dev/apis/events-api/) | [`slack-webhooks`](skills/slack-webhooks/) | Verify Slack Events API signatures (HMAC-SHA256, `X-Slack-Signature`), handle message, app_mention, and reaction events |
| [Stripe](https://docs.stripe.com/webhooks) | [`stripe-webhooks`](skills/stripe-webhooks/) | Verify Stripe webhook signatures, parse payment event payloads, handle checkout.session.completed events |
| [Twilio](https://www.twilio.com/docs/usage/webhooks) | [`twilio-webhooks`](skills/twilio-webhooks/) | Verify Twilio webhook signatures (HMAC-SHA1, `X-Twilio-Signature`), handle SMS, voice, and status callback events |
| [Vercel](https://vercel.com/docs/observability/webhooks) | [`vercel-webhooks`](skills/vercel-webhooks/) | Verify Vercel webhook signatures (HMAC-SHA1), handle deployment and project events |
| [Webflow](https://developers.webflow.com/data/docs/working-with-webhooks) | [`webflow-webhooks`](skills/webflow-webhooks/) | Verify Webflow webhook signatures (HMAC-SHA256), handle form submission, ecommerce, and CMS events |
| [WooCommerce](https://developer.woocommerce.com/docs/webhooks/) | [`woocommerce-webhooks`](skills/woocommerce-webhooks/) | Verify WooCommerce webhook signatures, handle order, product, and customer events |

### Webhook Handler Pattern Skills

Framework-agnostic best practices for webhook handling, applicable across any webhook integration.

| Skill | What It Does |
|-------|--------------|
| [`webhook-handler-patterns`](skills/webhook-handler-patterns/) | Implement webhook idempotency, error handling, retry logic, async processing |

### Webhook Infrastructure Skills

Skills for webhook infrastructure products — routing, queuing, delivery, and observability.

| Product | Skill | What It Does |
|---------|-------|--------------|
| [Hookdeck Event Gateway](https://hookdeck.com/docs) | [`hookdeck-event-gateway`](skills/hookdeck-event-gateway/) | Webhook infrastructure that replaces your queue — guaranteed delivery, retries, rate limiting, replay, observability |
| [Hookdeck Event Gateway (receiver)](https://hookdeck.com/docs/verification) | [`hookdeck-event-gateway-webhooks`](skills/hookdeck-event-gateway-webhooks/) | Verify `x-hookdeck-signature` and handle webhooks forwarded by the Hookdeck Event Gateway |
| [Hookdeck Outpost](https://outpost.hookdeck.com/docs) | [`outpost`](skills/outpost/) | Send webhooks and events to user-preferred destinations (HTTP, SQS, RabbitMQ, Pub/Sub, EventBridge, Kafka) |

## Quick Start

### Install with `npx skills` (any AI assistant)

```bash
# List available webhook skills
npx skills add hookdeck/webhook-skills --list

# Install Stripe webhook skill
npx skills add hookdeck/webhook-skills --skill stripe-webhooks

# Install multiple webhook skills
npx skills add hookdeck/webhook-skills --skill stripe-webhooks --skill shopify-webhooks
```

### Install with `/plugin` (Claude Code)

Claude Code distributes this repo as a [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces). Add the marketplace once, then install either a single provider skill or the bundle of all 37 skills.

```text
# Add this marketplace
/plugin marketplace add hookdeck/webhook-skills

# Install one provider skill (each is ~200 KB)
/plugin install stripe-webhooks@webhook-skills

# Or install all 37 webhook skills as one bundle (~3 MB)
/plugin install webhook-skills@webhook-skills
```

Plugin skills are namespaced with their plugin name, so the bundle exposes skills as `webhook-skills:stripe-webhooks`, `webhook-skills:shopify-webhooks`, etc., while a granular install exposes the same skill as `stripe-webhooks:stripe-webhooks`.

### Local Webhook Development

To receive webhooks on localhost during development, run [Hookdeck CLI](https://hookdeck.com/docs/cli) via `npx` — no install required:

```bash
# Start local webhook tunnel (no account required)
npx hookdeck-cli listen 3000 stripe --path /webhooks/stripe
```

This provides a public URL that forwards webhook events to your local server, plus a web UI for inspecting and replaying webhook requests.

## Example: How to Handle Stripe Webhooks

If an agent receives a `checkout.session.completed` event from Stripe, the `stripe-webhooks` skill can:

1. **Verify the webhook signature** using Stripe's signing secret
2. **Parse the event payload** to extract checkout session data
3. **Return a normalized event object** for further processing

After installing the skill, ask your AI assistant:

> "Help me set up Stripe webhook handling in my Express app"

The agent will:

1. Read `stripe-webhooks/SKILL.md` to understand webhook verification
2. Reference `stripe-webhooks/references/verification.md` for signature verification details
3. Copy code from `stripe-webhooks/examples/express/` as a starting point
4. Suggest `npx hookdeck-cli listen 3000 stripe --path /webhooks/stripe` for local webhook testing

## Example: How to Verify GitHub Webhook Signatures

If an agent needs to verify GitHub webhook authenticity, the `github-webhooks` skill can:

1. **Extract the signature header** (`X-Hub-Signature-256`)
2. **Compute HMAC-SHA256** of the raw request body
3. **Compare signatures** using timing-safe comparison

Ask your AI assistant:

> "How do I verify GitHub webhook signatures in Next.js?"

## Skill Structure

Each webhook skill follows a consistent structure:

```
skills/{provider}-webhooks/
├── SKILL.md              # Entry point — webhook overview, when to use
├── references/           # Documentation loaded on-demand
│   ├── overview.md       # What webhooks are available, common events
│   ├── setup.md          # Provider dashboard configuration
│   └── verification.md   # Webhook signature verification details
└── examples/             # Runnable webhook handler examples
    ├── express/          # Express.js webhook handler
    ├── nextjs/           # Next.js API route webhook handler
    └── fastapi/          # FastAPI webhook handler
```

Examples are complete, runnable webhook handlers following [PostHog's approach](https://posthog.com/blog/correct-llm-code-generation) — minimal code that demonstrates webhook signature verification and event handling.

## Contributing

We welcome contributions! The recommended way to add new provider webhook skills is using our AI-powered generator:

```bash
# One-time setup
cd scripts/skill-generator && npm install && cd ../..

# Generate a webhook skill (with documentation URL for best results)
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr
```

The generator researches the provider's webhook documentation, generates signature verification code and tests for Express/Next.js/FastAPI, validates accuracy, and creates a PR — all automatically.

**[See CONTRIBUTING.md](CONTRIBUTING.md) for the complete guide**, including:
- Providing multiple documentation URLs for better webhook skill generation
- Using YAML configs for batch webhook skill generation
- Resuming failed generations with the `review` command
- Updating existing webhook skills
- Manual contribution guidelines

## Related Resources

- [Agent Skills Specification](https://agentskills.io) — The open standard for AI agent skills
- [Skills Directory](https://skills.sh) — Discover and install agent skills
- [Hookdeck CLI](https://hookdeck.com/docs/cli) — Local webhook tunnel and debugging
- [Hookdeck Documentation](https://hookdeck.com/docs) — Webhook infrastructure platform

## License

MIT
