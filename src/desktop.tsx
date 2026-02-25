import { useBooking } from './state';
import { Stepper } from './components/Stepper';
import { StepRenderer } from './components/FlowSteps';
import { UpsellModal } from './components/UpsellModal';
import { FAQ } from './components/FAQ';
import { HowItWorks } from './components/HowItWorks';
import { Reviews } from './components/Reviews';
import { LiveActivityToast } from './components/LiveActivityToast';
import { COPY } from './copy';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from './components/UI';
import { Sparkles } from './components/Sparkles';
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
            <header className="w-full bg-white/35 backdrop-blur-lg border-b border-white/50 shadow-sm sticky top-0 z-50">
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
                            <a href="#how-it-works" className="text-text-primary hover:text-forest-700 transition-colors font-medium">How it works</a>
                            <a href="#faq" className="text-text-primary hover:text-forest-700 transition-colors font-medium">FAQ</a>
                            <Button onClick={startBooking} className="px-6 h-10 text-sm">Book Appointment</Button>
                        </div>
                    )}
                </div>
            </header>

            {/* HERO SECTION - LANDING PAGE VIEW */}
            {view === 'landing' && (
                <>
                    <section className="pt-16 pb-24 relative overflow-hidden" style={{ backgroundColor: service.theme.heroBg }}>
                        <div
                            className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full blur-3xl opacity-80"
                            style={{ backgroundColor: service.theme.heroTopGlow }}
                        />
                        <div
                            className="absolute -bottom-32 -left-20 h-[360px] w-[360px] rounded-full blur-3xl opacity-80"
                            style={{ backgroundColor: service.theme.heroBottomGlow }}
                        />
                        <Sparkles />
                        <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative z-10">
                            {/* Left Content */}
                            <div className="space-y-8 max-w-xl">
                                <h1 className="text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                                    Talk to a {service.providerName} covered by <span className="italic hero-brand-hover cursor-pointer">Onya Health</span>
                                </h1>

                                <p className="text-xl text-white font-semibold leading-relaxed">
                                    {service.heroSubtitle}
                                </p>

                                <div className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-black px-4 py-2 rounded-full shadow-md">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                    </span>
                                    {service.providerPlural} online now
                                </div>

                                <div className="max-w-sm">
                                    <Button
                                        fullWidth
                                        className="h-14 text-lg rounded-3xl shadow-lg bg-white hover:bg-slate-100 border border-white"
                                        style={{ color: service.theme.heroBg }}
                                        onClick={startBooking}
                                    >
                                        {service.primaryCta}
                                        <ArrowRight className="ml-2" />
                                    </Button>
                                </div>

                            </div>

                            {/* Right Image - Breaking Out */}
                            <div className="relative hidden md:block w-full max-w-[640px] justify-self-end">
                                <div className="relative w-full aspect-[4/3]">
                                    <div
                                        className="absolute inset-0 rounded-[3rem] rotate-3 translate-y-8 z-0"
                                        style={{ backgroundColor: service.theme.heroPanelTint }}
                                    />
                                    <div className="absolute inset-0 z-10">
                                        <img
                                            src="/DOCTORHERO.png"
                                            alt={`Trustworthy ${service.providerName}`}
                                            className="w-full h-full object-cover rounded-[3rem] shadow-2xl object-center hover:scale-[1.02] transition-transform duration-500"
                                            style={{
                                                maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                                                WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)'
                                            }}
                                        />

                                        {/* Floating Badge */}
                                        <div className="absolute left-4 right-4 bottom-10 md:right-auto md:max-w-[430px] bg-white p-3 rounded-2xl shadow-xl flex items-center gap-3 border border-blue-100">
                                            <div className="bg-forest-100 p-2 rounded-full text-forest-700">
                                                <Check size={20} />
                                            </div>
                                            <div className="font-semibold text-text-primary leading-snug">{service.badgeText}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Benefit Banner */}
                    <div className="bg-white border-b border-border py-3 overflow-hidden">
                        <div className="max-w-7xl mx-auto px-6 md:px-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
                            {service.benefitItems.map((text, i) => (
                                <div key={i} className="flex flex-col items-center text-center gap-1.5">
                                    <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                                        <Check size={16} strokeWidth={3} />
                                    </div>
                                    <span className="font-bold text-text-primary text-sm md:text-base leading-tight">{text}</span>
                                </div>
                            ))}
                        </div>
                        </div>
                    </div>

                    {/* As Seen In Section */}
                    <div className="bg-sand-50 py-6 border-b border-border">
                        <div className="max-w-7xl mx-auto px-8 text-center">
                            <p className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.28em] mb-5">As seen in</p>
                            <div className="flex flex-wrap justify-center items-center gap-8 grayscale opacity-60 mix-blend-multiply">
                                {/* Text Placeholders for News Logos using Serif font */}
                                <span className="text-2xl font-serif font-bold italic">The Sydney Morning Herald</span>
                                <span className="text-2xl font-serif font-bold">news<span className="text-text-primary">.com.au</span></span>
                                <span className="text-2xl font-serif font-black tracking-tighter">ABC NEWS</span>
                                <span className="text-2xl font-serif font-bold italic">The Age</span>
                            </div>
                        </div>
                    </div>

                    <div id="how-it-works">
                        <HowItWorks />
                    </div>

                    <Reviews />

                    <div id="faq" className="bg-sunlight-50 py-12">
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
                        <div className="bg-sunlight-50 rounded-3xl border border-sunlight-100 overflow-hidden shadow-lg p-8">
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
                            <div className="mt-8 pt-8 border-t border-sunlight-200">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-full overflow-hidden border-2 border-sunlight-200">
                                        <img src="/doctor.png" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-text-primary">Dr. Wilson</div>
                                        <div className="text-xs text-text-secondary">Chief Medical Officer</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <UpsellModal />
            {view === 'landing' && <LiveActivityToast />}

            <footer className="py-12 bg-white border-t border-border text-center">
                <div className="max-w-7xl mx-auto px-8">
                    <p className="text-bark-500 text-sm">
                        &copy; {new Date().getFullYear()} Onya Health. Not for emergencies.
                    </p>
                </div>
            </footer>
        </div>
    )
}
