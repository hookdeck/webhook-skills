# SonarQube Webhooks - Express Example

Minimal example of receiving SonarQube webhooks with signature verification (`X-Sonar-Webhook-HMAC-SHA256`).

## Prerequisites

- Node.js 18+
- A SonarQube Server webhook with a **Secret** (without one, deliveries are unsigned and fail verification)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook Secret to `.env` as `SONARQUBE_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 sonarqube --path /webhooks/sonarqube
```

Then use the Hookdeck URL as the webhook URL in SonarQube (Project Settings > Webhooks) and run an analysis.

## Endpoint

- `POST /webhooks/sonarqube` - Receives and verifies SonarQube analysis results. Branches on `qualityGate.status` (`OK` / `ERROR`).
