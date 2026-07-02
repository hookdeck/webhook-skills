import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

process.env.SALESFORCE_ORG_ID = '00Dxx0000000000EAA';
const ORG_ID = process.env.SALESFORCE_ORG_ID;

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('../app/webhooks/salesforce/route'));
});

interface TestNotification {
  id: string;
  type: string;
  recordId: string;
  name?: string;
}

function buildOutboundMessage({
  orgId = ORG_ID,
  notifications = [] as TestNotification[],
} = {}): string {
  const notificationXml = notifications
    .map(
      (n) => `
      <Notification>
        <Id>${n.id}</Id>
        <sObject xsi:type="sf:${n.type}" xmlns:sf="urn:sobject.enterprise.soap.sforce.com">
          <sf:Id>${n.recordId}</sf:Id>
          ${n.name ? `<sf:Name>${n.name}</sf:Name>` : ''}
        </sObject>
      </Notification>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <OrganizationId>${orgId}</OrganizationId>
      <ActionId>04kxx0000000000AAA</ActionId>
      <SessionId xsi:nil="true"/>
      <EnterpriseUrl>https://na1.salesforce.com/services/Soap/c/67.0/${orgId}</EnterpriseUrl>
      <PartnerUrl>https://na1.salesforce.com/services/Soap/u/67.0/${orgId}</PartnerUrl>${notificationXml}
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function post(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/salesforce', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body,
  });
}

describe('Salesforce Outbound Message route', () => {
  it('acks a valid message with the correct OrganizationId', async () => {
    const body = buildOutboundMessage({
      notifications: [
        { id: '04lxx000000000AAAA', type: 'Account', recordId: '001xx000003DGb2AAG', name: 'Acme Corp' },
      ],
    });

    const res = await POST(post(body));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
    expect(text).toContain('notificationsResponse');
    expect(text).toContain('<Ack>true</Ack>');
  });

  it('rejects a message with a mismatched OrganizationId', async () => {
    const body = buildOutboundMessage({
      orgId: '00Dyy0000000000ZZZ',
      notifications: [{ id: '04lxx000000000BBBB', type: 'Contact', recordId: '003xx000004TmiQAAS' }],
    });

    const res = await POST(post(body));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('<Ack>true</Ack>');
  });

  it('rejects a body that is not an Outbound Message', async () => {
    const res = await POST(post('<html><body>not soap</body></html>'));
    expect(res.status).toBe(401);
  });

  it('processes multiple notifications in one message', async () => {
    const notifications = Array.from({ length: 3 }, (_, i) => ({
      id: `04lxx00000000${i}AAAA`,
      type: 'Opportunity',
      recordId: `006xx00000000${i}AAAA`,
    }));

    const res = await POST(post(buildOutboundMessage({ notifications })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Ack>true</Ack>');
  });
});
