import fs from 'node:fs/promises';
import path from 'node:path';
import { error, info } from './logger.js';

const OUTBOX_PATH = path.resolve(process.cwd(), 'backend', 'data', 'outbox.log');
const RESEND_API_URL = 'https://api.resend.com/emails';

async function appendOutbox(entry) {
  await fs.mkdir(path.dirname(OUTBOX_PATH), { recursive: true });
  await fs.appendFile(OUTBOX_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || 'Onya Health <noreply@onyahealth.com>';
  const recipients = Array.isArray(to) ? to : [to];
  const provider = apiKey ? 'resend' : 'mock-outbox';

  info('email.dispatch.started', {
    provider,
    toCount: recipients.length,
    subject,
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
  });

  if (!apiKey) {
    await appendOutbox({
      at: new Date().toISOString(),
      mode: 'mock',
      to: recipients,
      from,
      subject,
      html,
      text,
      attachmentNames: attachments.map((item) => item.filename),
    });
    info('email.dispatch.mock_saved', {
      provider,
      to: recipients,
      subject,
      outboxPath: OUTBOX_PATH,
    });
    return { mocked: true };
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
      attachments: attachments.map((file) => ({
        filename: file.filename,
        content: file.contentBase64,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    await appendOutbox({
      at: new Date().toISOString(),
      mode: 'error',
      to: recipients,
      from,
      subject,
      error: errorText,
    });
    error('email.dispatch.failed', {
      provider,
      to: recipients,
      subject,
      status: response.status,
      errorText,
    });
    throw new Error(`Email delivery failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  info('email.dispatch.succeeded', {
    provider,
    to: recipients,
    subject,
    status: response.status,
    id: payload?.id || null,
  });
  return payload;
}
