import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock3,
    FileText,
    Heart,
    Home,
    MessageCircle,
    Mail,
    Phone,
    Lock,
    Stethoscope,
    Tag,
    UserRound,
} from 'lucide-react';
import { fetchApiJson, getApiBase } from '../lib/api';
import HomeTab from '../patient-portal/home/HomeTab';
import {
    type CheckoutSetupContext,
    type ConsultOption,
    type ConsultOptionId,
    type LayoutMode,
    type MainTab,
    type PatientProfile,
    type PortalProfileData,
    type PortalRequest,
    type PortalScreen,
    type RecordTab,
    type TestResultDraft,
    type TestResultEntry,
    type TextEntry,
    CONSULT_OPTIONS,
    MAIN_TABS,
    PORTAL_BACKGROUND_CARDS,
    appendRecordEntry,
    avatarInitials,
    consultTitle,
    createEmptyPortalData,
    createId,
    firstName,
    formatDate,
    formatReadableDate,
    isQueuedStatus,
    readPortalProfile,
    sectionCardClassName,
    statusLabel,
} from '../patient-portal/model';

function PortalBackdropArt() {
    return (
        <>
            {PORTAL_BACKGROUND_CARDS.map((card, index) => (
                <div
                    key={`${card.src}-${index}`}
                    className={`science-float-card pointer-events-none ${card.reverse ? 'is-reverse' : ''} ${card.className}`}
                    aria-hidden="true"
                    style={
                        {
                            '--science-tilt': card.tilt,
                            '--drift-duration': card.duration,
                            '--drift-delay': card.delay,
                        } as CSSProperties
                    }
                >
                    <img src={card.src} alt="" className="h-full w-full object-cover" />
                </div>
            ))}
        </>
    );
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
        <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-[#cbd5e1] bg-[#f8fbff]/95 backdrop-blur">
            <div className="px-5 pt-5">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#475569]">Platform</p>
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
                                        ? 'bg-[#0f172a] text-white'
                                        : 'text-[#334155] hover:bg-[#f1f8ff] hover:text-[#020617]'
                                }`}
                            >
                                <Icon size={16} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="mt-auto border-t border-[#cbd5e1] p-4">
                <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbeeff] text-sm font-semibold text-[#2e8cff]">
                            {avatarInitials(patient.fullName)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#020617]">{patient.fullName || 'Patient'}</p>
                            <p className="truncate text-xs text-[#475569]">{patient.email || 'No email'}</p>
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
        <header className="sticky top-0 z-40 border-b border-[#cbd5e1] bg-[#f8fbff]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-4">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <span className="rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#334155]">
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
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#cbd5e1] bg-[#f8fbff]">
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
                                active ? 'text-[#2e8cff]' : 'text-[#475569]'
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
            className="fixed bottom-16 left-3 right-3 z-40 overflow-hidden rounded-2xl border border-[#b7dcff] bg-white px-4 py-3 text-left shadow-[0_24px_40px_-30px_rgba(15,23,42,0.55)]"
        >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#2e8cff]" aria-hidden="true" />
            <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbeeff] text-[#2e8cff]">
                    <Heart size={18} className="fill-current stroke-current" />
                    <span className="portal-live-dot absolute -right-0.5 -top-0.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#020617]">You&apos;re in the queue</p>
                    <p className="text-xs text-[#475569]">Tap to view live status</p>
                </div>
                <ChevronRight size={18} className="ml-auto text-[#64748b]" />
            </div>
        </button>
    );
}

function ConsultTab({ onSelectOption }: { onSelectOption: (optionId: ConsultOptionId) => void }) {
    return (
        <section className="space-y-5">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Book a consultation</h1>
                <p className="mt-1 text-base text-[#475569]">Choose a service to continue. Live services open instantly, others are previewable.</p>
            </header>

            <div className="grid gap-3 md:grid-cols-2">
                {CONSULT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const live = option.status === 'available';
                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelectOption(option.id)}
                            className={`${sectionCardClassName(
                                'group p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_26px_50px_-36px_rgba(15,23,42,0.46)]'
                            )} ${live ? 'border-[#b7dcff] bg-[#f8fbff]' : ''}`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                        live ? 'bg-[#dbeeff] text-[#2e8cff]' : 'bg-[#f1f5f9] text-[#64748b]'
                                    }`}
                                >
                                    <Icon size={18} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-[#020617]">{option.title}</h2>
                                    <p className="mt-1 text-sm text-[#475569]">{option.subtitle}</p>
                                </div>
                                <span
                                    className={`ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                        live ? 'bg-[#dbeeff] text-[#165fad]' : 'bg-[#e2e8f0] text-[#475569]'
                                    }`}
                                >
                                    {option.badge}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                                    {live ? 'Available now' : 'Preview available'}
                                </p>
                                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#2e8cff] transition group-hover:gap-1.5">
                                    {live ? 'Continue' : 'View details'}
                                    <ChevronRight size={15} />
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function ConsultComingSoonScreen({
    option,
    onBack,
}: {
    option: ConsultOption | null;
    onBack: () => void;
}) {
    return (
        <section className="space-y-5">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back to consult options
            </button>

            <article className="overflow-hidden rounded-3xl border border-[#cbd5e1] bg-white">
                <div className="border-b border-[#dbeeff] bg-[#f8fbff] px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Coming soon</p>
                    <h1 className="mt-1 text-2xl font-semibold text-[#020617]">{option?.title ?? 'Service'}</h1>
                </div>
                <div className="p-5">
                    <p className="text-sm leading-relaxed text-[#475569]">
                        {option?.subtitle ?? 'This service is being prepared.'} We&apos;re currently finalizing workflows and clinician availability.
                    </p>
                    <div className="mt-4 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">What happens next</p>
                        <p className="mt-1 text-sm text-[#475569]">
                            Keep using live services today. This option will automatically appear as available once launched.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onBack}
                        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white"
                    >
                        Got it
                        <ChevronRight size={16} />
                    </button>
                </div>
            </article>
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
            <div className="border-b border-[#dbeeff] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#020617]">Account Info</h2>
            </div>
            <div className="space-y-1 p-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-[#f1f8ff] bg-[#f8fbff] px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#64748b]">{row.label}</p>
                        <p className="mt-1 text-sm font-medium text-[#020617]">{row.value}</p>
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
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Account</h1>
                <p className="mt-1 text-base text-[#475569]">View your personal details and profile activity</p>
            </header>

            <ProfileCard patient={patient} />

            <section className={sectionCardClassName()}>
                <div className="border-b border-[#dbeeff] px-5 py-4">
                    <h2 className="text-lg font-semibold text-[#020617]">Profile Summary</h2>
                </div>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                    {stats.map((item) => (
                        <article key={item.label} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-[#020617]">{item.value}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className={sectionCardClassName()}>
                <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">Latest consult</p>
                    {latestRequest ? (
                        <>
                            <h2 className="mt-2 text-lg font-semibold text-[#020617]">{consultTitle(latestRequest.serviceType)}</h2>
                            <p className="mt-1 text-sm text-[#475569]">{statusLabel(latestRequest.status)}</p>
                            <p className="mt-1 text-xs text-[#64748b]">Updated {formatDate(latestRequest.createdAt)}</p>
                            {latestRequest.certificatePdfUrl && (
                                <button
                                    type="button"
                                    onClick={() => onDownloadCertificate(latestRequest)}
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#2e8cff] px-3 py-2 text-sm font-semibold text-white"
                                >
                                    <FileText size={15} />
                                    Download Medical Certificate
                                </button>
                            )}
                        </>
                    ) : (
                        <p className="mt-2 text-sm text-[#475569]">No consult history yet.</p>
                    )}
                </div>
            </section>
        </section>
    );
}

function CallPrepScreen({
    onBack,
    onStartCall,
}: {
    onBack: () => void;
    onStartCall: () => void;
}) {
    const wavePattern = [16, 26, 19, 31, 18, 34, 22, 27, 17, 30, 21, 29, 16, 24];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#dbeeff]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back
            </button>

            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Ready to start?</h1>
                <p className="mt-2 text-base text-[#475569]">A quick chat with AI to help your doctor prepare</p>
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
                        <div key={item.text} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#dbeeff]' : ''}`}>
                            <Icon size={18} className="text-[#2e8cff]" />
                            <p className="text-sm text-[#475569]">{item.text}</p>
                        </div>
                    );
                })}
            </article>

            <article className="overflow-hidden rounded-3xl border border-[#dbeeff] bg-white p-4">
                <div className="flex items-center gap-2">
                    <Phone size={16} className="text-[#2e8cff]" />
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Live call preview</p>
                </div>
                <div className="audio-wave mt-2 min-h-[86px] rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-2">
                    {wavePattern.map((height, index) => (
                        <span
                            // intentional index key for fixed static visual bars
                            key={index}
                            style={
                                {
                                    '--wave-height': `${height}px`,
                                    '--wave-duration': `${1 + ((index % 4) * 0.1)}s`,
                                    '--wave-delay': `${index * 0.04}s`,
                                } as CSSProperties
                            }
                        />
                    ))}
                </div>
            </article>

            <button
                type="button"
                onClick={onStartCall}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2e8cff] text-sm font-semibold text-white"
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
    const queueSteps = ['Triage', 'Doctor Assigned', 'Review', 'Issue'];
    const rows = [
        { label: 'Type', value: 'Medical Certificate', icon: Tag },
        { label: 'Leave type', value: request?.purpose || '—', icon: FileText },
        { label: 'Main symptom', value: request?.symptom || '—', icon: FileText },
        { label: 'Certificate period', value: request?.startDate ? formatDate(request.startDate) : '—', icon: CalendarDays },
    ];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back
            </button>

            <article className="overflow-hidden rounded-3xl border border-[#b7dcff] bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dbeeff] text-[#2e8cff]">
                        <Heart size={20} className="fill-current stroke-current" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold text-[#020617]">Queued</h1>
                        <p className="text-sm text-[#475569]">A doctor will be assigned shortly</p>
                    </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                    <div className="portal-queue-track">
                        {queueSteps.map((step, index) => (
                            <div key={step} className="portal-queue-step">
                                <span
                                    className="portal-queue-dot"
                                    style={{ animationDelay: `${index * 0.28}s` } as CSSProperties}
                                    aria-hidden="true"
                                />
                                <span className="portal-queue-step-label">{step}</span>
                                {index < queueSteps.length - 1 && <span className="portal-queue-connector" aria-hidden="true" />}
                            </div>
                        ))}
                    </div>
                </div>
            </article>

            <article className={sectionCardClassName('overflow-hidden')}>
                {rows.map((row, index) => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#dbeeff]' : ''}`}>
                            <Icon size={16} className="text-[#94a3b8]" />
                            <span className="text-sm text-[#475569]">{row.label}</span>
                            <span className="ml-auto text-sm font-semibold text-[#020617]">{row.value}</span>
                        </div>
                    );
                })}
            </article>

            <button
                type="button"
                onClick={onSendMessage}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2e8cff] text-sm font-semibold text-white"
            >
                <MessageCircle size={16} />
                Message Doctor
            </button>
        </section>
    );
}

