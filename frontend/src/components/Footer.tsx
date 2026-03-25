import { ArrowRight, Instagram, Linkedin, Mail } from 'lucide-react';
import { Button } from './UI';

interface FooterProps {
    onStartConsult?: () => void;
    consultHref?: string;
}

interface FooterLinkGroup {
    title: string;
    links: Array<{ label: string; href: string }>;
}

const FOOTER_GROUPS: FooterLinkGroup[] = [
    {
        title: 'Services',
        links: [
            { label: 'Medical certificates', href: '/doctor' },
            { label: 'Work certificates', href: '/medical-certificate-work' },
            { label: 'University certificates', href: '/medical-certificate-university' },
            { label: "Carer's leave certificates", href: '/medical-certificate-carers-leave' },
            { label: 'General consults', href: '/doctor' },
            { label: 'Psychology support', href: '/psychologist' },
            { label: 'Nutrition consults', href: '/nutritionist' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About Onya Health', href: '/about' },
            { label: 'Patient login', href: '/patient-login' },
            { label: 'Onya blogs', href: '/blog' },
            { label: 'Contact', href: '/contact' },
        ],
    },
    {
        title: 'Support',
        links: [
            { label: 'FAQ', href: '#faq' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Trust & safety', href: '/trust' },
        ],
    },
];

export function Footer({ onStartConsult, consultHref = '/doctor' }: FooterProps) {
    return (
        <section className="w-full bg-bark-900 text-white">
            <footer className="w-full px-6 pb-8 pt-10 md:px-10 md:pb-10 md:pt-14 lg:px-14">
                <div>
                    <div className="flex flex-col gap-8 border-b border-white/20 pb-10 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <a href="/" className="inline-flex items-center" aria-label="Onya Health home">
                                <img src="/onya-health-logo.png" alt="Onya Health" className="h-10 w-auto brightness-0 invert" />
                            </a>
                            <p className="mt-5 max-w-md text-2xl font-semibold leading-snug text-white">
                                Healthcare that works around your life.
                                <span className="text-white/70"> Get reviewed online without waiting-room delays.</span>
                            </p>
                        </div>

                        <div className="flex flex-col items-start gap-4 lg:items-end">
                            {onStartConsult ? (
                                <Button onClick={onStartConsult} className="h-11 bg-white px-5 text-sm text-bark-900 hover:bg-sand-100">
                                    Start consultation
                                    <ArrowRight size={16} className="ml-2" />
                                </Button>
                            ) : (
                                <a
                                    href={consultHref}
                                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-bark-900 transition hover:bg-sand-100"
                                >
                                    Start consultation
                                    <ArrowRight size={16} className="ml-2" />
                                </a>
                            )}

                            <div className="flex items-center gap-3">
                                <a
                                    href="https://www.instagram.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-bark-900 transition-transform hover:scale-105"
                                    aria-label="Follow Onya Health on Instagram"
                                >
                                    <Instagram size={17} />
                                </a>
                                <a
                                    href="https://www.linkedin.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-bark-900 transition-transform hover:scale-105"
                                    aria-label="Follow Onya Health on LinkedIn"
                                >
                                    <Linkedin size={17} />
                                </a>
                                <a
                                    href="mailto:hello@onyahealth.com.au"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-bark-900 transition-transform hover:scale-105"
                                    aria-label="Email Onya Health support"
                                >
                                    <Mail size={17} />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-10 sm:grid-cols-3 lg:grid-cols-4">
                        {FOOTER_GROUPS.map((group) => (
                            <div key={group.title}>
                                <h3 className="text-xs uppercase tracking-[0.18em] text-white/60">{group.title}</h3>
                                <ul className="mt-4 space-y-2.5">
                                    {group.links.map((link) => (
                                        <li key={link.label}>
                                            <a
                                                href={link.href}
                                                className="text-sm text-white/90 transition-colors hover:text-white hover:underline"
                                            >
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
                            <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Clinic access</p>
                                <p className="mt-2 text-sm text-white/90">
                                    Online consults available across Australia with secure digital delivery by email.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-white/20 pt-6 text-sm text-white/65 md:flex-row md:items-end md:justify-between">
                        <p className="max-w-xl leading-relaxed">
                            We acknowledge Aboriginal and Torres Strait Islander peoples as the Traditional Custodians of Country throughout Australia and pay respect to Elders past and present.
                        </p>
                        <p className="text-left md:text-right">
                            Â© {new Date().getFullYear()} Onya Health Pty Ltd
                            <br />
                            ABN information available on request.
                        </p>
                    </div>
                </div>
            </footer>
        </section>
    );
}
