import { ArrowRight } from 'lucide-react';
import { Button } from './UI';
import { BLOG_POSTS } from '../blogs/posts';

interface PatientOrg {
    name: string;
    logoSrc: string;
}

interface SectionActionProps {
    onStartConsult?: () => void;
}

interface StatItem {
    value: string;
    label: string;
}

const PATIENT_ORGS: PatientOrg[] = [
    { name: 'BHP', logoSrc: '/logos/bhp.webp' },
    { name: 'Commonwealth Bank', logoSrc: '/logos/commbank.webp' },
    { name: 'NAB', logoSrc: '/logos/nab.webp' },
    { name: 'Telstra', logoSrc: '/logos/telstra.webp' },
    { name: 'Woolworths Group', logoSrc: '/logos/woolworths.webp' },
    { name: 'Qantas', logoSrc: '/logos/qantas.webp' },
    { name: 'University of Sydney', logoSrc: '/logos/usyd.webp' },
    { name: 'University of Melbourne', logoSrc: '/logos/unimelb.webp' },
    { name: 'UNSW', logoSrc: '/logos/unsw.webp' },
    { name: 'Monash University', logoSrc: '/logos/monash.webp' },
    { name: 'University of Queensland', logoSrc: '/logos/uq.webp' },
];

const STATS: StatItem[] = [
    { value: '24/7', label: 'Consult Requests' },
    { value: 'Doctor-reviewed', label: 'Clinical Decisions' },
    { value: 'Australia-wide', label: 'Service Coverage' },
];

const LEADING_POINTS: Array<{ title: string; body: string }> = [
    {
        title: 'AI-powered pre-consult triage',
        body: 'A guided AI flow captures your symptoms and context before handover so clinicians can review faster and with better context.',
    },
    {
        title: 'AHPRA-registered clinicians',
        body: 'Doctors, psychologists, and allied providers deliver care with clear clinical governance and practical follow-up pathways.',
    },
    {
        title: 'Australia-wide provider network',
        body: 'A large and growing clinical network helps patients access care quickly across major cities and regional communities.',
    },
];

const LOGO_TRACK = [...PATIENT_ORGS, ...PATIENT_ORGS];
const FALLBACK_CONSULT_HREF = '/doctor';
const FEATURED_BLOGS = BLOG_POSTS.slice(0, 3);

