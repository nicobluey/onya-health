const BRAND = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#d9e3f2',
  text: '#0f172a',
  textSoft: '#475569',
  primary: '#3b82f6',
  primaryDark: '#1d4ed8',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/$/, '');
}

function toAssetUrl(baseUrl, assetPath) {
  const base = normalizeBaseUrl(baseUrl);
  const path = String(assetPath || '').startsWith('/') ? assetPath : `/${assetPath}`;
  return `${base}${path}`;
}

function renderShell({ baseUrl, badge, title, subtitle, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const heroImage = toAssetUrl(baseUrl, '/HERO.png');
  const logoImage = toAssetUrl(baseUrl, '/logo.png');
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeBadge = escapeHtml(badge);
  const safeFooter = escapeHtml(footerNote || 'Onya Health · Trusted telehealth care across Australia');

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:'Basic Commercial Pro',Arial,sans-serif;color:${BRAND.text};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 0;">
                <img src="${logoImage}" alt="Onya Health" width="170" style="display:block;width:170px;max-width:100%;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 0;">
                <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e9f2ff;border:1px solid #bcd8ff;color:${BRAND.primaryDark};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">
                  ${safeBadge}
                </span>
                <h1 style="margin:14px 0 8px;font-size:32px;line-height:1.08;color:${BRAND.text};font-weight:700;">${safeTitle}</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:${BRAND.textSoft};">${safeSubtitle}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 20px;">
                <img src="${heroImage}" alt="" width="564" style="display:block;width:100%;max-width:564px;height:auto;border-radius:18px;border:1px solid ${BRAND.border};" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 26px;font-size:15px;line-height:1.65;color:${BRAND.text};">
                ${bodyHtml}
                ${
                  ctaLabel && ctaUrl
                    ? `<div style="margin-top:18px;">
                      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.5;color:#64748b;">
                ${safeFooter}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export function renderDoctorReviewEmail({ baseUrl, requestId, patientName, riskLabel, reviewUrl }) {
  const safeId = escapeHtml(requestId);
  const safePatient = escapeHtml(patientName);
  const safeRisk = escapeHtml(riskLabel);

  const html = renderShell({
    baseUrl,
    badge: 'Doctor Queue Update',
    title: 'New medical certificate to review',
    subtitle: 'A new patient request is ready in your doctor portal queue.',
    bodyHtml: `
      <p style="margin:0 0 10px;"><strong>Request ID:</strong> ${safeId}</p>
      <p style="margin:0 0 10px;"><strong>Patient:</strong> ${safePatient}</p>
      <p style="margin:0;"><strong>Risk:</strong> ${safeRisk}</p>
    `,
    ctaLabel: 'Open doctor queue',
    ctaUrl: reviewUrl,
  });

  return {
    html,
    text: `New medical certificate to review.\nRequest ID: ${requestId}\nPatient: ${patientName}\nRisk: ${riskLabel}\nOpen queue: ${reviewUrl}`,
  };
}

export function renderPatientCertificateReadyEmail({ baseUrl, requestId }) {
  const html = renderShell({
    baseUrl,
    badge: 'Certificate Ready',
    title: 'Your medical certificate is ready',
    subtitle: 'Your request has been reviewed and approved by an Onya doctor.',
    bodyHtml: `<p style="margin:0;"><strong>Request ID:</strong> ${escapeHtml(requestId)}</p><p style="margin:10px 0 0;">A copy of your certificate is attached to this email.</p>`,
  });

  return {
    html,
    text: `Your medical certificate is ready.\nRequest ID: ${requestId}\nA PDF copy is attached to this email.`,
  };
}

export function renderPatientCertificateDeniedEmail({ baseUrl, requestId }) {
  const html = renderShell({
    baseUrl,
    badge: 'Request Update',
    title: 'Update on your certificate request',
    subtitle: 'Your medical certificate request has been reviewed.',
    bodyHtml: `
      <p style="margin:0 0 10px;"><strong>Request ID:</strong> ${escapeHtml(requestId)}</p>
      <p style="margin:0;">Outcome: <strong>Not approved</strong>. You can submit a new consult if your symptoms change.</p>
    `,
  });

  return {
    html,
    text: `Update on your medical certificate request.\nRequest ID: ${requestId}\nOutcome: Not approved.`,
  };
}

export function renderPatientMoreInfoEmail({ baseUrl, requestId, doctorEmail, notes }) {
  const html = renderShell({
    baseUrl,
    badge: 'More Information Needed',
    title: 'Your doctor needs one more detail',
    subtitle: 'Please reply to continue your certificate review quickly.',
    bodyHtml: `
      <p style="margin:0 0 10px;"><strong>Request ID:</strong> ${escapeHtml(requestId)}</p>
      <p style="margin:0 0 10px;"><strong>Doctor:</strong> ${escapeHtml(doctorEmail)}</p>
      <p style="margin:0 0 8px;"><strong>Doctor note:</strong></p>
      <p style="margin:0;padding:12px 14px;border:1px solid ${BRAND.border};border-radius:12px;background:#f8fbff;">${escapeHtml(notes || 'Please provide additional details to continue your review.')}</p>
    `,
  });

  return {
    html,
    text: `More information is needed for request ${requestId}.\nDoctor: ${doctorEmail}\nNote: ${notes || 'Please provide additional details to continue your review.'}`,
  };
}

export function renderPatientWelcomeEmail({ baseUrl, fullName }) {
  const greeting = fullName ? `Welcome, ${fullName}` : 'Welcome to Onya Health';
  const html = renderShell({
    baseUrl,
    badge: 'Patient Account',
    title: greeting,
    subtitle: 'Your patient portal account is now active.',
    bodyHtml: '<p style="margin:0;">You can sign in with your email and password to track consult updates and certificates.</p>',
  });
  return {
    html,
    text: `${greeting}. Your patient portal account is now active.`,
  };
}

export function renderPatientPasswordResetEmail({ baseUrl, resetUrl, expiresMinutes }) {
  const html = renderShell({
    baseUrl,
    badge: 'Security',
    title: 'Reset your patient password',
    subtitle: 'A secure link was requested to reset your account password.',
    bodyHtml: `<p style="margin:0;">This reset link expires in <strong>${escapeHtml(expiresMinutes)}</strong> minutes.</p>`,
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
  });
  return {
    html,
    text: `Reset your patient password: ${resetUrl}\nThis link expires in ${expiresMinutes} minutes.`,
  };
}

export function renderDoctorWelcomeEmail({ baseUrl, fullName }) {
  const greeting = fullName ? `Welcome, Dr. ${fullName}` : 'Welcome to the Onya doctor portal';
  const html = renderShell({
    baseUrl,
    badge: 'Doctor Account',
    title: greeting,
    subtitle: 'Your doctor review account has been created.',
    bodyHtml: '<p style="margin:0;">You will now receive notifications when new certificates are ready for review.</p>',
  });
  return {
    html,
    text: `${greeting}. Your doctor review account has been created.`,
  };
}

export function renderDoctorPasswordResetEmail({ baseUrl, resetUrl, expiresMinutes }) {
  const html = renderShell({
    baseUrl,
    badge: 'Doctor Security',
    title: 'Reset your doctor portal password',
    subtitle: 'A secure link was requested for your doctor account.',
    bodyHtml: `<p style="margin:0;">This reset link expires in <strong>${escapeHtml(expiresMinutes)}</strong> minutes.</p>`,
    ctaLabel: 'Reset doctor password',
    ctaUrl: resetUrl,
  });
  return {
    html,
    text: `Reset your doctor password: ${resetUrl}\nThis link expires in ${expiresMinutes} minutes.`,
  };
}

export function renderDoctorPatientMessageEmail({ baseUrl, certId, patientEmail, message }) {
  const html = renderShell({
    baseUrl,
    badge: 'Patient Message',
    title: 'New patient response received',
    subtitle: 'A patient replied in the certificate thread.',
    bodyHtml: `
      <p style="margin:0 0 10px;"><strong>Request ID:</strong> ${escapeHtml(certId)}</p>
      <p style="margin:0 0 10px;"><strong>From:</strong> ${escapeHtml(patientEmail)}</p>
      <p style="margin:0 0 8px;"><strong>Message:</strong></p>
      <p style="margin:0;padding:12px 14px;border:1px solid ${BRAND.border};border-radius:12px;background:#f8fbff;">${escapeHtml(message)}</p>
    `,
  });
  return {
    html,
    text: `Patient message for request ${certId}\nFrom: ${patientEmail}\nMessage: ${message}`,
  };
}
