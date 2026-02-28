import { createContext, useContext, useState, type ReactNode } from 'react';
import type { BookingState, BookingStep, CertificatePurpose, Symptom, UserDetails } from './types';

interface BookingContextType extends BookingState {
    setPurpose: (p: CertificatePurpose) => void;
    setSymptom: (s: Symptom) => void;
    setComplianceChecked: (checked: boolean) => void;
    setDescription: (d: string) => void;
    setDates: (start: Date, duration: number) => void;
    setUnlimited: (unlimited: boolean) => void;
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
    'symptom',
    'compliance',
    'description',
    'dates',
    'upsell',
    'details',
    'checkout',
    'confirmation'
];

export function BookingProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<BookingState>({
        step: 'purpose',
        purpose: null,
        symptom: null,
        complianceChecked: false,
        description: '',
        startDate: new Date(),
        durationDays: 1,
        isUnlimited: false,
        details: {
            fullName: '',
            dob: '',
            gender: '',
            email: '',
            phone: '',
            address: ''
        },
        showUpsell: false,
        view: 'landing',
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
        setSymptom: (symptom: Symptom) => updateState({ symptom }),
        setComplianceChecked: (complianceChecked: boolean) => updateState({ complianceChecked }),
        setDescription: (description: string) => updateState({ description }),
        setDates: (startDate: Date, durationDays: number) => updateState({ startDate, durationDays }),
        setUnlimited: (isUnlimited: boolean) => updateState({ isUnlimited }),
        setDetails: (details: Partial<UserDetails>) => setState(prev => ({ ...prev, details: { ...prev.details, ...details } })),
        nextStep,
        prevStep,
        goToStep,
        startBooking: () => updateState({ view: 'booking' }),
        goHome: () => updateState({ view: 'landing', step: 'purpose', showUpsell: false })
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
