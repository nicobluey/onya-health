import { useBooking } from './state';
import { Stepper } from './components/Stepper';
import { StepRenderer } from './components/FlowSteps';
import { UpsellModal } from './components/UpsellModal';
import { FAQ } from './components/FAQ';
import { HowItWorks } from './components/HowItWorks';
import { Reviews } from './components/Reviews';
import { LiveActivityToast } from './components/LiveActivityToast';
import {
    BlogsSection,
    LeadingClinicSection,
    ReadyToSkipWaitingRoomSection,
    UsedByPatientsSection,
} from './components/LandingExtras';
import { COPY } from './copy';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from './components/UI';
import { Footer } from './components/Footer';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface DesktopViewProps {
    service: ServiceConfig;
}

export default function DesktopView({ service }: DesktopViewProps) {
    const { step, view, startBooking, goHome } = useBooking();
    const themedStyle = {
        backgroundColor: service.theme.pageBg,
        '--color-primary': service.theme.primary,
        '--color-primary-hover': service.theme.primaryHover,
    } as CSSProperties;

    return (
        <div className="min-h-screen flex flex-col font-sans" style={themedStyle}>
            <header className="sticky top-0 z-50 w-full border-b border-white/30 bg-white/30 shadow-sm backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-8 h-16 flex justify-between items-center">
                    <a
                        href="/"
                        className="font-serif font-bold text-3xl tracking-tight text-text-primary flex items-center gap-3 cursor-pointer"
                        aria-label="Go to home page"
                    >
                        <img src="/logo.png" alt="Onya Health" className="h-14 w-auto object-contain scale-110 origin-left" />
                        {/* Fallback to text if logo fails to load or looks weird */}
                        <span className="sr-only">Onya Health</span>
                    </a>

                    {view === 'booking' ? (
                        <div />
                    ) : (
                        <div className="flex items-center gap-6">
                            <a href="/patient-login" className="text-text-primary hover:text-forest-700 transition-colors font-medium">Patient login</a>
                            <a href="#how-it-works" className="text-text-primary hover:text-forest-700 transition-colors font-medium">How it works</a>
                            <a href="#faq" className="text-text-primary hover:text-forest-700 transition-colors font-medium">FAQ</a>
                            <Button onClick={startBooking} className="px-5 h-10 text-sm">Book now</Button>
                        </div>
                    )}
                </div>
            </header>

            {/* HERO SECTION - LANDING PAGE VIEW */}
            {view === 'landing' && (
                <>
                    <section className="relative min-h-[640px] overflow-hidden pb-32 pt-28" style={{ backgroundColor: service.theme.heroBg }}>
                        <div className="absolute inset-0">
                            <img
                                src="/HERO.png"
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

                                <div className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-black px-4 py-2 rounded-full shadow-md">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                    </span>
                                    {service.slug === 'doctor' ? 'Doctors online now' : `${service.providerPlural} online now`}
                                </div>

                                <div className="max-w-xs">
                                    <Button
                                        className="h-11 px-5 text-sm rounded-xl shadow-lg"
                                        onClick={startBooking}
                                    >
                                        {service.primaryCta}
                                        <ArrowRight className="ml-2" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <UsedByPatientsSection />

                    <div id="how-it-works">
                        <HowItWorks onStartConsult={startBooking} />
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
