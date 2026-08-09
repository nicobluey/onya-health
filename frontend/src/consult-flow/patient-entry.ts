import type { UserDetails } from '../types';

const PATIENT_CERTIFICATE_DRAFT_KEY = 'onya_patient_certificate_draft';
const PATIENT_CERTIFICATE_DRAFT_TTL_MS = 30 * 60 * 1000;

interface StoredPatientCertificateDraft {
    createdAt: number;
    details: Partial<UserDetails>;
}

function normalizeDraftDetails(value: unknown): Partial<UserDetails> {
    if (!value || typeof value !== 'object') return {};
    const candidate = value as Partial<UserDetails>;
    return {
        fullName: String(candidate.fullName || '').trim(),
        dob: String(candidate.dob || '').trim(),
        gender: String(candidate.gender || '').trim(),
        email: String(candidate.email || '').trim().toLowerCase(),
        phone: String(candidate.phone || '').trim(),
        address: String(candidate.address || '').trim(),
    };
}

export function storePatientCertificateDraft(details: Partial<UserDetails>) {
    if (typeof window === 'undefined') return;
    const payload: StoredPatientCertificateDraft = {
        createdAt: Date.now(),
        details: normalizeDraftDetails(details),
    };
    window.sessionStorage.setItem(PATIENT_CERTIFICATE_DRAFT_KEY, JSON.stringify(payload));
}

export function readPatientCertificateDraft(): Partial<UserDetails> {
    if (typeof window === 'undefined') return {};
    try {
        const stored = window.sessionStorage.getItem(PATIENT_CERTIFICATE_DRAFT_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as StoredPatientCertificateDraft;
        if (!Number.isFinite(parsed?.createdAt) || Date.now() - parsed.createdAt > PATIENT_CERTIFICATE_DRAFT_TTL_MS) {
            window.sessionStorage.removeItem(PATIENT_CERTIFICATE_DRAFT_KEY);
            return {};
        }
        return normalizeDraftDetails(parsed.details);
    } catch {
        window.sessionStorage.removeItem(PATIENT_CERTIFICATE_DRAFT_KEY);
        return {};
    }
}

export function clearPatientCertificateDraft() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(PATIENT_CERTIFICATE_DRAFT_KEY);
}

export function buildPatientCertificateBookingUrl(hasActiveUnlimited: boolean) {
    const params = new URLSearchParams({ source: 'patient' });
    if (hasActiveUnlimited) params.set('coverage', 'unlimited');
    return `/doctor?${params.toString()}#book`;
}

export function hasActiveUnlimitedCoverageFromSearch() {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
        params.get('source') === 'patient' &&
        params.get('coverage') === 'unlimited' &&
        Boolean(window.localStorage.getItem('onya_patient_token'))
    );
}

export function isPatientPortalBookingEntry() {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('source') === 'patient';
}
