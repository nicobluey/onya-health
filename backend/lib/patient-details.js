function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidIsoDate(value) {
  const candidate = String(value || '').trim();
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateCertificatePatientDetails(input, now = new Date()) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const patient = {
    ...source,
    fullName: String(source.fullName || '').trim(),
    dob: String(source.dob || '').trim(),
    email: normalizeEmail(source.email),
    phone: String(source.phone || '').trim(),
    address: String(source.address || '').trim(),
  };
  const errors = [];

  if (!patient.fullName) errors.push('Full legal name is required');
  if (!patient.dob) {
    errors.push('Date of birth is required');
  } else if (!isValidIsoDate(patient.dob)) {
    errors.push('Date of birth must be a valid date');
  } else {
    const today = new Date(now);
    const todayIso = Number.isNaN(today.getTime()) ? '' : today.toISOString().slice(0, 10);
    if (todayIso && patient.dob > todayIso) {
      errors.push('Date of birth cannot be in the future');
    }
  }

  if (!/^\S+@\S+\.\S+$/.test(patient.email)) {
    errors.push('A valid email is required');
  }

  const phoneDigits = patient.phone.replace(/\D+/g, '');
  if (!patient.phone) {
    errors.push('Phone number is required');
  } else if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    errors.push('Phone number must contain 8 to 15 digits');
  }

  return {
    valid: errors.length === 0,
    errors,
    patient,
  };
}
