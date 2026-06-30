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
import { COPY } from './copy';
import { Check, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '../components/UI';
import { Footer } from '../components/Footer';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface DesktopFlowViewProps {
    service: ServiceConfig;
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
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white">
                <div className="max-w-7xl mx-auto px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />

                    <div className="flex items-center gap-3">
                        <HeaderDropdown />
                        {view !== 'booking' && <Button onClick={startBooking} className="h-10 px-5 text-sm">Book now</Button>}
                    </div>
                </div>
            </header>

            {/* HERO SECTION - LANDING PAGE VIEW */}
            {view === 'landing' && (
                <>
                    {isDoctorPage ? (
                        <>
                            <section className="relative min-h-[720px] overflow-hidden border-b border-border bg-[#06142b]">
                                <img
                                    src="/Medical Certificate Landing.webp"
                                    alt="Person completing an online medical certificate consult"
                                    className="absolute inset-0 h-full w-full object-cover object-[68%_50%]"
                                    loading="eager"
                                />
                                <div className="absolute inset-0 bg-[#06142b]/38" />
                                <div className="relative mx-auto flex min-h-[720px] w-full max-w-7xl items-center px-8 py-16">
                                    <div className="max-w-4xl text-white">
                                        <p className="onya-kicker text-white/82">
                                            Australian doctor-reviewed service
                                        </p>
                                        <h1 className="onya-display mt-5 max-w-4xl text-white">
                                            Online certificate consults.
                                        </h1>
                                        <p className="mt-6 max-w-xl text-xl font-bold leading-relaxed text-white">
                                            Complete a short online form, receive doctor review, and get digital delivery if approved.
                                        </p>

                                        <div className="mt-8 max-w-sm lg:mt-9">
                                            <Button className="h-14 bg-white px-8 text-base text-[#06142b] hover:bg-[#edf2ff]" onClick={startBooking}>
                                                Start online consult
                                                <ArrowRight className="ml-2" />
                                            </Button>
                                        </div>

                                        <div className="mt-4 inline-flex max-w-md items-start gap-2 border border-white/24 bg-white/12 px-3 py-2 text-sm text-white backdrop-blur-sm">
                                            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                                            <p className="leading-relaxed">
                                                <span className="font-extrabold">Short form:</span> complete your consult details online in under 2 minutes.
                                            </p>
                                        </div>

                                        <p className="mt-3 text-sm font-semibold text-white/82">
                                            Non-emergency symptoms only. Certificates start from today onward.
                                        </p>
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
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16a34a] opacity-70"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#16a34a]"></span>
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
                <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-12 grid grid-cols-12 gap-12 items-start animate-fade-in-up">
                    <div className="col-span-12 lg:col-span-7 space-y-8">
                        <button onClick={goHome} className="text-sm font-extrabold text-text-secondary hover:text-text-primary flex items-center gap-2 mb-4">
                            &larr; Back to Home
                        </button>
                        <Stepper currentStep={step} showPricing={service.slug === 'doctor'} />
                        <div className="onya-panel min-h-[500px] p-10 transition-all relative overflow-visible">
                            <StepRenderer />
                        </div>
                    </div>

                    <div className="hidden lg:col-span-5 lg:block space-y-6 sticky top-28">
                        <div className="onya-panel p-8">
                            <h3 className="text-3xl font-extrabold leading-tight text-text-primary mb-5">Why choose Onya?</h3>
                            <ul className="space-y-4">
                                {COPY.hero.trust.map(item => (
                                    <li key={item} className="flex items-center gap-3 text-text-primary font-bold">
                                        <div className="bg-primary p-1 rounded-full text-white">
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
            <Footer onStartConsult={view === 'landing' ? startBooking : undefined} consultHref={`/${service.slug}`} />
        </div>
    )
}
