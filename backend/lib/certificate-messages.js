export const CERTIFICATE_MESSAGE_EVENT_TYPES = Object.freeze([
  'PATIENT_MESSAGE_SENT',
  'DOCTOR_MESSAGE_SENT',
  'CUSTOMER_SUPPORT_MESSAGE_SENT',
  'MORE_INFO_REQUESTED',
]);

const CERTIFICATE_MESSAGE_EVENT_TYPE_SET = new Set(CERTIFICATE_MESSAGE_EVENT_TYPES);

export function resolveStaffMessageSender(requestedSenderType) {
  const sender = String(requestedSenderType || '').trim().toLowerCase() === 'support'
    ? 'support'
    : 'doctor';

  if (sender === 'support') {
    return {
      sender,
      senderName: 'Customer support',
      eventType: 'CUSTOMER_SUPPORT_MESSAGE_SENT',
    };
  }

  return {
    sender,
    senderName: 'Clinical team',
    eventType: 'DOCTOR_MESSAGE_SENT',
  };
}

export function mapCertificateMessageEvent(entry, index = 0) {
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : entry || {};
  const eventType = String(entry?.event_type || entry?.type || payload?.type || '').trim().toUpperCase();
  if (!CERTIFICATE_MESSAGE_EVENT_TYPE_SET.has(eventType)) return null;

  const message = String(payload.message || payload.notes || '').trim();
  if (!message) return null;

  const createdAt = String(entry?.created_at || entry?.at || payload?.createdAt || payload?.at || '').trim();
  const sender = eventType === 'PATIENT_MESSAGE_SENT'
    ? 'patient'
    : eventType === 'CUSTOMER_SUPPORT_MESSAGE_SENT'
      ? 'support'
      : 'doctor';
  const fallbackSenderName = sender === 'patient'
    ? 'Patient'
    : sender === 'support'
      ? 'Customer support'
      : 'Clinical team';

  return {
    id: String(payload.messageId || `${eventType.toLowerCase()}-${createdAt || index}`).trim(),
    sender,
    senderName: sender === 'patient'
      ? String(payload.senderName || fallbackSenderName).trim()
      : fallbackSenderName,
    message,
    createdAt,
  };
}

export function buildCertificateMessageSummaries(entries = []) {
  const summaries = Object.create(null);

  entries.forEach((entry, index) => {
    const requestId = String(entry?.request_id || entry?.certificateId || entry?.requestId || '').trim();
    const message = mapCertificateMessageEvent(entry, index);
    if (!requestId || !message) return;

    const summary = summaries[requestId] || {
      messageCount: 0,
      latestSender: null,
      latestMessageAt: null,
      needsReply: false,
    };
    summary.messageCount += 1;

    if (
      !summary.latestMessageAt ||
      !message.createdAt ||
      String(message.createdAt).localeCompare(String(summary.latestMessageAt)) >= 0
    ) {
      summary.latestSender = message.sender;
      summary.latestMessageAt = message.createdAt || null;
      summary.needsReply = message.sender === 'patient';
    }

    summaries[requestId] = summary;
  });

  return summaries;
}
