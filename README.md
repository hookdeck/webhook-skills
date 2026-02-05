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
| Chargebee | [`chargebee-webhooks`](skills/chargebee-webhooks/) | Receive and verify Chargebee webhooks (Basic Auth), handle subscription billing events |
| Clerk | [`clerk-webhooks`](skills/clerk-webhooks/) | Verify Clerk webhook signatures, handle user, session, and organization events |
| Cursor | [`cursor-webhooks`](skills/cursor-webhooks/) | Verify Cursor Cloud Agent webhook signatures, handle agent status events |
| Deepgram | [`deepgram-webhooks`](skills/deepgram-webhooks/) | Receive and verify Deepgram transcription callbacks |
| ElevenLabs | [`elevenlabs-webhooks`](skills/elevenlabs-webhooks/) | Verify ElevenLabs webhook signatures, handle call transcription events |
| FusionAuth | [`fusionauth-webhooks`](skills/fusionauth-webhooks/) | Verify FusionAuth JWT webhook signatures, handle user, login, and registration events |
| GitHub | [`github-webhooks`](skills/github-webhooks/) | Verify GitHub webhook signatures, handle push, pull_request, and issue events |
| GitLab | [`gitlab-webhooks`](skills/gitlab-webhooks/) | Verify GitLab webhook tokens, handle push, merge_request, issue, and pipeline events |
| OpenAI | [`openai-webhooks`](skills/openai-webhooks/) | Verify OpenAI webhooks for fine-tuning, batch, and realtime async events |
| Paddle | [`paddle-webhooks`](skills/paddle-webhooks/) | Verify Paddle webhook signatures, handle subscription and billing events |
| Replicate | [`replicate-webhooks`](skills/replicate-webhooks/) | Verify Replicate webhook signatures, handle ML prediction lifecycle events |
| Resend | [`resend-webhooks`](skills/resend-webhooks/) | Verify Resend webhook signatures, handle email delivery and bounce events |
| SendGrid | [`sendgrid-webhooks`](skills/sendgrid-webhooks/) | Verify SendGrid webhook signatures (ECDSA), handle email delivery events |
| Shopify | [`shopify-webhooks`](skills/shopify-webhooks/) | Verify Shopify HMAC signatures, handle order and product webhook events |
| Stripe | [`stripe-webhooks`](skills/stripe-webhooks/) | Verify Stripe webhook signatures, parse payment event payloads, handle checkout.session.completed events |
| Vercel | [`vercel-webhooks`](skills/vercel-webhooks/) | Verify Vercel webhook signatures (HMAC-SHA1), handle deployment and project events |

### Webhook Handler Pattern Skills

Framework-agnostic best practices for webhook handling, applicable across any webhook integration.

| Skill | What It Does |
|-------|--------------|
| [`webhook-handler-patterns`](skills/webhook-handler-patterns/) | Implement webhook idempotency, error handling, retry logic, async processing |

### Webhook Infrastructure Skills

Skills for setting up reliable webhook infrastructure with routing, replay, and monitoring.

| Skill | What It Does |
|-------|--------------|
| [`hookdeck-event-gateway`](skills/hookdeck-event-gateway/) | Set up Hookdeck Event Gateway for webhook routing, retry, replay, and monitoring |

## Quick Start

### Install Webhook Skills

```bash
# List available webhook skills
npx skills add hookdeck/webhook-skills --list

# Install Stripe webhook skill
npx skills add hookdeck/webhook-skills --skill stripe-webhooks

# Install multiple webhook skills
npx skills add hookdeck/webhook-skills --skill stripe-webhooks --skill shopify-webhooks
```

### Local Webhook Development

To receive webhooks on localhost during development, install the [Hookdeck CLI](https://hookdeck.com/docs/cli):

```bash
npm i -g hookdeck-cli

# or:
brew install hookdeck/hookdeck/hookdeck

# Start local webhook tunnel (no account required)
hookdeck listen 3000 --path /webhooks/stripe
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
4. Suggest `hookdeck listen 3000 --path /webhooks/stripe` for local webhook testing

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
