import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/payt/route';
import { verifyPaytSignature } from '../lib/verify-payt';

// The Payt secret is an opaque string shown once on the webhooks settings page: used as UTF-8 bytes
const SECRET = 'test_payt_secret_abc123';
const HEADER = 'x-payt-signature';

const sign = (body: string | Buffer, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

const debtor = { id: 1, category: 'Debtor category', company_name: 'Example B.V.', name: 'Noa Jacobs', debtor_code: '2' };
const invoice = {
  id: 1,
  resource_type: 'invoice',
  invoice_number: '2011-1',
  amount_open: '1000',
  currency_code: 'EUR',
  debtor,
};
const wrap = (event_name: string, context: Record<string, unknown>) => ({
  event: { event_name, context, event_time: '2018-06-05T09:48:55.314159Z' },
});

// Shaped like the examples in Payt's events documentation
const events: Record<string, unknown> = {
  invoice_created: wrap('invoice_created', invoice),
  invoice_paid: wrap('invoice_paid', { ...invoice, amount_open: '0' }),
  invoice_closed: wrap('invoice_closed', { ...invoice, amount_open: '0' }),
  invoice_payment_created: wrap('invoice_payment_created', {
    id: 3592191, resource_type: 'invoice_payment', amount: '2.0', book_amount: '2.0', currency_code: 'EUR', invoice, debtor,
  }),
  case_created: wrap('case_created', {
    id: 1, resource_type: 'credit_case', credit_case_number: '123 456 789', currency_code: 'EUR', invoices: [invoice], debtor,
  }),
  case_paid: wrap('case_paid', { id: 1, resource_type: 'credit_case', credit_case_number: '123 456 789', invoices: [invoice], debtor }),
  bundled_reminder_sent: wrap('bundled_reminder_sent', {
    id: 1, resource_type: 'bundled_reminder', sent_as_format: 'email', invoices: [invoice], debtor,
  }),
  payment_plan_created: wrap('payment_plan_created', { id: 1, resource_type: 'payment_plan', invoices: [invoice], debtor }),
  credit_limit_exceeded: wrap('credit_limit_exceeded', {
    id: 730816, resource_type: 'debtor', debtor_code: '2', name: 'Some name', credit_limit_amount: 1100.0, book_open_amount: 1798.0,
  }),
  psp_transaction_successful: wrap('psp_transaction_successful', invoice),
  // Not handled explicitly: must still be acknowledged
  label_added: wrap('label_added', invoice),
};

function post(raw: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/payt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: raw,
    })
  );
}

describe('verifyPaytSignature', () => {
  const raw = Buffer.from('{"event":{"event_name":"invoice_created"}}');

  it('accepts a valid lowercase hex signature', () => {
    expect(verifyPaytSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('accepts uppercase hex (hex is case-insensitive)', () => {
    expect(verifyPaytSignature(raw, sign(raw).toUpperCase(), SECRET)).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['too short', 'abcd'],
    ['too long', sign(raw) + '00'],
    ['non-hex characters', 'z'.repeat(64)],
    ['sha256= prefix', `sha256=${sign(raw)}`],
    ['whitespace padded', ` ${sign(raw)} `],
    ['base64 instead of hex', crypto.createHmac('sha256', SECRET).update(raw).digest('base64')],
  ])('rejects a %s signature', (_name, sig) => {
    expect(verifyPaytSignature(raw, sig as string | null | undefined, SECRET)).toBe(false);
  });

  it('rejects a signature from another secret', () => {
    expect(verifyPaytSignature(raw, sign(raw, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects a missing secret', () => {
    expect(verifyPaytSignature(raw, sign(raw), undefined)).toBe(false);
  });
});

describe('POST /webhooks/payt', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubEnv('PAYT_WEBHOOK_SECRET', SECRET);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(Object.keys(events))('accepts a signed %s event', async (name) => {
    const raw = JSON.stringify(events[name]);
    const res = await post(raw, { [HEADER]: sign(raw) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('dispatches on event.event_name', async () => {
    const raw = JSON.stringify(events.invoice_created);
    await post(raw, { [HEADER]: sign(raw) });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invoice 2011-1 created for Noa Jacobs'));
  });

  it('logs events it does not handle', async () => {
    const raw = JSON.stringify(events.label_added);
    await post(raw, { [HEADER]: sign(raw) });
    expect(logSpy).toHaveBeenCalledWith('Unhandled Payt event: label_added');
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const raw = JSON.stringify(events.invoice_paid);
    const res = await post(raw, { 'content-type': 'text/plain', [HEADER]: sign(raw) });
    expect(res.status).toBe(200);
  });

  it('verifies the raw body, not a re-serialised one', async () => {
    const raw = '{ "event": { "event_name": "invoice_created",   "context": {} } }';
    expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(200);
    const reserialised = JSON.stringify(JSON.parse(raw));
    expect((await post(raw, { [HEADER]: sign(reserialised) })).status).toBe(401);
  });

  it('rejects a missing signature with 401', async () => {
    expect((await post(JSON.stringify(events.invoice_created))).status).toBe(401);
  });

  it('rejects an empty signature with 401', async () => {
    expect((await post(JSON.stringify(events.invoice_created), { [HEADER]: '' })).status).toBe(401);
  });

  it('rejects a signature for another secret with 401', async () => {
    const raw = JSON.stringify(events.invoice_created);
    expect((await post(raw, { [HEADER]: sign(raw, 'wrong') })).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const raw = JSON.stringify(events.invoice_created);
    const tampered = raw.replace('1000', '1');
    expect((await post(tampered, { [HEADER]: sign(raw) })).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    const raw = JSON.stringify(events.invoice_created);
    expect((await post(raw, { [HEADER]: 'not-a-signature' })).status).toBe(401);
    expect((await post(raw, { [HEADER]: `sha256=${sign(raw)}` })).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const raw = 'not json';
    expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(400);
  });

  it('returns 400 when event.event_name is missing', async () => {
    const raw = JSON.stringify({ event: { context: {} } });
    expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(400);
    const flat = JSON.stringify({ event_name: 'invoice_created' });
    expect((await post(flat, { [HEADER]: sign(flat) })).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    vi.stubEnv('PAYT_WEBHOOK_SECRET', '');
    const raw = JSON.stringify(events.invoice_created);
    expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(500);
  });
});
