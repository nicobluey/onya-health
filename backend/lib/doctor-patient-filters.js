const ALLOWED_SUBMITTED_WITHIN_DAYS = new Set([1, 7, 30, 90]);
const MIN_CERTIFICATE_DURATION_DAYS = 1;
const MAX_CERTIFICATE_DURATION_DAYS = 7;

function parseDateBoundary(value, endOfDay = false) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return Number.NaN;
  const suffix = endOfDay ? 'T23:59:59.999+10:00' : 'T00:00:00.000+10:00';
  const timestamp = new Date(`${normalized}${suffix}`).getTime();
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  const localDate = new Date(timestamp + 10 * 60 * 60 * 1000);
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() + 1 !== month ||
    localDate.getUTCDate() !== day
  ) {
    return Number.NaN;
  }
  return timestamp;
}

function parseDuration(value, fallback, fieldName, errors) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_CERTIFICATE_DURATION_DAYS || parsed > MAX_CERTIFICATE_DURATION_DAYS) {
    errors.push(`${fieldName} must be a whole number from 1 to 7`);
    return fallback;
  }
  return parsed;
}

export function parseDoctorPatientRequestFilters(searchParams, now = Date.now()) {
  const errors = [];
  const submittedWithinRaw = String(searchParams?.get('submittedWithin') || '').trim();
  const submittedWithinDays = submittedWithinRaw ? Number(submittedWithinRaw) : null;
  if (
    submittedWithinRaw &&
    (!Number.isInteger(submittedWithinDays) || !ALLOWED_SUBMITTED_WITHIN_DAYS.has(submittedWithinDays))
  ) {
    errors.push('submittedWithin must be 1, 7, 30, or 90 days');
  }

  const dateFrom = String(searchParams?.get('dateFrom') || '').trim();
  const dateTo = String(searchParams?.get('dateTo') || '').trim();
  const dateFromTimestamp = parseDateBoundary(dateFrom, false);
  const dateToTimestamp = parseDateBoundary(dateTo, true);
  if (submittedWithinDays && (dateFrom || dateTo)) {
    errors.push('Use submittedWithin or a custom date range, not both');
  }
  if (Number.isNaN(dateFromTimestamp)) errors.push('dateFrom must use YYYY-MM-DD');
  if (Number.isNaN(dateToTimestamp)) errors.push('dateTo must use YYYY-MM-DD');
  if (
    Number.isFinite(dateFromTimestamp) &&
    Number.isFinite(dateToTimestamp) &&
    dateFromTimestamp > dateToTimestamp
  ) {
    errors.push('dateFrom must be on or before dateTo');
  }

  const durationMin = parseDuration(
    searchParams?.get('durationMin'),
    MIN_CERTIFICATE_DURATION_DAYS,
    'durationMin',
    errors
  );
  const durationMax = parseDuration(
    searchParams?.get('durationMax'),
    MAX_CERTIFICATE_DURATION_DAYS,
    'durationMax',
    errors
  );
  if (durationMin > durationMax) {
    errors.push('durationMin must be less than or equal to durationMax');
  }

  const relativeAfter = submittedWithinDays
    ? now - submittedWithinDays * 24 * 60 * 60 * 1000
    : null;
  const submittedAfter = Number.isFinite(dateFromTimestamp) ? dateFromTimestamp : relativeAfter;
  const submittedBefore = Number.isFinite(dateToTimestamp) ? dateToTimestamp : null;

  return {
    valid: errors.length === 0,
    errors,
    submittedWithinDays,
    dateFrom,
    dateTo,
    submittedAfter: Number.isFinite(submittedAfter) ? new Date(submittedAfter).toISOString() : '',
    submittedBefore: Number.isFinite(submittedBefore) ? new Date(submittedBefore).toISOString() : '',
    durationMin,
    durationMax,
    hasRequestFilters: Boolean(
      submittedWithinDays ||
      dateFrom ||
      dateTo ||
      durationMin > MIN_CERTIFICATE_DURATION_DAYS ||
      durationMax < MAX_CERTIFICATE_DURATION_DAYS
    ),
  };
}

export function certificateMatchesDoctorPatientFilters(certificate, filters) {
  if (!filters?.valid) return false;
  const submittedAt = new Date(certificate?.createdAt || '').getTime();
  const submittedAfter = filters.submittedAfter ? new Date(filters.submittedAfter).getTime() : null;
  const submittedBefore = filters.submittedBefore ? new Date(filters.submittedBefore).getTime() : null;
  const rawDurationDays = Number(certificate?.certificateDraft?.durationDays || 1);
  const durationDays = Number.isFinite(rawDurationDays)
    ? Math.min(MAX_CERTIFICATE_DURATION_DAYS, Math.max(MIN_CERTIFICATE_DURATION_DAYS, rawDurationDays))
    : MIN_CERTIFICATE_DURATION_DAYS;

  if (Number.isFinite(submittedAfter) && (!Number.isFinite(submittedAt) || submittedAt < submittedAfter)) return false;
  if (Number.isFinite(submittedBefore) && (!Number.isFinite(submittedAt) || submittedAt > submittedBefore)) return false;
  return durationDays >= filters.durationMin && durationDays <= filters.durationMax;
}
