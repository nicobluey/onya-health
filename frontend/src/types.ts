export type CertificatePurpose =
    | 'University / School'
    | 'Work'
    | 'Carer’s leave'
    | 'Travel'
    | 'Other';

export type Symptom =
    | 'Cold / Flu'
    | 'Gastro'
    | 'Migraine'
    | 'Mental Health'
    | 'Injury'
    | 'Other';

export type BookingStep =
    | 'purpose'
    | 'compliance'
    | 'description'
    | 'dates'
    | 'upsell'
    | 'details'
    | 'checkout'
    | 'confirmation';

export interface UserDetails {
    fullName: string;
    dob: string;
    gender: string;
    email: string;
    phone: string;
    address: string;
}

export interface BookingState {
    step: BookingStep;
    purpose: CertificatePurpose | null;
    symptom: Symptom[];
    complianceChecked: boolean;
    description: string;
    startDate: Date | null;
    durationDays: number;
    isUnlimited: boolean; // false = one-off, true = subscription
    details: UserDetails;
    showUpsell: boolean; // Logic flag to trigger modal
    view?: 'landing' | 'booking';
}
