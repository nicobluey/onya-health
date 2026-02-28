import { useState } from 'react';
import { useBooking } from '../state';
import { COPY } from '../copy';
import { Button, SelectableCard, Checkbox, Input } from './UI';
import { motion } from 'framer-motion';
import { getServiceForPath } from '../services';

// Transitions
const fade = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3 }
};

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

export const SymptomStep = () => {
    const { setSymptom, nextStep, symptom } = useBooking();
    return (
        <motion.div {...fade} className="space-y-4">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.symptom.question}</h2>
            <div className="grid grid-cols-1 gap-3">
                {COPY.steps.symptom.options.map((opt) => (
                    <SelectableCard
                        key={opt}
                        selected={symptom === opt}
                        onClick={() => { setSymptom(opt as any); nextStep(); }}
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
    // We need to track individual checks locally or assume all must be checked logic in store. 
    // Store just has `complianceChecked` boolean.
    // The UI needs 5 separate checkboxes. Let's track them locally.

    const [checks, setChecks] = useState<boolean[]>(new Array(COPY.steps.compliance.checks.length).fill(false));

    const handleCheck = (idx: number, checked: boolean) => {
        const newChecks = [...checks];
        newChecks[idx] = checked;
        setChecks(newChecks);

        // If all checked, update store
        if (newChecks.every(c => c)) {
            setComplianceChecked(true);
        } else {
            setComplianceChecked(false);
        }
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.compliance.title}</h2>
            <div className="space-y-4">
                {COPY.steps.compliance.checks.map((text, idx) => (
                    <Checkbox
                        key={idx}
                        label={text}
                        checked={checks[idx]}
                        onChange={(c) => handleCheck(idx, c)}
                    />
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
    const { description, setDescription, nextStep } = useBooking();
    const [error, setError] = useState('');

    const handleNext = () => {
        if (!description.trim()) {
            setError('Please describe your symptoms');
            return;
        }
        nextStep();
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.description.prompt}</h2>
            <div className="space-y-2">
                <textarea
                    autoFocus
                    className="w-full h-32 p-4 rounded-xl border border-border resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    placeholder="I have a sore throat and fever..."
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setError(''); }}
                />
                <p className="text-sm text-text-secondary">{COPY.steps.description.helper}</p>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <Button fullWidth onClick={handleNext}>Continue</Button>
        </motion.div>
    );
};

export const DatesStep = () => {
    const { setDates, nextStep, startDate, durationDays } = useBooking();
    // Simple date picker simulation
    const today = new Date();
    // Just show Today, Tomorrow, Next Day as buttons for start date? 
    // User asked for "Calendar start date" and "Duration selector".
    // For simplicity/speed in this demo, I will use native date input or simple buttons.
    // "Calendar start date" implies a picker.

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">{COPY.steps.dates.question}</h2>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Start Date</label>
                    <input
                        type="date"
                        className="w-full p-3 rounded-lg border border-border bg-white"
                        defaultValue={today.toISOString().split('T')[0]} // Default to today
                        onChange={(e) => setDates(new Date(e.target.value), durationDays)}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Duration</label>
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map(d => (
                            <button
                                key={d}
                                onClick={() => setDates(startDate || new Date(), d)}
                                className={`py-3 rounded-lg border font-medium transition-all ${durationDays === d
                                    ? 'bg-primary border-primary text-sand-50'
                                    : 'bg-white border-border text-text-secondary hover:border-sand-300'
                                    }`}
                            >
                                {d} Day{d > 1 ? 's' : ''}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-sunlight-50 p-4 rounded-lg">
                    <p className="text-sm text-text-primary font-medium">
                        Certificate valid from: <span className="font-bold">{startDate ? startDate.toLocaleDateString() : 'Select date'}</span>
                    </p>
                    <p className="text-sm text-text-secondary">
                        Length: {durationDays} day{durationDays > 1 ? 's' : ''}
                    </p>
                </div>
            </div>
            <Button fullWidth onClick={nextStep}>Continue</Button>
        </motion.div>
    );
};

export const DetailsStep = () => {
    const { details, setDetails, nextStep } = useBooking();
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!details.fullName) newErrors.fullName = "Name is required";
        if (!details.email || !details.email.includes('@')) newErrors.email = "Valid email is required";
        if (!details.phone) newErrors.phone = "Phone is required";
        if (!details.address) newErrors.address = "Address is required";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) nextStep();
    };

    return (
        <motion.div {...fade} className="space-y-6">
            <h2 className="text-2xl font-bold text-text-primary">Your Details</h2>
            <div className="space-y-4">
                <Input
                    label={COPY.steps.details.fields.name}
                    value={details.fullName}
                    onChange={(e) => setDetails({ fullName: e.target.value })}
                    error={errors.fullName}
                />
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label={COPY.steps.details.fields.dob}
                        type="date"
                        value={details.dob}
                        onChange={(e) => setDetails({ dob: e.target.value })}
                    />
                    <Input
                        label={COPY.steps.details.fields.gender}
                        placeholder="e.g. Female"
                        value={details.gender}
                        onChange={(e) => setDetails({ gender: e.target.value })}
                    />
                </div>
                <Input
                    label={COPY.steps.details.fields.email}
                    type="email"
                    value={details.email}
                    onChange={(e) => setDetails({ email: e.target.value })}
                    error={errors.email}
                />
                <Input
                    label={COPY.steps.details.fields.phone}
                    type="tel"
                    value={details.phone}
                    onChange={(e) => setDetails({ phone: e.target.value })}
                    error={errors.phone}
                />
                <Input
                    label={COPY.steps.details.fields.address}
                    value={details.address}
                    onChange={(e) => setDetails({ address: e.target.value })}
                    error={errors.address}
                />
            </div>
            <Button fullWidth onClick={handleSubmit}>{COPY.steps.details.cta}</Button>
        </motion.div>
    );
};

export const CheckoutStep = () => {
    const {
        nextStep,
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

    const handleCheckout = async () => {
        setSubmitError('');
        setSubmitting(true);

        try {
            const serviceType = getServiceForPath(window.location.pathname) || 'doctor';
            const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

            const response = await fetch(`${apiBase}/api/checkout/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    serviceType,
                    patient: details,
                    consult: {
                        purpose,
                        symptom,
                        complianceChecked,
                        description,
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
            if (payload?.patientToken) {
                window.localStorage.setItem('onya_patient_token', payload.patientToken);
            }
            if (payload?.sessionId) {
                window.localStorage.setItem('onya_last_checkout_session_id', payload.sessionId);
            }

            if (payload?.checkoutUrl) {
                window.location.assign(payload.checkoutUrl);
                return;
            }

            nextStep();
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
                        {isUnlimited ? "$19.00" : "$25.00"}
                    </span>
                </div>
                {isUnlimited && <div className="text-xs text-forest-700 font-medium">Billed monthly</div>}
            </div>

            {/* Stripe Placeholder */}
            <div className="border border-border rounded-xl p-4 space-y-4">
                <div className="h-10 bg-sand-100 rounded animate-pulse" />
                <div className="h-10 bg-sand-100 rounded animate-pulse" />
            </div>

            <Button fullWidth onClick={handleCheckout} disabled={submitting}>
                {COPY.steps.checkout.cta}
            </Button>
            {submitError && (
                <p className="text-sm text-red-600 font-medium">{submitError}</p>
            )}
            {submitting && (
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
            <div className="p-4 bg-sunlight-50 rounded-xl text-sm text-text-primary">
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

import { Check } from 'lucide-react';

export const StepRenderer = () => {
    const { step } = useBooking();
    switch (step) {
        case 'purpose': return <PurposeStep />;
        case 'symptom': return <SymptomStep />;
        case 'compliance': return <ComplianceStep />;
        case 'description': return <DescriptionStep />;
        case 'dates': return <DatesStep />;
        case 'details': return <DetailsStep />;
        case 'checkout': return <CheckoutStep />;
        case 'confirmation': return <ConfirmationStep />;
        default: return null;
    }
};
