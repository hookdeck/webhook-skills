# Webhook Skills

A community collection of webhook integration skills for AI coding agents. Skills provide step-by-step instructions for setting up webhook receivers, handling events, and building reliable webhook infrastructure.

Works with [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [VS Code Copilot](https://github.com/features/copilot), and other AI coding assistants that support the [Agent Skills specification](https://agentskills.io).

## Quick Start

### Install Skills

```bash
# List available skills
npx skills add hookdeck/webhook-skills --list

# Install specific skills
npx skills add hookdeck/webhook-skills --skill stripe-webhooks
npx skills add hookdeck/webhook-skills --skill stripe-webhooks --skill hookdeck-event-gateway
```

### Local Webhook Development

To receive webhooks on localhost during development, install the [Hookdeck CLI](https://hookdeck.com/docs/cli):

```bash
brew install hookdeck/hookdeck/hookdeck

# Start local tunnel (no account required)
hookdeck listen 3000 --path /webhooks/stripe
```

This provides a public URL that forwards to your local server, plus a web UI for inspecting and replaying requests.

## Available Skills

### Provider Skills

Skills for receiving webhooks from specific providers. Each includes setup guides, signature verification, and runnable examples.

| Skill | Description | Examples |
|-------|-------------|----------|
| [`stripe-webhooks`](skills/stripe-webhooks/) | Receive and verify Stripe payment webhooks | Express, Next.js, FastAPI |
| [`shopify-webhooks`](skills/shopify-webhooks/) | Receive and verify Shopify store webhooks | Express, Next.js, FastAPI |
| [`github-webhooks`](skills/github-webhooks/) | Receive and verify GitHub repository webhooks | Express, Next.js, FastAPI |
| [`resend-webhooks`](skills/resend-webhooks/) | Receive and verify Resend email webhooks | Express, Next.js, FastAPI |

### Pattern Skills

Framework-agnostic best practices applicable across any webhook integration.

| Skill | Description |
|-------|-------------|
| [`webhook-handler-patterns`](skills/webhook-handler-patterns/) | Idempotency, error handling, retry logic, async processing |

### Infrastructure Skills

Skills for setting up Hookdeck's Event Gateway with signature verification.

| Skill | Description |
|-------|-------------|
| [`hookdeck-event-gateway`](skills/hookdeck-event-gateway/) | Webhook infrastructure with routing, replay, and monitoring |

## Skill Structure

Each skill follows a consistent structure:

```
skills/{skill-name}/
├── SKILL.md              # Entry point - what the skill does, when to use it
├── references/           # Documentation loaded on-demand by agents
│   ├── overview.md       # What the webhooks are, common events
│   ├── setup.md          # Provider dashboard configuration
│   └── verification.md   # Signature verification details
└── examples/             # Runnable example projects
    ├── express/
    │   ├── README.md     # Setup and run instructions
    │   ├── package.json
    │   ├── .env.example
    │   └── src/
    ├── nextjs/
    └── fastapi/
```

Examples are complete, runnable mini-apps following [PostHog's approach](https://posthog.com/blog/correct-llm-code-generation) — minimal code that demonstrates webhook handling without unnecessary complexity.

## Using with AI Coding Agents

### Claude Code

Skills are automatically loaded when relevant to your prompt:

```
> I need to receive Stripe webhooks in my Express app

Claude Code detects "Stripe webhooks" + "Express" and loads:
- stripe-webhooks/SKILL.md
- stripe-webhooks/references/verification.md
- stripe-webhooks/examples/express/
```

### Cursor / VS Code Copilot

Install skills to your project or global skills directory:

```bash
npx skills add hookdeck/webhook-skills --skill stripe-webhooks
```

## Example: Stripe Webhooks with Express

After installing the `stripe-webhooks` skill, ask your AI assistant:

> "Help me set up Stripe webhook handling in my Express app"

The agent will:

1. Read `stripe-webhooks/SKILL.md` to understand the task
2. Reference `stripe-webhooks/references/setup.md` for Stripe dashboard configuration
3. Copy code from `stripe-webhooks/examples/express/` as a starting point
4. Reference `stripe-webhooks/references/verification.md` for signature verification details
5. Suggest `hookdeck listen 3000 --path /webhooks/stripe` for local testing

## Contributing

We welcome contributions! The recommended way to add new provider skills is using our AI-powered generator:

```bash
# One-time setup
cd scripts/skill-generator && npm install && cd ../..

# Generate a skill (with documentation URL for best results)
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr
```

The generator researches the provider's documentation, generates code and tests for Express/Next.js/FastAPI, validates accuracy, and creates a PR — all automatically.

**[See CONTRIBUTING.md](CONTRIBUTING.md) for the complete guide**, including:
- Providing multiple documentation URLs for better results
- Using YAML configs for batch generation
- Resuming failed generations with the `review` command
- Updating existing skills
- Manual contribution guidelines

## Related Resources

- [Agent Skills Specification](https://agentskills.io) — The open standard for AI agent skills
- [Skills Directory](https://skills.sh) — Discover and install agent skills
- [Hookdeck CLI](https://hookdeck.com/docs/cli) — Local webhook tunnel and debugging

## License

MIT
