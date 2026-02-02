# Paddle Webhooks - FastAPI Example

Minimal example of receiving Paddle webhooks with signature verification using Python FastAPI.

## Prerequisites

- Python 3.9+
- Paddle account with webhook secret key

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

4. Add your Paddle webhook secret to `.env`

## Run

```bash
python main.py
```

Server runs on http://localhost:3000

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

### Using Paddle Webhook Simulator

1. Go to **Paddle Dashboard → Developer tools → Simulations**
2. Create a new simulation with your endpoint URL
3. Run the simulation to send test events

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/paddle
```

Then use the Hookdeck URL as your notification destination in Paddle.

## Endpoint

- `POST /webhooks/paddle` - Receives and verifies Paddle webhook events