export function UsedByPatientsSection() {
    return (
        <section className="w-full border-b border-border bg-white">
            <div className="w-full border-b border-border">
                <div className="grid gap-4 px-6 py-4 md:grid-cols-[auto_1fr] md:items-center md:px-8 lg:px-12">
                    <div className="grid grid-cols-3 gap-5">
                        {STATS.map((item) => (
                            <div key={item.label}>
                                <p className="text-3xl font-bold leading-none text-text-primary">{item.value}</p>
                                <p className="mt-1 text-xs font-medium text-bark-500">{item.label}</p>
                            </div>
                        ))}
                    </div>
                    <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                        Request a medical-certificate consult online. Doctor review is completed digitally, with clear outcomes and follow-up guidance where needed.
                    </p>
                </div>
            </div>

            <div className="px-6 py-6 text-center md:px-8 md:py-7 lg:px-12">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-text-secondary">Trusted by patients</p>
                <p className="mt-1.5 text-lg font-medium text-bark-600">Accepted by companies across Australia</p>

                <div className="relative mt-5 overflow-hidden">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />

                    <div className="logo-carousel-track gap-8 pr-8 md:gap-10 md:pr-10">
                        {LOGO_TRACK.map((org, idx) => (
                            <div key={`${org.name}-${idx}`} className="flex h-10 w-[130px] shrink-0 items-center justify-center md:h-12 md:w-[140px]">
                                <img
                                    src={org.logoSrc}
                                    alt={org.name}
                                    className={`object-contain ${
                                        org.name === 'Qantas' ? 'h-8 w-[120px] md:h-9 md:w-[126px]' : 'h-7 w-[106px] md:h-8 md:w-[112px]'
                                    }`}
                                    loading="lazy"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

interface BlogsSectionProps {
    onStartConsult?: () => void;
}

export function BlogsSection({ onStartConsult }: BlogsSectionProps) {
    return (
        <section id="blogs" className="w-full bg-white py-16 md:py-24">
            <div className="w-full overflow-hidden bg-neutral-950 py-14 md:py-20">
                <div className="mb-10 flex items-end justify-between border-b border-neutral-800 px-6 pb-6 md:mb-12 md:px-10 lg:px-14">
                    <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-neutral-500">Blogs</p>
                        <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">From the Onya Blogs</h2>
                    </div>
                    <div className="hidden text-sm text-neutral-500 sm:block">Latest reads from our clinical team</div>
                </div>

                <div>
                    {FEATURED_BLOGS.map((item, idx) => (
                        <div key={item.slug}>
                            <a href={`/blog/${item.slug}`} className="group grid gap-6 px-6 py-8 md:grid-cols-[1fr_1.2fr] md:gap-8 md:px-10 lg:px-14">
                                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-900 md:aspect-[16/10]">
                                    <img src={item.imageSrc} alt={item.title} className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100" loading="lazy" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/60 to-transparent" />
                                </div>

                                <div className="flex flex-col justify-center">
                                    <div className="mb-3 flex items-center gap-3">
                                        <span className="rounded bg-sunlight-400/15 px-2.5 py-1 text-xs font-medium text-sunlight-300">{item.category}</span>
                                        <span className="text-xs text-neutral-500">{item.readTimeMinutes} min read</span>
                                    </div>
                                    <h3 className="mb-3 text-xl font-semibold leading-tight text-white transition-colors group-hover:text-sunlight-200 md:text-2xl">
                                        {item.title}
                                    </h3>
                                    <blockquote className="mb-4 border-l-2 border-neutral-700 pl-4 text-sm leading-relaxed text-neutral-400 italic">
                                        {item.excerpt}
                                    </blockquote>
                                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-sunlight-300 transition-colors group-hover:text-sunlight-200">
                                        Read blog
                                    </span>
                                </div>
                            </a>
                            {idx < FEATURED_BLOGS.length - 1 && <div className="border-t border-neutral-800" />}
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex justify-center px-6 md:mt-10 md:px-10 lg:px-14">
                    {onStartConsult ? (
                        <Button onClick={onStartConsult} className="h-11 px-6 text-sm">
                            Start your consult
                        </Button>
                    ) : (
                        <a
                            href={FALLBACK_CONSULT_HREF}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start your consult
                        </a>
                    )}
                </div>
            </div>
        </section>
    );
}

export function LeadingClinicSection() {
    return (
        <section className="w-full bg-white py-0">
            <div className="w-full bg-neutral-950 px-6 py-14 md:px-10 md:py-16 lg:px-14">
                <div className="max-w-5xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sunlight-300">Why Onya Health</p>
                    <h2 className="mt-3 text-3xl font-bold leading-tight text-white md:text-4xl">
                        What makes Onya Health Australia&apos;s leading telehealth clinic
                    </h2>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
                    {LEADING_POINTS.map((point, idx) => (
                        <article key={point.title} className="rounded-2xl border border-neutral-700 bg-neutral-900/70 p-5">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                                {idx + 1}
                            </span>
                            <h3 className="mt-4 text-xl font-semibold text-white">{point.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-neutral-300">{point.body}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

const PATIENT_PLATFORM_PILLARS: Array<{ title: string; body: string }> = [
    {
        title: 'Know exactly what happens next',
        body: 'Patients get a clear timeline from submission to doctor decision, which reduces uncertainty and keeps progress visible.',
    },
    {
        title: 'Get outcomes faster with less friction',
        body: 'Our backend routes requests efficiently so suitable cases reach clinical review quickly without repeated admin back-and-forth.',
    },
    {
        title: 'Stay protected with secure records',
        body: 'Identity checks, consult data, and documentation are handled through healthcare-focused security workflows.',
    },
];

export function PatientPlatformFocusSection({ onStartConsult }: SectionActionProps) {
    return (
        <section className="w-full border-t border-border bg-surface">
            <div className="mx-auto w-full max-w-7xl px-6 py-14 md:px-8 md:py-16">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Patient-first platform</p>
                <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-text-primary md:text-4xl">
                    Built to get patients from request to resolution, faster
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
                    Onya Health is designed around one goal: better patient outcomes with less waiting and confusion. Every backend workflow
                    is optimised to help patients submit quickly, get reviewed safely, and receive clear next steps.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {PATIENT_PLATFORM_PILLARS.map((pillar) => (
                        <article key={pillar.title} className="rounded-2xl border border-border bg-bg p-5">
                            <h3 className="text-lg font-semibold text-text-primary">{pillar.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{pillar.body}</p>
                        </article>
                    ))}
                </div>

                <div className="mt-8 rounded-2xl border border-border bg-white px-5 py-4 md:px-6">
                    <p className="text-sm leading-relaxed text-text-secondary">
                        When you are unwell, the experience should feel simple. That is why we prioritise speed, clarity, and safe delivery at
                        every step.
                    </p>
                </div>

                <div className="mt-6">
                    {onStartConsult ? (
                        <Button onClick={onStartConsult} className="h-12 px-6 text-sm font-semibold">
                            Start my medical certificate consult
                            <ArrowRight size={16} className="ml-2" />
                        </Button>
                    ) : (
                        <a
                            href={FALLBACK_CONSULT_HREF}
                            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start my medical certificate consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                    )}
                </div>
            </div>
        </section>
    );
}

export function ReadyToSkipWaitingRoomSection({ onStartConsult }: SectionActionProps) {
    return (
        <section className="w-full bg-white py-0">
            <div className="w-full border-t border-neutral-800 bg-neutral-950 px-6 py-14 text-center md:px-10 md:py-16 lg:px-14">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sunlight-300">Ready when you are</p>
                <h2 className="mt-3 text-3xl font-bold leading-tight text-white md:text-4xl">Ready to skip the waiting room?</h2>
                <p className="mx-auto mt-3 max-w-2xl text-base text-neutral-300">
                    Get your medical certificate reviewed and delivered online without clinic queues.
                </p>
                <div className="mt-6 flex justify-center">
                    {onStartConsult ? (
                        <Button onClick={onStartConsult} className="h-14 px-8 text-base font-semibold rounded-2xl shadow-lg">
                            Get medical certificate
                            <ArrowRight size={20} className="ml-2" />
                        </Button>
                    ) : (
                        <a
                            href={FALLBACK_CONSULT_HREF}
                            className="inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-base font-semibold text-white shadow-lg transition hover:bg-primary-hover"
                        >
                            Get medical certificate
                            <ArrowRight size={20} className="ml-2" />
                        </a>
                    )}
                </div>
            </div>
        </section>
    );
}
