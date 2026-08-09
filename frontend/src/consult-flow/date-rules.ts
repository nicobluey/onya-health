export const MINIMUM_CERTIFICATE_PATIENT_AGE = 16;
export const EARLIEST_CERTIFICATE_DOB = '1900-01-01';

function padDatePart(value: number) {
    return String(value).padStart(2, '0');
}

export function toLocalDateInputValue(value: Date) {
    return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;
}

export function startOfLocalToday(now = new Date()) {
    const value = new Date(now);
    value.setHours(0, 0, 0, 0);
    return value;
}

export function parseLocalDateInput(value: string) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}

export function latestEligibleDob(now = new Date()) {
    const today = startOfLocalToday(now);
    const year = today.getFullYear() - MINIMUM_CERTIFICATE_PATIENT_AGE;
    const month = today.getMonth();
    const day = today.getDate();
    const candidate = new Date(year, month, day);

    // A 29 February birthday becomes 28 February in a non-leap target year.
    if (candidate.getMonth() !== month) {
        candidate.setDate(0);
    }
    return toLocalDateInputValue(candidate);
}

export function validateCertificateDob(value: string, now = new Date()) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'Date of birth is required';
    if (!parseLocalDateInput(normalized)) return 'Enter a valid date of birth';
    if (normalized < EARLIEST_CERTIFICATE_DOB) return 'Date of birth must be on or after 1 January 1900';
    if (normalized > latestEligibleDob(now)) {
        return `You must be at least ${MINIMUM_CERTIFICATE_PATIENT_AGE} years old to submit a certificate request`;
    }
    return '';
}
