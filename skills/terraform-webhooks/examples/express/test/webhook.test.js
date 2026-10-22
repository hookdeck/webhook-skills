const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TERRAFORM_NOTIFICATION_TOKEN = 'test_terraform_token';

const { app, verifyTerraformSignature, getTriggers } = require('../src/index');

/**
 * Generate a valid X-TFE-Notification-Signature for testing:
 * hex HMAC-SHA512 of the raw body keyed with the notification token.
 */
function generateSignature(payload, token) {
  return crypto.createHmac('sha512', token).update(payload).digest('hex');
}

const runPayload = (trigger, runStatus = 'applied') => ({
  payload_version: 1,
  notification_configuration_id: 'nc-AeUQ2zfKZzW9TiGZ',
  run_url: 'https://app.terraform.io/app/acme-org/my-workspace/runs/run-FwnENkvDnrpyFC7M',
  run_id: 'run-FwnENkvDnrpyFC7M',
  run_message: 'Add five new queue workers',
  run_created_at: '2019-01-25T18:34:00.000Z',
  run_created_by: 'sample-user',
  workspace_id: 'ws-XdeUVMWShTesDMME',
  workspace_name: 'my-workspace',
  organization_name: 'acme-org',
  notifications: [
    {
      message: 'Run Applied',
      trigger,
      run_status: runStatus,
      run_updated_at: '2019-01-25T18:37:04.000Z',
      run_updated_by: 'sample-user',
    },
  ],
});

const verificationPayload = {
  payload_version: 1,
  notification_configuration_id: 'nc-jWvVsmp5VxsaCeXm',
  run_url: null,
  run_id: null,
  run_message: null,
  run_created_at: null,
  run_created_by: null,
  workspace_id: null,
  workspace_name: null,
  organization_name: null,
  notifications: [
    {
      message: 'Verification of test',
      trigger: 'verification',
      run_status: null,
      run_updated_at: null,
      run_updated_by: null,
    },
  ],
};

const driftPayload = {
  payload_version: '2',
  notification_configuration_id: 'nc-SZ3V3cLFxK6sqLKn',
  notification_configuration_url: 'https://app.terraform.io/api/v2/notification-configurations/nc-SZ3V3cLFxK6sqLKn',
  trigger_scope: 'assessment',
  trigger: 'assessment:drifted',
  message: 'Drift Detected',
  details: {
    new_assessment_result: { id: 'asmtres-vRVQxpqq64EA9V5a', drifted: true, resources_drifted: 4 },
    workspace_id: 'ws-XdeUVMWShTesDMME',
    workspace_name: 'my-workspace',
    organization_name: 'acme-org',
  },
};

describe('Terraform Webhook Endpoint', () => {
  const token = process.env.TERRAFORM_NOTIFICATION_TOKEN;

  describe('verifyTerraformSignature', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"payload_version":1}');
      const signature = generateSignature(payload, token);

      expect(verifyTerraformSignature(payload, signature, token)).toBe(true);
    });

    it('should accept an uppercase hex signature', () => {
      const payload = Buffer.from('{"payload_version":1}');
      const signature = generateSignature(payload, token).toUpperCase();

      expect(verifyTerraformSignature(payload, signature, token)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"payload_version":1}');

      expect(verifyTerraformSignature(payload, 'deadbeef', token)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"payload_version":1}');

      expect(verifyTerraformSignature(payload, undefined, token)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"run_id":"run-1"}');
      const signature = generateSignature(original, token);

      expect(verifyTerraformSignature(Buffer.from('{"run_id":"run-2"}'), signature, token)).toBe(false);
    });

    it('should return false for the wrong token', () => {
      const payload = Buffer.from('{"payload_version":1}');
      const signature = generateSignature(payload, token);

      expect(verifyTerraformSignature(payload, signature, 'wrong_token')).toBe(false);
    });

    it('should reject a SHA-256 signature', () => {
      const payload = Buffer.from('{"payload_version":1}');
      const sha256 = crypto.createHmac('sha256', token).update(payload).digest('hex');

      expect(verifyTerraformSignature(payload, sha256, token)).toBe(false);
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
    const post = (body, { signature, contentType = 'application/json' } = {}) => {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      const req = request(app)
        .post('/webhooks/terraform')
        .set('Content-Type', contentType);
      const sig = signature === undefined ? generateSignature(raw, token) : signature;
      if (sig) req.set('X-TFE-Notification-Signature', sig);
      return req.send(raw);
    };

    it('should accept the verification request', async () => {
      const response = await post(verificationPayload);
      expect(response.status).toBe(200);
    });

    it.each([
      'run:created',
      'run:planning',
      'run:needs_attention',
      'run:applying',
      'run:completed',
      'run:errored',
    ])('should accept a %s run notification', async (trigger) => {
      const response = await post(runPayload(trigger));
      expect(response.status).toBe(200);
    });

    it.each(['assessment:drifted', 'assessment:check_failure', 'assessment:failed'])(
      'should accept a %s workspace notification',
      async (trigger) => {
        const response = await post({ ...driftPayload, trigger });
        expect(response.status).toBe(200);
      }
    );

    it('should verify regardless of content type', async () => {
      const response = await post(runPayload('run:completed'), { contentType: 'text/plain' });
      expect(response.status).toBe(200);
    });

    it('should return 400 for an invalid signature', async () => {
      const response = await post(runPayload('run:completed'), { signature: 'a'.repeat(128) });
      expect(response.status).toBe(400);
    });

    it('should return 400 when the signature header is missing', async () => {
      const response = await post(runPayload('run:completed'), { signature: '' });
      expect(response.status).toBe(400);
    });

    it('should return 400 for a signed body that is not JSON', async () => {
      const response = await post('not json');
      expect(response.status).toBe(400);
    });
  });
});
