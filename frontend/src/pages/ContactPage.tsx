import { useEffect } from 'react';
import { ArrowRight, Mail, ShieldCheck, Stethoscope } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';

const COMPANY_ABN = '85 207 753 898';

const CONTACT_OPTIONS = [
    {
        title: 'General support',
        body: 'Questions about bookings, account access, delivery timing, or platform issues.',
        actionLabel: 'Email support',
        href: 'mailto:hello@onyahealth.com.au?subject=Onya%20Health%20Support',
        icon: Mail,
    },
    {
        title: 'Privacy and data requests',
        body: 'Requests for access, correction, or privacy-related concerns about your information.',
        actionLabel: 'Email privacy',
        href: 'mailto:hello@onyahealth.com.au?subject=Privacy%20Request',
        icon: ShieldCheck,
    },
    {
        title: 'Clinical follow-up',
        body: 'If you need a follow-up consultation, use your patient portal or booking flow for the fastest clinical routing.',
        actionLabel: 'Go to patient login',
        href: '/patient-login',
        icon: Stethoscope,
    },
];

export default function ContactPage() {
    useEffect(() => {
        document.title = 'Contact Onya Health';
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute(
                'content',
                'Contact Onya Health for support, privacy requests, and clinical follow-up pathways.'
            );
        }
    }, []);

    return (
        <main className="min-h-screen bg-white">
            <header className="sticky top-0 z-40 border-b border-border bg-white">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                    <HeaderBrand />
                    <div className="flex items-center gap-3">
                        <HeaderDropdown buttonClassName="flex h-10 w-10 items-center justify-center rounded-full text-text-primary/90 transition-colors hover:bg-[#edf2ff]" />
                        <a
                            href="/doctor"
                            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-extrabold text-white transition hover:bg-primary-hover"
                        >
                            Start consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                    </div>
                </div>
            </header>

            <section className="border-b border-border bg-[#f5f7fa]">
                <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-6 md:py-16">
                    <p className="onya-kicker">Contact</p>
                    <h1 className="onya-heading-xl mt-4">Contact Onya Health</h1>
                    <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
                        Reach out for help with your account, service access, or privacy questions. For urgent medical emergencies, call 000.
                    </p>
                </div>
            </section>

            <section className="bg-white">
                <div className="mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-14">
                    <div className="grid gap-5 md:grid-cols-3">
                        {CONTACT_OPTIONS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <article key={item.title} className="onya-tile p-6">
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <Icon size={18} />
                                    </div>
                                    <h2 className="mt-4 text-lg font-extrabold text-text-primary">{item.title}</h2>
                                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.body}</p>
                                    <a
                                        href={item.href}
                                        className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-primary px-4 text-sm font-extrabold text-primary transition hover:bg-[#edf2ff]"
                                    >
                                        {item.actionLabel}
                                    </a>
                                </article>
                            );
                        })}
                    </div>

                    <div className="onya-tile mt-8 p-6">
                        <h2 className="text-xl font-extrabold text-text-primary">Company details</h2>
                        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                            Onya Health Pty Ltd
                            <br />
                            ABN {COMPANY_ABN}
                        </p>
                    </div>
                </div>
            </section>

            <Footer consultHref="/doctor" />
        </main>
    );
}
