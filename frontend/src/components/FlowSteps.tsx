import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useBooking } from '../consult-flow/state';
import { COPY } from '../consult-flow/copy';
import { Button, SelectableCard, Input } from './UI';
import { AnimatePresence, motion } from 'framer-motion';
import { getServiceForPath } from '../consult-flow/services';
import {
    formatAud,
    getOneOffCertificateBandLabel,
    getOneOffCertificatePrice,
    getOneOffPricingBandLabel,
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

const CARER_CERT_UPSELL_DOLLARS = Math.max(
    0,
    Number(import.meta.env.VITE_CARER_CERT_UPSELL_DOLLARS || 10)
);

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
        { value: 8, label: 'More than 7 days' },
    ];

    const selectedDuration = durationOptions.find((option) => option.value === durationDays) || durationOptions[0];
    const durationLabel = durationDays > 7 ? 'More than 7 days' : `${durationDays} day${durationDays > 1 ? 's' : ''}`;
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
                                    className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg"
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
                        One-off price: <span className="price-numerals text-text-primary">{formatAud(estimatedOneOffPrice)}</span> ({pricingBandLabel})
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
    const [genderOpen, setGenderOpen] = useState(false);
    const genderMenuRef = useRef<HTMLDivElement | null>(null);
    const genderOptions = ['Male', 'Female', 'Other'];

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const fullName = details.fullName.trim();
        const dob = details.dob.trim();
        const gender = details.gender.trim();
        const email = details.email.trim();
        const phone = details.phone.trim();

        if (!fullName) newErrors.fullName = "Full legal name is required";
        if (!dob) newErrors.dob = "Date of birth is required";
        if (!gender) newErrors.gender = "Gender is required";
        if (!email || !email.includes('@')) newErrors.email = "Valid email is required";
        if (!phone) newErrors.phone = "Phone is required";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) nextStep();
    };

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
                        onChange={(e) => setDetails({ email: e.target.value })}
                        error={errors.email}
                        required
                    />
                    {details.email.trim() && <p className="text-xs font-semibold text-amber-600">Verification pending</p>}
                </div>
                <div className="space-y-1.5">
                    <Input
                        label={COPY.steps.details.fields.phone}
                        type="tel"
                        value={details.phone}
                        onChange={(e) => setDetails({ phone: e.target.value })}
                        error={errors.phone}
                        required
                    />
                    {details.phone.trim() && <p className="text-xs font-semibold text-amber-600">Verification pending</p>}
                </div>
            </div>
            <Button fullWidth onClick={handleSubmit}>{COPY.steps.details.cta}</Button>
        </motion.div>
    );
};

export const CheckoutStep = () => {
    const {
        isUnlimited,
        includeCarerCertificate,
        setCarerCertificate,
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
    const showCarerUpsell = !isUnlimited;
    const baseAmount = isUnlimited ? UNLIMITED_MONTHLY_PRICE_AUD : getOneOffCertificatePrice(durationDays);
    const carerAddonAmount = showCarerUpsell && includeCarerCertificate ? CARER_CERT_UPSELL_DOLLARS : 0;
    const totalAmount = baseAmount + carerAddonAmount;
    const oneOffLabel = getOneOffCertificateBandLabel(durationDays);

    useEffect(() => {
        warmCheckoutPath();
    }, []);

    const handleCheckout = async () => {
        setSubmitError('');
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
                    <span className="price-numerals text-text-primary">
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
                            <p className="price-numerals mt-2 text-sm text-text-primary">+${CARER_CERT_UPSELL_DOLLARS.toFixed(2)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCarerCertificate(!includeCarerCertificate)}
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

            {showCarerUpsell && (
                <div className="rounded-xl border border-border bg-sand-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">Total due today</span>
                        <span className="price-numerals text-base text-text-primary">${totalAmount.toFixed(2)}</span>
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
