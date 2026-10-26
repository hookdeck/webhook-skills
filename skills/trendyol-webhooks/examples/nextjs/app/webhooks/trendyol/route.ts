// Generated with: trendyol-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTrendyolRequest } from '../../../lib/verify-trendyol';

interface TrendyolPackage {
  orderNumber?: string;
  shipmentPackageId?: number;
  status?: string;
  shipmentPackageStatus?: string;
  [key: string]: unknown;
}

// Each package is the full order package; its status says what changed.
function handlePackage(pkg: TrendyolPackage): void {
  const status = String(pkg.status || pkg.shipmentPackageStatus || '').toUpperCase();
  const ref = `${pkg.orderNumber} (package ${pkg.shipmentPackageId})`;

  switch (status) {
    case 'CREATED':
      console.log(`Package created: ${ref}`);
      // TODO: import the order and start picking
      break;

    case 'PICKING':
      console.log(`Package picking: ${ref}`);
      // TODO: mark the order as being prepared
      break;

    case 'INVOICED':
      console.log(`Package invoiced: ${ref}`);
      // TODO: record the invoice (pkg.invoiceNumber, pkg.invoiceLink)
      break;

    case 'SHIPPED':
      console.log(`Package shipped: ${ref}`);
      // TODO: store pkg.cargoTrackingNumber and pkg.cargoProviderName
      break;

    case 'DELIVERED':
      console.log(`Package delivered: ${ref}`);
      // TODO: complete the order
      break;

    case 'UNDELIVERED':
      console.log(`Package undelivered: ${ref}`);
      // TODO: follow up with the carrier
      break;

    case 'CANCELLED':
      console.log(`Package cancelled: ${ref}`);
      // TODO: release stock (pkg.lines[].cancelReason)
      break;

    case 'RETURNED':
      console.log(`Package returned: ${ref}`);
      // TODO: start the return flow
      break;

    case 'UNSUPPLIED':
      console.log(`Package unsupplied: ${ref}`);
      // TODO: reconcile stock
      break;

    case 'AWAITING':
      console.log(`Package awaiting: ${ref}`);
      break;

    case 'UNPACKED':
      console.log(`Package unpacked: ${ref}`);
      break;

    case 'AT_COLLECTION_POINT':
      console.log(`Package at collection point: ${ref}`);
      // TODO: notify the customer if you track pickup
      break;

    case 'VERIFIED':
      console.log(`Package verified: ${ref}`);
      break;

    default:
      console.log(`Unhandled package status: ${status || '(none)'} for ${ref}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTrendyolRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-api-key' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const content = (payload as { content?: unknown } | null)?.content;
  if (!payload || typeof payload !== 'object' || !Array.isArray(content)) {
    return NextResponse.json({ error: 'Expected a JSON object with a content array' }, { status: 400 });
  }

  try {
    for (const pkg of content) {
      if (pkg && typeof pkg === 'object') handlePackage(pkg as TrendyolPackage);
    }
  } catch (err) {
    // A non-2xx makes Trendyol re-send every 5 minutes, so handlers should be idempotent.
    console.error('Error handling Trendyol package:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
