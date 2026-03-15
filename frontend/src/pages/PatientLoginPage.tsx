import { type CSSProperties, useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { fetchApiJson } from '../lib/api';

type FloatingScienceCard = {
    src: string;
    className: string;
    tilt: string;
    duration: string;
    delay: string;
    reverse?: boolean;
};

const SCIENCE_FLOATING_CARDS: FloatingScienceCard[] = [
    {
        src: '/Blue%20Cells.png',
        className: '-left-20 top-16 h-36 w-36 md:-left-24 md:top-20 md:h-56 md:w-56',
        tilt: '-8deg',
        duration: '18s',
        delay: '0s',
    },
    {
        src: '/Green%20Cells.png',
        className: 'right-[-2.9rem] top-24 h-28 w-28 md:right-[5%] md:top-14 md:h-36 md:w-36',
        tilt: '8deg',
        duration: '17s',
        delay: '1.2s',
        reverse: true,
    },
    {
        src: '/Blue%20Bubbles.png',
        className: 'left-[6%] -bottom-10 h-28 w-28 md:left-[8%] md:bottom-10 md:h-36 md:w-36',
        tilt: '-6deg',
        duration: '20s',
        delay: '0.8s',
    },
    {
        src: '/Orange%20Cells.png',
        className: 'right-[18%] -bottom-8 h-24 w-24 md:right-[28%] md:bottom-6 md:h-32 md:w-32',
        tilt: '9deg',
        duration: '15s',
        delay: '0.5s',
        reverse: true,
    },
    {
        src: '/Red%20Cells.png',
        className: '-left-9 top-[54%] h-24 w-24 md:left-[1%] md:top-[50%] md:h-32 md:w-32',
        tilt: '-10deg',
        duration: '16s',
        delay: '1.6s',
    },
    {
        src: '/Red%20Chemicals.png',
        className: '-right-8 top-[62%] h-28 w-28 md:right-[1%] md:top-[58%] md:h-36 md:w-36',
        tilt: '10deg',
        duration: '19s',
        delay: '0.7s',
        reverse: true,
    },
    {
        src: '/Red%20Veins.png',
        className: 'left-[34%] -top-9 h-20 w-20 md:left-[42%] md:-top-8 md:h-28 md:w-28',
        tilt: '-5deg',
        duration: '14s',
        delay: '0.2s',
    },
    {
        src: '/Lab%20Equipment.png',
        className: 'right-[34%] -top-7 h-20 w-20 md:right-[36%] md:-top-7 md:h-28 md:w-28',
        tilt: '7deg',
        duration: '15s',
        delay: '1.4s',
        reverse: true,
    },
    {
        src: '/Microscope.png',
        className: 'left-[2%] bottom-[12%] h-24 w-24 md:left-[2%] md:bottom-[18%] md:h-36 md:w-36',
        tilt: '-7deg',
        duration: '17s',
        delay: '2s',
    },
    {
        src: '/Pipette.png',
        className: 'right-3 bottom-[8%] h-28 w-28 md:-right-12 md:bottom-[8%] md:h-[260px] md:w-[260px]',
        tilt: '8deg',
        duration: '20s',
        delay: '1s',
        reverse: true,
    },
];

export default function PatientLoginPage() {
    const [email, setEmail] = useState('');
    const [dob, setDob] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetSending, setResetSending] = useState(false);
    const [error, setError] = useState('');
    const [resetStatus, setResetStatus] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (!email || !email.includes('@')) {
            setError('Enter a valid email address.');
            return;
        }

        if (!password && !dob) {
            setError('Enter your date of birth.');
            return;
        }

        try {
            setLoading(true);
            const { response, payload } = await fetchApiJson('/api/patient/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    dob: password ? '' : dob,
                    password: password || undefined,
                }),
            });
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to log in right now');
            }

            window.localStorage.setItem('onya_patient_email', payload?.patient?.email || email);
            window.localStorage.setItem('onya_patient_token', payload.token || '');
            window.location.href = '/patient';
        } catch (errorObject) {
            setError(errorObject instanceof Error ? errorObject.message : 'Unable to log in right now');
        } finally {
            setLoading(false);
        }
    };

    const handleSendResetLink = async () => {
        setResetStatus('');
        setError('');

        if (!email || !email.includes('@')) {
            setError('Enter your account email first.');
            return;
        }

        try {
            setResetSending(true);
            const { response, payload } = await fetchApiJson('/api/patient/password/reset/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to send reset link right now.');
            }
            setResetStatus('Reset link sent if this email exists.');
        } catch (errorObject) {
            setError(errorObject instanceof Error ? errorObject.message : 'Unable to send reset link right now.');
        } finally {
            setResetSending(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-sunlight-50 text-text-primary">
            <div className="science-scene" aria-hidden="true">
                {SCIENCE_FLOATING_CARDS.map((card, index) => (
                    <div
                        key={`${card.src}-${index}`}
                        className={`science-float-card ${card.reverse ? 'is-reverse' : ''} ${card.className}`}
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
            </div>

            <header className="sticky top-0 z-20 w-full border-b border-white/40 bg-white/40 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
                    <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                        <img src="/logo.png" alt="Onya Health" className="h-11 w-auto object-contain" />
                    </a>
                    <div className="flex items-center gap-2">
                        <a
                            href="/verify"
                            className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700 transition hover:border-forest-300"
                        >
                            Verify
                        </a>
                        <a
                            href="/doctor"
                            className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700 transition hover:border-forest-300"
                        >
                            Start Consult
                            <ArrowRight size={14} />
                        </a>
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="hidden overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-[0_28px_56px_-36px_rgba(15,23,42,0.35)] lg:block">
                        <img
                            src="/HERO.png"
                            alt=""
                            aria-hidden="true"
                            className="h-[360px] w-full object-cover"
                        />
                        <div className="p-8">
                            <p className="inline-flex items-center rounded-full border border-sand-200 bg-sunlight-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-bark-600">
                                Patient Portal
                            </p>
                            <h1 className="mt-4 max-w-[16ch] text-5xl leading-[1.05] text-bark-900">
                                Healthcare made for you.
                            </h1>
                            <p className="mt-4 max-w-[48ch] text-base text-bark-500">
                                Sign in to track consult updates, manage your account details, and keep your records in one secure place.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-sand-200 bg-white p-6 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.28)] md:p-7">
                        <h2 className="text-3xl leading-tight">Patient login</h2>
                        <p className="mt-2 text-bark-500">
                            Access your consult activity, profile, billing, and queue status with password or date-of-birth sign-in.
                        </p>

                        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-bark-600">Email</span>
                                <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
                                    <Mail size={16} className="text-bark-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-11 w-full bg-transparent outline-none"
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-bark-600">Password</span>
                                <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
                                    <Lock size={16} className="text-bark-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-11 w-full bg-transparent outline-none"
                                        placeholder="Use password if your account is set up"
                                        autoComplete="current-password"
                                    />
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-bark-600">Date of birth</span>
                                <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
                                    <Lock size={16} className="text-bark-400" />
                                    <input
                                        type="date"
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value)}
                                        className="h-11 w-full bg-transparent outline-none"
                                        required={!password}
                                    />
                                </div>
                            </label>

                            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                            {resetStatus && <p className="text-sm font-medium text-emerald-600">{resetStatus}</p>}

                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {loading ? 'Signing in...' : 'Continue to patient portal'}
                                <ArrowRight size={16} />
                            </button>

                            <button
                                type="button"
                                onClick={handleSendResetLink}
                                disabled={resetSending}
                                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-sand-200 bg-white text-sm font-semibold text-bark-700 transition hover:border-[#93c5fd] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {resetSending ? 'Sending reset link...' : 'Forgot password? Send reset link'}
                            </button>
                        </form>

                        <p className="mt-5 text-center text-xs text-bark-500">
                            Your account is created automatically after checkout using your consult email.
                        </p>
                        <p className="mt-1 text-center text-xs text-bark-500">
                            New patient? <a href="/doctor" className="underline underline-offset-2">Start a consult to create your account</a>.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
