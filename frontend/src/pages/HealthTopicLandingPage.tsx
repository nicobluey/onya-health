import { useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HowItWorks } from '../components/HowItWorks';
import { LiveActivityToast } from '../components/LiveActivityToast';
import { MagneticButton } from '../components/lightswind/MagneticButton';

interface HealthTopic {
    slug: string;
    title: string;
    intro: string;
}

const HERO_IMAGES = [
    '/HERO.webp',
    '/Medical Certificate Landing.webp',
    '/landing-work-certificate.webp',
    '/landing-university-certificate.webp',
    '/parents.webp',
];

const HOME_HIGHLIGHTS = [
    { title: 'Fast', detail: 'Online assessment' },
    { title: 'Trusted', detail: 'Practitioner reviewed' },
    { title: 'Personalised', detail: 'Care matched to your needs' },
];

const HEALTH_TOPICS: HealthTopic[] = [
    { slug: 'flu-2026-australia-vaccination', title: 'Flu in 2026: vaccination and symptom planning in Australia', intro: 'Understand common flu symptoms, when to isolate, and how to organise practical next steps while you recover.' },
    { slug: 'flu-symptoms-in-adults', title: 'Flu symptoms in adults: what to watch for', intro: 'A clear overview of common adult flu symptoms and when symptoms may need a doctor-reviewed check-in.' },
    { slug: 'covid-booster-2026-australia', title: 'COVID booster planning in Australia for 2026', intro: 'How people are planning boosters, symptom checks, and safe return-to-work decisions in 2026.' },
    { slug: 'sore-throat-fever-and-cough', title: 'Sore throat, fever, and cough: practical next steps', intro: 'What this symptom cluster can look like and how to decide whether home rest or doctor review is the better path.' },
    { slug: 'gastro-and-vomiting-recovery', title: 'Gastro and vomiting recovery guide', intro: 'A straightforward guide to hydration, rest, and follow-up decisions after a short gastrointestinal illness.' },
    { slug: 'food-poisoning-symptoms', title: 'Food poisoning symptoms and recovery timing', intro: 'Understand common patterns of food-borne illness and signs that suggest you should seek clinical advice.' },
    { slug: 'migraine-and-work-absence', title: 'Migraine and work absence support', intro: 'A practical overview for managing migraine episodes and planning communication around short-term leave needs.' },
    { slug: 'headache-not-going-away', title: 'Headache that is not going away: what to do next', intro: 'When a persistent headache should be monitored at home versus escalated to a doctor-reviewed assessment.' },
    { slug: 'sinus-infection-pressure-pain', title: 'Sinus pressure and infection symptoms', intro: 'How to identify common sinus symptom patterns and what people usually do when symptoms linger.' },
    { slug: 'chesty-cough-and-bronchitis', title: 'Chesty cough and bronchitis concerns', intro: 'A simple reference for cough duration, self-care boundaries, and when to move to clinical review.' },
    { slug: 'asthma-flare-up-help', title: 'Asthma flare-up support and monitoring', intro: 'Key considerations for monitoring asthma symptoms and deciding when urgent care is needed.' },
    { slug: 'hay-fever-season-australia', title: 'Hay fever season in Australia: symptom planning', intro: 'How seasonal allergy symptoms can affect daily life and what people commonly search for during peak periods.' },
    { slug: 'pink-eye-conjunctivitis-adults', title: 'Conjunctivitis in adults: common signs and next steps', intro: 'A clear overview of red-eye symptoms and practical care planning for work and daily routines.' },
    { slug: 'ear-infection-in-adults', title: 'Ear infection symptoms in adults', intro: 'Understand common ear pain and pressure symptoms and when those patterns warrant doctor review.' },
    { slug: 'uti-symptoms-and-treatment', title: 'UTI symptoms and treatment pathway overview', intro: 'A practical summary of common urinary symptoms and safe escalation decisions when symptoms progress.' },
    { slug: 'period-pain-and-sick-leave', title: 'Period pain and short-term leave support', intro: 'How people navigate severe period pain episodes and practical options for documentation when needed.' },
    { slug: 'endometriosis-flare-up', title: 'Endometriosis flare-up support guide', intro: 'Planning around symptom flares, routines, and supportive clinical pathways during difficult episodes.' },
    { slug: 'pcos-symptoms-and-support', title: 'PCOS symptoms and support options', intro: 'A practical introduction to common PCOS symptom searches and care planning conversations.' },
    { slug: 'menopause-hot-flushes', title: 'Menopause hot flushes and symptom support', intro: 'Managing common menopause symptoms with practical lifestyle planning and timely medical follow-up.' },
    { slug: 'anxiety-symptoms-and-support', title: 'Anxiety symptoms and where to start', intro: 'A calm, plain-language guide to common anxiety symptoms and first-step support options.' },
    { slug: 'panic-attacks-what-to-do', title: 'Panic attacks: immediate and follow-up actions', intro: 'What people often do during panic episodes and how to plan safer follow-up support.' },
    { slug: 'low-mood-and-depression-signs', title: 'Low mood and depression signs: practical guidance', intro: 'Recognising prolonged low mood patterns and choosing a realistic support path.' },
    { slug: 'burnout-and-stress-leave', title: 'Burnout and stress leave in Australia', intro: 'A practical overview of burnout symptoms and common documentation questions for short-term leave.' },
    { slug: 'trouble-sleeping-insomnia', title: 'Trouble sleeping and insomnia support', intro: 'How persistent sleep issues can affect daily function and when to seek structured clinical input.' },
    { slug: 'fatigue-and-low-energy', title: 'Fatigue and low energy: what people check first', intro: 'A guide to common fatigue-related searches and planning next steps when symptoms persist.' },
    { slug: 'back-pain-from-work', title: 'Back pain from work and daily strain', intro: 'Managing acute back pain episodes and deciding when doctor review is appropriate.' },
    { slug: 'neck-pain-desk-workers', title: 'Neck pain in desk workers: symptom management', intro: 'Common neck strain patterns, activity adjustments, and signs that suggest clinical review.' },
    { slug: 'sciatica-leg-pain', title: 'Sciatica and leg pain support guide', intro: 'Understanding radiating pain patterns and practical escalation pathways for worsening symptoms.' },
    { slug: 'knee-pain-after-running', title: 'Knee pain after running: common pathways', intro: 'When activity-related knee pain can be self-managed and when review is recommended.' },
    { slug: 'ankle-sprain-recovery-time', title: 'Ankle sprain recovery timelines and care', intro: 'A practical outline of swelling, load management, and common return-to-activity decisions.' },
    { slug: 'skin-rash-and-itching', title: 'Skin rash and itching: first-step guide', intro: 'A high-level guide to common rash patterns and when to seek doctor-reviewed advice.' },
    { slug: 'eczema-flare-management', title: 'Eczema flare management in adults', intro: 'Practical symptom management tips and clear points for escalation when flares persist.' },
    { slug: 'hives-and-allergic-reaction', title: 'Hives and allergic reaction monitoring', intro: 'How to monitor symptom progression and identify situations that require urgent care.' },
    { slug: 'stomach-cramps-and-bloating', title: 'Stomach cramps and bloating support', intro: 'Common symptom patterns, self-care boundaries, and when further review is sensible.' },
    { slug: 'ibs-symptoms-guide', title: 'IBS symptom guide and practical planning', intro: 'A practical view of symptom triggers, routine planning, and support pathways for IBS.' },
    { slug: 'dehydration-signs-in-adults', title: 'Dehydration signs in adults', intro: 'A quick guide to spotting dehydration early and acting before symptoms worsen.' },
    { slug: 'fever-in-adults-guide', title: 'Fever in adults: monitoring and escalation', intro: 'How adults can monitor fever symptoms safely and decide when to seek medical review.' },
    { slug: 'high-blood-pressure-symptoms', title: 'High blood pressure symptom questions', intro: 'A plain-language overview of common concerns people search when checking blood pressure symptoms.' },
    { slug: 'low-iron-and-fatigue', title: 'Low iron and fatigue support', intro: 'Understanding low-energy symptom patterns often associated with iron concerns and next-step planning.' },
    { slug: 'thyroid-symptoms-checklist', title: 'Thyroid symptoms checklist overview', intro: 'A practical guide to common thyroid-related symptom searches and follow-up planning.' },
    { slug: 'early-diabetes-symptoms', title: 'Early diabetes symptom questions', intro: 'What people typically look for when early symptoms are concerning and how to plan review.' },
    { slug: 'gp-wait-times-brisbane', title: 'GP wait times in Brisbane: planning faster care', intro: 'How people are navigating appointment delays and using online pathways when timing matters.' },
    { slug: 'hospital-wait-times-southeast-queensland', title: 'Hospital wait times in South East Queensland', intro: 'How patients plan around public wait-time pressure while deciding where and when to seek care.' },
    { slug: 'hospital-wait-times-australia', title: 'Hospital wait times in Australia: practical alternatives', intro: 'A practical overview of common wait-time concerns and alternatives for non-emergency support.' },
    { slug: 'same-day-medical-certificate-online', title: 'Same-day medical certificate online requests', intro: 'What people expect from same-day certificate pathways and how doctor-reviewed outcomes are handled.' },
    { slug: 'medical-certificate-for-university', title: 'Medical certificates for university assessments', intro: 'Student-focused guidance for requesting documentation when illness affects classes or assessment.' },
    { slug: 'carers-leave-certificate-australia', title: 'Carer’s leave certificate pathways in Australia', intro: 'A practical summary of common carer leave documentation searches and digital request pathways.' },
    { slug: 'work-sick-leave-certificate-online', title: 'Work sick leave certificate online options', intro: 'How employees commonly request short-term leave evidence through online doctor-reviewed pathways.' },
    { slug: 'telehealth-doctor-consult-online', title: 'Telehealth doctor consults online in Australia', intro: 'A practical overview of online consult workflows and what to expect from digital care.' },
    { slug: 'where-to-get-medical-certificate-fast', title: 'Where to get a medical certificate quickly', intro: 'What to compare when timing matters: speed, clarity, and safe doctor-reviewed outcomes.' },
];

