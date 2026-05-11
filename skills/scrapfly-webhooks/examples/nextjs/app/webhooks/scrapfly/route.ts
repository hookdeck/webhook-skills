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
  rawBody: string,
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
  // Read raw body as text — JSON.parse + re-stringify would change the bytes
  // and break the signature.
  const rawBody = await request.text();

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

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Failed to parse Scrapfly webhook payload:', err);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  console.log(`Scrapfly webhook (id=${webhookId} resource=${resourceType} job=${jobId})`);

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
      console.log('Extraction result:', payload?.result?.data);
      break;

    case 'screenshot':
      console.log('Screenshot result URL:', payload?.result?.screenshot_url);
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
