import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCertificateMessageSummaries,
  mapCertificateMessageEvent,
  resolveStaffMessageSender,
} from './certificate-messages.js';
import { renderPatientDoctorMessageEmail } from './email-templates.js';

test('uses the authenticated doctor identity by default', () => {
  assert.deepEqual(resolveStaffMessageSender('unexpected-value', 'Dr Taylor'), {
    sender: 'doctor',
    senderName: 'Dr Taylor',
    eventType: 'DOCTOR_MESSAGE_SENT',
  });
});

test('uses a fixed customer support identity', () => {
  assert.deepEqual(resolveStaffMessageSender('support', 'Spoofed name'), {
    sender: 'support',
    senderName: 'Customer support',
    eventType: 'CUSTOMER_SUPPORT_MESSAGE_SENT',
  });
});

test('maps support audit events without trusting a stored display name', () => {
  const message = mapCertificateMessageEvent({
    event_type: 'CUSTOMER_SUPPORT_MESSAGE_SENT',
    created_at: '2026-08-09T01:00:00.000Z',
    payload: {
      messageId: 'support-1',
      senderName: 'Not customer support',
      message: 'Your request is still in the queue.',
    },
  });

  assert.deepEqual(message, {
    id: 'support-1',
    sender: 'support',
    senderName: 'Customer support',
    message: 'Your request is still in the queue.',
    createdAt: '2026-08-09T01:00:00.000Z',
  });
});

test('only marks the thread as needing a reply when the patient sent the latest message', () => {
  const summaries = buildCertificateMessageSummaries([
    {
      request_id: 'request-1',
      event_type: 'PATIENT_MESSAGE_SENT',
      created_at: '2026-08-09T01:00:00.000Z',
      payload: { message: 'Is there an update?' },
    },
    {
      request_id: 'request-1',
      event_type: 'CUSTOMER_SUPPORT_MESSAGE_SENT',
      created_at: '2026-08-09T01:01:00.000Z',
      payload: { message: 'The doctor will review this shortly.' },
    },
  ]);

  assert.deepEqual(summaries['request-1'], {
    messageCount: 2,
    latestSender: 'support',
    latestMessageAt: '2026-08-09T01:01:00.000Z',
    needsReply: false,
  });
});

test('renders customer support identity in patient email copy', () => {
  const email = renderPatientDoctorMessageEmail({
    baseUrl: 'https://supadoc.com.au',
    requestId: 'request-1',
    senderName: 'Untrusted sender',
    senderType: 'support',
    message: 'We are checking the payment status.',
  });

  assert.match(email.html, /Customer support sent you a message/);
  assert.match(email.text, /From: Customer support/);
  assert.doesNotMatch(email.text, /Untrusted sender/);
});