function pickHeroImage(slug: string) {
    let hash = 0;
    for (let i = 0; i < slug.length; i += 1) {
        hash = (hash * 31 + slug.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % HERO_IMAGES.length;
    return HERO_IMAGES[index];
}

function getTopicByPath(pathname: string) {
    const normalized = pathname.toLowerCase().replace(/\/+$/, '');
    if (normalized === '/health') return null;
    if (!normalized.startsWith('/health/')) return null;
    const slug = normalized.slice('/health/'.length);
    return HEALTH_TOPICS.find((topic) => topic.slug === slug) || null;
}

function topicTags(topic: HealthTopic) {
    return [
        topic.title,
        'Online doctor consult',
        'Medical certificate support',
        'Australia health guidance',
    ];
}

export default function HealthTopicLandingPage() {
    const pathname = window.location.pathname;
    const currentTopic = useMemo(() => getTopicByPath(pathname), [pathname]);
    const bookingHref = '/doctor?view=booking';
    const relatedTopics = useMemo(() => {
        if (!currentTopic) return HEALTH_TOPICS.slice(0, 12);
        return HEALTH_TOPICS.filter((topic) => topic.slug !== currentTopic.slug).slice(0, 12);
    }, [currentTopic]);

    useEffect(() => {
        const title = currentTopic
            ? `${currentTopic.title} | Onya Health`
            : 'Health Topics Australians Search Most | Onya Health';
        const description = currentTopic
            ? `${currentTopic.intro} Doctor-reviewed online consult support from Onya Health.`
            : 'Explore common health topics Australians search and access doctor-reviewed online consult support.';

        document.title = title;
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute('content', description);
        }
    }, [currentTopic]);

    return (
        <div className="min-h-screen flex flex-col font-sans bg-white">
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden pb-12 pt-24 md:min-h-[560px] md:pb-20 md:pt-28">
                    <div className="absolute inset-0">
                        <img
                            src={pickHeroImage((currentTopic?.slug || 'health-topics'))}
                            alt={currentTopic?.title || 'Onya Health topic guide'}
                            className="h-full w-full object-cover object-[58%_44%] md:object-[50%_44%]"
                        />
                        <div className="absolute inset-0 bg-bark-900/28" />
                    </div>

                    <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-8 text-center">
                        <p className="inline-flex rounded-full border border-white/40 bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-text-primary">
                            Health search topic
                        </p>
                        <h1 className="mt-4 text-4xl md:text-6xl font-serif font-bold leading-[1.08] text-white tracking-tight">
                            {currentTopic?.title || 'Common health topics Australians search'}
                        </h1>
                        <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                            {currentTopic?.intro || 'Explore practical guidance for common health concerns, then book doctor-reviewed online support when needed.'}
                        </p>
                        <div className="mt-8 inline-flex">
                            <MagneticButton
                                variant="primary"
                                size="lg"
                                strength={0.46}
                                radius={112}
                                className="rounded-2xl px-8 shadow-lg"
                                onClick={() => {
                                    window.location.href = bookingHref;
                                }}
                                aria-label="Book now"
                            >
                                Book now
                                <ArrowRight size={18} />
                            </MagneticButton>
                        </div>
                        <div className="mt-3 inline-flex items-center rounded-full border border-white/40 bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-text-primary">
                            <span className="relative mr-2 flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            </span>
                            Doctors online now
                        </div>
                        <p className="mx-auto mt-2 max-w-2xl text-xs font-medium text-white/90">
                            Most certificates can be delivered under 30 minutes.
                        </p>
                    </div>
                </section>

                <div className="border-b border-border bg-white py-4">
                    <div className="max-w-7xl mx-auto px-6 md:px-8">
                        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                            <div className="grid grid-cols-3 gap-5">
                                {HOME_HIGHLIGHTS.map((item) => (
                                    <div key={item.title}>
                                        <p className="text-2xl font-bold leading-none text-text-primary">{item.title}</p>
                                        <p className="mt-1 text-xs font-medium text-bark-500">{item.detail}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                                Access care faster through a tailored online experience that connects you with the right support across Australia.
                            </p>
                        </div>
                    </div>
                </div>

                <div id="how-it-works">
                    <HowItWorks serviceSlug="doctor" onStartConsult={() => { window.location.href = bookingHref; }} />
                </div>

                <section className="relative overflow-hidden max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="relative z-10 text-3xl font-serif font-bold text-center text-text-primary mb-6">
                        Support matched to the care you need
                    </h2>
                    <p className="relative z-10 mx-auto mb-8 max-w-3xl text-center text-base text-text-secondary">
                        Browse topic guidance, then start a doctor-reviewed consult when you need personalised support.
                    </p>

                    <div className="relative z-10 rounded-3xl border border-border bg-white p-6 md:p-8 shadow-sm">
                        <h3 className="text-2xl font-serif font-bold text-text-primary">
                            {currentTopic?.title || 'Top searched health topics'}
                        </h3>
                        <p className="mt-3 text-text-secondary leading-relaxed">
                            {currentTopic?.intro || 'Choose a topic and get practical next steps. If symptoms are affecting work, study, or caring responsibilities, you can move to a doctor-reviewed online consult.'}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {(currentTopic ? topicTags(currentTopic) : ['Flu support', 'Hospital wait times', 'Medical certificates', 'Doctor online now']).map((tag) => (
                                <span
                                    key={tag}
                                    className="rounded-full border border-border bg-sunlight-50 px-3 py-1 text-xs font-semibold text-bark-700"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="max-w-7xl mx-auto px-5 md:px-8 pb-12 md:pb-16">
                    <h2 className="text-2xl md:text-3xl font-serif font-bold text-text-primary">Related topic pages</h2>
                    <p className="mt-2 text-text-secondary">50 SEO-focused pages for common Australian health searches.</p>
                    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {relatedTopics.map((topic) => (
                            <article key={topic.slug} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                <h3 className="font-semibold text-text-primary">{topic.title}</h3>
                                <p className="mt-2 text-sm text-text-secondary line-clamp-3">{topic.intro}</p>
                                <div className="mt-4">
                                    <a
                                        href={`/health/${topic.slug}`}
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary transition hover:bg-sunlight-50"
                                    >
                                        Open topic
                                        <ArrowRight size={15} className="ml-2" />
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </main>

            <div className="hidden md:block">
                <LiveActivityToast />
            </div>
            <div className="md:hidden">
                <LiveActivityToast mobile />
            </div>
            <Footer consultHref={bookingHref} />
        </div>
    );
}
