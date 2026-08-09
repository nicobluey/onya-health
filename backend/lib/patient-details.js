function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export const MINIMUM_CERTIFICATE_PATIENT_AGE = 16;
export const EARLIEST_CERTIFICATE_DOB = '1900-01-01';

export function isValidIsoDate(value) {
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

function calendarDateParts(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(value);
    const readPart = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return {
      year: readPart('year'),
      month: readPart('month'),
      day: readPart('day'),
    };
  }

  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function calculateAgeYears(dob, atDate = new Date()) {
  const birth = calendarDateParts(dob);
  const reference = calendarDateParts(atDate);
  if (!birth || !reference) return null;

  let age = reference.year - birth.year;
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) {
    age -= 1;
  }
  return age;
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
    const age = calculateAgeYears(patient.dob, now);
    if (patient.dob < EARLIEST_CERTIFICATE_DOB) {
      errors.push('Date of birth must be on or after 1 January 1900');
    } else if (age === null) {
      errors.push('Date of birth must be a valid date');
    } else if (age < 0) {
      errors.push('Date of birth cannot be in the future');
    } else if (age < MINIMUM_CERTIFICATE_PATIENT_AGE) {
      errors.push(`You must be at least ${MINIMUM_CERTIFICATE_PATIENT_AGE} years old to submit a certificate request`);
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
