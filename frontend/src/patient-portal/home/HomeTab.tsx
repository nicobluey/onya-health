import { type CSSProperties, useState } from 'react';
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
import {
    type LayoutMode,
    type MainTab,
    type PatientProfile,
    type PortalProfileData,
    type PortalRequest,
    type RecordTab,
    type TestResultDraft,
    type TestResultEntry,
    type TextEntry,
    consultTitle,
    formatDate,
    formatReadableDate,
    isQueuedStatus,
    statusLabel,
} from '../model';

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
    'rounded-3xl border border-border bg-white shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)]';

function statusTone(status: string) {
    const normalized = String(status || '').toLowerCase();
    if (isQueuedStatus(status)) return 'bg-sand-75 text-primary border-border';
    if (normalized === 'approved' || normalized === 'closed') return 'bg-sand-75 text-primary border-border';
    if (normalized === 'denied') return 'bg-error/10 text-error border-error/30';
    return 'bg-sand-75 text-text-secondary border-border';
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg text-text-secondary">
                <Icon size={22} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-text-primary">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
            <button
                type="button"
                onClick={onAdd}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-primary transition hover:border-secondary"
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
        <section className="relative overflow-hidden rounded-[30px] border border-border bg-white p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
                <div>
                    <p className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                        Patient Home
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                        Welcome back, {firstNameValue}
                    </h1>
                    <p className="mt-2 max-w-[560px] text-sm text-text-secondary sm:text-base">
                        Your records, consult activity, and profile details are in one clean, unified workspace.
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:max-w-[420px]">
                        <button
                            type="button"
                            onClick={() => onGoToTab('consult')}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            <ClipboardPlus size={16} />
                            Start Consult
                        </button>
                        <button
                            type="button"
                            onClick={() => onGoToTab('account')}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-border"
                        >
                            <UserRound size={16} />
                            Manage Account
                        </button>
                        <div className="rounded-2xl border border-border bg-bg px-4 py-3 sm:col-span-2">
                            <p className="text-xs uppercase tracking-[0.12em] text-text-secondary">Consults on file</p>
                            <p className="mt-1 text-2xl font-semibold text-text-primary">{requestCount}</p>
                        </div>
                    </div>
                </div>

                <div className="relative hidden min-h-[260px] lg:block">
                    <div className="overflow-hidden rounded-[1.8rem] border border-border">
                        <img src="/HERO.png" alt="" aria-hidden="true" className="h-[260px] w-full object-cover" />
                    </div>
                    <div
                        className="science-float-card -left-8 -top-5 h-20 w-20"
                        aria-hidden="true"
                        style={{ '--science-tilt': '-7deg', '--drift-duration': '20s', '--drift-delay': '0.3s' } as CSSProperties}
                    >
                        <img src="/Green%20Cells.png" alt="" className="h-full w-full object-cover" />
                    </div>
                    <div
                        className="science-float-card is-reverse -bottom-4 right-3 h-24 w-24"
                        aria-hidden="true"
                        style={{ '--science-tilt': '8deg', '--drift-duration': '18s', '--drift-delay': '0.8s' } as CSSProperties}
                    >
                        <img src="/Blue%20Cells.png" alt="" className="h-full w-full object-cover" />
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
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Queue Status</p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">No active queue</h2>
                <p className="mt-1 text-sm text-text-secondary">Start a consult and it will appear here when a doctor is reviewing it.</p>
            </section>
        );
    }

    return (
        <section className="overflow-hidden rounded-3xl border border-border bg-white p-5 shadow-[0_18px_36px_-28px_rgba(35,71,47,0.28)]">
            <div className="flex items-start gap-3">
                <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand-75 text-primary">
                    <Heart size={19} className="fill-current stroke-current" />
                    <span className="portal-live-dot absolute -right-0.5 -top-0.5" aria-hidden="true" />
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.11em] text-text-secondary">Queue Status</p>
                    <h2 className="mt-1 text-lg font-semibold text-text-primary">You are in the doctor queue</h2>
                    <p className="mt-1 text-sm text-text-secondary">{statusLabel(request.status)}</p>
                </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-bg p-3">
                <div className="portal-queue-track">
                    {['Triage', 'Assigned', 'Review', 'Issued'].map((label, index) => (
                        <div key={label} className="portal-queue-step">
                            <span className="portal-queue-dot" style={{ animationDelay: `${index * 0.25}s` } as CSSProperties} />
                            <span className="portal-queue-step-label">{label}</span>
                            {index < 3 && <span className="portal-queue-connector" />}
                        </div>
                    ))}
                </div>
            </div>
            <button
                type="button"
                onClick={onOpenQueue}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
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
    const [showOlder, setShowOlder] = useState(false);
    const latest = requests.slice(0, 3);
    const older = requests.slice(3, 12);
    const visibleHistory = showOlder ? [...latest, ...older] : latest;

    return (
        <section className={`${panelClassName} p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-text-primary">Latest Consults</h2>
                    <p className="mt-1 text-sm text-text-secondary">Most recent activity first. Expand if you need older consults.</p>
                </div>
                <div className="hidden rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold text-text-secondary sm:block">
                    {requests.length} records
                </div>
            </div>

            {visibleHistory.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg p-6 text-sm text-text-secondary">
                    No consult history yet.
                </div>
            ) : (
                <ul className="mt-5 space-y-3">
                    {visibleHistory.map((request) => {
                        const queued = isQueuedStatus(request.status);

                        return (
                            <li key={request.id}>
                                <article className="rounded-2xl border border-border bg-surface p-4 transition hover:border-border">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(request.status)}`}>
                                            {statusLabel(request.status)}
                                        </span>
                                        <span className="text-xs font-medium text-text-secondary">{formatDate(request.createdAt)}</span>
                                    </div>

                                    <h3 className="mt-3 text-base font-semibold text-text-primary">{consultTitle(request.serviceType)}</h3>
                                    <p className="mt-1 text-sm text-text-secondary">
                                        {request.decision?.by || (queued ? 'Awaiting doctor assignment' : 'Completed consult')}
                                    </p>

                                    {request.certificatePdfUrl && (
                                        <button
                                            type="button"
                                            onClick={() => onDownloadCertificate(request)}
                                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-secondary"
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

            {older.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowOlder((prev) => !prev)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2 text-sm font-semibold text-primary transition hover:border-border"
                >
                    {showOlder ? 'Hide older consults' : `View older consults (${older.length})`}
                    <ChevronRight size={15} className={`transition ${showOlder ? 'rotate-90' : ''}`} />
                </button>
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
            <div className="border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold text-text-primary">Account Snapshot</h2>
            </div>
            <div className="space-y-1 p-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-sand-100 bg-bg px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-text-secondary">{row.label}</p>
                        <p className="mt-1 text-sm font-medium text-text-primary">{row.value}</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Profile Progress</p>
            <h2 className="mt-2 text-lg font-semibold text-text-primary">{percent}% complete</h2>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-75">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-4 space-y-2">
                {metrics.map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between rounded-xl border border-sand-100 bg-surface px-3 py-2">
                        <span className="text-xs font-medium text-text-secondary">{metric.label}</span>
                        <span className="text-sm font-semibold text-primary">{metric.value}</span>
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
            <div className="border-b border-border px-3 py-3">
                <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(RECORD_TAB_META) as RecordTab[]).map((tab) => {
                        const active = tab === recordTab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => onRecordTabChange(tab)}
                                className={`rounded-xl px-2 py-2 text-center text-[12px] font-semibold leading-tight transition sm:text-sm ${
                                    active
                                        ? 'border border-border bg-bark-900 text-white'
                                        : 'border border-sand-100 text-text-secondary hover:bg-sand-75'
                                }`}
                            >
                                {RECORD_TAB_META[tab].label}
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 py-2 text-sm font-semibold text-primary transition hover:border-border"
                >
                    <Plus size={15} />
                    {tabMeta.ctaLabel}
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-border bg-bg p-3">
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-secondary"
                            placeholder={tabMeta.placeholderTitle}
                        />
                        <textarea
                            value={details}
                            onChange={(event) => setDetails(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-secondary"
                            placeholder="Optional details for your care team"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
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
                            <li key={entry.id} className="rounded-2xl border border-border bg-bg px-4 py-3">
                                <p className="text-sm font-semibold text-text-primary">{entry.title}</p>
                                {entry.details && <p className="mt-1 text-sm text-text-secondary">{entry.details}</p>}
                                <p className="mt-2 text-xs text-text-secondary">Added {formatDate(entry.createdAt)}</p>
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
            <div className="flex items-center border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold text-text-primary">Lifestyle Notes</h2>
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary"
                    aria-label="Add lifestyle note"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-border bg-bg p-3">
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-secondary"
                            placeholder="e.g. Sleep routine"
                        />
                        <textarea
                            value={details}
                            onChange={(event) => setDetails(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-secondary"
                            placeholder="Share habits, sleep, activity, nutrition, or triggers"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
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
                            <li key={entry.id} className="rounded-2xl border border-border bg-bg px-4 py-3">
                                <p className="text-sm font-semibold text-text-primary">{entry.title}</p>
                                {entry.details && <p className="mt-1 text-sm text-text-secondary">{entry.details}</p>}
                                <p className="mt-2 text-xs text-text-secondary">Added {formatDate(entry.createdAt)}</p>
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
            <div className="flex items-center border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold text-text-primary">Test Results</h2>
                <button
                    type="button"
                    onClick={() => setIsAdding((value) => !value)}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary"
                >
                    <Upload size={14} />
                    Upload Test
                </button>
            </div>

            <div className="p-4">
                {isAdding && (
                    <form onSubmit={submit} className="mb-4 space-y-3 rounded-2xl border border-border bg-bg p-3">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-secondary"
                            placeholder="e.g. Full Blood Count"
                        />
                        <input
                            type="date"
                            value={testDate}
                            onChange={(event) => setTestDate(event.target.value)}
                            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-secondary"
                        />
                        <textarea
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-secondary"
                            placeholder="Add a short summary of this result"
                        />
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">Attachment</label>
                            <input
                                type="file"
                                onChange={(event) => setFileName(event.target.files?.[0]?.name || '')}
                                className="block w-full text-xs text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-sand-75 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
                            />
                            {fileName && <p className="text-xs text-text-secondary">Selected: {fileName}</p>}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
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
                            <li key={entry.id} className="rounded-2xl border border-border bg-bg px-4 py-3">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-text-primary">{entry.name}</p>
                                        {entry.summary && <p className="mt-1 text-sm text-text-secondary">{entry.summary}</p>}
                                    </div>
                                    <span className="ml-auto shrink-0 text-xs text-text-secondary">{formatDate(entry.testDate)}</span>
                                </div>
                                {entry.fileName && <p className="mt-2 text-xs text-text-secondary">Attachment: {entry.fileName}</p>}
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




