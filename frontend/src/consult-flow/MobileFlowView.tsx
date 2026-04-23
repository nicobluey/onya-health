import { useBooking } from './state';
import { Stepper } from '../components/Stepper';
import { StepRenderer } from '../components/FlowSteps';
import { UpsellModal } from '../components/UpsellModal';
import { FAQ } from '../components/FAQ';
import { HowItWorks } from '../components/HowItWorks';
import { Reviews } from '../components/Reviews';
import {
    BlogsSection,
    LeadingClinicSection,
    PatientPlatformFocusSection,
    ReadyToSkipWaitingRoomSection,
    UsedByPatientsSection,
} from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

import { COPY } from './copy';
import { Check, ArrowRight, Clock3, ShieldCheck } from 'lucide-react';
import { Button } from '../components/UI';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface MobileFlowViewProps {
    service: ServiceConfig;
}

const DOCTOR_HERO_INFO_CARDS = [
    {
        title: 'Doctor reviewed',
        detail: 'AHPRA-registered doctor assessment.',
        icon: ShieldCheck,
    },
];

export default function MobileFlowView({ service }: MobileFlowViewProps) {
    const { step, view, startBooking } = useBooking();
    const isDoctorPage = service.slug === 'doctor';
    const themedStyle = {
        backgroundColor: service.theme.pageBg,
        '--color-primary': service.theme.primary,
        '--color-primary-hover': service.theme.primaryHover,
    } as CSSProperties;

    return (
        <div className="min-h-screen flex flex-col font-sans" style={themedStyle}>
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-border bg-white shadow-sm">
                <div className="flex items-center justify-between px-4 h-14">
                    <HeaderBrand compact />
                    <div className="flex items-center gap-1.5">
                        {view === 'landing' && (
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-text-primary shadow-sm">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span>{service.slug === 'doctor' ? 'Certificate consults 24/7' : `${service.providerPlural} online`}</span>
                            </div>
                        )}
                        <HeaderDropdown
                            buttonClassName="ml-1 h-9 w-9 rounded-lg text-text-primary/90 flex items-center justify-center hover:bg-sand-75 transition-colors"
                            topOffsetClassName="top-14"
                        />
                    </div>
                </div>
                {view === 'booking' && (
                    <div className="px-4 pb-3 pt-1">
                        <Stepper currentStep={step} />
                    </div>
                )}
            </header>

            {view === 'landing' ? (
                <main className="flex-1">
                    {isDoctorPage ? (
                        <>
                            <section className="border-b border-border bg-[linear-gradient(135deg,#fff8ef_0%,#fffaf5_45%,#ffffff_100%)] px-4 py-11">
                                <div className="mx-auto max-w-xl">
                                    <p className="inline-flex rounded-full border border-sunlight-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-bark-600">
                                        Australian doctor-reviewed service
                                    </p>
                                    <h1 className="mt-4 text-4xl font-serif font-bold leading-tight text-text-primary">
                                        Online medical certificate consults.
                                    </h1>
                                    <p className="mt-4 text-base leading-relaxed text-text-secondary">
                                        Complete a short online form, receive doctor review, and get digital delivery if approved.
                                    </p>

                                    <div className="mt-6">
                                        <Button fullWidth onClick={startBooking} className="h-14 text-lg font-semibold rounded-2xl shadow-lg">
                                            Start online consult
                                            <ArrowRight size={20} className="ml-2" />
                                        </Button>
                                    </div>

                                    <div className="mt-3 inline-flex max-w-full items-start gap-1.5 rounded-md border border-slate-200/70 bg-white/75 px-2.5 py-1.5 text-[13px] text-text-primary">
                                        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                                        <p className="leading-relaxed">
                                            <span className="font-medium">Short form:</span> complete your consult details online in under 2 minutes.
                                        </p>
                                    </div>

                                    <p className="mt-3 text-sm text-text-secondary">
                                        Non-emergency symptoms only. Certificates start from today onward.
                                    </p>

                                    <div className="relative mt-6 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_20px_46px_rgba(15,23,42,0.16)]">
                                        <img
                                            src="/Medical Certificate Landing.webp"
                                            alt="Person completing an online medical certificate consult"
                                            className="h-[290px] w-full object-cover object-[68%_50%]"
                                        />
                                    </div>

                                    <div className="mt-4 grid gap-2.5">
                                        {DOCTOR_HERO_INFO_CARDS.map((card) => {
                                            const Icon = card.icon;
                                            return (
                                                <article
                                                    key={card.title}
                                                    className="rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm"
                                                >
                                                    <div className="flex items-start gap-2.5">
                                                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                            <Icon className="h-3.5 w-3.5" />
                                                        </span>
                                                        <div>
                                                            <p className="text-sm font-semibold text-text-primary">{card.title}</p>
                                                            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{card.detail}</p>
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>

                            <div id="how-it-works">
                                <HowItWorks onStartConsult={startBooking} serviceSlug={service.slug} />
                            </div>

                            <UsedByPatientsSection />

                            <PatientPlatformFocusSection onStartConsult={startBooking} />

                            <ReadyToSkipWaitingRoomSection onStartConsult={startBooking} />

                            <div id="faq" className="bg-white py-12 px-4 border-t border-border">
                                <FAQ maxItems={6} />
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Hero Mobile */}
                            <section className="pb-16 pt-16 text-center relative overflow-hidden" style={{ backgroundColor: service.theme.heroBg }}>
                                <div className="absolute inset-0">
                                    <img
                                        src="/HERO.webp"
                                        alt=""
                                        aria-hidden="true"
                                        className="h-full w-full object-cover"
                                        style={{ objectPosition: '60% 84%' }}
                                    />
                                    <div className="absolute inset-0 bg-bark-900/26" />
                                </div>
                                <div className="relative z-10 px-5">
                                    <h1 className="text-4xl font-serif font-bold leading-tight text-white mb-4">
                                        Talk to a {service.providerName} covered by <span className="hero-brand-hover inline-block">Onya Health</span>.
                                    </h1>
                                    <p className="text-lg text-white font-semibold mb-8 leading-relaxed">
                                        {service.heroSubtitle}
                                    </p>

                                    <div className="mb-6">
                                        <Button
                                            fullWidth
                                            onClick={startBooking}
                                            className="h-11 text-base rounded-xl shadow-lg"
                                        >
                                            {service.mobileCta}
                                            <ArrowRight size={18} className="ml-2" />
                                        </Button>
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

                            <div id="faq" className="bg-white py-12 px-4 border-t border-border">
                                <FAQ />
                            </div>
                        </>
                    )}
                </main>
            ) : (
                <main className="flex-1 px-4 py-6 bg-white">
                    <div className="bg-white rounded-2xl shadow-sm border border-border p-5 mb-8">
                        <StepRenderer />
                    </div>
                    {/* Trust Chips Mobile */}
                    <div className="bg-white p-4 rounded-xl border border-border space-y-3">
                        <div className="text-xs font-bold uppercase text-bark-700 tracking-wider mb-1">Why Onya?</div>
                        {COPY.hero.trust.map(item => (
                            <div key={item} className="flex items-center gap-2 text-sm font-medium text-text-primary">
                                <Check size={14} className="text-forest-700" />
                                {item}
                            </div>
                        ))}
                    </div>
                </main>
            )}

            <UpsellModal />
            <Footer onStartConsult={view === 'landing' ? startBooking : undefined} consultHref={`/${service.slug}`} />
        </div>
    );
}
