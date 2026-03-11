import {
  Brain,
  ClipboardPlus,
  Pill,
  Scale,
  Stethoscope,
  TestTube2,
  type LucideIcon,
} from 'lucide-react';

export type MainTab = 'home' | 'consult' | 'account';
export type PortalScreen = 'main' | 'call-prep' | 'queued' | 'consult-coming-soon';
export type RecordTab = 'medical-history' | 'allergies' | 'medications';
export type LayoutMode = 'desktop' | 'mobile';

export type ConsultOptionId =
  | 'medical-certificate'
  | 'blood-tests'
  | 'prescriptions'
  | 'general-consult'
  | 'weight-loss'
  | 'psychology';

export interface ConsultOption {
  id: ConsultOptionId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  status: 'available' | 'coming-soon';
  badge?: string;
}

export interface PortalRequest {
  id: string;
  createdAt: string;
  status: string;
  serviceType: string;
  purpose: string;
  symptom: string;
  description: string;
  startDate: string | null;
  durationDays: number;
  decision?: {
    by?: string;
    at?: string;
    notes?: string;
  } | null;
  certificatePdfUrl?: string | null;
}

export interface PatientProfile {
  fullName: string;
  email: string;
  dob?: string;
  phone?: string;
}

export interface TextEntry {
  id: string;
  title: string;
  details: string;
  createdAt: string;
}

export interface TestResultEntry {
  id: string;
  name: string;
  summary: string;
  testDate: string;
  fileName: string;
  createdAt: string;
}

export interface PortalProfileData {
  medicalHistory: TextEntry[];
  allergies: TextEntry[];
  medications: TextEntry[];
  lifestyleNotes: TextEntry[];
  testResults: TestResultEntry[];
}

export interface TestResultDraft {
  name: string;
  summary: string;
  testDate: string;
  fileName: string;
}

export interface CheckoutSetupContext {
  sessionId: string;
  consultEmail: string;
}

export interface PortalBackgroundCard {
  src: string;
  className: string;
  tilt: string;
  duration: string;
  delay: string;
  reverse?: boolean;
}

export const MAIN_TABS: MainTab[] = ['home', 'consult', 'account'];

export const CONSULT_OPTIONS: ConsultOption[] = [
  {
    id: 'medical-certificate',
    title: 'Medical Certificate',
    subtitle: 'Get a medical certificate reviewed by a doctor',
    icon: ClipboardPlus,
    status: 'available',
    badge: 'LIVE',
  },
  {
    id: 'blood-tests',
    title: 'Blood Tests',
    subtitle: 'Request a pathology referral for blood work',
    icon: TestTube2,
    status: 'coming-soon',
    badge: 'COMING SOON',
  },
  {
    id: 'prescriptions',
    title: 'Prescriptions',
    subtitle: 'Renew or request a new prescription',
    icon: Pill,
    status: 'coming-soon',
    badge: 'COMING SOON',
  },
  {
    id: 'general-consult',
    title: 'General Consult',
    subtitle: 'Speak with a doctor about any health concern',
    icon: Stethoscope,
    status: 'coming-soon',
    badge: 'COMING SOON',
  },
  {
    id: 'weight-loss',
    title: 'Weight Loss',
    subtitle: 'Start or continue your weight support plan',
    icon: Scale,
    status: 'coming-soon',
    badge: 'COMING SOON',
  },
  {
    id: 'psychology',
    title: 'Psychology',
    subtitle: 'Talk with a psychologist online with confidential support',
    icon: Brain,
    status: 'coming-soon',
    badge: 'COMING SOON',
  },
];

