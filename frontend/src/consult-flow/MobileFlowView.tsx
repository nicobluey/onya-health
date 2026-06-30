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
import { Check, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '../components/UI';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface MobileFlowViewProps {
    service: ServiceConfig;
}

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
            <header className="sticky top-0 z-30 border-b border-border bg-white">
                <div className="flex items-center justify-between px-4 h-14">
                    <HeaderBrand compact />
                    <div className="flex items-center gap-1.5">
                        {view === 'landing' && (
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#edf2ff] px-3 py-1.5 text-sm font-extrabold text-text-primary">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16a34a] opacity-70"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16a34a]"></span>
                                </span>
                                <span>{service.slug === 'doctor' ? 'Certificate consults 24/7' : `${service.providerPlural} online`}</span>
                            </div>
                        )}
                        <HeaderDropdown
                            buttonClassName="ml-1 h-9 w-9 rounded-full text-text-primary/90 flex items-center justify-center hover:bg-[#edf2ff] transition-colors"
                            topOffsetClassName="top-14"
                        />
                    </div>
                </div>
                {view === 'booking' && (
                    <div className="px-4 pb-3 pt-1">
                        <Stepper currentStep={step} showPricing={service.slug === 'doctor'} />
                    </div>
                )}
            </header>

            {view === 'landing' ? (
                <main className="flex-1">
                    {isDoctorPage ? (
                        <>
                            <section className="relative min-h-[620px] overflow-hidden border-b border-border bg-[#06142b]">
                                <img
                                    src="/Medical Certificate Landing.webp"
                                    alt="Person completing an online medical certificate consult"
                                    className="absolute inset-0 h-full w-full object-cover object-[68%_50%]"
                                />
                                <div className="absolute inset-0 bg-[#06142b]/48" />
                                <div className="relative flex min-h-[620px] flex-col justify-end px-4 pb-10 pt-16 text-white">
                                    <p className="onya-kicker text-white/82">Australian doctor-reviewed service</p>
                                    <h1 className="mt-4 text-6xl font-extrabold uppercase leading-[0.92] text-white">
                                        Online certificate consults.
                                    </h1>
                                    <p className="mt-5 text-lg font-bold leading-relaxed text-white">
                                        Complete a short online form, receive doctor review, and get digital delivery if approved.
                                    </p>
                                    <div className="mt-6">
                                        <Button fullWidth onClick={startBooking} className="h-14 bg-white text-base text-[#06142b] hover:bg-[#edf2ff]">
                                            Start online consult
                                            <ArrowRight size={20} className="ml-2" />
                                        </Button>
                                    </div>
                                    <div className="mt-4 inline-flex max-w-full items-start gap-2 border border-white/24 bg-white/12 px-3 py-2 text-sm text-white backdrop-blur-sm">
                                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                                        <p className="leading-relaxed">
                                            <span className="font-extrabold">Short form:</span> complete consult details online in under 2 minutes.
                                        </p>
                                    </div>
                                    <p className="mt-3 text-sm font-semibold text-white/82">
                                        Non-emergency symptoms only. Certificates start from today onward.
                                    </p>
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
                    <div className="onya-panel mb-8 p-5 relative overflow-visible">
                        <StepRenderer />
                    </div>
                    {/* Trust Chips Mobile */}
                    <div className="onya-panel p-4 space-y-3">
                        <div className="text-xs font-extrabold uppercase text-primary mb-1">Why Onya?</div>
                        {COPY.hero.trust.map(item => (
                            <div key={item} className="flex items-center gap-2 text-sm font-bold text-text-primary">
                                <Check size={14} className="text-primary" />
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
