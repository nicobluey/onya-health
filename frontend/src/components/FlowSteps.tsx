import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useBooking } from '../consult-flow/state';
import { COPY } from '../consult-flow/copy';
import { Button, SelectableCard, Input } from './UI';
import { AnimatePresence, motion } from 'framer-motion';
import { getServiceForPath } from '../consult-flow/services';
import {
    CARER_CERT_ADDON_PRICE_AUD,
    formatAud,
    getOneOffCertificateBandLabel,
    getOneOffCertificatePrice,
    getOneOffPricingBandLabel,
    ONE_OFF_BASE_PRICE_AUD,
    UNLIMITED_MONTHLY_PRICE_AUD,
} from '../consult-flow/pricing';
import { fetchApiJson } from '../lib/api';
import { warmCheckoutPath } from '../lib/performanceWarmup';
import type { CertificatePurpose, Symptom } from '../types';

// Transitions
const fade = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3 }
};

const configuredCarerAddonPrice = Number(import.meta.env.VITE_CARER_CERT_UPSELL_DOLLARS || '');
const CARER_CERT_UPSELL_DOLLARS =
    Number.isFinite(configuredCarerAddonPrice) &&
    configuredCarerAddonPrice > 0 &&
    configuredCarerAddonPrice < ONE_OFF_BASE_PRICE_AUD
        ? configuredCarerAddonPrice
        : CARER_CERT_ADDON_PRICE_AUD;

type EmailAccountCheckState = 'idle' | 'checking' | 'available' | 'exists' | 'error';
type AccountMatchReason = 'email' | 'phone' | '';

function normalizeEmailInput(value: string) {
    return String(value || '').trim().toLowerCase();
}

function isLikelyEmail(value: string) {
    const normalized = normalizeEmailInput(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function formatDateInputValue(value: Date | string | null | undefined) {
    if (!value) return '';
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function getCertificateEndDateInputValue(startDate: Date | null, durationDays: number) {
    if (!startDate) return '';
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + Math.max(1, Number(durationDays || 1)) - 1);
    return formatDateInputValue(date);
}

export const PurposeStep = () => {
    const { setPurpose, nextStep, purpose } = useBooking();
    return (
        <motion.div {...fade} className="space-y-4">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.purpose.question}</h2>
            <div className="space-y-3">
                {COPY.steps.purpose.options.map((opt) => (
                    <SelectableCard
                        key={opt}
                        selected={purpose === opt}
                        onClick={() => {
                            setPurpose(opt as CertificatePurpose);
                            nextStep();
                        }}
                    >
                        {opt}
                    </SelectableCard>
                ))}
            </div>
        </motion.div>
    );
};

export const ComplianceStep = () => {
    const { nextStep, setComplianceChecked } = useBooking();
    const [checks, setChecks] = useState<boolean[]>(new Array(COPY.steps.compliance.checks.length).fill(false));

    const handleCheck = (idx: number, checked: boolean) => {
        const newChecks = [...checks];
        newChecks[idx] = checked;
        setChecks(newChecks);
        setComplianceChecked(newChecks.every(c => c));
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.compliance.title}</h2>
            <div className="space-y-3" role="group" aria-label="Before you continue confirmations">
                {COPY.steps.compliance.checks.map((text, idx) => (
                    <button
                        key={idx}
                        type="button"
                        aria-pressed={checks[idx]}
                        onClick={() => handleCheck(idx, !checks[idx])}
                        className={`flex w-full min-h-14 items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium leading-snug transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            checks[idx]
                                ? 'border-primary bg-white text-text-primary shadow-sm'
                                : 'border-border bg-white text-text-secondary hover:border-sand-300 hover:bg-sand-50'
                        }`}
                    >
                        <span>{text}</span>
                        <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                                checks[idx]
                                    ? 'border-primary bg-primary text-sand-50'
                                    : 'border-sand-300 bg-white text-transparent'
                            }`}
                            aria-hidden="true"
                        >
                            <Check size={13} />
                        </span>
                    </button>
                ))}
            </div>
            <Button
                fullWidth
                disabled={!checks.every(c => c)}
                onClick={nextStep}
            >
                Continue
            </Button>
        </motion.div>
    );
};

export const SafetyStep = () => {
    const { nextStep } = useBooking();
    const [checks, setChecks] = useState<boolean[]>(new Array(COPY.steps.safety.checks.length).fill(false));
    const allConfirmed = checks.every(Boolean);

    const toggle = (idx: number) => {
        const next = [...checks];
        next[idx] = !next[idx];
        setChecks(next);
    };

    const handleContinue = () => {
        if (allConfirmed) {
            nextStep();
            return;
        }

        window.alert(`${COPY.steps.safety.alertTitle}\n\n${COPY.steps.safety.alertBody}`);
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.safety.title}</h2>
            <p className="text-sm text-text-secondary">{COPY.steps.safety.helper}</p>

            <div className="space-y-3" role="group" aria-label="Urgent symptom safety checklist">
                {COPY.steps.safety.checks.map((text, idx) => (
                    <button
                        key={idx}
                        type="button"
                        aria-pressed={checks[idx]}
                        onClick={() => toggle(idx)}
                        className={`flex w-full min-h-14 items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium leading-snug transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            checks[idx]
                                ? 'border-primary bg-white text-text-primary shadow-sm'
                                : 'border-border bg-white text-text-secondary hover:border-sand-300 hover:bg-sand-50'
                        }`}
                    >
                        <span>{text}</span>
                        <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                                checks[idx]
                                    ? 'border-primary bg-primary text-sand-50'
                                    : 'border-sand-300 bg-white text-transparent'
                            }`}
                            aria-hidden="true"
                        >
                            <Check size={13} />
                        </span>
                    </button>
                ))}
            </div>

            <Button fullWidth onClick={handleContinue}>
                {COPY.steps.safety.continueLabel}
            </Button>
        </motion.div>
    );
};

