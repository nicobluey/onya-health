import { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { fetchApiJson } from './lib/api';

export default function PatientLogin() {
    const [email, setEmail] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (!email || !email.includes('@')) {
            setError('Enter a valid email address.');
            return;
        }

        if (!dob) {
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
                    dob,
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

    return (
        <div className="relative min-h-screen overflow-hidden bg-sunlight-50 text-text-primary">
            <img
                src="/Blue%20Cells.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -left-20 -top-16 h-72 w-72 object-cover opacity-30"
            />
            <img
                src="/Pipette.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 bottom-0 hidden h-[560px] w-auto object-contain opacity-25 md:block"
            />

            <header className="sticky top-0 z-20 w-full border-b border-white/40 bg-white/40 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
                    <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                        <img src="/logo.png" alt="Onya Health" className="h-11 w-auto object-contain" />
                    </a>
                    <a
                        href="/doctor"
                        className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700 transition hover:border-forest-300"
                    >
                        Start Consult
                        <ArrowRight size={14} />
                    </a>
                </div>
            </header>

            <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="relative hidden overflow-hidden rounded-3xl border border-sand-200 bg-gradient-to-br from-forest-700 via-forest-600 to-forest-500 p-8 text-white shadow-[0_28px_56px_-36px_rgba(15,23,42,0.35)] lg:block">
                        <img
                            src="/HERO.png"
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-28"
                        />
                        <div className="relative z-10">
                            <p className="inline-flex items-center rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sand-75">
                                Patient Portal
                            </p>
                            <h1 className="mt-4 max-w-[16ch] text-5xl leading-[1.05]">
                                Healthcare made for you.
                            </h1>
                            <p className="mt-4 max-w-[48ch] text-base text-sand-75">
                                Sign in to track consult updates, manage your account details, and keep your records in one secure place.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-sand-200 bg-white p-6 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.28)] md:p-7">
                        <h2 className="text-3xl leading-tight">Patient login</h2>
                        <p className="mt-2 text-bark-500">
                            Access your consult activity, profile, billing, and queue status.
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
                                <span className="mb-2 block text-sm font-medium text-bark-600">Date of birth</span>
                                <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
                                    <Lock size={16} className="text-bark-400" />
                                    <input
                                        type="date"
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value)}
                                        className="h-11 w-full bg-transparent outline-none"
                                        required
                                    />
                                </div>
                            </label>

                            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {loading ? 'Signing in...' : 'Continue to patient portal'}
                                <ArrowRight size={16} />
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
