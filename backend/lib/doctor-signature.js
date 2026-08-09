const SUPPORTED_SIGNATURE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

function hasPngSignature(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
}

function hasJpegSignature(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function parseDoctorSignatureDataUrl(value, maxBytes = 750_000) {
  const candidate = String(value || '').trim();
  const match = candidate.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    const error = new Error('Upload a JPEG, PNG, or SVG signature from the doctor portal');
    error.code = 'SIGNATURE_TYPE_UNSUPPORTED';
    throw error;
  }

  const requestedMimeType = String(match[1] || '').trim().toLowerCase();
  if (!SUPPORTED_SIGNATURE_MIME_TYPES.has(requestedMimeType)) {
    const error = new Error('Upload a JPEG, PNG, or SVG signature from the doctor portal');
    error.code = 'SIGNATURE_TYPE_UNSUPPORTED';
    throw error;
  }

  const buffer = Buffer.from(String(match[2] || '').replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    const error = new Error('The selected signature file is empty');
    error.code = 'SIGNATURE_EMPTY';
    throw error;
  }
  if (buffer.length > maxBytes) {
    const error = new Error('The signature must be 750 KB or smaller');
    error.code = 'SIGNATURE_TOO_LARGE';
    throw error;
  }

  const mimeType = requestedMimeType === 'image/jpg' ? 'image/jpeg' : requestedMimeType;
  const validBytes = mimeType === 'image/png' ? hasPngSignature(buffer) : hasJpegSignature(buffer);
  if (!validBytes) {
    const error = new Error('The signature image could not be validated');
    error.code = 'SIGNATURE_INVALID';
    throw error;
  }

  return {
    buffer,
    mimeType,
    extension: mimeType === 'image/png' ? 'png' : 'jpg',
  };
}

export function normalizeDoctorSignatureMimeType(value, signaturePath = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'image/png') return 'image/png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg';
  return String(signaturePath || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}
