import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCertificateMessageSummaries,
  mapCertificateMessageEvent,
  resolveStaffMessageSender,
} from './certificate-messages.js';
import {
  renderPatientDoctorMessageEmail,
  renderPatientMoreInfoEmail,
} from './email-templates.js';

test('uses a role identity for clinical replies', () => {
  assert.deepEqual(resolveStaffMessageSender('unexpected-value'), {
    sender: 'doctor',
    senderName: 'Clinical team',
    eventType: 'DOCTOR_MESSAGE_SENT',
  });
});

test('uses a fixed customer support identity', () => {
  assert.deepEqual(resolveStaffMessageSender('support'), {
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

test('anonymises historical doctor message display names', () => {
  const message = mapCertificateMessageEvent({
    event_type: 'DOCTOR_MESSAGE_SENT',
    created_at: '2026-08-09T01:00:00.000Z',
    payload: {
      messageId: 'doctor-1',
      senderName: 'Dr Taylor',
      message: 'Your request is under review.',
    },
  });

  assert.equal(message.senderName, 'Clinical team');
  assert.doesNotMatch(JSON.stringify(message), /Dr Taylor/);
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

test('renders a clinical role identity instead of a doctor name in patient email copy', () => {
  const email = renderPatientDoctorMessageEmail({
    baseUrl: 'https://supadoc.com.au',
    requestId: 'request-1',
    senderName: 'Dr Taylor',
    senderType: 'doctor',
    message: 'Your request is under review.',
  });

  assert.match(email.html, /Clinical team sent you a message/);
  assert.match(email.text, /From: Clinical team/);
  assert.doesNotMatch(`${email.html}\n${email.text}`, /Dr Taylor/);
});

test('does not expose a doctor email in more-information emails', () => {
  const email = renderPatientMoreInfoEmail({
    baseUrl: 'https://supadoc.com.au',
    requestId: 'request-1',
    doctorEmail: 'doctor.personal@example.com',
    notes: 'Please confirm the first day you missed work.',
  });

  assert.match(email.text, /From: Clinical team/);
  assert.doesNotMatch(`${email.html}\n${email.text}`, /doctor\.personal@example\.com/);
});
