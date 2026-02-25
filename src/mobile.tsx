import { useBooking } from './state';
import { Stepper } from './components/Stepper';
import { StepRenderer } from './components/FlowSteps';
import { UpsellModal } from './components/UpsellModal';
import { FAQ } from './components/FAQ';
import { Reviews } from './components/Reviews';
import { LiveActivityToast } from './components/LiveActivityToast';

import { COPY } from './copy';
import { Check, ArrowRight, Menu, X } from 'lucide-react';
import { Button } from './components/UI';
import { Sparkles } from './components/Sparkles';
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ServiceConfig } from './services';

const STEP_IMAGES = ['/REQUEST%20A%20CONSULT.png', '/DOCTOR%20REVIEW.png', '/RELIEF.png'];

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
            <header className="sticky top-0 z-30 bg-white/35 backdrop-blur-lg border-b border-white/50 shadow-sm">
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
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-black px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span>{service.providerPlural} online</span>
                            </div>
                        )}
                        {view === 'landing' && (
                            <button
                                type="button"
                                onClick={() => setMenuOpen((prev) => !prev)}
                                className="ml-1 h-9 w-9 rounded-lg border border-border bg-white/90 text-text-primary flex items-center justify-center"
                                aria-label="Toggle navigation"
                                aria-expanded={menuOpen}
                            >
                                {menuOpen ? <X size={18} /> : <Menu size={18} />}
                            </button>
                        )}
                    </div>
                </div>
                {view === 'landing' && (
                    <AnimatePresence initial={false}>
                        {menuOpen && (
                            <motion.nav
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-white/60 bg-white/75 backdrop-blur-md px-4 pb-4"
                            >
                                <div className="pt-3 space-y-2">
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
                                        Book Appointment
                                    </Button>
                                </div>
                            </motion.nav>
                        )}
                    </AnimatePresence>
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
                    <section className="pt-8 pb-12 px-5 text-center relative overflow-hidden" style={{ backgroundColor: service.theme.heroBg }}>
                        <div
                            className="absolute -top-20 -right-20 h-56 w-56 rounded-full blur-3xl opacity-80"
                            style={{ backgroundColor: service.theme.heroTopGlow }}
                        />
                        <Sparkles />
                        <h1 className="text-4xl font-serif font-bold leading-tight text-white mb-4 z-10 relative">
                            Talk to a {service.providerName} covered by <span className="hero-brand-hover inline-block">Onya Health</span>.
                        </h1>
                        <p className="text-lg text-white font-semibold mb-8 leading-relaxed z-10 relative">
                            {service.heroSubtitle}
                        </p>

                        <div className="mb-6 z-10 relative">
                            <Button
                                fullWidth
                                onClick={startBooking}
                                className="h-14 text-lg rounded-3xl shadow-lg bg-white hover:bg-slate-100 border border-white"
                                style={{ color: service.theme.heroBg }}
                            >
                                {service.mobileCta}
                                <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </div>

                        {/* Doctor Image Mobile */}
                        <div className="relative mx-auto w-full max-w-[360px] aspect-[4/3] mt-4">
                            <div
                                className="absolute inset-0 rounded-[2rem] rotate-3 translate-y-4"
                                style={{ backgroundColor: service.theme.heroPanelTint }}
                            />
                            <img
                                src="/DOCTORHERO.png"
                                className="relative w-full h-full object-cover rounded-[2rem] shadow-lg z-10"
                                alt={`${service.providerName} hero`}
                            />
                        </div>
                    </section>

                    {/* Benefit Banner Mobile */}
                    <div className="bg-white border-b border-border py-2 px-4 overflow-hidden">
                        <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                            {service.benefitItems.map((text, i) => (
                                <div key={i} className="flex flex-col items-center text-center gap-1">
                                    <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                                        <Check size={14} strokeWidth={3} />
                                    </div>
                                    <span className="text-xs font-bold text-text-primary leading-tight">{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* As Seen In Mobile */}
                    <div className="bg-sand-50 py-5 border-b border-border">
                        <div className="px-6 text-center">
                            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.28em] mb-4">As seen in</p>
                            <div className="flex flex-wrap justify-center items-center gap-6 grayscale opacity-60 mix-blend-multiply">
                                <span className="text-xl font-serif font-bold italic">SMH</span>
                                <span className="text-xl font-serif font-bold">news<span className="text-text-primary">.com.au</span></span>
                                <span className="text-xl font-serif font-black tracking-tighter">ABC</span>
                                <span className="text-xl font-serif font-bold italic">The Age</span>
                            </div>
                        </div>
                    </div>

                    <div id="how-it-works" className="px-5 py-12 bg-white">
                        <h2 className="text-2xl font-serif font-bold mb-8 text-center">How it works</h2>
                        <div className="space-y-8">
                            {COPY.howItWorks.steps.map((stepItem, i) => (
                                <div key={stepItem.title} className="text-center">
                                    <img
                                        src={STEP_IMAGES[i]}
                                        alt={`Step ${i + 1}: ${stepItem.title}`}
                                        className="mx-auto w-full max-w-sm rounded-3xl mb-4"
                                    />
                                    <h3 className="font-bold text-lg mb-1">{i + 1}. {stepItem.title}</h3>
                                    <p className="text-text-secondary">{stepItem.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Reviews />

                    <div id="faq" className="bg-sunlight-50 py-12 px-4">
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
                    <div className="bg-sunlight-50 p-4 rounded-xl space-y-3">
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

            <footer className="py-8 text-center text-bark-500 text-xs bg-white border-t border-border">
                &copy; {new Date().getFullYear()} Onya Health. Australia.
            </footer>
        </div>
    );
}