export const DescriptionStep = () => {
    const {
        symptom,
        setSymptom,
        symptomVisibility,
        setSymptomVisibility,
        description,
        setDescription,
        nextStep
    } = useBooking();
    const [error, setError] = useState('');

    const handleNext = () => {
        if (symptom.length === 0) {
            setError('Please choose at least one symptom');
            return;
        }
        nextStep();
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.description.prompt}</h2>
            <p className="text-sm text-text-secondary">{COPY.steps.description.helper}</p>

            <div className="space-y-4">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Symptoms">
                    {COPY.steps.symptom.options.map((opt) => {
                        const selected = symptom.includes(opt as Symptom);
                        return (
                            <button
                                key={opt}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                    const next = selected
                                        ? symptom.filter((value) => value !== (opt as Symptom))
                                        : [...symptom, opt as Symptom];
                                    setSymptom(next);
                                    setError('');
                                }}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    selected
                                        ? 'border-primary bg-primary text-sand-50 shadow-sm'
                                        : 'border-border bg-white text-text-primary hover:border-sand-300 hover:bg-sand-50'
                                }`}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-secondary">Additional notes (optional)</label>
                    <textarea
                        className="w-full h-28 p-4 rounded-xl border border-border resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        placeholder="Add anything useful for the doctor (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-secondary">Symptom privacy on certificate</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            aria-pressed={symptomVisibility === 'private'}
                            onClick={() => setSymptomVisibility('private')}
                            className={`rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                symptomVisibility === 'private'
                                    ? 'border-primary bg-primary text-sand-50 shadow-sm'
                                    : 'border-border bg-white text-text-primary hover:border-sand-300 hover:bg-sand-50'
                            }`}
                        >
                            <p className="font-semibold">Keep private</p>
                            <p className={`mt-1 text-xs ${symptomVisibility === 'private' ? 'text-sand-100' : 'text-text-secondary'}`}>
                                Certificate uses: "medical condition"
                            </p>
                        </button>
                        <button
                            type="button"
                            aria-pressed={symptomVisibility === 'public'}
                            onClick={() => setSymptomVisibility('public')}
                            className={`rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                symptomVisibility === 'public'
                                    ? 'border-primary bg-primary text-sand-50 shadow-sm'
                                    : 'border-border bg-white text-text-primary hover:border-sand-300 hover:bg-sand-50'
                            }`}
                        >
                            <p className="font-semibold">Show symptoms</p>
                            <p className={`mt-1 text-xs ${symptomVisibility === 'public' ? 'text-sand-100' : 'text-text-secondary'}`}>
                                Certificate can include your symptom category
                            </p>
                        </button>
                    </div>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}

                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">Seek urgent in-person care now if you have:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900/90">
                        {COPY.steps.description.redFlags.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            </div>
            <Button fullWidth onClick={handleNext}>Continue</Button>
        </motion.div>
    );
};

export const DatesStep = () => {
    const { setDates, nextStep, startDate, durationDays } = useBooking();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [durationOpen, setDurationOpen] = useState(false);
    const durationMenuRef = useRef<HTMLDivElement | null>(null);
    const durationOptions = [
        { value: 1, label: '1 day' },
        { value: 2, label: '2 days' },
        { value: 3, label: '3 days' },
        { value: 4, label: '4 days' },
        { value: 5, label: '5 days' },
        { value: 6, label: '6 days' },
        { value: 7, label: '7 days' },
    ];

    const selectedDuration = durationOptions.find((option) => option.value === durationDays) || durationOptions[0];
    const durationLabel = `${Math.min(7, Math.max(1, durationDays))} day${durationDays > 1 ? 's' : ''}`;
    const estimatedOneOffPrice = getOneOffCertificatePrice(durationDays);
    const pricingBandLabel = getOneOffPricingBandLabel(durationDays);

    const dateToInputValue = (value: Date | null) => {
        const source = value || today;
        const normalized = new Date(source.getTime() - source.getTimezoneOffset() * 60000);
        return normalized.toISOString().split('T')[0];
    };

    const normalizeNotPast = (value: Date) => {
        const next = new Date(value);
        if (Number.isNaN(next.getTime())) return today;
        next.setHours(0, 0, 0, 0);
        return next < today ? today : next;
    };

    useEffect(() => {
        if (!durationOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!durationMenuRef.current) return;
            if (durationMenuRef.current.contains(event.target as Node)) return;
            setDurationOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setDurationOpen(false);
        };

        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [durationOpen]);

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.dates.question}</h2>
            <p className="text-sm text-text-secondary">{COPY.steps.dates.helper}</p>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Start Date</label>
                    <input
                        type="date"
                        className="w-full p-3 rounded-lg border border-border bg-white"
                        value={dateToInputValue(startDate)}
                        min={dateToInputValue(today)}
                        onChange={(e) => setDates(normalizeNotPast(new Date(e.target.value)), durationDays)}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Duration</label>
                    <div className="relative" ref={durationMenuRef}>
                        <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-semibold text-text-primary transition-all duration-200 hover:border-sand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            aria-haspopup="listbox"
                            aria-expanded={durationOpen}
                            aria-label="Certificate duration"
                            onClick={() => setDurationOpen((current) => !current)}
                        >
                            <span>{selectedDuration.label}</span>
                            <span aria-hidden="true" className={`text-xs transition-transform duration-200 ${durationOpen ? 'rotate-180' : ''}`}>
                                ▾
                            </span>
                        </button>

                        <AnimatePresence>
                            {durationOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.16 }}
                                    className="relative z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg"
                                    role="listbox"
                                    aria-label="Certificate duration options"
                                >
                                    {durationOptions.map((option) => {
                                        const active = selectedDuration.value === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="option"
                                                aria-selected={active}
                                                onClick={() => {
                                                    setDates(normalizeNotPast(startDate || today), option.value);
                                                    setDurationOpen(false);
                                                }}
                                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                                                    active
                                                        ? 'bg-white font-semibold text-primary'
                                                        : 'text-text-secondary hover:bg-sand-50'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="rounded-lg border border-border bg-white p-4">
                    <p className="text-sm text-text-primary font-medium">
                        Certificate valid from: <span className="font-bold">{startDate ? startDate.toLocaleDateString() : 'Select date'}</span>
                    </p>
                    <p className="text-sm text-text-secondary">
                        Length: {durationLabel}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                        One-off price: <span className="font-semibold text-text-primary">{formatAud(estimatedOneOffPrice)}</span> ({pricingBandLabel})
                    </p>
                </div>

                {durationDays > 7 && (
                    <div className="rounded-lg border border-border bg-white p-4">
                        <p className="text-sm font-semibold text-text-primary">Doctor review required for longer durations</p>
                        <p className="mt-1 text-sm text-text-secondary">
                            Requests over 7 days may need a follow-up assessment before approval.
                        </p>
                    </div>
                )}
            </div>
            <Button fullWidth onClick={nextStep}>Continue</Button>
        </motion.div>
    );
};

export const DetailsStep = () => {
    const { details, setDetails, nextStep } = useBooking();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [accountCheckError, setAccountCheckError] = useState('');
    const [checkingAccount, setCheckingAccount] = useState(false);
    const [emailAccountCheckState, setEmailAccountCheckState] = useState<EmailAccountCheckState>('idle');
    const [matchedAccountEmail, setMatchedAccountEmail] = useState('');
    const [accountMatchReason, setAccountMatchReason] = useState<AccountMatchReason>('');
    const [genderOpen, setGenderOpen] = useState(false);
    const genderMenuRef = useRef<HTMLDivElement | null>(null);
    const emailCheckRequestRef = useRef(0);
    const lastEmailCheckRef = useRef<{
        email: string;
        state: Extract<EmailAccountCheckState, 'available' | 'exists'>;
        matchedEmail: string;
    } | null>(null);
    const genderOptions = ['Male', 'Female', 'Other'];

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const fullName = details.fullName.trim();
        const dob = details.dob.trim();
        const gender = details.gender.trim();
        const email = details.email.trim();
        const phone = details.phone.trim();
        const address = details.address.trim();

        if (!fullName) newErrors.fullName = "Full legal name is required";
        if (!dob) newErrors.dob = "Date of birth is required";
        if (!gender) newErrors.gender = "Gender is required";
        if (!email || !email.includes('@')) newErrors.email = "Valid email is required";
        if (!phone) newErrors.phone = "Phone is required";
        if (!address) newErrors.address = "Address is required";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        setAccountCheckError('');
        if (!validate()) return;
        const requestId = ++emailCheckRequestRef.current;
        setCheckingAccount(true);
        try {
            const normalizedEmail = normalizeEmailInput(details.email);
            const { response, payload } = await fetchApiJson('/api/patient/account-exists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({
                    email: normalizedEmail,
                    phone: details.phone.trim(),
                }),
            });
            if (requestId !== emailCheckRequestRef.current) return;
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to verify account details');
            }
            if (payload?.exists) {
                const reason: AccountMatchReason = payload?.reason === 'phone' ? 'phone' : 'email';
                const matchedEmail = reason === 'email'
                    ? normalizeEmailInput(String(payload?.matchedEmail || normalizedEmail))
                    : '';
                setAccountCheckError('');
                setAccountMatchReason(reason);
                setMatchedAccountEmail(matchedEmail);
                setEmailAccountCheckState('exists');
                if (matchedEmail) {
                    window.localStorage.setItem('onya_patient_email', matchedEmail);
                }
                return;
            }
            setAccountMatchReason('');
            setMatchedAccountEmail('');
            setEmailAccountCheckState('available');
            lastEmailCheckRef.current = {
                email: normalizedEmail,
                state: 'available',
                matchedEmail: '',
            };
            nextStep();
        } catch (errorObject) {
            if (requestId !== emailCheckRequestRef.current) return;
            setAccountCheckError(errorObject instanceof Error ? errorObject.message : 'Unable to verify account details');
        } finally {
            setCheckingAccount(false);
        }
    };

    useEffect(() => {
        const requestId = ++emailCheckRequestRef.current;
        const normalizedEmail = normalizeEmailInput(details.email);
        setAccountCheckError('');
        setAccountMatchReason('');

        if (!normalizedEmail) {
            setMatchedAccountEmail('');
            setEmailAccountCheckState('idle');
            lastEmailCheckRef.current = null;
            return;
        }

        if (!isLikelyEmail(normalizedEmail)) {
            setMatchedAccountEmail('');
            setEmailAccountCheckState('idle');
            lastEmailCheckRef.current = null;
            return;
        }

        if (lastEmailCheckRef.current?.email === normalizedEmail) {
            setMatchedAccountEmail(lastEmailCheckRef.current.matchedEmail);
            setEmailAccountCheckState(lastEmailCheckRef.current.state);
            return;
        }

        setEmailAccountCheckState('checking');
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                const { response, payload } = await fetchApiJson('/api/patient/account-exists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    cache: 'no-store',
                    body: JSON.stringify({
                        email: normalizedEmail,
                    }),
                });
                if (requestId !== emailCheckRequestRef.current) return;
                if (!response.ok) {
                    setEmailAccountCheckState('error');
                    return;
                }

                if (payload?.exists) {
                    const matchedEmail = normalizeEmailInput(String(payload?.matchedEmail || normalizedEmail));
                    setAccountMatchReason('email');
                    setMatchedAccountEmail(matchedEmail);
                    setEmailAccountCheckState('exists');
                    lastEmailCheckRef.current = {
                        email: normalizedEmail,
                        state: 'exists',
                        matchedEmail,
                    };
                    if (matchedEmail) {
                        window.localStorage.setItem('onya_patient_email', matchedEmail);
                    }
                    return;
                }

                setMatchedAccountEmail('');
                setAccountMatchReason('');
                setEmailAccountCheckState('available');
                lastEmailCheckRef.current = {
                    email: normalizedEmail,
                    state: 'available',
                    matchedEmail: '',
                };
            } catch {
                if (controller.signal.aborted) return;
                if (requestId !== emailCheckRequestRef.current) return;
                setEmailAccountCheckState('error');
            }
        }, 700);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [details.email]);

    useEffect(() => {
        if (!genderOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!genderMenuRef.current) return;
            if (genderMenuRef.current.contains(event.target as Node)) return;
            setGenderOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setGenderOpen(false);
        };

        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [genderOpen]);

    const handleEmailChange = (value: string) => {
        emailCheckRequestRef.current += 1;
        lastEmailCheckRef.current = null;
        setMatchedAccountEmail('');
        setAccountMatchReason('');
        setEmailAccountCheckState('idle');
        setAccountCheckError('');
        setDetails({ email: value });
    };

    const handlePhoneChange = (value: string) => {
        if (accountMatchReason === 'phone') {
            setMatchedAccountEmail('');
            setAccountMatchReason('');
            setEmailAccountCheckState(lastEmailCheckRef.current?.state || 'idle');
            setAccountCheckError('');
        }
        setDetails({ phone: value });
    };

    const signInEmail = accountMatchReason === 'phone'
        ? ''
        : normalizeEmailInput(matchedAccountEmail || details.email);

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">Your Details</h2>
            <div className="space-y-4">
                <Input
                    label={COPY.steps.details.fields.name}
                    value={details.fullName}
                    onChange={(e) => setDetails({ fullName: e.target.value })}
                    error={errors.fullName}
                    required
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                        label={COPY.steps.details.fields.dob}
                        type="date"
                        value={details.dob}
                        onChange={(e) => setDetails({ dob: e.target.value })}
                        error={errors.dob}
                        required
                    />
                    <div className="relative w-full space-y-1.5" ref={genderMenuRef}>
                        <label className="block text-sm font-medium text-text-secondary">{COPY.steps.details.fields.gender}</label>
                        <button
                            type="button"
                            className={`flex h-12 w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent ${
                                errors.gender ? 'border-red-500 text-text-secondary' : 'border-border text-text-primary'
                            }`}
                            aria-haspopup="listbox"
                            aria-expanded={genderOpen}
                            aria-label="Gender"
                            onClick={() => setGenderOpen((current) => !current)}
                        >
                            <span>{details.gender || 'Select gender'}</span>
                            <span aria-hidden="true" className={`text-xs transition-transform duration-200 ${genderOpen ? 'rotate-180' : ''}`}>
                                ▾
                            </span>
                        </button>
                        <AnimatePresence>
                            {genderOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.16 }}
                                    className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg"
                                    role="listbox"
                                    aria-label="Gender options"
                                >
                                    {genderOptions.map((option) => {
                                        const active = details.gender === option;
                                        return (
                                            <button
                                                key={option}
                                                type="button"
                                                role="option"
                                                aria-selected={active}
                                                onClick={() => {
                                                    setDetails({ gender: option });
                                                    setGenderOpen(false);
                                                }}
                                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                                                    active
                                                        ? 'bg-white font-semibold text-primary'
                                                        : 'text-text-secondary hover:bg-sand-50'
                                                }`}
                                            >
                                                {option}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {errors.gender && <p className="text-xs text-red-500">{errors.gender}</p>}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Input
                        label={COPY.steps.details.fields.email}
                        type="email"
                        value={details.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        error={errors.email}
                        required
                    />
                    {emailAccountCheckState === 'checking' && (
                        <p className="text-xs font-semibold text-amber-600">Checking if this email already has an account...</p>
                    )}
                    {emailAccountCheckState === 'available' && (
                        <p className="text-xs font-semibold text-forest-700">No existing account found for this email.</p>
                    )}
                    {emailAccountCheckState === 'exists' && accountMatchReason !== 'phone' && (
                        <div className="space-y-2 rounded-lg border border-[#f2d6a6] bg-[#fff8ec] p-3">
                            <p className="text-xs font-semibold text-amber-700">
                                This email already has a patient account. Sign in now so you don&apos;t create a second account.
                            </p>
                            <a
                                href={signInEmail ? `/patient-login?email=${encodeURIComponent(signInEmail)}` : '/patient-login'}
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text-primary"
                            >
                                Sign in now
                            </a>
                        </div>
                    )}
                    {emailAccountCheckState === 'error' && (
                        <p className="text-xs font-semibold text-amber-700">
                            We couldn&apos;t verify account status right now. You can continue and we&apos;ll check again.
                        </p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Input
                        label={COPY.steps.details.fields.phone}
                        type="tel"
                        value={details.phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        error={errors.phone}
                        required
                    />
                    {details.phone.trim() && <p className="text-xs font-semibold text-amber-600">Verification pending</p>}
                    {emailAccountCheckState === 'exists' && accountMatchReason === 'phone' && (
                        <div className="space-y-2 rounded-lg border border-[#f2d6a6] bg-[#fff8ec] p-3">
                            <p className="text-xs font-semibold text-amber-700">
                                This phone number is already linked to a patient account. Sign in to continue.
                            </p>
                            <a
                                href="/patient-login"
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text-primary"
                            >
                                Sign in now
                            </a>
                        </div>
                    )}
                </div>
                <Input
                    label={COPY.steps.details.fields.address}
                    value={details.address}
                    onChange={(e) => setDetails({ address: e.target.value })}
                    error={errors.address}
                    required
                />
            </div>
            {accountCheckError && (
                <div>
                    <p className="text-xs font-semibold text-red-600">{accountCheckError}</p>
                </div>
            )}
            <Button fullWidth onClick={handleSubmit} disabled={checkingAccount}>
                {checkingAccount ? 'Checking your account...' : COPY.steps.details.cta}
            </Button>
        </motion.div>
    );
};

export const CheckoutStep = () => {
    const {
        isUnlimited,
        includeCarerCertificate,
        setCarerCertificate,
        carerCertificateDetails,
        setCarerCertificateDetails,
        purpose,
        symptom,
        symptomVisibility,
        complianceChecked,
        description,
        startDate,
        durationDays,
        details
    } = useBooking();
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [carerDetailsErrors, setCarerDetailsErrors] = useState<Record<string, string>>({});
    const showCarerUpsell = !isUnlimited;
    const baseAmount = isUnlimited ? UNLIMITED_MONTHLY_PRICE_AUD : getOneOffCertificatePrice(durationDays);
    const carerAddonAmount = showCarerUpsell && includeCarerCertificate ? CARER_CERT_UPSELL_DOLLARS : 0;
    const totalAmount = baseAmount + carerAddonAmount;
    const oneOffLabel = getOneOffCertificateBandLabel(durationDays);

    useEffect(() => {
        warmCheckoutPath();
    }, []);

    const validateCarerDetails = () => {
        if (!showCarerUpsell || !includeCarerCertificate) {
            setCarerDetailsErrors({});
            return true;
        }

        const nextErrors: Record<string, string> = {};
        const normalized = {
            fullName: carerCertificateDetails.fullName.trim(),
            dob: carerCertificateDetails.dob.trim(),
            relationship: carerCertificateDetails.relationship.trim(),
            startDate: carerCertificateDetails.startDate.trim(),
            endDate: carerCertificateDetails.endDate.trim(),
            email: String(carerCertificateDetails.email || '').trim(),
        };

        if (!normalized.fullName) nextErrors.fullName = 'Carer name is required';
        if (!normalized.dob) nextErrors.dob = 'Carer date of birth is required';
        if (!normalized.relationship) nextErrors.relationship = 'Relationship or caring context is required';
        if (!normalized.startDate) nextErrors.startDate = 'Certificate start date is required';
        if (!normalized.endDate) nextErrors.endDate = 'Certificate end date is required';
        if (normalized.startDate && normalized.endDate && normalized.endDate < normalized.startDate) {
            nextErrors.endDate = 'End date must be on or after the start date';
        }
        if (normalized.email && !isLikelyEmail(normalized.email)) {
            nextErrors.email = 'Enter a valid email or leave this blank';
        }

        setCarerDetailsErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleCheckout = async () => {
        setSubmitError('');
        if (!validateCarerDetails()) {
            setSubmitError('Please complete the carer certificate details before payment.');
            return;
        }

        setSubmitting(true);

        try {
            const symptomSummary = symptom.join(', ');
            const consultDescription = [
                symptomSummary ? `Symptoms: ${symptomSummary}` : '',
                description.trim(),
            ]
                .filter(Boolean)
                .join('\n\n');

            const serviceType = getServiceForPath(window.location.pathname) || 'doctor';
            const patientToken = String(window.localStorage.getItem('onya_patient_token') || '').trim();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (patientToken) {
                headers.Authorization = `Bearer ${patientToken}`;
            }
            const { response, payload } = await fetchApiJson('/api/checkout/session', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    uiMode: 'hosted',
                    serviceType,
                    patient: details,
                    consult: {
                        purpose,
                        symptom: symptomSummary,
                        symptomVisibility,
                        complianceChecked,
                        description: consultDescription,
                        startDate: startDate?.toISOString() || null,
                        durationDays,
                        isUnlimited,
                        includeCarerCertificate: showCarerUpsell ? includeCarerCertificate : false,
                        carerCertificateDetails:
                            showCarerUpsell && includeCarerCertificate
                                ? {
                                      fullName: carerCertificateDetails.fullName.trim(),
                                      dob: carerCertificateDetails.dob.trim(),
                                      relationship: carerCertificateDetails.relationship.trim(),
                                      startDate: carerCertificateDetails.startDate.trim(),
                                      endDate: carerCertificateDetails.endDate.trim(),
                                      email: String(carerCertificateDetails.email || '').trim(),
                                  }
                                : null,
                    }
                }),
            });
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to submit your certificate right now.');
            }

            if (details.email) {
                window.localStorage.setItem('onya_patient_email', details.email);
            }

            if (payload?.checkoutBypassed) {
                window.location.assign('/patient');
                return;
            }

            if (payload?.sessionId) {
                window.localStorage.setItem('onya_last_checkout_session_id', payload.sessionId);
            }

            if (payload?.checkoutUrl) {
                window.location.assign(payload.checkoutUrl);
                return;
            }

            throw new Error('Unable to initialize Stripe checkout.');
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Unable to submit your certificate right now.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.checkout.title}</h2>

            <div className="bg-sand-50 border border-border rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-text-primary">
                        {isUnlimited ? "Unlimited Certificates" : "One-off Certificate"}
                    </span>
                    <span className="font-bold text-text-primary">
                        ${baseAmount.toFixed(2)}
                    </span>
                </div>
                {isUnlimited && <div className="text-xs text-forest-700 font-medium">Billed monthly</div>}
                {!isUnlimited && <div className="text-xs text-text-secondary font-medium">{oneOffLabel}</div>}
            </div>

            {showCarerUpsell && (
                <div className="rounded-xl border border-border bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-semibold text-text-primary">Add carer&apos;s certificate</p>
                            <p className="mt-1 text-sm text-text-secondary">
                                Optional add-on if you need carer leave documentation for this request.
                            </p>
                            <p className="mt-2 text-sm font-semibold text-text-primary">+${CARER_CERT_UPSELL_DOLLARS.toFixed(2)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const nextEnabled = !includeCarerCertificate;
                                setCarerCertificate(nextEnabled);
                                if (nextEnabled) {
                                    setCarerCertificateDetails({
                                        startDate: carerCertificateDetails.startDate || formatDateInputValue(startDate),
                                        endDate:
                                            carerCertificateDetails.endDate ||
                                            getCertificateEndDateInputValue(startDate, durationDays),
                                    });
                                } else {
                                    setCarerDetailsErrors({});
                                }
                            }}
                            className={`inline-flex h-8 w-14 items-center rounded-full border transition ${
                                includeCarerCertificate ? 'border-primary bg-primary' : 'border-border bg-sand-100'
                            }`}
                            aria-pressed={includeCarerCertificate}
                            aria-label="Toggle carer's certificate add-on"
                        >
                            <span
                                className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                                    includeCarerCertificate ? 'translate-x-7' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            )}

            {showCarerUpsell && includeCarerCertificate && (
                <div className="space-y-4 rounded-xl border border-border bg-white p-4">
                    <div>
                        <p className="font-semibold text-text-primary">Carer certificate details</p>
                        <p className="mt-1 text-sm text-text-secondary">
                            These details are required so the additional certificate can be reviewed accurately.
                        </p>
                    </div>
                    <Input
                        label="Carer full legal name"
                        value={carerCertificateDetails.fullName}
                        onChange={(event) => setCarerCertificateDetails({ fullName: event.target.value })}
                        error={carerDetailsErrors.fullName}
                        required
                    />
                    <Input
                        label="Carer date of birth"
                        type="date"
                        value={carerCertificateDetails.dob}
                        onChange={(event) => setCarerCertificateDetails({ dob: event.target.value })}
                        error={carerDetailsErrors.dob}
                        required
                    />
                    <Input
                        label="Relationship or caring context"
                        value={carerCertificateDetails.relationship}
                        onChange={(event) => setCarerCertificateDetails({ relationship: event.target.value })}
                        error={carerDetailsErrors.relationship}
                        placeholder="e.g. parent, partner, child under your care"
                        required
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                            label="Certificate start date"
                            type="date"
                            value={carerCertificateDetails.startDate}
                            onChange={(event) => setCarerCertificateDetails({ startDate: event.target.value })}
                            error={carerDetailsErrors.startDate}
                            required
                        />
                        <Input
                            label="Certificate end date"
                            type="date"
                            value={carerCertificateDetails.endDate}
                            onChange={(event) => setCarerCertificateDetails({ endDate: event.target.value })}
                            error={carerDetailsErrors.endDate}
                            required
                        />
                    </div>
                    <Input
                        label="Carer/patient email (optional)"
                        type="email"
                        value={carerCertificateDetails.email || ''}
                        onChange={(event) => setCarerCertificateDetails({ email: event.target.value })}
                        error={carerDetailsErrors.email}
                    />
                </div>
            )}

            {showCarerUpsell && (
                <div className="rounded-xl border border-border bg-sand-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">Total due today</span>
                        <span className="text-base font-bold text-text-primary">${totalAmount.toFixed(2)}</span>
                    </div>
                </div>
            )}

            <Button
                fullWidth
                onClick={handleCheckout}
                onMouseEnter={warmCheckoutPath}
                onFocus={warmCheckoutPath}
                disabled={submitting}
            >
                {submitting ? 'Redirecting to secure checkout...' : COPY.steps.checkout.cta}
            </Button>
            {submitError && (
                <p className="text-sm text-red-600 font-medium">{submitError}</p>
            )}
            {submitting && (
                <p className="text-sm text-text-secondary">Opening Stripe checkout...</p>
            )}

            <div className="text-center text-xs text-text-secondary flex items-center justify-center gap-2">
                <span>🔒 Secure 256-bit SSL encryption</span>
            </div>

            <div className="text-center">
                <a
                    href="/patient-login"
                    className="text-sm font-semibold text-forest-700 underline underline-offset-2"
                >
                    Already have an account? Patient login
                </a>
            </div>
        </motion.div>
    );
};

export const ConfirmationStep = () => {
    return (
        <motion.div {...fade} className="text-center py-12 space-y-6">
            <div className="w-16 h-16 bg-forest-100 rounded-full flex items-center justify-center mx-auto text-forest-700">
                <Check size={32} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-text-primary mb-2">{COPY.steps.confirmation.title}</h2>
                <p className="text-text-secondary">{COPY.steps.confirmation.message}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 text-sm text-text-primary">
                Check your email for confirmation and next steps.
            </div>
            <div className="space-y-3 max-w-sm mx-auto">
                <a
                    href="/patient"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white"
                >
                    Open patient account
                </a>
                <a
                    href="/patient-login"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-text-primary"
                >
                    Patient login
                </a>
            </div>
        </motion.div>
    );
}

export const StepRenderer = () => {
    const { step } = useBooking();
    switch (step) {
        case 'purpose': return <PurposeStep />;
        case 'compliance': return <ComplianceStep />;
        case 'safety': return <SafetyStep />;
        case 'description': return <DescriptionStep />;
        case 'dates': return <DatesStep />;
        case 'details': return <DetailsStep />;
        case 'checkout': return <CheckoutStep />;
        case 'confirmation': return <ConfirmationStep />;
        default: return null;
    }
};
