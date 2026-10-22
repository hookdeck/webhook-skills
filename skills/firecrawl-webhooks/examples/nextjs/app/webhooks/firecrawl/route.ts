// Generated with: firecrawl-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify X-Firecrawl-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body.
 */
function verifyFirecrawlWebhook(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!signatureHeader || !secret) return false;

  const idx = signatureHeader.indexOf('=');
  const algo = signatureHeader.slice(0, idx);
  const sig = signatureHeader.slice(idx + 1);
  if (idx < 0 || algo !== 'sha256' || !sig) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (any content type)
  const body = await request.text();
  const signature = request.headers.get('x-firecrawl-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Firecrawl-Signature header' }, { status: 400 });
  }

  if (!verifyFirecrawlWebhook(body, signature, process.env.FIRECRAWL_WEBHOOK_SECRET)) {
    console.error('Firecrawl signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.type) {
    case 'crawl.started':
      console.log(`Crawl ${event.id} started`);
      break;
    case 'crawl.page':
      console.log(`Crawl ${event.id} scraped ${event.data?.[0]?.metadata?.url}`);
      // TODO: store event.data[0].markdown, dedupe on event.webhookId
      break;
    case 'crawl.completed':
      console.log(`Crawl ${event.id} completed`);
      break;
    case 'batch_scrape.started':
      console.log(`Batch scrape ${event.id} started`);
      break;
    case 'batch_scrape.page':
      console.log(`Batch scrape ${event.id} scraped ${event.data?.[0]?.metadata?.url}`);
      break;
    case 'batch_scrape.completed':
      console.log(`Batch scrape ${event.id} completed`);
      break;
    case 'extract.started':
      console.log(`Extract ${event.id} started`);
      break;
    case 'extract.completed':
      console.log(`Extract ${event.id} completed:`, event.data?.[0]?.data);
      break;
    case 'extract.failed':
      console.error(`Extract ${event.id} failed: ${event.error}`);
      break;
    case 'agent.started':
    case 'agent.action':
    case 'agent.completed':
    case 'agent.failed':
    case 'agent.cancelled':
      console.log(`Agent ${event.id}: ${event.type}`);
      break;
    case 'monitor.page':
    case 'monitor.check.completed':
      console.log(`Monitor ${event.id}: ${event.type}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
