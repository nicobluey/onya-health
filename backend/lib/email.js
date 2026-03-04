import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { error, info } from './logger.js';

function defaultOutboxPath() {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), 'onya-health-outbox.log');
  }
  return path.resolve(process.cwd(), 'backend', 'data', 'outbox.log');
}

const OUTBOX_PATH = process.env.OUTBOX_PATH || defaultOutboxPath();
const RESEND_API_URL = 'https://api.resend.com/emails';
let cachedSmtpTransporter = null;

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const tlsRejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

  return {
    host,
    port,
    user,
    pass,
    secure,
    tlsRejectUnauthorized,
    enabled: Boolean(host && port && user && pass),
  };
}

export function currentEmailProvider() {
  const explicitProvider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const smtp = getSmtpConfig();
  const resendEnabled = Boolean(String(process.env.RESEND_API_KEY || '').trim());

  if (explicitProvider === 'smtp') return smtp.enabled ? 'smtp' : 'mock-outbox';
  if (explicitProvider === 'resend') return resendEnabled ? 'resend' : 'mock-outbox';

  // On serverless, prefer HTTP API providers first when available.
  if (process.env.VERCEL && resendEnabled) return 'resend';
  if (smtp.enabled) return 'smtp';
  if (resendEnabled) return 'resend';
  return 'mock-outbox';
}

function allowMockEmailFallback() {
  const explicitOverride = String(process.env.ALLOW_MOCK_EMAIL || '').trim().toLowerCase();
  if (explicitOverride === 'true') return true;
  if (explicitOverride === 'false') return false;
  return !process.env.VERCEL;
}

async function getSmtpTransporter() {
  const config = getSmtpConfig();
  if (!config.enabled) return null;
  if (cachedSmtpTransporter) return cachedSmtpTransporter;

  const nodemailer = await import('nodemailer');
  cachedSmtpTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: config.tlsRejectUnauthorized,
    },
  });

  return cachedSmtpTransporter;
}

async function appendOutbox(entry) {
  try {
    await fs.mkdir(path.dirname(OUTBOX_PATH), { recursive: true });
    await fs.appendFile(OUTBOX_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    return true;
  } catch (err) {
    if (['EROFS', 'EACCES', 'EPERM'].includes(err?.code)) {
      info('email.outbox.unwritable', {
        code: err.code,
        message: err.message,
        outboxPath: OUTBOX_PATH,
      });
      return false;
    }
    throw err;
  }
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || 'Onya Health <noreply@onyahealth.com>';
  const recipients = Array.isArray(to) ? to : [to];
  const provider = currentEmailProvider();

  info('email.dispatch.started', {
    provider,
    toCount: recipients.length,
    subject,
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
  });

  if (provider === 'smtp') {
    try {
      const transporter = await getSmtpTransporter();
      const payload = await transporter.sendMail({
        from,
        to: recipients.join(', '),
        subject,
        html,
        text,
        attachments: attachments.map((file) => ({
          filename: file.filename,
          content: Buffer.from(String(file.contentBase64 || ''), 'base64'),
        })),
      });

      const accepted = Array.isArray(payload?.accepted)
        ? payload.accepted.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const rejected = Array.isArray(payload?.rejected)
        ? payload.rejected.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const expected = recipients.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
      const fullyAccepted = expected.length > 0 && expected.every((entry) => accepted.includes(entry));
      const anyAccepted = accepted.length > 0;

      info('email.dispatch.succeeded', {
        provider,
        to: recipients,
        subject,
        status: 'accepted',
        id: payload?.messageId || null,
        accepted,
        rejected,
        response: payload?.response || null,
      });

      // Fail closed in production if SMTP did not accept the intended recipient(s).
      if (process.env.VERCEL && (!anyAccepted || !fullyAccepted)) {
        const deliveryError = new Error(
          `SMTP accepted ${accepted.length}/${expected.length} recipients (rejected: ${rejected.join(', ') || 'none'})`
        );
        error('email.dispatch.partial_or_rejected', {
          provider,
          to: recipients,
          subject,
          accepted,
          rejected,
          response: payload?.response || null,
        });
        throw deliveryError;
      }
      return payload;
    } catch (errorObject) {
      await appendOutbox({
        at: new Date().toISOString(),
        mode: 'error',
        provider,
        to: recipients,
        from,
        subject,
        error: errorObject?.message || String(errorObject),
      });
      error('email.dispatch.failed', {
        provider,
        to: recipients,
        subject,
        errorText: errorObject?.message || String(errorObject),
      });
      throw errorObject;
    }
  }

  if (provider === 'mock-outbox' || !apiKey) {
    if (!allowMockEmailFallback()) {
      const configError = new Error(
        'Email provider is not configured. Set SMTP_* or RESEND_API_KEY in production.'
      );
      error('email.dispatch.unconfigured', {
        provider,
        to: recipients,
        subject,
      });
      throw configError;
    }

    const saved = await appendOutbox({
      at: new Date().toISOString(),
      mode: 'mock',
      to: recipients,
      from,
      subject,
      html,
      text,
      attachmentNames: attachments.map((item) => item.filename),
    });
    info(saved ? 'email.dispatch.mock_saved' : 'email.dispatch.mock_unsaved', {
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
