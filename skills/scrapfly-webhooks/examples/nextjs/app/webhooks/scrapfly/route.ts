// Generated with: scrapfly-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a Scrapfly webhook signature.
 *
 * Algorithm: upper(hex(HMAC_SHA256(secret, rawBody)))
 * Header:    X-Scrapfly-Webhook-Signature (uppercase hex)
 */
function verifyScrapflySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();

  // Scrapfly also sends an X-Scrapfly-Webhook-Signature-Lowercase variant;
  // normalise to uppercase so either header works.
  const received = signatureHeader.toUpperCase();

  try {
    return timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read raw body as bytes — screenshot deliveries are raw image bytes
  // (JPEG / PNG / WebP / GIF), not text. Using request.text() would
  // decode the bytes as UTF-8 and corrupt the body for verification.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-scrapfly-webhook-signature');
  const resourceType = request.headers.get('x-scrapfly-webhook-resource-type');
  const webhookId = request.headers.get('x-scrapfly-webhook-id');
  const jobId = request.headers.get('x-scrapfly-webhook-job-id');
  const crawlEvent = request.headers.get('x-scrapfly-crawl-event-name');

  const secret = process.env.SCRAPFLY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SCRAPFLY_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  if (!verifyScrapflySignature(rawBody, signature, secret)) {
    console.error('Scrapfly webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  console.log(`Scrapfly webhook (id=${webhookId} resource=${resourceType} job=${jobId})`);

  // Dispatch BEFORE JSON parsing — screenshot deliveries are raw image
  // bytes (JPEG / PNG / WebP / GIF) regardless of the Content-Type you
  // configured in the Scrapfly dashboard (json or msgpack — both apply
  // verbatim to scrape/extraction deliveries, but screenshot bodies are
  // binary either way). Trying to JSON.parse a binary body throws after
  // verification has already succeeded.
  if (resourceType === 'screenshot') {
    console.log(`Screenshot received: ${rawBody.length} bytes (binary, ${jobId})`);
    // rawBody is the raw image bytes. Persist it to storage keyed on
    // jobId / webhookId. Do not call JSON.parse here. The synchronous
    // Screenshot API response exposes metadata in headers like
    // X-Scrapfly-Screenshot-Url; the webhook delivery only carries the
    // image bytes.
    return NextResponse.json({ received: true });
  }

  // Remaining resource types are serialised per your dashboard's
  // Content-Type setting. This handler assumes `application/json`; if
  // you configured `application/msgpack`, swap JSON.parse for a msgpack
  // decoder (e.g. `@msgpack/msgpack`).

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Failed to parse Scrapfly webhook payload:', err);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (resourceType) {
    case 'scrape':
      // Scrape API places the fetched URL at result.url. The webhook overlay's
      // payload.context only carries `webhook` and `job` sub-objects.
      console.log('Scrape result:', {
        url: payload?.result?.url,
        status: payload?.result?.status_code,
      });
      break;

    case 'extraction':
      // Extraction body shape (from a real capture):
      // { content_type, data: { ... }, context: { webhook, job } }
      // The extracted fields live at payload.data, NOT payload.result.data.
      console.log('Extraction result:', {
        content_type: payload?.content_type,
        data: payload?.data,
      });
      break;

    default: {
      const event = crawlEvent || payload?.event;
      switch (event) {
        case 'crawler_started':
          console.log('Crawler started:', payload?.payload?.crawler_uuid);
          break;
        case 'crawler_url_visited':
          console.log('Crawler visited:', payload?.payload?.url);
          break;
        case 'crawler_url_discovered':
          console.log('Crawler discovered:', payload?.payload?.url);
          break;
        case 'crawler_url_skipped':
          console.log('Crawler skipped:', payload?.payload?.url);
          break;
        case 'crawler_url_failed':
          console.log('Crawler failed:', payload?.payload?.url);
          break;
        case 'crawler_stopped':
          console.log('Crawler stopped:', payload?.payload?.crawler_uuid);
          break;
        case 'crawler_cancelled':
          console.log('Crawler cancelled:', payload?.payload?.crawler_uuid);
          break;
        case 'crawler_finished':
          console.log('Crawler finished:', payload?.payload?.crawler_uuid);
          break;
        default:
          console.log('Unhandled Scrapfly webhook:', { resourceType, event });
      }
    }
  }

  return NextResponse.json({ received: true });
}
