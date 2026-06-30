import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { fetchApiJson } from '../lib/api';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

export default function PatientLoginPage() {
    const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const initialEmail = String(initialParams.get('email') || '').trim().toLowerCase();
    const initialMagicToken = String(initialParams.get('magic_token') || '').trim();
    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetSending, setResetSending] = useState(false);
    const [magicSending, setMagicSending] = useState(false);
    const [magicAuthenticating, setMagicAuthenticating] = useState(Boolean(initialMagicToken));
    const [error, setError] = useState('');
    const [resetStatus, setResetStatus] = useState('');
    const [magicStatus, setMagicStatus] = useState('');

    useEffect(() => {
        if (!initialMagicToken) return;
        let disposed = false;
        const authenticateWithMagicToken = async () => {
            setError('');
            setMagicStatus('');
            setMagicAuthenticating(true);
            try {
                const { response, payload } = await fetchApiJson('/api/patient/magic-link/consume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: initialMagicToken }),
                });
                if (!response.ok) {
                    throw new Error(payload.error || 'Magic link is invalid or expired');
                }
                const resolvedEmail = String(payload?.patient?.email || initialEmail || '').trim().toLowerCase();
                if (resolvedEmail) {
                    window.localStorage.setItem('onya_patient_email', resolvedEmail);
                }
                window.localStorage.setItem('onya_patient_token', payload.token || '');
                window.location.href = '/patient';
            } catch (errorObject) {
                if (disposed) return;
                setError(errorObject instanceof Error ? errorObject.message : 'Magic link is invalid or expired');
            } finally {
                if (!disposed) {
                    setMagicAuthenticating(false);
                }
            }
        };
        void authenticateWithMagicToken();
        return () => {
            disposed = true;
        };
    }, [initialEmail, initialMagicToken]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (!email || !email.includes('@')) {
            setError('Enter a valid email address.');
            return;
        }

        if (!password) {
            setError('Enter your password.');
            return;
        }

        try {
            setLoading(true);
            const { response, payload } = await fetchApiJson('/api/patient/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
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

    const handleSendMagicLink = async () => {
        setMagicStatus('');
        setError('');
        if (!email || !email.includes('@')) {
            setError('Enter your account email first.');
            return;
        }

        try {
            setMagicSending(true);
            const { response, payload } = await fetchApiJson('/api/patient/magic-link/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to send magic link right now.');
            }
            setMagicStatus('Magic link sent if this email exists.');
        } catch (errorObject) {
            setError(errorObject instanceof Error ? errorObject.message : 'Unable to send magic link right now.');
        } finally {
            setMagicSending(false);
        }
    };

    return (
        <div className="min-h-screen overflow-hidden bg-[#f5f7fa] text-text-primary">
            <header className="sticky top-0 z-20 w-full border-b border-border bg-white">
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
                    <HeaderBrand />
                    <div className="flex items-center gap-2.5">
                        <HeaderDropdown buttonClassName="h-10 w-10 rounded-full text-text-primary/90 flex items-center justify-center hover:bg-sand-75 transition-colors" />
                        <a
                            href="/doctor"
                            className="hidden h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-extrabold text-[#06142b] transition hover:border-primary sm:inline-flex"
                        >
                            Start Consult
                            <ArrowRight size={14} />
                        </a>
                    </div>
                </div>
            </header>

            <main className="mx-auto grid min-h-[calc(100svh-64px)] w-full max-w-7xl gap-0 px-4 py-6 md:px-8 md:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
                <section className="relative hidden overflow-hidden border border-border bg-white lg:block">
                    <img
                        src="/Medical Certificate Landing.webp"
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover object-center"
                    />
                    <div className="relative z-10 flex h-full min-h-[680px] flex-col justify-end p-8">
                        <p className="onya-kicker w-fit">Patient portal</p>
                        <h1 className="onya-display mt-5 max-w-[8ch] text-[#06142b]">
                            Portal access.
                        </h1>
                        <p className="mt-5 max-w-[520px] text-lg font-semibold leading-relaxed text-[#06142b]">
                            Track consult updates, manage your profile, and keep certificate records in one secure workspace.
                        </p>
                        <div className="mt-8 grid max-w-[560px] grid-cols-3 border border-border bg-white">
                            {['Secure login', 'Certificate records', 'Account details'].map((item) => (
                                <div key={item} className="border-r border-border p-4 text-sm font-extrabold last:border-r-0">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="flex items-center bg-white p-5 md:p-8 lg:border-y lg:border-r lg:border-border">
                    <div className="mx-auto w-full max-w-[520px]">
                        <p className="onya-kicker">Patient login</p>
                        <h2 className="onya-heading-xl mt-4 text-[#06142b]">Get back in.</h2>
                        <p className="mt-3 text-base leading-relaxed text-text-secondary">
                            Access consult activity, billing, profile details, and queue status. Password login is available for trial and checkout-created accounts.
                        </p>

                        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                            <label className="block">
                                <span className="mb-2 block text-sm font-extrabold uppercase text-[#06142b]">Email</span>
                                <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4">
                                    <Mail size={16} className="text-primary" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-12 w-full bg-transparent outline-none"
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-extrabold uppercase text-[#06142b]">Password</span>
                                <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4">
                                    <Lock size={16} className="text-primary" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-12 w-full bg-transparent outline-none"
                                        placeholder="Use password if your account is set up"
                                        autoComplete="current-password"
                                    />
                                </div>
                            </label>

                            {error && (
                                <p className="border border-[#f3c5c4] bg-[#ffe9e8] px-4 py-3 text-sm font-bold text-[#a93736]">
                                    {error}
                                </p>
                            )}
                            {magicStatus && (
                                <p className="border border-[#86efac] bg-[#ecfdf3] px-4 py-3 text-sm font-bold text-[#166534]">
                                    {magicStatus}
                                </p>
                            )}
                            {resetStatus && (
                                <p className="border border-[#f3df9d] bg-[#fff8e8] px-4 py-3 text-sm font-bold text-[#8a6700]">
                                    {resetStatus}
                                </p>
                            )}

                            <button type="submit" disabled={loading || magicAuthenticating} className="onya-button w-full">
                                {loading ? 'Signing in...' : 'Continue to patient portal'}
                                <ArrowRight size={16} />
                            </button>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={handleSendMagicLink}
                                    disabled={magicSending || magicAuthenticating}
                                    className="onya-button-secondary"
                                >
                                    {magicSending ? 'Sending...' : 'Email magic link'}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSendResetLink}
                                    disabled={resetSending || magicAuthenticating}
                                    className="onya-button-secondary"
                                >
                                    {resetSending ? 'Sending...' : 'Reset password'}
                                </button>
                            </div>
                        </form>

                        <div className="mt-7 border-t border-border pt-4 text-sm text-text-secondary">
                            <p>Your account is created automatically after checkout using your consult email.</p>
                            <p className="mt-2">
                                New patient? <a href="/doctor" className="font-extrabold text-primary underline underline-offset-2">Start a consult to create your account</a>.
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
