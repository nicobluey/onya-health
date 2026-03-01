import { useState } from 'react';
import type { ComponentType, FormEvent } from 'react';
import {
    ChevronRight,
    ClipboardPlus,
    FileText,
    Heart,
    NotebookPen,
    Plus,
    Stethoscope,
    TestTube2,
    Upload,
    UserRound,
} from 'lucide-react';

type MainTab = 'home' | 'consult' | 'account';
type LayoutMode = 'desktop' | 'mobile';
type RecordTab = 'medical-history' | 'allergies' | 'medications';

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

const RECORD_TAB_META: Record<
    RecordTab,
    {
        label: string;
        emptyTitle: string;
        emptyDescription: string;
        ctaLabel: string;
        placeholderTitle: string;
    }
> = {
    'medical-history': {
        label: 'Medical History',
        emptyTitle: 'No medical history yet',
        emptyDescription: 'Add your past or ongoing conditions to help your care team make faster decisions.',
        ctaLabel: 'Add condition',
        placeholderTitle: 'e.g. Asthma',
    },
    allergies: {
        label: 'Allergies',
        emptyTitle: 'No allergies added yet',
        emptyDescription: 'List allergies so your treatment plan avoids unsafe medications.',
        ctaLabel: 'Add allergy',
        placeholderTitle: 'e.g. Penicillin',
    },
    medications: {
        label: 'Medications',
        emptyTitle: 'No medications listed yet',
        emptyDescription: 'Track ongoing medicines and dosage details in one place.',
        ctaLabel: 'Add medication',
        placeholderTitle: 'e.g. Metformin 500mg',
    },
};

const panelClassName =
    'rounded-3xl border border-[#cbd5e1] bg-white shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)]';

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

