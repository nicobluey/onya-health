import { useEffect } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, Stethoscope, UserCheck } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';

const TRUST_PILLARS = [
    {
        title: 'Independent practitioner decisions',
        body: 'Clinical outcomes are determined by independent AHPRA-registered practitioners based on clinical judgment and applicable standards.',
        icon: Stethoscope,
    },
    {
        title: 'Identity and account safeguards',
        body: 'Access to patient accounts is protected through authentication controls and monitored platform workflows.',
        icon: UserCheck,
    },
    {
        title: 'Privacy and secure handling',
        body: 'Personal and health information is handled under our privacy obligations with access controls and secure transmission practices.',
        icon: LockKeyhole,
    },
    {
        title: 'Operational integrity',
        body: 'We continuously improve reliability, request handling, and support operations to keep patient pathways clear and stable.',
        icon: ShieldCheck,
    },
];

export default function TrustSafetyPage() {
    useEffect(() => {
        document.title = 'Trust & Safety | Onya Health';
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute(
                'content',
                'Learn how Onya Health approaches trust, safety, privacy, and clinical workflow integrity.'
            );
        }
    }, []);

    return (
        <main className="min-h-screen bg-bg">
            <header className="sticky top-0 z-40 border-b border-border bg-white shadow-sm">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                    <HeaderBrand />
                    <div className="flex items-center gap-3">
                        <HeaderDropdown buttonClassName="flex h-10 w-10 items-center justify-center rounded-xl text-text-primary/90 transition-colors hover:bg-sand-75" />
                        <a
                            href="/doctor"
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                    </div>
                </div>
            </header>

            <section className="border-b border-border bg-sunlight-50">
                <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-6 md:py-16">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Trust & safety</p>
                    <h1 className="mt-4 text-4xl font-bold leading-tight text-text-primary md:text-5xl">How Onya Health approaches trust and safety</h1>
                    <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
                        Our platform is designed to support safe, clear, and privacy-conscious healthcare workflows for patients across Australia.
                    </p>
                </div>
            </section>

            <section className="bg-surface">
                <div className="mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-14">
                    <div className="grid gap-5 md:grid-cols-2">
                        {TRUST_PILLARS.map((pillar) => {
                            const Icon = pillar.icon;
                            return (
                                <article key={pillar.title} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <Icon size={18} />
                                    </div>
                                    <h2 className="mt-4 text-lg font-semibold text-text-primary">{pillar.title}</h2>
                                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{pillar.body}</p>
                                </article>
                            );
                        })}
                    </div>

                    <div className="mt-8 rounded-2xl border border-border bg-white p-6 shadow-sm">
                        <h2 className="text-xl font-semibold text-text-primary">Emergency care reminder</h2>
                        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                            Onya Health is not an emergency service. If you have chest pain, breathing difficulty, severe bleeding, or another urgent condition,
                            call 000 immediately.
                        </p>
                    </div>
                </div>
            </section>

            <Footer consultHref="/doctor" />
        </main>
    );
}
