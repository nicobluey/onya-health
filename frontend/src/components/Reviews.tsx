import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './UI';
import { useBooking } from '../consult-flow/state';

const REVIEWS = [
    {
        title: 'Structured clinical triage',
        body: 'Consult inputs are organized so clinicians can review key context quickly and make safer telehealth decisions.',
        meta: 'Experience feature · Triage'
    },
    {
        title: 'Streamlined online consult flow',
        body: 'Patients complete one guided path from intake to outcome, with fewer drop-offs and less duplicated admin.',
        meta: 'Experience feature · Workflow'
    },
    {
        title: 'Clear communication checkpoints',
        body: 'The experience keeps patients informed with direct status updates and practical next-step messaging.',
        meta: 'Experience feature · Communication'
    },
    {
        title: 'Built for common leave scenarios',
        body: 'The request pathway is tuned for non-emergency documentation needs with conservative suitability checks.',
        meta: 'Experience feature · Suitability'
    },
    {
        title: 'Faster handover to doctor review',
        body: 'Captured details are prepared for review so clinicians can focus on decisions rather than chasing missing information.',
        meta: 'Experience feature · Efficiency'
    },
    {
        title: 'Professional documentation output',
        body: 'When appropriate, documentation is generated and delivered in a secure, standardized digital format.',
        meta: 'Experience feature · Documentation'
    },
    {
        title: 'Mobile-first experience quality',
        body: 'All key steps are optimized for smaller screens so patients can complete requests without desktop friction.',
        meta: 'Experience feature · Mobile'
    },
    {
        title: 'Designed for operational reliability',
        body: 'The flow keeps request state, audit events, and delivery actions aligned for fewer edge-case failures.',
        meta: 'Experience feature · Reliability'
    }
];

const getCardsPerView = (width: number) => {
    if (width >= 1400) return 4;
    if (width >= 1024) return 3;
    if (width >= 768) return 2;
    return 1;
};

export function Reviews() {
    const { startBooking } = useBooking();
    const totalReviews = REVIEWS.length;
    const [cardsPerView, setCardsPerView] = useState(() => getCardsPerView(window.innerWidth));
    const [activeIndex, setActiveIndex] = useState(0);
    const [slideIndex, setSlideIndex] = useState(() => getCardsPerView(window.innerWidth));
    const [isPaused, setIsPaused] = useState(false);
    const [transitionEnabled, setTransitionEnabled] = useState(true);
    const prevCardsPerView = useRef(cardsPerView);

    const trackReviews = useMemo(
        () => [...REVIEWS.slice(-cardsPerView), ...REVIEWS, ...REVIEWS.slice(0, cardsPerView)],
        [cardsPerView]
    );

    const goNext = useCallback(() => {
        setTransitionEnabled(true);
        setSlideIndex((prev) => prev + 1);
        setActiveIndex((prev) => (prev + 1) % totalReviews);
    }, [totalReviews]);

    const goPrev = useCallback(() => {
        setTransitionEnabled(true);
        setSlideIndex((prev) => prev - 1);
        setActiveIndex((prev) => (prev - 1 + totalReviews) % totalReviews);
    }, [totalReviews]);

    const jumpTo = (index: number) => {
        const normalized = ((index % totalReviews) + totalReviews) % totalReviews;
        setTransitionEnabled(true);
        setSlideIndex(cardsPerView + normalized);
        setActiveIndex(normalized);
    };

    useEffect(() => {
        const onResize = () => {
            setCardsPerView(getCardsPerView(window.innerWidth));
        };

        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (prevCardsPerView.current === cardsPerView) return;

        prevCardsPerView.current = cardsPerView;
        requestAnimationFrame(() => {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView + activeIndex);
            requestAnimationFrame(() => setTransitionEnabled(true));
        });
    }, [cardsPerView, activeIndex]);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(goNext, 4800);
        return () => clearInterval(interval);
    }, [goNext, isPaused]);

    const handleTrackTransitionEnd = () => {
        if (slideIndex >= cardsPerView + totalReviews) {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setTransitionEnabled(true));
            });
        }

        if (slideIndex < cardsPerView) {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView + totalReviews - 1);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setTransitionEnabled(true));
            });
        }
    };

    return (
        <section className="relative overflow-hidden border-y border-border py-16">
            <div className="absolute inset-0">
                <img
                    src="/HERO.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: '60% 77%' }}
                />
            </div>
            <div className="relative mx-auto max-w-7xl px-6 md:px-8">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-white/85">Experience Highlights</p>
                        <h2 className="text-3xl font-serif font-bold text-white md:text-4xl">What patients can expect from this pathway</h2>
                        <p className="mt-3 text-base font-bold text-white md:text-lg">Feature-level outcomes focused on speed, safety, and clarity.</p>
                    </div>
                    <Button onClick={startBooking} className="hidden h-11 px-6 md:inline-flex">
                        Start Consult
                        <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>

                <div
                    className="overflow-hidden"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    <div
                        className="flex -mx-2"
                        style={{
                            transform: `translateX(-${(slideIndex * 100) / cardsPerView}%)`,
                            transition: transitionEnabled ? 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
                        }}
                        onTransitionEnd={handleTrackTransitionEnd}
                    >
                        {trackReviews.map((review, idx) => (
                            <article
                                key={`${review.title}-${review.meta}-${idx}`}
                                className="px-2"
                                style={{ flex: `0 0 ${100 / cardsPerView}%` }}
                            >
                                <div className="h-full bg-white rounded-2xl border border-sand-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                    <h3 className="text-2xl font-bold text-text-primary leading-tight mb-3">{review.title}</h3>
                                    <p className="text-text-secondary leading-relaxed mb-6 text-[15px] min-h-[96px]">{review.body}</p>
                                    <div className="border-t border-sand-200 pt-4">
                                        <p className="font-semibold text-text-primary text-sm">{review.meta}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="mt-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        {Array.from({ length: totalReviews }).map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                aria-label={`Go to highlight ${idx + 1}`}
                                onClick={() => jumpTo(idx)}
                                className={`h-2.5 rounded-full transition-all ${idx === activeIndex ? 'bg-primary w-7' : 'bg-sand-300 w-2.5 hover:bg-sand-400'}`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={goPrev}
                            className="h-12 w-12 rounded-xl border border-border bg-white text-text-primary hover:bg-sand-50 flex items-center justify-center"
                            aria-label="Previous highlights"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            className="h-12 w-12 rounded-xl border border-border bg-white text-text-primary hover:bg-sand-50 flex items-center justify-center"
                            aria-label="Next highlights"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="mt-6 md:hidden">
                    <Button onClick={startBooking} fullWidth className="h-11">
                        Start Consult
                        <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>
            </div>
        </section>
    );
}
