/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { BookingState, BookingStep, CertificatePurpose, Symptom, SymptomVisibility, UserDetails } from '../types';

interface BookingContextType extends BookingState {
    setPurpose: (p: CertificatePurpose) => void;
    setSymptom: (s: Symptom[]) => void;
    setSymptomVisibility: (visibility: SymptomVisibility) => void;
    setComplianceChecked: (checked: boolean) => void;
    setDescription: (d: string) => void;
    setDates: (start: Date, duration: number) => void;
    setUnlimited: (unlimited: boolean) => void;
    setCarerCertificate: (enabled: boolean) => void;
    setDetails: (d: Partial<UserDetails>) => void;
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (step: BookingStep) => void;
    startBooking: () => void;
    goHome: () => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const FLOW_ORDER: BookingStep[] = [
    'purpose',
    'compliance',
    'safety',
    'description',
    'dates',
    'upsell',
    'details',
    'checkout',
    'confirmation'
];

function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function normalizeStartDate(value: Date) {
    const normalized = new Date(value);
    if (Number.isNaN(normalized.getTime())) {
        return startOfToday();
    }
    normalized.setHours(0, 0, 0, 0);
    const today = startOfToday();
    return normalized < today ? today : normalized;
}

function getPurposeFromSearch(): CertificatePurpose | null {
    const params = new URLSearchParams(window.location.search);
    const rawPurpose = (params.get('purpose') || '').trim().toLowerCase();

    if (rawPurpose === 'work') return 'Work';
    if (rawPurpose === 'university' || rawPurpose === 'uni' || rawPurpose === 'school') return 'University / School';
    if (rawPurpose === 'carer' || rawPurpose === 'carers' || rawPurpose === 'carers-leave') return 'Carer’s leave';

    return null;
}

function getInitialViewFromSearch(): 'landing' | 'booking' {
    const params = new URLSearchParams(window.location.search);
    const view = (params.get('view') || '').trim().toLowerCase();
    return view === 'booking' ? 'booking' : 'landing';
}

function readStoredPatientEmail() {
    if (typeof window === 'undefined') return '';
    return String(window.localStorage.getItem('onya_patient_email') || '').trim().toLowerCase();
}

export function BookingProvider({ children }: { children: ReactNode }) {
    const preselectedPurpose = getPurposeFromSearch();
    const initialStep: BookingStep = preselectedPurpose ? 'compliance' : 'purpose';
    const initialView = getInitialViewFromSearch();

    const [state, setState] = useState<BookingState>({
        step: initialStep,
        purpose: preselectedPurpose,
        symptom: [],
        symptomVisibility: 'private',
        complianceChecked: false,
        description: '',
        startDate: startOfToday(),
        durationDays: 1,
        isUnlimited: false,
        includeCarerCertificate: false,
        details: {
            fullName: '',
            dob: '',
            gender: '',
            email: readStoredPatientEmail(),
            phone: '',
            address: ''
        },
        showUpsell: false,
        view: initialView,
    });

    const updateState = (updates: Partial<BookingState>) => {
        setState(prev => ({ ...prev, ...updates }));
    };

    const nextStep = () => {
        const currentIndex = FLOW_ORDER.indexOf(state.step);
        if (currentIndex < FLOW_ORDER.length - 1) {
            if (state.step === 'dates') {
                setState(prev => ({ ...prev, step: 'upsell', showUpsell: true }));
            } else if (state.step === 'upsell') {
                setState(prev => ({ ...prev, step: 'details', showUpsell: false }));
            } else {
                setState(prev => ({ ...prev, step: FLOW_ORDER[currentIndex + 1] }));
            }
        }
    };

    const prevStep = () => {
        const currentIndex = FLOW_ORDER.indexOf(state.step);
        if (currentIndex > 0) {
            setState(prev => ({ ...prev, step: FLOW_ORDER[currentIndex - 1] }));
        }
    };

    const goToStep = (step: BookingStep) => {
        setState(prev => ({ ...prev, step }));
    };

    const value: BookingContextType = {
        ...state,
        setPurpose: (purpose: CertificatePurpose) => updateState({ purpose }),
        setSymptom: (symptom: Symptom[]) => updateState({ symptom }),
        setSymptomVisibility: (symptomVisibility: SymptomVisibility) => updateState({ symptomVisibility }),
        setComplianceChecked: (complianceChecked: boolean) => updateState({ complianceChecked }),
        setDescription: (description: string) => updateState({ description }),
        setDates: (startDate: Date, durationDays: number) =>
            updateState({
                startDate: normalizeStartDate(startDate),
                durationDays: Math.max(1, Number(durationDays || 1)),
            }),
        setUnlimited: (isUnlimited: boolean) =>
            setState((prev) => ({
                ...prev,
                isUnlimited,
                includeCarerCertificate: isUnlimited ? false : prev.includeCarerCertificate,
            })),
        setCarerCertificate: (includeCarerCertificate: boolean) => updateState({ includeCarerCertificate }),
        setDetails: (details: Partial<UserDetails>) => setState(prev => ({ ...prev, details: { ...prev.details, ...details } })),
        nextStep,
        prevStep,
        goToStep,
        startBooking: () => updateState({ view: 'booking' }),
        goHome: () => updateState({
            view: 'landing',
            step: preselectedPurpose ? 'compliance' : 'purpose',
            purpose: preselectedPurpose,
            showUpsell: false
        })
    };

    const { Provider } = BookingContext;
    return (
        <Provider value={value} >
            {children}
        </Provider>
    );
}

export function useBooking() {
    const context = useContext(BookingContext);
    if (!context) throw new Error('useBooking must be used within a BookingProvider');
    return context;
}
