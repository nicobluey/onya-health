import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useBooking } from '../state';
import { COPY } from '../copy';
import { Button, SelectableCard, Input } from './UI';
import { AnimatePresence, motion } from 'framer-motion';
import { getServiceForPath } from '../services';

// Transitions
const fade = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3 }
};

type EmbeddedCheckoutInstance = {
    mount: (element: HTMLElement | string) => void;
    destroy: () => void;
};

type StripeLike = {
    initEmbeddedCheckout: (config: {
        fetchClientSecret: () => Promise<string>;
        onComplete?: () => void;
    }) => Promise<EmbeddedCheckoutInstance>;
};

let stripeLoaderPromise: Promise<StripeLike> | null = null;

function loadStripe(publishableKey: string): Promise<StripeLike> {
    if (!publishableKey) {
        return Promise.reject(new Error('Stripe publishable key is missing'));
    }

    if (stripeLoaderPromise) return stripeLoaderPromise;

    stripeLoaderPromise = new Promise((resolve, reject) => {
        const existingStripe = (window as any).Stripe;
        if (typeof existingStripe === 'function') {
            resolve(existingStripe(publishableKey));
            return;
        }

        const scriptId = 'stripe-js';
        let script = document.getElementById(scriptId) as HTMLScriptElement | null;
        if (!script) {
            script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://js.stripe.com/clover/stripe.js';
            script.async = true;
            document.head.appendChild(script);
        } else if (typeof (window as any).Stripe === 'function') {
            resolve((window as any).Stripe(publishableKey));
            return;
        }

        const onLoad = () => {
            const stripeFactory = (window as any).Stripe;
            if (typeof stripeFactory !== 'function') {
                reject(new Error('Stripe.js failed to initialise'));
                return;
            }
            resolve(stripeFactory(publishableKey));
        };

        const onError = () => reject(new Error('Unable to load Stripe.js'));

        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
    });

    return stripeLoaderPromise;
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
                        onClick={() => { setPurpose(opt as any); nextStep(); }}
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

export const DescriptionStep = () => {
    const {
        symptom,
        setSymptom,
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
                        const selected = symptom.includes(opt as any);
                        return (
                            <button
                                key={opt}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                    const next = selected
                                        ? symptom.filter((value) => value !== (opt as any))
                                        : [...symptom, opt as any];
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
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <Button fullWidth onClick={handleNext}>Continue</Button>
        </motion.div>
    );
};

export const DatesStep = () => {
    const { setDates, nextStep, startDate, durationDays } = useBooking();
    const today = new Date();
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

    const dateToInputValue = (value: Date | null) => {
        const source = value || today;
        const normalized = new Date(source.getTime() - source.getTimezoneOffset() * 60000);
        return normalized.toISOString().split('T')[0];
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

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Start Date</label>
                    <input
                        type="date"
                        className="w-full p-3 rounded-lg border border-border bg-white"
                        value={dateToInputValue(startDate)}
                        onChange={(e) => setDates(new Date(e.target.value), durationDays)}
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
                                                    setDates(startDate || today, option.value);
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
        purpose,
        symptom,
        complianceChecked,
        description,
        startDate,
        durationDays,
        details
    } = useBooking();
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [embeddedClientSecret, setEmbeddedClientSecret] = useState('');
    const [embeddedSessionId, setEmbeddedSessionId] = useState('');
    const checkoutContainerRef = useRef<HTMLDivElement | null>(null);
    const embeddedCheckoutRef = useRef<EmbeddedCheckoutInstance | null>(null);
    const stripePublishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

    const handleCheckout = async () => {
        if (embeddedClientSecret) return;
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
            const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
            const uiMode = stripePublishableKey ? 'embedded' : 'hosted';

            const response = await fetch(`${apiBase}/api/checkout/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    uiMode,
                    serviceType,
                    patient: details,
                    consult: {
                        purpose,
                        symptom: symptomSummary,
                        complianceChecked,
                        description: consultDescription,
                        startDate: startDate?.toISOString() || null,
                        durationDays,
                        isUnlimited,
                    }
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to submit your certificate right now.');
            }

            if (details.email) {
                window.localStorage.setItem('onya_patient_email', details.email);
            }
            if (payload?.sessionId) {
                window.localStorage.setItem('onya_last_checkout_session_id', payload.sessionId);
            }

            if (uiMode === 'embedded' && payload?.clientSecret) {
                setEmbeddedClientSecret(payload.clientSecret);
                setEmbeddedSessionId(payload.sessionId || '');
                return;
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

    useEffect(() => {
        if (!embeddedClientSecret) return;

        let cancelled = false;

        const mountEmbeddedCheckout = async () => {
            try {
                const stripe = await loadStripe(stripePublishableKey);
                const checkout = await stripe.initEmbeddedCheckout({
                    fetchClientSecret: async () => embeddedClientSecret,
                    onComplete: () => {
                        const search = new URLSearchParams();
                        search.set('checkout', 'success');
                        if (embeddedSessionId) {
                            search.set('session_id', embeddedSessionId);
                            window.localStorage.setItem('onya_last_checkout_session_id', embeddedSessionId);
                        }
                        window.location.assign(`/patient?${search.toString()}`);
                    },
                });

                if (cancelled) {
                    checkout.destroy();
                    return;
                }

                embeddedCheckoutRef.current = checkout;
                if (checkoutContainerRef.current) {
                    checkout.mount(checkoutContainerRef.current);
                }
            } catch (errorObject) {
                setSubmitError(errorObject instanceof Error ? errorObject.message : 'Unable to load Stripe checkout');
            }
        };

        mountEmbeddedCheckout();

        return () => {
            cancelled = true;
            if (embeddedCheckoutRef.current) {
                embeddedCheckoutRef.current.destroy();
                embeddedCheckoutRef.current = null;
            }
        };
    }, [embeddedClientSecret, embeddedSessionId, stripePublishableKey]);

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.checkout.title}</h2>

            <div className="bg-sand-50 border border-border rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-text-primary">
                        {isUnlimited ? "Unlimited Certificates" : "One-off Certificate"}
                    </span>
                    <span className="font-bold text-text-primary">
                        {isUnlimited ? "$19.00" : "$25.00"}
                    </span>
                </div>
                {isUnlimited && <div className="text-xs text-forest-700 font-medium">Billed monthly</div>}
            </div>

            <div className="border border-border rounded-xl p-4 space-y-4">
                {embeddedClientSecret ? (
                    <div ref={checkoutContainerRef} className="min-h-[420px]" />
                ) : (
                    <>
                        <div className="h-10 bg-sand-100 rounded animate-pulse" />
                        <div className="h-10 bg-sand-100 rounded animate-pulse" />
                    </>
                )}
            </div>

            <Button fullWidth onClick={handleCheckout} disabled={submitting || Boolean(embeddedClientSecret)}>
                {submitting ? 'Preparing checkout...' : embeddedClientSecret ? 'Checkout loaded below' : COPY.steps.checkout.cta}
            </Button>
            {submitError && (
                <p className="text-sm text-red-600 font-medium">{submitError}</p>
            )}
            {submitting && !embeddedClientSecret && (
                <p className="text-sm text-text-secondary">Preparing secure Stripe checkout...</p>
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
        case 'description': return <DescriptionStep />;
        case 'dates': return <DatesStep />;
        case 'details': return <DetailsStep />;
        case 'checkout': return <CheckoutStep />;
        case 'confirmation': return <ConfirmationStep />;
        default: return null;
    }
};