function statusTone(status: string) {
    const normalized = String(status || '').toLowerCase();
    if (isQueuedStatus(status)) return 'bg-[#fff4dc] text-[#8d5c0a] border-[#f4d7a5]';
    if (normalized === 'approved' || normalized === 'closed') return 'bg-[#eaf4ff] text-[#2e8cff] border-[#b7dcff]';
    if (normalized === 'denied') return 'bg-[#ffe9e8] text-[#a93736] border-[#f3c5c4]';
    return 'bg-[#f1f8ff] text-[#475569] border-[#cbd5e1]';
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

function getRecordEntries(data: PortalProfileData, tab: RecordTab): TextEntry[] {
    if (tab === 'medical-history') return data.medicalHistory;
    if (tab === 'allergies') return data.allergies;
    return data.medications;
}

function EmptySectionState({
    icon: Icon,
    title,
    description,
    buttonLabel,
    onAdd,
}: {
    icon: ComponentType<{ size?: number; className?: string }>;
    title: string;
    description: string;
    buttonLabel: string;
    onAdd: () => void;
}) {
    return (
        <div className="px-4 py-10 text-center sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] text-[#64748b]">
                <Icon size={22} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-[#020617]">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#475569]">{description}</p>
            <button
                type="button"
                onClick={onAdd}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#2e8cff] transition hover:border-[#58a8ff]"
            >
                <Plus size={16} />
                {buttonLabel}
            </button>
        </div>
    );
}

function HomeHero({
    firstNameValue,
    requestCount,
    onGoToTab,
}: {
    firstNameValue: string;
    requestCount: number;
    onGoToTab: (tab: Exclude<MainTab, 'home'>) => void;
}) {
    return (
        <section className="relative overflow-hidden rounded-[30px] border border-[#cbd5e1] bg-gradient-to-br from-[#165fad] via-[#2e8cff] to-[#58a8ff] p-5 text-white sm:p-7">
            <img
                src="/Blue%20Bubbles.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -left-12 -top-14 h-44 w-44 object-cover opacity-35"
            />
            <img
                src="/Blue%20Cells.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 right-[-2rem] h-52 w-52 object-cover opacity-30"
            />
            <img
                src="/HERO.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 bottom-0 hidden h-[115%] w-auto object-contain opacity-20 lg:block"
            />
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f1f5f9]">
                        Patient Home
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                        Welcome back, {firstNameValue}
                    </h1>
                    <p className="mt-2 max-w-[560px] text-sm text-[#f1f5f9] sm:text-base">
                        Your records, consult activity, and profile details are in one clean, unified workspace.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[340px]">
                    <button
                        type="button"
                        onClick={() => onGoToTab('consult')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#020617] transition hover:bg-[#f8fbff]"
                    >
                        <ClipboardPlus size={16} />
                        Start Consult
                    </button>
                    <button
                        type="button"
                        onClick={() => onGoToTab('account')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/45 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                    >
                        <UserRound size={16} />
                        Manage Account
                    </button>
                    <div className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 sm:col-span-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-[#f1f5f9]">Consults on file</p>
                        <p className="mt-1 text-2xl font-semibold">{requestCount}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}

function QueueStatusCard({
    request,
    onOpenQueue,
}: {
    request: PortalRequest | null;
    onOpenQueue: () => void;
}) {
    if (!request) {
        return (
            <section className={`${panelClassName} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#475569]">Queue Status</p>
                <h2 className="mt-2 text-lg font-semibold text-[#020617]">No active queue</h2>
                <p className="mt-1 text-sm text-[#475569]">Start a consult and it will appear here when a doctor is reviewing it.</p>
            </section>
        );
    }

    return (
        <section className="overflow-hidden rounded-3xl border border-[#d8c79f] bg-[#fff7e8] p-5 shadow-[0_18px_36px_-28px_rgba(86,67,28,0.45)]">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f6e5bf] text-[#8d5c0a]">
                    <Heart size={19} className="fill-current stroke-current" />
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.11em] text-[#8d6720]">Queue Status</p>
                    <h2 className="mt-1 text-lg font-semibold text-[#5d420f]">You are in the doctor queue</h2>
                    <p className="mt-1 text-sm text-[#7f5b1a]">{statusLabel(request.status)}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={onOpenQueue}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#7e5920] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#684715]"
            >
                View Queue
                <ChevronRight size={16} />
            </button>
        </section>
    );
}

function PreviousConsultQueue({
    requests,
    onDownloadCertificate,
}: {
    requests: PortalRequest[];
    onDownloadCertificate: (request: PortalRequest) => void;
}) {
    const history = requests.slice(0, 10);

    return (
        <section className={`${panelClassName} p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-[#020617]">Previous Consults</h2>
                    <p className="mt-1 text-sm text-[#475569]">Stacked chronologically for quick review and downloads.</p>
                </div>
                <div className="hidden rounded-full border border-[#cbd5e1] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#475569] sm:block">
                    {history.length} records
                </div>
            </div>

            {history.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] p-6 text-sm text-[#475569]">
                    No consult history yet.
                </div>
            ) : (
                <ul className="mt-5 max-h-[440px] space-y-3 overflow-y-auto pr-1">
                    {history.map((request, index) => {
                        const queued = isQueuedStatus(request.status);

                        return (
                            <li key={request.id} className="relative pl-7">
                                {index < history.length - 1 && (
                                    <span className="absolute left-[0.62rem] top-7 h-[calc(100%-0.15rem)] w-px bg-[#cbd5e1]" aria-hidden="true" />
                                )}
                                <span
                                    className={`absolute left-0 top-2.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                                        queued ? 'bg-[#d19a33]' : 'bg-[#2e8cff]'
                                    }`}
                                    aria-hidden="true"
                                />

                                <article className="rounded-2xl border border-[#cbd5e1] bg-[#ffffff] p-4 transition hover:border-[#b7dcff]">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(request.status)}`}>
                                            {statusLabel(request.status)}
                                        </span>
                                        <span className="text-xs font-medium text-[#475569]">{formatDate(request.createdAt)}</span>
                                    </div>

                                    <h3 className="mt-3 text-base font-semibold text-[#020617]">{consultTitle(request.serviceType)}</h3>
                                    <p className="mt-1 text-sm text-[#475569]">
                                        {request.decision?.by || (queued ? 'Awaiting doctor assignment' : 'Completed consult')}
                                    </p>

                                    {request.certificatePdfUrl && (
                                        <button
                                            type="button"
                                            onClick={() => onDownloadCertificate(request)}
                                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-xs font-semibold text-[#2e8cff] transition hover:border-[#58a8ff]"
                                        >
                                            <FileText size={14} />
                                            Download certificate PDF
                                        </button>
                                    )}
                                </article>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

function AccountSnapshot({ patient }: { patient: PatientProfile }) {
    const rows = [
        { label: 'Full name', value: patient.fullName || 'Patient' },
        { label: 'Email', value: patient.email || 'Not provided' },
        { label: 'Date of birth', value: formatReadableDate(patient.dob) },
        { label: 'Phone', value: patient.phone || 'Not provided' },
    ];

    return (
        <section className={`${panelClassName} overflow-hidden`}>
            <div className="border-b border-[#dbeeff] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#020617]">Account Snapshot</h2>
            </div>
            <div className="space-y-1 p-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-[#eaf4ff] bg-[#f8fbff] px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#64748b]">{row.label}</p>
                        <p className="mt-1 text-sm font-medium text-[#020617]">{row.value}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ProfilePulse({ patient, data }: { patient: PatientProfile; data: PortalProfileData }) {
    const completionSteps = [
        Boolean(patient.fullName?.trim()),
        Boolean(patient.email?.trim()),
        Boolean(patient.dob?.trim()),
        Boolean(patient.phone?.trim()),
        data.medicalHistory.length > 0 || data.allergies.length > 0 || data.medications.length > 0,
    ];
    const completed = completionSteps.filter(Boolean).length;
    const percent = Math.round((completed / completionSteps.length) * 100);
    const metrics = [
        { label: 'History entries', value: data.medicalHistory.length + data.allergies.length + data.medications.length },
        { label: 'Lifestyle notes', value: data.lifestyleNotes.length },
        { label: 'Test uploads', value: data.testResults.length },
    ];

    return (
        <section className={`${panelClassName} p-5`}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#475569]">Profile Progress</p>
            <h2 className="mt-2 text-lg font-semibold text-[#020617]">{percent}% complete</h2>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eaf4ff]">
                <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-4 space-y-2">
                {metrics.map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between rounded-xl border border-[#eaf4ff] bg-[#ffffff] px-3 py-2">
                        <span className="text-xs font-medium text-[#475569]">{metric.label}</span>
                        <span className="text-sm font-semibold text-[#2e8cff]">{metric.value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function MedicalRecordsSection({
    data,
    recordTab,
    onRecordTabChange,
    onAddEntry,
}: {
    data: PortalProfileData;
    recordTab: RecordTab;
    onRecordTabChange: (tab: RecordTab) => void;
    onAddEntry: (tab: RecordTab, title: string, details: string) => void;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [details, setDetails] = useState('');
    const activeEntries = getRecordEntries(data, recordTab);
    const tabMeta = RECORD_TAB_META[recordTab];

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;

        onAddEntry(recordTab, title.trim(), details.trim());
        setTitle('');
        setDetails('');
        setIsAdding(false);
    };

    return (
        <section className={`${panelClassName} overflow-hidden`}>
            <div className="flex items-center gap-2 overflow-x-auto border-b border-[#dbeeff] px-3 py-3">
                {(Object.keys(RECORD_TAB_META) as RecordTab[]).map((tab) => {
                    const active = tab === recordTab;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => onRecordTabChange(tab)}
                            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                                active
                                    ? 'border border-[#b7dcff] bg-[#0f172a] text-white'
                                    : 'text-[#475569] hover:bg-[#f1f8ff]'
                            }`}
                        >
                            {RECORD_TAB_META[tab].label}
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#cbd5e1] text-[#2e8cff]"
                    aria-label="Add health item"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder={tabMeta.placeholderTitle}
                        />
                        <textarea
                            value={details}
                            onChange={(event) => setDetails(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder="Optional details for your care team"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-[#2e8cff] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                )}

                {activeEntries.length === 0 ? (
                    <EmptySectionState
                        icon={Stethoscope}
                        title={tabMeta.emptyTitle}
                        description={tabMeta.emptyDescription}
                        buttonLabel={tabMeta.ctaLabel}
                        onAdd={() => setIsAdding(true)}
                    />
                ) : (
                    <ul className="space-y-2">
                        {activeEntries.map((entry) => (
                            <li key={entry.id} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-4 py-3">
                                <p className="text-sm font-semibold text-[#020617]">{entry.title}</p>
                                {entry.details && <p className="mt-1 text-sm text-[#475569]">{entry.details}</p>}
                                <p className="mt-2 text-xs text-[#64748b]">Added {formatDate(entry.createdAt)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function LifestyleNotesSection({
    entries,
    onAddEntry,
}: {
    entries: TextEntry[];
    onAddEntry: (title: string, details: string) => void;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [details, setDetails] = useState('');

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;

        onAddEntry(title.trim(), details.trim());
        setTitle('');
        setDetails('');
        setIsAdding(false);
    };

    return (
        <section className={`${panelClassName} overflow-hidden`}>
            <div className="flex items-center border-b border-[#dbeeff] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#020617]">Lifestyle Notes</h2>
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#cbd5e1] text-[#2e8cff]"
                    aria-label="Add lifestyle note"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder="e.g. Sleep routine"
                        />
                        <textarea
                            value={details}
                            onChange={(event) => setDetails(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder="Share habits, sleep, activity, nutrition, or triggers"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-[#2e8cff] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                )}

                {entries.length === 0 ? (
                    <EmptySectionState
                        icon={NotebookPen}
                        title="No lifestyle notes yet"
                        description="Capture sleep, nutrition, stress, and daily habits to personalize your care plan."
                        buttonLabel="Add lifestyle note"
                        onAdd={() => setIsAdding(true)}
                    />
                ) : (
                    <ul className="space-y-2">
                        {entries.map((entry) => (
                            <li key={entry.id} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-4 py-3">
                                <p className="text-sm font-semibold text-[#020617]">{entry.title}</p>
                                {entry.details && <p className="mt-1 text-sm text-[#475569]">{entry.details}</p>}
                                <p className="mt-2 text-xs text-[#64748b]">Added {formatDate(entry.createdAt)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function TestResultsSection({
    entries,
    onAddResult,
}: {
    entries: TestResultEntry[];
    onAddResult: (draft: TestResultDraft) => void;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [summary, setSummary] = useState('');
    const [testDate, setTestDate] = useState('');
    const [fileName, setFileName] = useState('');

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;

        onAddResult({
            name: name.trim(),
            summary: summary.trim(),
            testDate: testDate || new Date().toISOString(),
            fileName: fileName.trim(),
        });

        setName('');
        setSummary('');
        setTestDate('');
        setFileName('');
        setIsAdding(false);
    };

    return (
        <section className={`${panelClassName} overflow-hidden`}>
            <div className="flex items-center border-b border-[#dbeeff] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#020617]">Test Results</h2>
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-semibold text-[#2e8cff]"
                >
                    <Upload size={14} />
                    Upload Test
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder="e.g. Full Blood Count"
                        />
                        <input
                            type="date"
                            value={testDate}
                            onChange={(event) => setTestDate(event.target.value)}
                            className="h-10 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm outline-none focus:border-[#58a8ff]"
                        />
                        <textarea
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm outline-none focus:border-[#58a8ff]"
                            placeholder="Add a short summary of this result"
                        />
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#475569]">Attachment</label>
                            <input
                                type="file"
                                onChange={(event) => setFileName(event.target.files?.[0]?.name || '')}
                                className="block w-full text-xs text-[#475569] file:mr-3 file:rounded-lg file:border-0 file:bg-[#eaf4ff] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#2e8cff]"
                            />
                            {fileName && <p className="text-xs text-[#64748b]">Selected: {fileName}</p>}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-[#2e8cff] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                                Save result
                            </button>
                        </div>
                    </form>
                )}

                {entries.length === 0 ? (
                    <EmptySectionState
                        icon={TestTube2}
                        title="No test results yet"
                        description="Upload your radiology or pathology reports and keep your records organized."
                        buttonLabel="Upload result"
                        onAdd={() => setIsAdding(true)}
                    />
                ) : (
                    <ul className="space-y-2">
                        {entries.map((entry) => (
                            <li key={entry.id} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-4 py-3">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[#020617]">{entry.name}</p>
                                        {entry.summary && <p className="mt-1 text-sm text-[#475569]">{entry.summary}</p>}
                                    </div>
                                    <span className="ml-auto shrink-0 text-xs text-[#64748b]">{formatDate(entry.testDate)}</span>
                                </div>
                                {entry.fileName && <p className="mt-2 text-xs text-[#64748b]">Attachment: {entry.fileName}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function SideRail({
    queuedRequest,
    patient,
    data,
    onOpenQueue,
}: {
    queuedRequest: PortalRequest | null;
    patient: PatientProfile;
    data: PortalProfileData;
    onOpenQueue: () => void;
}) {
    return (
        <div className="space-y-5">
            <QueueStatusCard request={queuedRequest} onOpenQueue={onOpenQueue} />
            <AccountSnapshot patient={patient} />
            <ProfilePulse patient={patient} data={data} />
        </div>
    );
}

export default function HomeTab({
    mode,
    firstNameValue,
    requests,
    queuedRequest,
    patient,
    data,
    recordTab,
    onRecordTabChange,
    onAddRecordEntry,
    onAddLifestyleNote,
    onAddTestResult,
    onOpenQueue,
    onDownloadCertificate,
    onGoToTab,
}: {
    mode: LayoutMode;
    firstNameValue: string;
    requests: PortalRequest[];
    queuedRequest: PortalRequest | null;
    patient: PatientProfile;
    data: PortalProfileData;
    recordTab: RecordTab;
    onRecordTabChange: (tab: RecordTab) => void;
    onAddRecordEntry: (tab: RecordTab, title: string, details: string) => void;
    onAddLifestyleNote: (title: string, details: string) => void;
    onAddTestResult: (draft: TestResultDraft) => void;
    onOpenQueue: () => void;
    onDownloadCertificate: (request: PortalRequest) => void;
    onGoToTab: (tab: Exclude<MainTab, 'home'>) => void;
}) {
    const desktop = mode === 'desktop';

    if (desktop) {
        return (
            <section className="space-y-6">
                <HomeHero firstNameValue={firstNameValue} requestCount={requests.length} onGoToTab={onGoToTab} />

                <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                    <div className="space-y-6">
                        <PreviousConsultQueue requests={requests} onDownloadCertificate={onDownloadCertificate} />
                        <MedicalRecordsSection
                            data={data}
                            recordTab={recordTab}
                            onRecordTabChange={onRecordTabChange}
                            onAddEntry={onAddRecordEntry}
                        />
                        <LifestyleNotesSection entries={data.lifestyleNotes} onAddEntry={onAddLifestyleNote} />
                        <TestResultsSection entries={data.testResults} onAddResult={onAddTestResult} />
                    </div>

                    <SideRail queuedRequest={queuedRequest} patient={patient} data={data} onOpenQueue={onOpenQueue} />
                </div>
            </section>
        );
    }

    return (
        <section className="space-y-5">
            <HomeHero firstNameValue={firstNameValue} requestCount={requests.length} onGoToTab={onGoToTab} />
            <QueueStatusCard request={queuedRequest} onOpenQueue={onOpenQueue} />
            <PreviousConsultQueue requests={requests} onDownloadCertificate={onDownloadCertificate} />
            <MedicalRecordsSection
                data={data}
                recordTab={recordTab}
                onRecordTabChange={onRecordTabChange}
                onAddEntry={onAddRecordEntry}
            />
            <LifestyleNotesSection entries={data.lifestyleNotes} onAddEntry={onAddLifestyleNote} />
            <TestResultsSection entries={data.testResults} onAddResult={onAddTestResult} />
            <AccountSnapshot patient={patient} />
            <ProfilePulse patient={patient} data={data} />
        </section>
    );
}
