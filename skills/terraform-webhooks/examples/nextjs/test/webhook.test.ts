import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getTriggers, verifyTerraformSignature } from '../lib/terraform';
import { POST } from '../app/webhooks/terraform/route';

const token = 'test_terraform_token';

beforeAll(() => {
  process.env.TERRAFORM_NOTIFICATION_TOKEN = token;
});

/**
 * Generate a valid X-TFE-Notification-Signature for testing:
 * hex HMAC-SHA512 of the raw body keyed with the notification token.
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

function runPayload(trigger: string) {
  return {
    payload_version: 1,
    notification_configuration_id: 'nc-AeUQ2zfKZzW9TiGZ',
    run_url: 'https://app.terraform.io/app/acme-org/my-workspace/runs/run-FwnENkvDnrpyFC7M',
    run_id: 'run-FwnENkvDnrpyFC7M',
    workspace_id: 'ws-XdeUVMWShTesDMME',
    workspace_name: 'my-workspace',
    organization_name: 'acme-org',
    notifications: [{ message: 'Run Applied', trigger, run_status: 'applied' }],
  };
}

const verificationPayload = {
  payload_version: 1,
  notification_configuration_id: 'nc-jWvVsmp5VxsaCeXm',
  run_id: null,
  workspace_name: null,
  notifications: [{ message: 'Verification of test', trigger: 'verification', run_status: null }],
};

const driftPayload = {
  payload_version: '2',
  notification_configuration_id: 'nc-SZ3V3cLFxK6sqLKn',
  trigger_scope: 'assessment',
  trigger: 'assessment:drifted',
  message: 'Drift Detected',
  details: { workspace_name: 'my-workspace', organization_name: 'acme-org' },
};

describe('verifyTerraformSignature', () => {
  it('validates a correct signature', () => {
    const payload = JSON.stringify({ payload_version: 1 });
    expect(verifyTerraformSignature(payload, generateSignature(payload, token), token)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    const payload = JSON.stringify({ payload_version: 1 });
    const signature = generateSignature(payload, token).toUpperCase();
    expect(verifyTerraformSignature(payload, signature, token)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyTerraformSignature('{}', 'deadbeef', token)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyTerraformSignature('{}', null, token)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const signature = generateSignature('{"run_id":"run-1"}', token);
    expect(verifyTerraformSignature('{"run_id":"run-2"}', signature, token)).toBe(false);
  });

  it('rejects the wrong token', () => {
    const payload = '{}';
    expect(verifyTerraformSignature(payload, generateSignature(payload, token), 'wrong')).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', token).update('{}').digest('hex');
    expect(verifyTerraformSignature('{}', sha256, token)).toBe(false);
  });
});

describe('getTriggers', () => {
  it('reads triggers from the notifications array', () => {
    expect(getTriggers(runPayload('run:completed'))).toEqual(['run:completed']);
  });

  it('reads the top-level trigger of workspace payloads', () => {
    expect(getTriggers(driftPayload)).toEqual(['assessment:drifted']);
  });

  it('identifies change request payloads', () => {
    expect(getTriggers({ change_request_url: 'https://app.terraform.io/x' })).toEqual(['team:change_request']);
  });
});

describe('POST /webhooks/terraform', () => {
  beforeEach(() => {
    process.env.TERRAFORM_NOTIFICATION_TOKEN = token;
  });

  function post(body: unknown, opts: { signature?: string; contentType?: string } = {}) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const signature = opts.signature === undefined ? generateSignature(raw, token) : opts.signature;
    const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
    if (signature) headers['x-tfe-notification-signature'] = signature;
    return POST(new NextRequest('http://localhost:3000/webhooks/terraform', { method: 'POST', headers, body: raw }));
  }

  it('accepts the verification request', async () => {
    expect((await post(verificationPayload)).status).toBe(200);
  });

  it.each(['run:created', 'run:planning', 'run:needs_attention', 'run:applying', 'run:completed', 'run:errored'])(
    'accepts a %s run notification',
    async (trigger) => {
      expect((await post(runPayload(trigger))).status).toBe(200);
    }
  );

  it.each(['assessment:drifted', 'assessment:check_failure', 'assessment:failed'])(
    'accepts a %s workspace notification',
    async (trigger) => {
      expect((await post({ ...driftPayload, trigger })).status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    expect((await post(runPayload('run:completed'), { contentType: 'text/plain' })).status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    expect((await post(runPayload('run:completed'), { signature: 'a'.repeat(128) })).status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    expect((await post(runPayload('run:completed'), { signature: '' })).status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  it('returns 500 when the token is not configured', async () => {
    delete process.env.TERRAFORM_NOTIFICATION_TOKEN;
    expect((await post(runPayload('run:completed'))).status).toBe(500);
  });
});
