# Hookdeck Event Gateway - FastAPI Example

Minimal example of receiving webhooks through Hookdeck with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Hookdeck account with destination configured
- Hookdeck webhook secret from destination settings

## Setup

1. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Hookdeck webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Login and start listening
hookdeck login
hookdeck listen 3000 --path /webhooks
```

## Endpoint

- `POST /webhooks` - Receives and verifies Hookdeck webhook events
