import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock3,
    ClipboardPlus,
    FileText,
    Heart,
    Home,
    Info,
    MessageCircle,
    MicOff,
    Phone,
    Pill,
    Scale,
    Stethoscope,
    Tag,
    TestTube2,
    UserRound,
} from 'lucide-react';
import { fetchApiJson, getApiBase } from './lib/api';
import HomeTab from './patient-portal/home/HomeTab';

type MainTab = 'home' | 'consult' | 'account';
type PortalScreen = 'main' | 'call-prep' | 'queued';
type RecordTab = 'medical-history' | 'allergies' | 'medications';
type LayoutMode = 'desktop' | 'mobile';

interface PortalRequest {
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

interface PatientProfile {
    fullName: string;
    email: string;
    dob?: string;
    phone?: string;
}

interface TextEntry {
    id: string;
    title: string;
    details: string;
    createdAt: string;
}

interface TestResultEntry {
    id: string;
    name: string;
    summary: string;
    testDate: string;
    fileName: string;
    createdAt: string;
}

interface PortalProfileData {
    medicalHistory: TextEntry[];
    allergies: TextEntry[];
    medications: TextEntry[];
    lifestyleNotes: TextEntry[];
    testResults: TestResultEntry[];
}

interface TestResultDraft {
    name: string;
    summary: string;
    testDate: string;
    fileName: string;
}

const MAIN_TABS: MainTab[] = ['home', 'consult', 'account'];

const CONSULT_OPTIONS = [
    {
        id: 'medical-certificate',
        title: 'Medical Certificate',
        subtitle: 'Get a medical certificate reviewed by a doctor',
        icon: ClipboardPlus,
        active: true,
        badge: 'ACTIVE',
    },
    {
        id: 'blood-tests',
        title: 'Blood Tests',
        subtitle: 'Request a pathology referral for blood work',
        icon: TestTube2,
        active: false,
        badge: 'COMING SOON',
    },
    {
        id: 'prescriptions',
        title: 'Prescriptions',
        subtitle: 'Renew or request a new prescription',
        icon: Pill,
        active: false,
    },
    {
        id: 'general-consult',
        title: 'General Consult',
        subtitle: 'Speak with a doctor about any health concern',
        icon: Stethoscope,
        active: false,
    },
    {
        id: 'weight-loss',
        title: 'Weight Loss',
        subtitle: 'Start or continue your weight support plan',
        icon: Scale,
        active: false,
    },
];

function createEmptyPortalData(): PortalProfileData {
    return {
        medicalHistory: [],
        allergies: [],
        medications: [],
        lifestyleNotes: [],
        testResults: [],
    };
}

function createId() {
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

function readPortalProfile(raw: string | null): PortalProfileData {
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

function appendRecordEntry(data: PortalProfileData, tab: RecordTab, entry: TextEntry): PortalProfileData {
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

function isQueuedStatus(status: string) {
    const normalized = String(status || '').toLowerCase();
    return ['awaiting_payment', 'pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(normalized);
}

function statusLabel(status: string) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'awaiting_payment') return 'Awaiting payment confirmation';
    if (['pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(normalized)) return 'Pending doctor review';
    if (normalized === 'approved') return 'Approved and issued';
    if (normalized === 'closed') return 'Completed';
    if (normalized === 'denied') return 'Not approved';
    if (!normalized) return 'No active request';
    return normalized.replace(/_/g, ' ');
}

function consultTitle(serviceType: string) {
    if (serviceType === 'doctor' || !serviceType) return 'Medical Certificate';
    return serviceType
        .split('_')
        .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatReadableDate(value?: string | null) {
    if (!value) return 'Not provided';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
}

function avatarInitials(fullName: string) {
    const initials = fullName
        .split(' ')
        .map((part) => part.trim().charAt(0))
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
    return initials || 'PT';
}

function firstName(fullName: string) {
    const trimmed = fullName.trim();
    if (!trimmed) return 'there';
    return trimmed.split(' ')[0];
}

function sectionCardClassName(extraClassName = '') {
    return `rounded-3xl border border-[#dbe2d9] bg-white shadow-[0_24px_42px_-34px_rgba(17,27,20,0.45)] ${extraClassName}`.trim();
}

function DesktopSidebar({
    activeTab,
    onTabChange,
    patient,
}: {
    activeTab: MainTab;
    onTabChange: (next: MainTab) => void;
    patient: PatientProfile;
}) {
    return (
        <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-[#d8e0d7] bg-[#f7faf6]/95 backdrop-blur">
            <div className="px-5 pt-5">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#6a786d]">Platform</p>
                <nav className="mt-3 space-y-1">
                    {[
                        { id: 'home' as const, label: 'Home', icon: Home },
                        { id: 'consult' as const, label: 'Consult', icon: Stethoscope },
                        { id: 'account' as const, label: 'Account', icon: UserRound },
                    ].map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onTabChange(item.id)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                                    active
                                        ? 'bg-[#141f18] text-white'
                                        : 'text-[#4c5d52] hover:bg-[#edf3ec] hover:text-[#1a2a21]'
                                }`}
                            >
                                <Icon size={16} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="mt-auto border-t border-[#d8e0d7] p-4">
                <div className="rounded-2xl border border-[#d7dfd6] bg-[#f1f6f0] p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dce7db] text-sm font-semibold text-[#1f5f3f]">
                            {avatarInitials(patient.fullName)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#1a2a21]">{patient.fullName || 'Patient'}</p>
                            <p className="truncate text-xs text-[#5f7063]">{patient.email || 'No email'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}

function MobileTopBar({ activeTab }: { activeTab: MainTab }) {
    const label = activeTab.slice(0, 1).toUpperCase() + activeTab.slice(1);

    return (
        <header className="sticky top-0 z-40 border-b border-[#d8e0d7] bg-[#f7faf6]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-4">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <span className="rounded-full border border-[#d8e0d7] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#465549]">
                    {label}
                </span>
            </div>
        </header>
    );
}

function MobileBottomNav({
    activeTab,
    onTabChange,
}: {
    activeTab: MainTab;
    onTabChange: (next: MainTab) => void;
}) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#d8e0d7] bg-[#f7faf6]">
            <div className="mx-auto flex h-16 w-full max-w-[740px] items-center px-1">
                {[
                    { id: 'home' as const, label: 'Home', icon: Home },
                    { id: 'consult' as const, label: 'Consult', icon: Stethoscope },
                    { id: 'account' as const, label: 'Account', icon: UserRound },
                ].map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onTabChange(item.id)}
                            className={`flex flex-1 flex-col items-center justify-center gap-1.5 py-2 ${
                                active ? 'text-[#1f5f3f]' : 'text-[#667669]'
                            }`}
                        >
                            <Icon size={20} />
                            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function QueueBanner({ onTap }: { onTap: () => void }) {
    return (
        <button
            type="button"
            onClick={onTap}
            className="fixed bottom-16 left-3 right-3 z-40 rounded-2xl border border-[#d8c79f] bg-[#fff7e8] px-4 py-3 text-left shadow-lg"
        >
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6e5bf] text-[#8d5c0a]">
                    <Heart size={18} className="fill-current stroke-current" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#5d420f]">You&apos;re in the queue</p>
                    <p className="text-xs text-[#7f5b1a]">Tap to view status</p>
                </div>
                <ChevronRight size={18} className="ml-auto text-[#7f5b1a]" />
            </div>
        </button>
    );
}

function ConsultTab({ onOpenCall }: { onOpenCall: () => void }) {
    return (
        <section>
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#14264a]">Book a consultation</h1>
                <p className="mt-1 text-base text-[#5f739b]">Choose the type of consultation you need</p>
            </header>

            <div className="mt-5 space-y-3">
                {CONSULT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const clickable = option.id === 'medical-certificate';
                    return (
                        <article
                            key={option.id}
                            onClick={clickable ? onOpenCall : undefined}
                            className={`${sectionCardClassName('p-4')} ${
                                clickable ? 'cursor-pointer' : ''
                            } ${option.active ? 'border-[#b7cdf4] bg-[#f8fbff]' : ''}`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                        option.active ? 'bg-[#eaf2ff] text-[#0f66e8]' : 'bg-[#f0f4fa] text-[#8a9abc]'
                                    }`}
                                >
                                    <Icon size={18} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-[#16305f]">{option.title}</h2>
                                    <p className="mt-1 text-sm text-[#60739a]">{option.subtitle}</p>
                                </div>
                                {option.badge ? (
                                    <span
                                        className={`ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                            option.active ? 'bg-[#deebff] text-[#143c7d]' : 'bg-[#e5ebf6] text-[#5b6f95]'
                                        }`}
                                    >
                                        {option.badge}
                                    </span>
                                ) : (
                                    <ChevronRight size={18} className="ml-auto text-[#90a2c6]" />
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function ProfileCard({ patient }: { patient: PatientProfile }) {
    const rows = [
        { label: 'Full name', value: patient.fullName || 'Patient' },
        { label: 'Email', value: patient.email || 'Not provided' },
        { label: 'Date of birth', value: formatReadableDate(patient.dob) },
        { label: 'Phone', value: patient.phone || 'Not provided' },
    ];

    return (
        <section className={sectionCardClassName()}>
            <div className="border-b border-[#e3e8e2] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#18251e]">Account Info</h2>
            </div>
            <div className="space-y-1 p-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-[#edf1ec] bg-[#f8faf7] px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#6f7e71]">{row.label}</p>
                        <p className="mt-1 text-sm font-medium text-[#213128]">{row.value}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function AccountTab({
    patient,
    latestRequest,
    data,
    onDownloadCertificate,
}: {
    patient: PatientProfile;
    latestRequest: PortalRequest | null;
    data: PortalProfileData;
    onDownloadCertificate: (request: PortalRequest) => void;
}) {
    const stats = [
        { label: 'Medical history', value: data.medicalHistory.length },
        { label: 'Lifestyle notes', value: data.lifestyleNotes.length },
        { label: 'Test results', value: data.testResults.length },
    ];

    return (
        <section className="space-y-5">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#14264a]">Account</h1>
                <p className="mt-1 text-base text-[#5f739b]">View your personal details and profile activity</p>
            </header>

            <ProfileCard patient={patient} />

            <section className={sectionCardClassName()}>
                <div className="border-b border-[#dbe4f6] px-5 py-4">
                    <h2 className="text-lg font-semibold text-[#14264a]">Profile Summary</h2>
                </div>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                    {stats.map((item) => (
                        <article key={item.label} className="rounded-2xl border border-[#dbe4f6] bg-[#f8fbff] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7080a2]">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-[#173362]">{item.value}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className={sectionCardClassName()}>
                <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7588ad]">Latest consult</p>
                    {latestRequest ? (
                        <>
                            <h2 className="mt-2 text-lg font-semibold text-[#14264a]">{consultTitle(latestRequest.serviceType)}</h2>
                            <p className="mt-1 text-sm text-[#5f739b]">{statusLabel(latestRequest.status)}</p>
                            <p className="mt-1 text-xs text-[#7a8bab]">Updated {formatDate(latestRequest.createdAt)}</p>
                            {latestRequest.certificatePdfUrl && (
                                <button
                                    type="button"
                                    onClick={() => onDownloadCertificate(latestRequest)}
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0f66e8] px-3 py-2 text-sm font-semibold text-white"
                                >
                                    <FileText size={15} />
                                    Download Medical Certificate
                                </button>
                            )}
                        </>
                    ) : (
                        <p className="mt-2 text-sm text-[#63759b]">No consult history yet.</p>
                    )}
                </div>
            </section>
        </section>
    );
}

function CallPrepScreen({ onBack }: { onBack: () => void }) {
    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#0f66e8]" />
                <div className="h-1.5 rounded-full bg-[#0f66e8]" />
                <div className="h-1.5 rounded-full bg-[#d4dff3]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#5f739b]">
                <ArrowLeft size={16} />
                Back
            </button>

            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#14264a]">Ready to start?</h1>
                <p className="mt-2 text-base text-[#5f739b]">A quick chat with AI to help your doctor prepare</p>
            </header>

            <article className={sectionCardClassName('overflow-hidden')}>
                {[
                    { icon: Phone, text: '2-3 minute voice call' },
                    { icon: Clock3, text: 'Confirm your certificate dates' },
                    { icon: MessageCircle, text: 'Describe your symptoms' },
                    { icon: CheckCircle2, text: 'Summary sent to your doctor' },
                ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.text} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#e1e9f7]' : ''}`}>
                            <Icon size={18} className="text-[#0f66e8]" />
                            <p className="text-sm text-[#455c88]">{item.text}</p>
                        </div>
                    );
                })}
            </article>

            <article className="overflow-hidden rounded-3xl border border-[#f2c2c2] bg-[#fff5f5]">
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffdede] text-[#dc3f3f]">
                        <MicOff size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[#ba2a2a]">Tap to try again</h3>
                        <p className="text-xs text-[#9e3b3b]">Microphone blocked</p>
                    </div>
                </div>
                <div className="border-t border-[#f3d1d1] px-4 py-3">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-[#be3333]">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        Allow access in your browser settings to continue.
                    </p>
                </div>
            </article>

            <button
                type="button"
                disabled
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d6e2f7] bg-[#eef3fc] text-sm font-semibold text-[#8da1c4]"
            >
                <Phone size={16} />
                Start call
            </button>
        </section>
    );
}

function QueuedWaitingScreen({
    request,
    onBack,
    onSendMessage,
}: {
    request: PortalRequest | null;
    onBack: () => void;
    onSendMessage: () => void;
}) {
    const rows = [
        { label: 'Type', value: 'Medical Certificate', icon: Tag },
        { label: 'Leave type', value: request?.purpose || '—', icon: FileText },
        { label: 'Main symptom', value: request?.symptom || '—', icon: FileText },
        { label: 'Certificate period', value: request?.startDate ? formatDate(request.startDate) : '—', icon: CalendarDays },
    ];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#0f66e8]" />
                <div className="h-1.5 rounded-full bg-[#0f66e8]" />
                <div className="h-1.5 rounded-full bg-[#0f66e8]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#5f739b]">
                <ArrowLeft size={16} />
                Back
            </button>

            <article className="rounded-3xl border border-[#b7cdf4] bg-[#eaf2ff] px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d9e8ff] text-[#0f66e8]">
                        <Heart size={20} className="fill-current stroke-current" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold text-[#1b3f7a]">Queued</h1>
                        <p className="text-sm text-[#2b58a2]">A doctor will be assigned shortly</p>
                    </div>
                </div>
            </article>

            <article className={sectionCardClassName('overflow-hidden')}>
                {rows.map((row, index) => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#e1e9f7]' : ''}`}>
                            <Icon size={16} className="text-[#8ca0c6]" />
                            <span className="text-sm text-[#6d7f9f]">{row.label}</span>
                            <span className="ml-auto text-sm font-semibold text-[#1f355f]">{row.value}</span>
                        </div>
                    );
                })}
            </article>

            <button
                type="button"
                onClick={onSendMessage}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f66e8] text-sm font-semibold text-white"
            >
                <MessageCircle size={16} />
                Message Doctor
            </button>
        </section>
    );
}

export default function PatientPortal() {
    const [mainTab, setMainTab] = useState<MainTab>('home');
    const [portalScreen, setPortalScreen] = useState<PortalScreen>('main');
    const [lastMainTab, setLastMainTab] = useState<MainTab>('home');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [patient, setPatient] = useState<PatientProfile>({
        fullName: 'John Von',
        email: window.localStorage.getItem('onya_patient_email') || 'john@gmail.com',
    });
    const [requests, setRequests] = useState<PortalRequest[]>([]);
    const [activeQueuedRequest, setActiveQueuedRequest] = useState<PortalRequest | null>(null);
    const [recordTab, setRecordTab] = useState<RecordTab>('medical-history');
    const [portalData, setPortalData] = useState<PortalProfileData>(createEmptyPortalData);
    const [portalDataReady, setPortalDataReady] = useState(false);

    const [token, setToken] = useState(() => window.localStorage.getItem('onya_patient_token') || '');
    const profileStorageKey = useMemo(() => {
        const emailPart = (patient.email || 'guest').trim().toLowerCase() || 'guest';
        return `onya_patient_profile:${emailPart}`;
    }, [patient.email]);

    useEffect(() => {
        const saved = window.localStorage.getItem(profileStorageKey);
        setPortalData(readPortalProfile(saved));
        setPortalDataReady(true);
    }, [profileStorageKey]);

    useEffect(() => {
        if (!portalDataReady) return;
        window.localStorage.setItem(profileStorageKey, JSON.stringify(portalData));
    }, [portalDataReady, portalData, profileStorageKey]);

    useEffect(() => {
        let disposed = false;

        const bootstrapCheckoutTokenIfPresent = async () => {
            const url = new URL(window.location.href);
            const checkout = url.searchParams.get('checkout');
            const sessionId =
                url.searchParams.get('session_id') ||
                window.localStorage.getItem('onya_last_checkout_session_id');
            if (checkout !== 'success' || !sessionId) {
                return;
            }

            try {
                const { response, payload } = await fetchApiJson(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                });
                if (response.ok && payload?.patientToken) {
                    const nextToken = String(payload.patientToken);
                    window.localStorage.setItem('onya_patient_token', nextToken);
                    setToken(nextToken);
                }
                if (payload?.patientEmail) {
                    window.localStorage.setItem('onya_patient_email', String(payload.patientEmail));
                }
            } catch {
                // Keep polling for status updates even if confirmation fails once.
            } finally {
                window.localStorage.removeItem('onya_last_checkout_session_id');
                url.searchParams.delete('checkout');
                url.searchParams.delete('session_id');
                const nextSearch = url.searchParams.toString();
                const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`;
                window.history.replaceState({}, '', nextUrl);
            }
        };

        const fetchPortalData = async (silent = false) => {
            if (!silent) {
                setLoading(true);
                setLoadError('');
                await bootstrapCheckoutTokenIfPresent();
            }

            const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';
            if (!activeToken) {
                window.location.href = '/patient-login';
                return;
            }
            if (activeToken !== token) {
                setToken(activeToken);
            }

            try {
                const headers = {
                    Authorization: `Bearer ${activeToken}`,
                };
                const [meResult, requestsResult] = await Promise.all([
                    fetchApiJson('/api/patient/me', { headers }),
                    fetchApiJson('/api/patient/requests', { headers }),
                ]);
                const meRes = meResult.response;
                const requestsRes = requestsResult.response;

                if (meRes.status === 401 || requestsRes.status === 401) {
                    window.localStorage.removeItem('onya_patient_token');
                    setToken('');
                    window.location.href = '/patient-login';
                    return;
                }

                const mePayload = meResult.payload;
                const requestsPayload = requestsResult.payload;

                if (!meRes.ok) {
                    throw new Error(mePayload.error || 'Unable to load patient account');
                }
                if (!requestsRes.ok) {
                    throw new Error(requestsPayload.error || 'Unable to load patient requests');
                }

                if (disposed) return;

                const patientProfile: PatientProfile = {
                    fullName: mePayload?.patient?.fullName || 'Patient',
                    email: mePayload?.patient?.email || window.localStorage.getItem('onya_patient_email') || '',
                    dob: mePayload?.patient?.dob || '',
                    phone: mePayload?.patient?.phone || '',
                };
                setPatient(patientProfile);
                window.localStorage.setItem('onya_patient_email', patientProfile.email);

                const items: PortalRequest[] = Array.isArray(requestsPayload?.requests) ? requestsPayload.requests : [];
                setRequests(items);
                const firstQueued = items.find((item) => isQueuedStatus(item.status)) || null;
                setActiveQueuedRequest(firstQueued);
            } catch (errorObject) {
                if (!disposed && !silent) {
                    setLoadError(errorObject instanceof Error ? errorObject.message : 'Unable to load patient account');
                }
            } finally {
                if (!disposed && !silent) {
                    setLoading(false);
                }
            }
        };

        fetchPortalData(false);
        const pollTimer = window.setInterval(() => {
            fetchPortalData(true);
        }, 10000);

        return () => {
            disposed = true;
            window.clearInterval(pollTimer);
        };
    }, [token]);

    const firstNameValue = useMemo(() => firstName(patient.fullName || ''), [patient.fullName]);
    const latestRequest = useMemo(() => (requests.length > 0 ? requests[0] : null), [requests]);
    const queuedRequest = useMemo(
        () => activeQueuedRequest || requests.find((item) => isQueuedStatus(item.status)) || null,
        [activeQueuedRequest, requests]
    );

    const openCallScreen = () => {
        setLastMainTab(mainTab);
        setPortalScreen('call-prep');
    };

    const openQueuedScreen = () => {
        setLastMainTab(mainTab);
        setActiveQueuedRequest(queuedRequest);
        setPortalScreen('queued');
    };

    const closeOverlayScreen = () => {
        setPortalScreen('main');
        setMainTab(lastMainTab);
    };

    const setTab = (next: MainTab) => {
        setMainTab(next);
        setPortalScreen('main');
    };

    const addRecordEntry = (tab: RecordTab, title: string, details: string) => {
        const entry: TextEntry = {
            id: createId(),
            title,
            details,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => appendRecordEntry(current, tab, entry));
    };

    const addLifestyleNote = (title: string, details: string) => {
        const entry: TextEntry = {
            id: createId(),
            title,
            details,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => ({
            ...current,
            lifestyleNotes: [entry, ...current.lifestyleNotes],
        }));
    };

    const addTestResult = (draft: TestResultDraft) => {
        const entry: TestResultEntry = {
            id: createId(),
            name: draft.name,
            summary: draft.summary,
            testDate: draft.testDate,
            fileName: draft.fileName,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => ({
            ...current,
            testResults: [entry, ...current.testResults],
        }));
    };

    const sendMessageToDoctor = async () => {
        if (!queuedRequest || !token) return;
        const message = window.prompt('Message for the doctor');
        if (!message || !message.trim()) return;

        try {
            const { response, payload } = await fetchApiJson(
                `/api/patient/requests/${encodeURIComponent(queuedRequest.id)}/message`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ message }),
                }
            );
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to send message');
            }
            window.alert('Message sent to doctor.');
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to send message');
        }
    };

    const downloadCertificatePdf = async (request: PortalRequest) => {
        if (!request.certificatePdfUrl || !token) return;

        try {
            const response = await fetch(`${getApiBase()}${request.certificatePdfUrl}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                let message = 'Unable to download certificate';
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const payload = await response.json();
                    message = payload?.error || message;
                } else {
                    const text = await response.text();
                    if (text) {
                        message = text.slice(0, 180);
                    }
                }
                throw new Error(message);
            }

            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `medical-certificate-${request.id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(objectUrl);
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to download certificate');
        }
    };

    const renderPortalContent = (mode: LayoutMode) => {
        if (portalScreen === 'call-prep') {
            return <CallPrepScreen onBack={closeOverlayScreen} />;
        }
        if (portalScreen === 'queued') {
            return (
                <QueuedWaitingScreen
                    request={queuedRequest}
                    onBack={closeOverlayScreen}
                    onSendMessage={sendMessageToDoctor}
                />
            );
        }

        if (mainTab === 'home') {
            return (
                <HomeTab
                    mode={mode}
                    firstNameValue={firstNameValue}
                    requests={requests}
                    queuedRequest={queuedRequest}
                    patient={patient}
                    data={portalData}
                    recordTab={recordTab}
                    onRecordTabChange={setRecordTab}
                    onAddRecordEntry={addRecordEntry}
                    onAddLifestyleNote={addLifestyleNote}
                    onAddTestResult={addTestResult}
                    onOpenQueue={openQueuedScreen}
                    onDownloadCertificate={downloadCertificatePdf}
                    onGoToTab={setTab}
                />
            );
        }

        if (mainTab === 'consult') {
            return <ConsultTab onOpenCall={openCallScreen} />;
        }

        return (
            <AccountTab
                patient={patient}
                latestRequest={latestRequest}
                data={portalData}
                onDownloadCertificate={downloadCertificatePdf}
            />
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#eef3ec] px-4 py-8 font-sans text-[#1f1f23]">
                <div className="mx-auto max-w-[900px] rounded-3xl border border-[#dbe2d9] bg-white p-6">
                    <p className="text-sm text-[#5f7063]">Loading your patient account...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-[#eef3ec] px-4 py-8 font-sans text-[#1f1f23]">
                <div className="mx-auto max-w-[900px] rounded-3xl border border-[#dbe2d9] bg-white p-6">
                    <h1 className="text-2xl font-semibold text-[#1a2a21]">Unable to load account</h1>
                    <p className="mt-2 text-[#5f7063]">{loadError}</p>
                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="rounded-xl bg-[#1f5f3f] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Retry
                        </button>
                        <a
                            href="/patient-login"
                            className="rounded-xl border border-[#dbe2d9] bg-white px-4 py-2 text-sm font-semibold text-[#1a2a21]"
                        >
                            Back to login
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="hidden min-h-screen bg-[#eef3ec] text-[#1f1f23] md:flex">
                <DesktopSidebar activeTab={mainTab} onTabChange={setTab} patient={patient} />
                <main className="flex-1">
                    <div className="mx-auto w-full max-w-[1160px] px-8 py-7">
                        {portalScreen === 'main' && (
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d5ddd4] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5d6d60]">
                                <Home size={14} />
                                {MAIN_TABS.find((tab) => tab === mainTab)?.toUpperCase()}
                            </div>
                        )}
                        {renderPortalContent('desktop')}
                    </div>
                </main>
            </div>

            <div className={`min-h-screen bg-[#eef3ec] text-[#1f1f23] md:hidden ${portalScreen === 'main' ? 'pb-28' : 'pb-6'}`}>
                <MobileTopBar activeTab={mainTab} />
                <main className="px-4 py-5">{renderPortalContent('mobile')}</main>
                {portalScreen === 'main' && queuedRequest && <QueueBanner onTap={openQueuedScreen} />}
                {portalScreen === 'main' && <MobileBottomNav activeTab={mainTab} onTabChange={setTab} />}
            </div>
        </>
    );
}