function CheckoutAccountSetupScreen({
    setup,
    onComplete,
}: {
    setup: CheckoutSetupContext;
    onComplete: (payload: { token: string; patientEmail: string }) => void;
}) {
    const [email, setEmail] = useState(setup.consultEmail || '');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleUseSameEmail = () => {
        setEmail(setup.consultEmail);
        setConfirmEmail(setup.consultEmail);
        setErrorMessage('');
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setErrorMessage('');

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedConfirm = confirmEmail.trim().toLowerCase();
        const normalizedConsult = setup.consultEmail.trim().toLowerCase();

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            setErrorMessage('Enter a valid email address.');
            return;
        }
        if (normalizedConsult && normalizedEmail !== normalizedConsult) {
            setErrorMessage(`Use the same consult email: ${setup.consultEmail}`);
            return;
        }
        if (normalizedEmail !== normalizedConfirm) {
            setErrorMessage('Email confirmation does not match.');
            return;
        }
        if (!password || password.length < 8) {
            setErrorMessage('Password must be at least 8 characters.');
            return;
        }
        if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
            setErrorMessage('Password must include at least one letter and one number.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage('Password confirmation does not match.');
            return;
        }

        try {
            setSubmitting(true);
            const { response, payload } = await fetchApiJson('/api/patient/checkout/account/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: setup.sessionId,
                    email: normalizedEmail,
                    confirmEmail: normalizedConfirm,
                    password,
                }),
            });

            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to complete account setup right now.');
            }

            const token = String(payload?.token || '').trim();
            const patientEmail = String(payload?.patientEmail || normalizedEmail).trim();
            if (!token) {
                throw new Error('Account setup completed but no login token was returned.');
            }

            onComplete({ token, patientEmail });
        } catch (errorObject) {
            setErrorMessage(errorObject instanceof Error ? errorObject.message : 'Unable to complete account setup right now.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
            <PortalBackdropArt />
            <div className="relative z-10 mx-auto w-full max-w-[760px]">
                <section className="overflow-hidden rounded-3xl border border-[#cbd5e1] bg-white shadow-[0_30px_55px_-36px_rgba(15,23,42,0.46)]">
                    <div className="border-b border-[#dbeeff] bg-[#f8fbff] px-5 py-4 md:px-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Payment confirmed</p>
                        <h1 className="mt-1 text-2xl font-semibold text-[#020617] md:text-[2rem]">Create your portal password</h1>
                        <p className="mt-2 text-sm text-[#475569]">
                            Confirm your consult email and set a password to access your patient portal.
                        </p>
                    </div>

                    <form className="space-y-4 px-5 py-5 md:px-6" onSubmit={handleSubmit}>
                        <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">Consult email on file</p>
                            <p className="mt-1 text-sm font-semibold text-[#020617]">{setup.consultEmail}</p>
                        </div>

                        {setup.consultEmail && (
                            <button
                                type="button"
                                onClick={handleUseSameEmail}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#b7dcff] bg-[#eff6ff] px-4 text-sm font-semibold text-[#165fad]"
                            >
                                Use the same email as {setup.consultEmail}
                            </button>
                        )}

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Email</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Mail size={16} className="text-[#64748b]" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Confirm email</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Mail size={16} className="text-[#64748b]" />
                                <input
                                    type="email"
                                    value={confirmEmail}
                                    onChange={(event) => setConfirmEmail(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="Retype your email"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Create password</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Lock size={16} className="text-[#64748b]" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="At least 8 chars with a letter and number"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Confirm password</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Lock size={16} className="text-[#64748b]" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="Retype your password"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </label>

                        {errorMessage && <p className="text-sm font-semibold text-red-600">{errorMessage}</p>}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#2e8cff] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {submitting ? 'Creating account...' : 'Continue to patient portal'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}

export default function PatientPortalPage() {
    const [mainTab, setMainTab] = useState<MainTab>('home');
    const [portalScreen, setPortalScreen] = useState<PortalScreen>('main');
    const [lastMainTab, setLastMainTab] = useState<MainTab>('home');
    const [selectedConsultOptionId, setSelectedConsultOptionId] = useState<ConsultOptionId | null>(null);
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
    const [checkoutSetupContext, setCheckoutSetupContext] = useState<CheckoutSetupContext | null>(null);

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

        const bootstrapCheckoutIfPresent = async () => {
            const url = new URL(window.location.href);
            const checkout = url.searchParams.get('checkout');
            const sessionId =
                url.searchParams.get('session_id') ||
                window.localStorage.getItem('onya_last_checkout_session_id');
            if (checkout !== 'success' || !sessionId) {
                return null;
            }

            window.localStorage.removeItem('onya_patient_token');
            setToken('');

            try {
                const { response, payload } = await fetchApiJson(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                });
                if (response.ok) {
                    const consultEmail = String(payload?.patientEmail || '').trim().toLowerCase();
                    if (consultEmail) {
                        window.localStorage.setItem('onya_patient_email', consultEmail);
                    }
                    return {
                        sessionId,
                        consultEmail: consultEmail || String(window.localStorage.getItem('onya_patient_email') || '').trim().toLowerCase(),
                    };
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
            return null;
        };

        const fetchPortalData = async (silent = false) => {
            if (checkoutSetupContext) {
                if (!silent) {
                    setLoading(false);
                    setLoadError('');
                }
                return;
            }

            if (!silent) {
                setLoading(true);
                setLoadError('');
                const setupContext = await bootstrapCheckoutIfPresent();
                if (setupContext) {
                    if (!disposed) {
                        setCheckoutSetupContext(setupContext);
                        setLoading(false);
                    }
                    return;
                }
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
    }, [token, checkoutSetupContext]);

    const firstNameValue = useMemo(() => firstName(patient.fullName || ''), [patient.fullName]);
    const latestRequest = useMemo(() => (requests.length > 0 ? requests[0] : null), [requests]);
    const selectedConsultOption = useMemo(
        () => CONSULT_OPTIONS.find((item) => item.id === selectedConsultOptionId) || null,
        [selectedConsultOptionId]
    );
    const queuedRequest = useMemo(
        () => activeQueuedRequest || requests.find((item) => isQueuedStatus(item.status)) || null,
        [activeQueuedRequest, requests]
    );

    const openQueuedScreen = () => {
        setLastMainTab(mainTab);
        setActiveQueuedRequest(queuedRequest);
        setPortalScreen('queued');
    };

    const closeOverlayScreen = () => {
        setPortalScreen('main');
        setMainTab(lastMainTab);
        setSelectedConsultOptionId(null);
    };

    const setTab = (next: MainTab) => {
        setMainTab(next);
        setPortalScreen('main');
        setSelectedConsultOptionId(null);
    };

    const openConsultOption = (optionId: ConsultOptionId) => {
        const option = CONSULT_OPTIONS.find((item) => item.id === optionId);
        if (!option) return;

        setLastMainTab('consult');
        if (option.status === 'available') {
            setPortalScreen('call-prep');
            setSelectedConsultOptionId(null);
            return;
        }

        setSelectedConsultOptionId(optionId);
        setPortalScreen('consult-coming-soon');
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

    const startCallAndQueue = () => {
        const syntheticRequest: PortalRequest =
            queuedRequest ||
            latestRequest || {
                id: `local-${createId()}`,
                createdAt: new Date().toISOString(),
                status: 'submitted',
                serviceType: 'doctor',
                purpose: 'Personal leave',
                symptom: 'General symptoms',
                description: '',
                startDate: new Date().toISOString(),
                durationDays: 1,
            };

        setActiveQueuedRequest(syntheticRequest);
        setPortalScreen('queued');
    };

    const completeCheckoutSetup = ({ token: nextToken, patientEmail }: { token: string; patientEmail: string }) => {
        window.localStorage.setItem('onya_patient_token', nextToken);
        if (patientEmail) {
            window.localStorage.setItem('onya_patient_email', patientEmail);
        }
        setPatient((current) => ({
            ...current,
            email: patientEmail || current.email,
        }));
        setCheckoutSetupContext(null);
        setLoadError('');
        setLoading(true);
        setToken(nextToken);
    };

    const renderPortalContent = (mode: LayoutMode) => {
        if (portalScreen === 'call-prep') {
            return <CallPrepScreen onBack={closeOverlayScreen} onStartCall={startCallAndQueue} />;
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
        if (portalScreen === 'consult-coming-soon') {
            return <ConsultComingSoonScreen option={selectedConsultOption} onBack={closeOverlayScreen} />;
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
            return <ConsultTab onSelectOption={openConsultOption} />;
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

    if (checkoutSetupContext) {
        return <CheckoutAccountSetupScreen setup={checkoutSetupContext} onComplete={completeCheckoutSetup} />;
    }

    if (loading) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
                <PortalBackdropArt />
                <div className="relative z-10 mx-auto max-w-[900px] rounded-3xl border border-[#cbd5e1] bg-white p-6">
                    <p className="text-sm text-[#475569]">Loading your patient account...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
                <PortalBackdropArt />
                <div className="relative z-10 mx-auto max-w-[900px] rounded-3xl border border-[#cbd5e1] bg-white p-6">
                    <h1 className="text-2xl font-semibold text-[#020617]">Unable to load account</h1>
                    <p className="mt-2 text-[#475569]">{loadError}</p>
                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="rounded-xl bg-[#2e8cff] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Retry
                        </button>
                        <a
                            href="/patient-login"
                            className="rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#020617]"
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
            <div className="relative hidden min-h-screen overflow-hidden bg-[#f8fbff] text-[#020617] md:flex">
                <PortalBackdropArt />
                <DesktopSidebar activeTab={mainTab} onTabChange={setTab} patient={patient} />
                <main className="relative z-10 flex-1">
                    <div className="mx-auto w-full max-w-[1160px] px-8 py-7">
                        {portalScreen === 'main' && (
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#475569]">
                                <Home size={14} />
                                {MAIN_TABS.find((tab) => tab === mainTab)?.toUpperCase()}
                            </div>
                        )}
                        {renderPortalContent('desktop')}
                    </div>
                </main>
            </div>

            <div className={`relative min-h-screen overflow-hidden bg-[#f8fbff] text-[#020617] md:hidden ${portalScreen === 'main' ? 'pb-28' : 'pb-6'}`}>
                <PortalBackdropArt />
                <MobileTopBar activeTab={mainTab} />
                <main className="relative z-10 px-4 py-5">{renderPortalContent('mobile')}</main>
                {portalScreen === 'main' && queuedRequest && <QueueBanner onTap={openQueuedScreen} />}
                {portalScreen === 'main' && <MobileBottomNav activeTab={mainTab} onTabChange={setTab} />}
            </div>
        </>
    );
}
