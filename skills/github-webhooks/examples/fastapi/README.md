# GitHub Webhooks - FastAPI Example

Minimal example of receiving GitHub webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- GitHub repository with webhook configured

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

4. Add your GitHub webhook secret to `.env`

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

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/github
```

## Endpoint

- `POST /webhooks/github` - Receives and verifies GitHub webhook events
