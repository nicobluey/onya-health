import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
    ArrowLeft,
    ChevronRight,
    Heart,
    Home,
    NotebookPen,
    Pill,
    Plus,
    Stethoscope,
    TestTube2,
    UserRound,
    ClipboardPlus,
    Phone,
    Clock3,
    MessageCircle,
    CheckCircle2,
    MicOff,
    Info,
    ExternalLink,
    Pencil,
    Scale,
    Tag,
    FileText,
    CalendarDays,
} from 'lucide-react';

type MainTab = 'home' | 'consult' | 'account';
type AccountTab = 'activity' | 'profile' | 'billing';
type PortalScreen = 'main' | 'call-prep' | 'queued';

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
}

interface PatientProfile {
    fullName: string;
    email: string;
    dob?: string;
    phone?: string;
}

function getApiBase() {
    return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
}

function isQueuedStatus(status: string) {
    const normalized = String(status || '').toLowerCase();
    return ['pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(normalized);
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

const CONSULT_OPTIONS = [
    {
        id: 'medical-certificate',
        title: 'Medical Certificate',
        subtitle: 'Get a medical certificate',
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

function BottomNav({
    tab,
    onChange,
}: {
    tab: MainTab;
    onChange: (next: MainTab) => void;
}) {
    const Item = ({
        id,
        label,
        icon: Icon,
    }: {
        id: MainTab;
        label: string;
        icon: ComponentType<{ size?: number; className?: string }>;
    }) => {
        const active = tab === id;
        return (
            <button
                type="button"
                onClick={() => onChange(id)}
                className="flex flex-1 flex-col items-center justify-center gap-2 py-2"
            >
                <Icon size={30} className={active ? 'text-[#3e3e43]' : 'text-[#a3a3a8]'} />
                <span className={`text-sm font-semibold tracking-tight leading-none ${active ? 'text-[#3e3e43]' : 'text-[#a3a3a8]'}`}>
                    {label}
                </span>
                <span className={`h-1.5 w-16 rounded-full ${active ? 'bg-[#2f2f34]' : 'bg-transparent'}`} />
            </button>
        );
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#dadadd] bg-[#f7f7f8]">
            <div className="mx-auto flex h-28 w-full max-w-[900px] items-center px-2">
                <Item id="home" label="Home" icon={Home} />
                <Item id="consult" label="Consult" icon={Stethoscope} />
                <Item id="account" label="Account" icon={UserRound} />
            </div>
        </div>
    );
}

function QueueBanner({ onTap }: { onTap: () => void }) {
    return (
        <button
            type="button"
            onClick={onTap}
            className="fixed bottom-28 left-0 right-0 z-40 border border-[#b6dc79] bg-[#e9f2d6] py-4 text-left"
        >
            <div className="mx-auto flex w-full max-w-[900px] items-center gap-5 px-4 md:px-6">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#d9edbb] text-[#59a400]">
                    <Heart size={34} className="fill-current stroke-current" />
                </div>
                <div className="min-w-0">
                    <p className="text-xl md:text-2xl font-semibold tracking-tight leading-none text-[#365b1d]">
                        You&apos;re in the queue
                    </p>
                    <p className="mt-2 text-xl md:text-2xl text-[#5aa000] leading-none">Tap to view</p>
                </div>
                <ChevronRight size={36} className="ml-auto text-[#5aa000]" />
            </div>
        </button>
    );
}

function HomeTab({
    firstName,
    latestRequest,
}: {
    firstName: string;
    latestRequest: PortalRequest | null;
}) {
    return (
        <section className="space-y-8">
            <header>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#18181d]">Hey, {firstName}</h1>
                <p className="mt-2 text-2xl md:text-3xl text-[#737378] leading-tight">Here&apos;s your Onya Health profile.</p>
            </header>

            <div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#18181d]">Previous Consults</h2>
                <article className="mt-4 rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] p-5">
                    <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 text-[#69b700]">
                            <Stethoscope size={23} />
                            <span className="text-base md:text-lg font-semibold leading-none">
                                {latestRequest && isQueuedStatus(latestRequest.status) ? 'Active' : 'Completed'}
                            </span>
                        </div>
                        <span className="text-base md:text-lg text-[#737378] leading-none">
                            {latestRequest ? formatDate(latestRequest.createdAt) : '—'}
                        </span>
                    </div>
                    <h3 className="mt-8 text-2xl md:text-3xl font-semibold tracking-tight text-[#18181d]">
                        {latestRequest?.serviceType === 'doctor' ? 'Medical Certificate' : (latestRequest?.serviceType || 'Consult')}
                    </h3>
                    <p className="text-lg md:text-xl text-[#737378] leading-none mt-2">
                        {latestRequest ? (isQueuedStatus(latestRequest.status) ? 'Unassigned' : latestRequest.status) : 'No consults yet'}
                    </p>
                </article>
            </div>

            <div className="rounded-3xl border border-[#d8d8dc] bg-[#f8f8f9]">
                <div className="flex items-center gap-2 border-b border-[#dfdfe3] p-3">
                    <button className="rounded-2xl border border-[#d8d8dc] bg-white px-4 py-2 text-base md:text-lg font-semibold leading-none text-[#1f1f24]">
                        Medical History
                    </button>
                    <button className="px-3 text-base md:text-lg font-semibold leading-none text-[#8a8a8f]">Allergies</button>
                    <button className="px-3 text-base md:text-lg font-semibold leading-none text-[#8a8a8f]">Medical</button>
                    <button className="ml-auto px-2 text-[#2a2a2e]"><Plus size={32} /></button>
                </div>
                <div className="px-4 py-12 text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#dedee2] bg-[#f0f0f2] text-[#85858b]">
                        <Stethoscope size={36} />
                    </div>
                    <h3 className="mt-5 text-2xl md:text-3xl font-semibold tracking-tight text-[#1e1e23]">No medical history yet</h3>
                    <p className="mt-3 text-xl md:text-2xl leading-tight text-[#737378]">
                        Add your past or ongoing conditions to build your profile.
                    </p>
                </div>
            </div>
        </section>
    );
}

function ConsultTab({ onOpenCall }: { onOpenCall: () => void }) {
    return (
        <section>
            <header className="text-center">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#1d1d22]">Book a consultation</h1>
                <p className="mt-2 text-2xl md:text-3xl text-[#6f6f73] leading-tight">Choose the type of consultation you need</p>
            </header>

            <div className="mt-6 space-y-4">
                {CONSULT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                        <article
                            key={option.id}
                            onClick={option.id === 'medical-certificate' ? onOpenCall : undefined}
                            className={`rounded-3xl border p-5 ${option.active
                                ? 'border-[#b6dc79] bg-[#f4faeb]'
                                : 'border-[#d8d8dc] bg-[#f6f6f7]'
                                } ${option.id === 'medical-certificate' ? 'cursor-pointer' : ''}`}
                        >
                            <div className="flex items-start gap-4">
                                <Icon size={38} className={option.active ? 'text-[#5aa000]' : 'text-[#a0a0a5]'} />
                                <div className="min-w-0">
                                    <h2 className={`text-2xl md:text-3xl font-semibold tracking-tight ${option.active ? 'text-[#3f6f10]' : 'text-[#1f1f24]'}`}>
                                        {option.title}
                                    </h2>
                                    <p className={`mt-1 text-xl md:text-2xl leading-tight ${option.active ? 'text-[#5aa000]' : 'text-[#6f6f73]'}`}>
                                        {option.subtitle}
                                    </p>
                                </div>
                                {option.badge ? (
                                    <span
                                        className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${option.active
                                            ? 'bg-[#deefbd] text-[#3f6f10]'
                                            : 'bg-[#d9d9dc] text-[#57575c]'
                                            }`}
                                    >
                                        {option.badge}
                                    </span>
                                ) : (
                                    <ChevronRight size={30} className="ml-auto text-[#c2c2c6]" />
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function AccountHeader({
    active,
    onChange,
    email,
    fullName,
}: {
    active: AccountTab;
    onChange: (tab: AccountTab) => void;
    email: string;
    fullName: string;
}) {
    const initials = fullName
        .split(' ')
        .map((part) => part.trim().charAt(0))
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'JV';

    return (
        <header className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#e2c96d] text-lg md:text-xl font-semibold text-white">
                {initials}
            </div>
            <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-[#1d1d22]">{fullName || 'Patient'}</h1>
            <p className="mt-1 text-2xl md:text-3xl text-[#6f6f73] leading-none">{email}</p>

            <div className="mt-5 grid grid-cols-3 border-b border-[#dbdbdf]">
                {(['activity', 'profile', 'billing'] as AccountTab[]).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => onChange(tab)}
                        className={`relative pb-3 text-2xl md:text-3xl font-semibold capitalize ${active === tab ? 'text-[#1f1f23]' : 'text-[#a0a0a5]'}`}
                    >
                        {tab}
                        {active === tab && (
                            <span className="absolute left-1/2 bottom-0 h-1.5 w-32 -translate-x-1/2 rounded-full bg-[#1f1f23]" />
                        )}
                    </button>
                ))}
            </div>
        </header>
    );
}

function BillingPanel({
    latestRequest,
}: {
    latestRequest: PortalRequest | null;
}) {
    return (
        <section className="space-y-4">
            <article className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] px-5 py-7 text-center">
                <p className="text-2xl md:text-3xl text-[#6f6f73] leading-none">No active subscriptions</p>
            </article>

            <article className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] p-5">
                <div className="flex items-center">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#1e1e23]">Med Cert</h2>
                        <p className="text-base md:text-lg text-[#707075] leading-none mt-1">
                            {latestRequest ? formatDate(latestRequest.createdAt) : '—'}
                        </p>
                    </div>
                    <p className="ml-auto text-2xl md:text-3xl font-semibold tracking-tight text-[#1e1e23]">$12.90</p>
                    <button className="ml-5 inline-flex items-center gap-2 text-base md:text-lg font-medium text-[#59595f]">
                        <ExternalLink size={22} />
                        Receipt
                    </button>
                </div>
            </article>

            <article className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] px-5 py-6 text-center">
                <p className="text-xl md:text-2xl text-[#707075] leading-tight">Need to update your payment method?</p>
                <a href="#" className="mt-2 inline-flex items-center gap-2 text-2xl md:text-3xl font-semibold underline text-[#1f1f24]">
                    Manage in Stripe
                    <ExternalLink size={22} />
                </a>
            </article>
        </section>
    );
}

function ProfilePanel() {
    return (
        <section className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7]">
            <div className="space-y-0 divide-y divide-[#dbdbdf]">
                {[
                    { label: 'First name', value: 'John' },
                    { label: 'Last name', value: 'Von' },
                    { label: 'Date of birth', value: '14/06/2000' },
                ].map((row) => (
                    <div key={row.label} className="flex items-end justify-between px-5 py-4">
                        <div>
                            <p className="text-xl md:text-2xl text-[#707075] leading-none">{row.label}</p>
                            <p className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-[#1e1e23]">{row.value}</p>
                        </div>
                        <button className="text-[#9a9aa0]">
                            <Pencil size={28} />
                        </button>
                    </div>
                ))}

                <div className="px-5 py-4">
                    <p className="text-xl md:text-2xl text-[#707075] leading-none">Gender</p>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <button className="h-16 rounded-2xl bg-[#e8e8ea] text-xl md:text-2xl font-semibold text-[#56565c]">Male</button>
                        <button className="h-16 rounded-2xl border-2 border-[#72c100] bg-[#eef7df] text-xl md:text-2xl font-semibold text-[#4c8d00]">Female</button>
                        <button className="h-16 rounded-2xl bg-[#e8e8ea] text-xl md:text-2xl font-semibold text-[#56565c]">Other</button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ActivityPanel({
    latestRequest,
}: {
    latestRequest: PortalRequest | null;
}) {
    return (
        <section className="space-y-4">
            <article className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] p-5">
                <div className="flex items-center justify-between">
                    <p className="inline-flex items-center gap-2 text-base md:text-lg font-semibold text-[#69b700]">
                        <Stethoscope size={22} />
                        {latestRequest && isQueuedStatus(latestRequest.status) ? 'In queue' : 'Reviewed'}
                    </p>
                    <p className="text-sm md:text-base text-[#737378] leading-none">
                        {latestRequest ? `Updated ${formatDate(latestRequest.createdAt)}` : 'No updates yet'}
                    </p>
                </div>
                <h2 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight text-[#1e1e23]">Medical Certificate</h2>
                <p className="mt-1 text-lg md:text-xl text-[#737378] leading-none">
                    {latestRequest ? (isQueuedStatus(latestRequest.status) ? 'Awaiting doctor assignment' : latestRequest.status) : 'No active request'}
                </p>
            </article>

            <article className="rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7] p-5">
                <h3 className="text-xl md:text-2xl font-semibold text-[#1e1e23]">What happens next</h3>
                <ul className="mt-4 space-y-3 text-base md:text-lg text-[#646469] leading-tight">
                    <li className="flex items-center gap-2"><CheckCircle2 size={22} className="text-[#69b700]" /> Payment confirmed</li>
                    <li className="flex items-center gap-2"><Clock3 size={22} className="text-[#69b700]" /> Queue position updates</li>
                    <li className="flex items-center gap-2"><NotebookPen size={22} className="text-[#69b700]" /> Certificate delivery by email</li>
                </ul>
            </article>
        </section>
    );
}

function CallPrepScreen({ onBack }: { onBack: () => void }) {
    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
                <div className="h-2 rounded-full bg-[#72c100]" />
                <div className="h-2 rounded-full bg-[#72c100]" />
                <div className="h-2 rounded-full bg-[#d9d9dc]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-base md:text-lg text-[#5f5f64]">
                <ArrowLeft size={30} />
                Back
            </button>

            <header className="text-center">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#121217]">Ready to start?</h1>
                <p className="mt-3 text-2xl md:text-3xl text-[#6f6f73] leading-tight">A quick chat with AI to help your doctor prepare</p>
            </header>

            <article className="overflow-hidden rounded-3xl border border-[#d8d8dc] bg-[#f6f6f7]">
                {[
                    { icon: Phone, text: '2-3 minute voice call' },
                    { icon: Clock3, text: 'Confirm your certificate dates' },
                    { icon: MessageCircle, text: 'Describe your symptoms' },
                    { icon: CheckCircle2, text: 'Summary sent to your doctor' },
                ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.text} className={`flex items-center gap-3 px-4 py-4 ${index > 0 ? 'border-t border-[#dfdfe3]' : ''}`}>
                            <Icon size={26} className="text-[#61a700]" />
                            <p className="text-2xl md:text-3xl text-[#56565b] leading-none">{item.text}</p>
                        </div>
                    );
                })}
            </article>

            <article className="overflow-hidden rounded-3xl border-2 border-dashed border-[#f1a3a3] bg-[#fff1f1]">
                <div className="flex items-center gap-4 px-4 py-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ffdede] text-[#ef3b3b]">
                        <MicOff size={30} />
                    </div>
                    <div>
                        <h3 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#d80000]">Tap to try again</h3>
                        <p className="text-xl md:text-2xl text-[#6f6f73] leading-none mt-2">Microphone blocked</p>
                    </div>
                </div>
                <div className="border-t border-[#f3b4b4] px-4 py-4">
                    <p className="flex items-start gap-3 text-base md:text-lg leading-tight text-[#ef1a1a]">
                        <Info size={22} className="mt-1 shrink-0" />
                        Allow access in your browser settings - look for the lock icon in the address bar
                    </p>
                </div>
            </article>

            <button
                type="button"
                disabled
                className="mt-1 inline-flex h-20 w-full items-center justify-center gap-2 rounded-3xl border border-[#e3e3e6] bg-[#efeff0] text-2xl md:text-3xl font-semibold text-[#a0a0a5]"
            >
                <Phone size={26} />
                Start call
            </button>

            <p className="text-center text-base md:text-lg text-[#737378] leading-none">
                Private &amp; Secure <span className="mx-2">|</span> ~2 minutes
            </p>
        </section>
    );
}

function QueuedWaitingScreen({
    request,
    onSendMessage,
}: {
    request: PortalRequest | null;
    onSendMessage: () => void;
}) {
    const detailRows = [
        { label: 'Type', value: 'Medical Certificate', icon: Tag },
        { label: 'Leave type', value: request?.purpose || '—', icon: FileText },
        { label: 'Main symptom', value: request?.symptom || '—', icon: FileText },
        { label: 'Certificate period', value: request?.startDate ? formatDate(request.startDate) : '—', icon: CalendarDays },
    ];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
                <div className="h-2 rounded-full bg-[#72c100]" />
                <div className="h-2 rounded-full bg-[#72c100]" />
                <div className="h-2 rounded-full bg-[#72c100]" />
            </div>

            <article className="rounded-3xl border border-[#b6dc79] bg-[#eef4df] px-5 py-5">
                <div className="flex items-center gap-3">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-semibold tracking-tight text-[#1c1c20]">Queued</h1>
                        <p className="mt-1 text-xl text-[#68686d]">A doctor will be assigned shortly</p>
                    </div>
                    <div className="ml-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#d8ecb8] text-[#59a400]">
                        <Heart size={30} className="fill-current stroke-current" />
                    </div>
                </div>
            </article>

            <article className="overflow-hidden rounded-3xl border border-[#7ec800] bg-[#7ad200] md:grid md:grid-cols-[1.45fr_1fr]">
                <div className="relative min-h-[220px] bg-[linear-gradient(135deg,#2f2f35,#838388)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(121,210,0,0.45),transparent_40%)]" />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white text-6xl font-light tracking-tight">
                        doccy
                    </div>
                </div>
                <div className="p-5 md:p-6">
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-white leading-tight">
                        Upgrade to jump to the front of the queue.
                    </p>
                    <button
                        type="button"
                        className="mt-6 inline-flex h-16 w-full items-center justify-between rounded-2xl bg-white px-5 text-2xl font-semibold text-[#4e8b00]"
                    >
                        Skip the queue
                        <ArrowLeft size={28} className="rotate-180" />
                    </button>
                </div>
            </article>

            <article className="overflow-hidden rounded-3xl border border-[#d7d7db] bg-[#f6f6f7]">
                {detailRows.map((row, index) => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className={`flex items-center gap-3 px-5 py-4 ${index > 0 ? 'border-t border-[#dfdfe3]' : ''}`}>
                            <Icon size={23} className="text-[#a0a0a5]" />
                            <span className="text-xl text-[#95959b]">{row.label}</span>
                            <span className="ml-auto text-2xl font-semibold text-[#3c3c40]">{row.value}</span>
                        </div>
                    );
                })}
            </article>

            <button
                type="button"
                onClick={onSendMessage}
                className="inline-flex h-16 w-full items-center justify-center gap-3 rounded-3xl bg-[#232428] text-2xl font-semibold text-white"
            >
                <MessageCircle size={28} />
                Message Doctor
            </button>
        </section>
    );
}

export default function PatientPortal() {
    const [mainTab, setMainTab] = useState<MainTab>('home');
    const [accountTab, setAccountTab] = useState<AccountTab>('billing');
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

    const token = useMemo(() => window.localStorage.getItem('onya_patient_token') || '', []);

    useEffect(() => {
        if (!token) {
            window.location.href = '/patient-login';
            return;
        }

        const fetchPortalData = async () => {
            setLoading(true);
            setLoadError('');
            try {
                const headers = {
                    Authorization: `Bearer ${token}`,
                };
                const apiBase = getApiBase();

                const [meRes, requestsRes] = await Promise.all([
                    fetch(`${apiBase}/api/patient/me`, { headers }),
                    fetch(`${apiBase}/api/patient/requests`, { headers }),
                ]);

                if (meRes.status === 401 || requestsRes.status === 401) {
                    window.localStorage.removeItem('onya_patient_token');
                    window.location.href = '/patient-login';
                    return;
                }

                const mePayload = await meRes.json();
                const requestsPayload = await requestsRes.json();

                if (!meRes.ok) {
                    throw new Error(mePayload.error || 'Unable to load patient account');
                }
                if (!requestsRes.ok) {
                    throw new Error(requestsPayload.error || 'Unable to load patient requests');
                }

                const patientProfile: PatientProfile = {
                    fullName: mePayload?.patient?.fullName || 'Patient',
                    email: mePayload?.patient?.email || window.localStorage.getItem('onya_patient_email') || '',
                    dob: mePayload?.patient?.dob || '',
                    phone: mePayload?.patient?.phone || '',
                };
                setPatient(patientProfile);
                window.localStorage.setItem('onya_patient_email', patientProfile.email);

                const items: PortalRequest[] = Array.isArray(requestsPayload?.requests)
                    ? requestsPayload.requests
                    : [];
                setRequests(items);
                const firstQueued = items.find((item) => isQueuedStatus(item.status)) || null;
                setActiveQueuedRequest(firstQueued);
            } catch (errorObject) {
                setLoadError(errorObject instanceof Error ? errorObject.message : 'Unable to load patient account');
            } finally {
                setLoading(false);
            }
        };

        fetchPortalData();
    }, [token]);

    const firstName = useMemo(() => {
        const value = String(patient.fullName || '').trim();
        return value ? value.split(' ')[0] : 'there';
    }, [patient.fullName]);

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

    const sendMessageToDoctor = async () => {
        if (!queuedRequest || !token) return;
        const message = window.prompt('Message for the doctor');
        if (!message || !message.trim()) return;

        try {
            const response = await fetch(`${getApiBase()}/api/patient/requests/${encodeURIComponent(queuedRequest.id)}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ message }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to send message');
            }
            window.alert('Message sent to doctor.');
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to send message');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#e8f1ff] text-[#1f1f23] px-4 py-8">
                <div className="mx-auto max-w-[900px] rounded-3xl border border-[#cfdcf2] bg-white p-6">
                    <p className="text-lg text-[#5e6980]">Loading your patient account...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-[#e8f1ff] text-[#1f1f23] px-4 py-8">
                <div className="mx-auto max-w-[900px] rounded-3xl border border-[#cfdcf2] bg-white p-6">
                    <h1 className="text-2xl font-semibold text-[#162848]">Unable to load account</h1>
                    <p className="mt-2 text-[#5e6980]">{loadError}</p>
                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="rounded-xl bg-[#0f66e8] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Retry
                        </button>
                        <a
                            href="/patient-login"
                            className="rounded-xl border border-[#cfdcf2] bg-white px-4 py-2 text-sm font-semibold text-[#162848]"
                        >
                            Back to login
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#e8f1ff] pb-[230px] text-[#1f1f23]">
            <div className="mx-auto w-full max-w-[900px] px-4 pt-6 md:px-6 md:pt-8">
                {portalScreen === 'main' && (
                    <>
                        {mainTab === 'home' && <HomeTab firstName={firstName} latestRequest={latestRequest} />}
                        {mainTab === 'consult' && <ConsultTab onOpenCall={openCallScreen} />}
                        {mainTab === 'account' && (
                            <section className="space-y-5">
                                <AccountHeader
                                    active={accountTab}
                                    onChange={setAccountTab}
                                    email={patient.email}
                                    fullName={patient.fullName}
                                />
                                {accountTab === 'billing' && <BillingPanel latestRequest={latestRequest} />}
                                {accountTab === 'profile' && <ProfilePanel />}
                                {accountTab === 'activity' && <ActivityPanel latestRequest={latestRequest} />}
                            </section>
                        )}
                    </>
                )}

                {portalScreen === 'call-prep' && <CallPrepScreen onBack={closeOverlayScreen} />}
                {portalScreen === 'queued' && (
                    <QueuedWaitingScreen
                        request={queuedRequest}
                        onSendMessage={sendMessageToDoctor}
                    />
                )}
            </div>

            {portalScreen === 'main' && queuedRequest && <QueueBanner onTap={openQueuedScreen} />}
            {portalScreen === 'main' && <BottomNav tab={mainTab} onChange={setTab} />}
        </div>
    );
}
