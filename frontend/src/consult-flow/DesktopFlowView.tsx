import { useBooking } from './state';
import { Stepper } from '../components/Stepper';
import { StepRenderer } from '../components/FlowSteps';
import { UpsellModal } from '../components/UpsellModal';
import { FAQ } from '../components/FAQ';
import { HowItWorks } from '../components/HowItWorks';
import { Reviews } from '../components/Reviews';
import { LiveActivityToast } from '../components/LiveActivityToast';
import {
    BlogsSection,
    LeadingClinicSection,
    PatientPlatformFocusSection,
    ReadyToSkipWaitingRoomSection,
    UsedByPatientsSection,
} from '../components/LandingExtras';
import { COPY } from './copy';
import { Check, ArrowRight, Clock3, ShieldCheck } from 'lucide-react';
import { Button } from '../components/UI';
import { Footer } from '../components/Footer';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface DesktopFlowViewProps {
    service: ServiceConfig;
}

const DOCTOR_HERO_OVERLAY_CARDS = [
    {
        title: 'Doctor reviewed',
        detail: 'AHPRA-registered doctor assessment.',
        icon: ShieldCheck,
    },
];

function DoctorHeroOverlayCard({
    card,
    className,
}: {
    card: (typeof DOCTOR_HERO_OVERLAY_CARDS)[number];
    className: string;
}) {
    const Icon = card.icon;

    return (
        <article
            className={`absolute rounded-xl border border-slate-200/85 bg-white/96 px-2.5 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.11)] ${className}`}
        >
            <div className="flex items-start gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary/90">
                    <Icon className="h-3 w-3" />
                </span>
                <div>
                    <p className="text-xs font-semibold text-text-primary">{card.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">{card.detail}</p>
                </div>
            </div>
        </article>
    );
}

export default function DesktopFlowView({ service }: DesktopFlowViewProps) {
    const { step, view, startBooking, goHome } = useBooking();
    const isDoctorPage = service.slug === 'doctor';
    const themedStyle = {
        backgroundColor: service.theme.pageBg,
        '--color-primary': service.theme.primary,
        '--color-primary-hover': service.theme.primaryHover,
    } as CSSProperties;

    return (
        <div className="min-h-screen flex flex-col font-sans" style={themedStyle}>
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />

                    <div className="flex items-center gap-3">
                        <HeaderDropdown />
                        {view !== 'booking' && <Button onClick={startBooking} className="px-5 h-10 text-sm">Book now</Button>}
                    </div>
                </div>
            </header>

            {/* HERO SECTION - LANDING PAGE VIEW */}
            {view === 'landing' && (
                <>
                    {isDoctorPage ? (
                        <>
                            <section className="border-b border-border bg-[linear-gradient(135deg,#fff8ef_0%,#fffaf5_45%,#ffffff_100%)] py-14 lg:py-20">
                                <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.18fr)] md:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] xl:gap-14">
                                    <div className="max-w-xl">
                                        <p className="inline-flex rounded-full border border-sunlight-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-bark-600">
                                            Australian doctor-reviewed service
                                        </p>
                                        <h1 className="mt-4 text-5xl leading-[1.04] text-text-primary lg:text-6xl">
                                            Online medical certificate consults.
                                        </h1>
                                        <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-secondary">
                                            Complete a short online form, receive doctor review, and get digital delivery if approved.
                                        </p>

                                        <div className="mt-8 max-w-sm lg:mt-9">
                                            <Button className="h-14 rounded-2xl px-8 text-base font-semibold shadow-lg" onClick={startBooking}>
                                                Start online consult
                                                <ArrowRight className="ml-2" />
                                            </Button>
                                        </div>

                                        <div className="mt-3 inline-flex max-w-md items-start gap-1.5 rounded-md border border-slate-200/70 bg-white/75 px-2.5 py-1.5 text-[13px] text-text-primary">
                                            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                                            <p className="leading-relaxed">
                                                <span className="font-medium">Short form:</span> complete your consult details online in under 2 minutes.
                                            </p>
                                        </div>

                                        <p className="mt-3 text-sm text-text-secondary">
                                            Non-emergency symptoms only. Certificates start from today onward.
                                        </p>
                                    </div>

                                    <div className="relative h-[430px] overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.18)] md:h-[520px] xl:h-[620px]">
                                        <img
                                            src="/Medical Certificate Landing.webp"
                                            alt="Person completing an online medical certificate consult"
                                            className="absolute inset-0 block h-full w-full object-cover object-[68%_50%]"
                                            loading="eager"
                                        />
                                        <div className="pointer-events-none absolute inset-y-0 left-0 w-44 bg-gradient-to-r from-white/22 to-transparent" />
                                        <div className="pointer-events-none absolute inset-0 hidden md:block">
                                            <DoctorHeroOverlayCard
                                                card={DOCTOR_HERO_OVERLAY_CARDS[0]}
                                                className="left-9 top-20 w-36 lg:left-12 lg:top-24 lg:w-40"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div id="how-it-works">
                                <HowItWorks onStartConsult={startBooking} serviceSlug={service.slug} />
                            </div>

                            <UsedByPatientsSection />

                            <PatientPlatformFocusSection onStartConsult={startBooking} />

                            <ReadyToSkipWaitingRoomSection onStartConsult={startBooking} />

                            <div id="faq" className="bg-white py-12 border-t border-border">
                                <FAQ maxItems={6} />
                            </div>
                        </>
                    ) : (
                        <>
                            <section className="relative min-h-[640px] overflow-hidden pb-32 pt-28" style={{ backgroundColor: service.theme.heroBg }}>
                                <div className="absolute inset-0">
                                    <img
                                        src="/HERO.webp"
                                        alt=""
                                        aria-hidden="true"
                                        className="h-full w-full object-cover"
                                        style={{ objectPosition: '58% 76%' }}
                                    />
                                </div>
                                <div className="max-w-7xl mx-auto px-8 relative z-10">
                                    <div className="space-y-8 max-w-2xl">
                                        <h1 className="text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                                            Talk to a {service.providerName} covered by <span className="hero-brand-hover cursor-pointer">Onya Health</span>
                                        </h1>

                                        <p className="text-xl text-white font-semibold leading-relaxed">
                                            {service.heroSubtitle}
                                        </p>

                                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-text-primary shadow-md">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                            </span>
                                            {`${service.providerPlural} online now`}
                                        </div>

                                        <div className="max-w-xs">
                                            <Button className="h-11 px-5 text-sm rounded-xl shadow-lg" onClick={startBooking}>
                                                {service.primaryCta}
                                                <ArrowRight className="ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <UsedByPatientsSection />

                            <div id="how-it-works">
                                <HowItWorks onStartConsult={startBooking} serviceSlug={service.slug} />
                            </div>

                            <Reviews />

                            <BlogsSection onStartConsult={startBooking} />

                            <LeadingClinicSection />

                            <ReadyToSkipWaitingRoomSection onStartConsult={startBooking} />

                            <div id="faq" className="bg-white py-12 border-t border-border">
                                <FAQ />
                            </div>
                        </>
                    )}
                </>
            )}

            {/* BOOKING FLOW VIEW */}
            {view === 'booking' && (
                <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-12 grid grid-cols-12 gap-16 items-start animate-fade-in-up">
                    <div className="col-span-12 lg:col-span-7 space-y-8">
                        <button onClick={goHome} className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-2 mb-4">
                            &larr; Back to Home
                        </button>
                        <Stepper currentStep={step} />
                        <div className="bg-white rounded-3xl shadow-xl border border-border p-10 min-h-[500px] transition-all relative overflow-hidden">
                            <StepRenderer />
                        </div>
                    </div>

                    <div className="hidden lg:col-span-5 lg:block space-y-6 sticky top-28">
                        <div className="bg-white rounded-3xl border border-border overflow-hidden shadow-lg p-8">
                            <h3 className="font-serif text-2xl font-bold text-text-primary mb-4">Why choose Onya?</h3>
                            <ul className="space-y-4">
                                {COPY.hero.trust.map(item => (
                                    <li key={item} className="flex items-center gap-3 text-text-primary font-medium">
                                        <div className="bg-white p-1 rounded-full text-forest-700 shadow-sm">
                                            <Check size={14} strokeWidth={3} />
                                        </div>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <UpsellModal />
            {view === 'landing' && <LiveActivityToast />}
            <Footer onStartConsult={view === 'landing' ? startBooking : undefined} consultHref={`/${service.slug}`} />
        </div>
    )
}