export const PORTAL_BACKGROUND_CARDS: PortalBackgroundCard[] = [
  {
    src: '/Blue%20Cells.png',
    className: '-left-14 top-20 h-28 w-28 md:-left-20 md:top-28 md:h-40 md:w-40',
    tilt: '-8deg',
    duration: '22s',
    delay: '0s',
  },
  {
    src: '/Green%20Cells.png',
    className: 'right-[-2rem] top-24 h-24 w-24 md:right-[2%] md:top-24 md:h-32 md:w-32',
    tilt: '8deg',
    duration: '20s',
    delay: '1s',
    reverse: true,
  },
  {
    src: '/Microscope.png',
    className: 'right-[-2.2rem] bottom-8 h-28 w-28 md:right-[-3rem] md:bottom-16 md:h-40 md:w-40',
    tilt: '7deg',
    duration: '26s',
    delay: '0.6s',
    reverse: true,
  },
  {
    src: '/Lab%20Equipment.png',
    className: 'left-2 bottom-12 h-24 w-24 md:left-[2%] md:bottom-20 md:h-32 md:w-32',
    tilt: '-7deg',
    duration: '24s',
    delay: '1.5s',
  },
];

export function createEmptyPortalData(): PortalProfileData {
  return {
    medicalHistory: [],
    allergies: [],
    medications: [],
    lifestyleNotes: [],
    testResults: [],
  };
}

export function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function parseTextEntries(source: unknown): TextEntry[] {
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const value = item as Record<string, unknown>;
      const title = asText(value.title).trim();
      const details = asText(value.details).trim();
      if (!title && !details) return null;

      return {
        id: asText(value.id) || createId(),
        title: title || 'Untitled',
        details,
        createdAt: asText(value.createdAt) || new Date().toISOString(),
      };
    })
    .filter((item): item is TextEntry => Boolean(item));
}

function parseTestResults(source: unknown): TestResultEntry[] {
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const value = item as Record<string, unknown>;
      const name = asText(value.name).trim();
      const summary = asText(value.summary).trim();
      const testDate = asText(value.testDate).trim();
      if (!name && !summary) return null;

      return {
        id: asText(value.id) || createId(),
        name: name || 'Untitled result',
        summary,
        testDate: testDate || new Date().toISOString(),
        fileName: asText(value.fileName),
        createdAt: asText(value.createdAt) || new Date().toISOString(),
      };
    })
    .filter((item): item is TestResultEntry => Boolean(item));
}

export function readPortalProfile(raw: string | null): PortalProfileData {
  if (!raw) return createEmptyPortalData();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createEmptyPortalData();
    const value = parsed as Record<string, unknown>;
    return {
      medicalHistory: parseTextEntries(value.medicalHistory),
      allergies: parseTextEntries(value.allergies),
      medications: parseTextEntries(value.medications),
      lifestyleNotes: parseTextEntries(value.lifestyleNotes),
      testResults: parseTestResults(value.testResults),
    };
  } catch {
    return createEmptyPortalData();
  }
}

export function appendRecordEntry(data: PortalProfileData, tab: RecordTab, entry: TextEntry): PortalProfileData {
  if (tab === 'medical-history') {
    return {
      ...data,
      medicalHistory: [entry, ...data.medicalHistory],
    };
  }
  if (tab === 'allergies') {
    return {
      ...data,
      allergies: [entry, ...data.allergies],
    };
  }
  return {
    ...data,
    medications: [entry, ...data.medications],
  };
}

export function isQueuedStatus(status: string) {
  const normalized = String(status || '').toLowerCase();
  return ['awaiting_payment', 'pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(normalized);
}

export function statusLabel(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'awaiting_payment') return 'Awaiting payment confirmation';
  if (['pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(normalized)) return 'Pending doctor review';
  if (normalized === 'approved') return 'Approved and issued';
  if (normalized === 'closed') return 'Completed';
  if (normalized === 'denied') return 'Not approved';
  if (!normalized) return 'No active request';
  return normalized.replace(/_/g, ' ');
}

export function consultTitle(serviceType: string) {
  if (serviceType === 'doctor' || !serviceType) return 'Medical Certificate';
  return serviceType
    .split('_')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatReadableDate(value?: string | null) {
  if (!value) return 'Not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function avatarInitials(fullName: string) {
  const initials = fullName
    .split(' ')
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials || 'PT';
}

export function firstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(' ')[0];
}

export function sectionCardClassName(extraClassName = '') {
  return `rounded-3xl border border-[#cbd5e1] bg-white shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] ${extraClassName}`.trim();
}
