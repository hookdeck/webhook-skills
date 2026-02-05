# WooCommerce Webhooks - FastAPI Example

Minimal example of receiving WooCommerce webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- WooCommerce store with webhook signing secret

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
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

4. Add your WooCommerce webhook secret to `.env`:
   ```
   WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret_from_woocommerce
   ```

## Run

Development mode:
```bash
uvicorn main:app --reload
```

Production mode:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Server runs on http://localhost:8000

## Test

You can test with a sample payload:

```bash
curl -X POST http://localhost:8000/webhooks/woocommerce \
  -H "Content-Type: application/json" \
  -H "X-WC-Webhook-Topic: order.created" \
  -H "X-WC-Webhook-Signature: your_generated_signature" \
  -d '{"id": 123, "status": "processing", "total": "29.99"}'
```

Run tests:
```bash
pytest test_webhook.py -v
```

## WooCommerce Setup

In your WooCommerce admin:
1. Go to **WooCommerce > Settings > Advanced > Webhooks**
2. Add webhook with delivery URL: `http://localhost:8000/webhooks/woocommerce`
3. Copy the webhook secret to your `.env` file