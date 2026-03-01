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
import { Footer } from './components/Footer';

import { COPY } from './copy';
import { Check, ArrowRight, Grid2x2, X } from 'lucide-react';
import { Button } from './components/UI';
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { ServiceConfig } from './services';

interface MobileViewProps {
    service: ServiceConfig;
}

export default function MobileView({ service }: MobileViewProps) {
    const { step, view, startBooking } = useBooking();
    const [menuOpen, setMenuOpen] = useState(false);
    const themedStyle = {
        backgroundColor: service.theme.pageBg,
        '--color-primary': service.theme.primary,
        '--color-primary-hover': service.theme.primaryHover,
    } as CSSProperties;

    useEffect(() => {
        setMenuOpen(false);
    }, [view]);

    return (
        <div className="min-h-screen flex flex-col font-sans" style={themedStyle}>
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/30 bg-white/30 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 h-14">
                    <a
                        href="/"
                        className="font-serif font-bold text-xl tracking-tight text-text-primary flex items-center gap-2 cursor-pointer"
                        aria-label="Go to home page"
                    >
                        <img src="/logo.png" alt="Onya Health" className="h-12 w-auto object-contain scale-110 origin-left" />
                    </a>
                    <div className="flex items-center gap-1.5">
                        {view === 'landing' && (
                            <div className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white text-black px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span>{service.slug === 'doctor' ? 'Doctors online now' : `${service.providerPlural} online`}</span>
                            </div>
                        )}
                        {view === 'landing' && (
                            <button
                                type="button"
                                onClick={() => setMenuOpen((prev) => !prev)}
                                className="ml-1 h-9 w-9 rounded-lg text-text-primary/90 flex items-center justify-center hover:bg-white/30 transition-colors"
                                aria-label="Toggle navigation"
                                aria-expanded={menuOpen}
                            >
                                {menuOpen ? <X size={18} /> : <Grid2x2 size={18} />}
                            </button>
                        )}
                    </div>
                </div>
                {view === 'landing' && (
                    menuOpen && (
                        <nav className="border-t border-white/40 bg-white/70 backdrop-blur-xl px-4 pb-4">
                            <div className="pt-3 space-y-2">
                                <a
                                    href="/patient-login"
                                    onClick={() => setMenuOpen(false)}
                                    className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary"
                                >
                                    Patient login
                                </a>
                                <a
                                    href="#how-it-works"
                                    onClick={() => setMenuOpen(false)}
                                    className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary"
                                >
                                    How it works
                                </a>
                                <a
                                    href="#faq"
                                    onClick={() => setMenuOpen(false)}
                                    className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary"
                                >
                                    FAQ
                                </a>
                                <Button
                                    fullWidth
                                    className="h-10 text-sm"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        startBooking();
                                    }}
                                >
                                    Book now
                                </Button>
                            </div>
                        </nav>
                    )
                )}
                {view === 'booking' && (
                    <div className="px-4 pb-3 pt-1">
                        <Stepper currentStep={step} />
                    </div>
                )}
            </header>

            {view === 'landing' ? (
                <main className="flex-1">
                    {/* Hero Mobile */}
                    <section className="pb-16 pt-16 text-center relative overflow-hidden" style={{ backgroundColor: service.theme.heroBg }}>
                        <div className="absolute inset-0">
                            <img
                                src="/HERO.png"
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
                        <HowItWorks onStartConsult={startBooking} />
                    </div>

                    <Reviews />

                    <BlogsSection onStartConsult={startBooking} />

                    <LeadingClinicSection />

                    <ReadyToSkipWaitingRoomSection onStartConsult={startBooking} />

                    <div id="faq" className="bg-white py-12 px-4 border-t border-border">
                        <FAQ />
                    </div>
                    <LiveActivityToast mobile />
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
