import { useEffect, useMemo } from 'react';
import { ArrowRight, Clock3, Stethoscope, UserRound } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { MagneticButton } from '../components/lightswind/MagneticButton';

interface HealthTopic {
    slug: string;
    title: string;
    intro: string;
}

type TopicBucket =
    | 'respiratory'
    | 'gastro'
    | 'pain'
    | 'mental'
    | 'womens'
    | 'skin'
    | 'chronic'
    | 'system'
    | 'certificate';

interface BucketGuide {
    label: string;
    banner: string;
    bannerAlt: string;
    whyItMatters: string;
    immediateSteps: string[];
    avoid: string[];
    redFlags: string[];
    prepare: string[];
    documentation: string[];
    faq: Array<{ question: string; answer: string }>;
}

const ARTICLE_AUTHOR = {
    name: 'Onya Health Editorial Team',
    role: 'Clinical Content Team',
};

const CLINICAL_REVIEWER = {
    name: 'AHPRA-registered Onya Doctor',
    role: 'Clinical reviewer',
};

const LAST_UPDATED = 'April 7, 2026';
const SITE_URL = 'https://www.onyahealth.com.au';

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

const HEALTH_TOPIC_SLUG_SET = new Set(HEALTH_TOPICS.map((topic) => topic.slug));

const BUCKET_GUIDES: Record<TopicBucket, BucketGuide> = {
    respiratory: {
        label: 'Respiratory health',
        banner: '/Blue Cells.webp',
        bannerAlt: 'Blue cellular health background',
        whyItMatters:
            'Respiratory symptoms can shift quickly over 24 to 48 hours. Most mild presentations settle with rest and hydration, but breathing changes should always be escalated quickly.',
        immediateSteps: [
            'Track fever, breathing comfort, cough frequency, and fatigue morning and evening.',
            'Hydrate consistently and reduce heavy physical activity while symptoms are active.',
            'Record symptom onset and pattern changes so a doctor can review clear context.',
        ],
        avoid: [
            'Returning to full work or study load too early while symptoms are still escalating.',
            'Ignoring worsening breathlessness, chest discomfort, or persistent fever.',
            'Using ad-hoc symptom notes instead of one clear timeline.',
        ],
        redFlags: [
            'Breathing difficulty, chest pain, confusion, or persistent high fever.',
            'Rapid deterioration after a short period of improvement.',
            'Unable to keep fluids down or maintain basic hydration.',
        ],
        prepare: [
            'Prepare a timeline of symptoms, key measurements, and current medications.',
            'List your immediate concerns: safety, return-to-work timing, and documentation.',
            'Have contact details and availability ready for any follow-up requests.',
        ],
        documentation: [
            'If symptoms affect work or study, ask early about safe timelines for return.',
            'Keep employer or institution communication factual and concise.',
            'Use doctor-reviewed guidance to avoid guesswork around certificate timing.',
        ],
        faq: [
            { question: 'How quickly should respiratory symptoms improve?', answer: 'Many mild cases improve over a few days, but trends matter more than a single timepoint. Worsening symptoms should be reviewed promptly.' },
            { question: 'Can I work while recovering?', answer: 'That depends on symptom severity and role demands. If symptoms affect safety or performance, a doctor-reviewed plan is safer.' },
            { question: 'When should I seek urgent in-person care?', answer: 'Seek urgent care immediately for severe breathing symptoms, chest pain, confusion, or rapid deterioration.' },
        ],
    },
    gastro: {
        label: 'Gastrointestinal health',
        banner: '/Green Cells.webp',
        bannerAlt: 'Green health texture',
        whyItMatters:
            'Gastro symptoms often improve with rest and fluid replacement, but dehydration risk can rise quickly when intake is poor or vomiting persists.',
        immediateSteps: [
            'Use regular small fluid intake and monitor urine output.',
            'Restart simple meals gradually once nausea settles.',
            'Reduce workload for 24 to 48 hours and reassess symptoms.',
        ],
        avoid: [
            'Large meals too early during active nausea.',
            'Ignoring signs of dehydration while symptoms continue.',
            'Skipping symptom tracking and relying on memory only.',
        ],
        redFlags: [
            'Persistent vomiting, severe abdominal pain, or blood in stool/vomit.',
            'Dizziness, very low urine output, or worsening weakness.',
            'Symptoms extending without improvement despite conservative care.',
        ],
        prepare: [
            'Note symptom onset, episodes per day, and hydration tolerance.',
            'Prepare current medication and allergy details.',
            'Document impact on daily tasks and work/study attendance.',
        ],
        documentation: [
            'If illness impacts attendance, request support early rather than after symptoms worsen.',
            'Use a clear symptom timeline for easier documentation review.',
            'Follow clinician guidance on safe return timing.',
        ],
        faq: [
            { question: 'How long does gastro usually last?', answer: 'Many mild episodes settle over one to three days, but duration varies and ongoing dehydration risk should be monitored closely.' },
            { question: 'Should I keep eating normally?', answer: 'Most people do better with gradual reintroduction of simple foods once nausea improves.' },
            { question: 'When do I need urgent care?', answer: 'Seek urgent care for severe pain, blood in stool/vomit, persistent vomiting, or dehydration signs.' },
        ],
    },
    pain: {
        label: 'Pain and mobility',
        banner: '/Red Cells.webp',
        bannerAlt: 'Red cells texture',
        whyItMatters:
            'Pain symptoms are easier to manage when you track patterns, triggers, and functional limits early. This reduces avoidable delays in effective review.',
        immediateSteps: [
            'Reduce aggravating activity and use paced movement where possible.',
            'Track pain score and functional impact each day.',
            'Prioritise sleep support and basic recovery routines.',
        ],
        avoid: [
            'Pushing through severe pain that is reducing movement quality.',
            'Inconsistent symptom tracking that hides deterioration trends.',
            'Returning to full load before stability is confirmed.',
        ],
        redFlags: [
            'Pain with weakness, numbness, or major function loss.',
            'Pain worsening despite conservative management.',
            'Severe pain with inability to perform basic daily tasks.',
        ],
        prepare: [
            'Bring pain timeline, trigger list, and current self-care measures.',
            'Outline what activities are limited and since when.',
            'Prepare goals for safe return to work/study routines.',
        ],
        documentation: [
            'If pain limits function, request early clinical guidance on recovery window.',
            'Use specific functional impacts in your leave communication.',
            'Reassess regularly before returning to demanding tasks.',
        ],
        faq: [
            { question: 'Should I rest completely?', answer: 'Total rest is rarely ideal long-term. Most people need paced, symptom-guided activity with clear limits.' },
            { question: 'How do I explain pain impact for work?', answer: 'Use concrete limits such as sitting, lifting, standing, or concentration capacity rather than broad statements.' },
            { question: 'When is urgent care needed for pain?', answer: 'Urgent care is appropriate when pain is severe, function drops suddenly, or neurological symptoms appear.' },
        ],
    },
    mental: {
        label: 'Mental health and wellbeing',
        banner: '/Blue Bubbles.webp',
        bannerAlt: 'Blue bubbles abstract texture',
        whyItMatters:
            'Mental health symptoms respond best to early support, predictable routines, and practical load reduction. Escalate quickly if safety or basic function is affected.',
        immediateSteps: [
            'Reduce non-essential commitments for several days.',
            'Rebuild routine around sleep, food, hydration, and short movement breaks.',
            'Track distress intensity and function each day.',
        ],
        avoid: [
            'Isolating completely when symptoms are escalating.',
            'Waiting until severe burnout to seek structured support.',
            'Ignoring sleep deterioration for multiple nights.',
        ],
        redFlags: [
            'Escalating panic, inability to function safely, or severe insomnia.',
            'Rapid mental state decline over a short timeframe.',
            'Any concern related to immediate safety.',
        ],
        prepare: [
            'Write down major symptom patterns and current stressors.',
            'List supports you already use and what has not helped.',
            'Prepare clear goals for immediate and short-term support.',
        ],
        documentation: [
            'If symptoms affect attendance or performance, request review early.',
            'Use concise factual language in communication with employers/institutions.',
            'Align leave duration with medical guidance and symptom trend.',
        ],
        faq: [
            { question: 'Is it okay to seek help early?', answer: 'Yes. Early support is usually associated with better outcomes and less disruption.' },
            { question: 'Can I request short-term leave for mental health symptoms?', answer: 'If symptoms impact function, discuss options with a clinician and follow your workplace or institution policy.' },
            { question: 'When should I seek urgent help?', answer: 'Seek urgent or emergency support immediately for any immediate safety concern.' },
        ],
    },
    womens: {
        label: 'Women’s health',
        banner: '/Orange Cells.webp',
        bannerAlt: 'Orange cells texture',
        whyItMatters:
            'Hormonal and reproductive symptoms can vary across cycles and life stages. Pattern tracking improves assessment quality and treatment planning.',
        immediateSteps: [
            'Track timing, pain/intensity, and daily function impact.',
            'Use recovery blocks around sleep and hydration consistency.',
            'Note symptom triggers and what provides partial relief.',
        ],
        avoid: [
            'Normalising severe symptoms that repeatedly disrupt function.',
            'Delaying assessment when pattern severity is increasing.',
            'Returning to full load without symptom stability.',
        ],
        redFlags: [
            'Severe pain preventing basic function.',
            'Rapidly worsening symptoms or heavy abnormal bleeding concerns.',
            'New severe symptoms with no clear baseline pattern.',
        ],
        prepare: [
            'Bring symptom diary covering timing and severity.',
            'Document current medications and relevant history.',
            'List goals around pain control and function restoration.',
        ],
        documentation: [
            'If episodes affect attendance, request review during active periods.',
            'Keep leave communication practical and symptom-focused.',
            'Use clinician guidance for return planning and follow-up timing.',
        ],
        faq: [
            { question: 'Should I wait multiple cycles before seeking help?', answer: 'If symptoms are severe or disrupting daily life, early review is usually better than waiting.' },
            { question: 'Can documentation reflect recurring flares?', answer: 'Yes, when clinically appropriate and supported by clear symptom history.' },
            { question: 'When is urgent care needed?', answer: 'Urgent care is needed for severe pain, significant deterioration, or symptoms that feel unsafe.' },
        ],
    },
    skin: {
        label: 'Skin and allergy concerns',
        banner: '/Red Chemicals.webp',
        bannerAlt: 'Red chemistry texture',
        whyItMatters:
            'Skin symptoms can appear similar across causes, so progression speed and associated symptoms are key. Consistent tracking helps avoid treatment delays.',
        immediateSteps: [
            'Reduce potential irritants and simplify skincare exposure.',
            'Track spread pattern and symptom intensity each day.',
            'Use clear photos over time for comparison.',
        ],
        avoid: [
            'Frequent product switching while symptoms are unstable.',
            'Ignoring rapid spread or systemic symptoms.',
            'Delaying review when symptoms remain unchanged or worsen.',
        ],
        redFlags: [
            'Facial swelling, breathing symptoms, severe pain, or rapid spread.',
            'Rash with fever or feeling systemically unwell.',
            'No improvement after conservative management.',
        ],
        prepare: [
            'List recent exposures, products, and medication changes.',
            'Bring photo timeline if available.',
            'Prepare symptom start date and progression summary.',
        ],
        documentation: [
            'If symptoms affect work or study participation, discuss functional impact early.',
            'Use clinically reviewed timelines for documentation accuracy.',
            'Follow guidance on safe return where symptoms are visible or uncomfortable.',
        ],
        faq: [
            { question: 'Can I monitor skin symptoms at home first?', answer: 'Mild stable symptoms can often be monitored briefly, but worsening or red flags require faster review.' },
            { question: 'Do photos help?', answer: 'Yes. Time-stamped photos can make progression patterns clearer in consultations.' },
            { question: 'When is urgent care needed?', answer: 'Urgent care is needed for breathing issues, facial swelling, severe pain, or rapidly progressive symptoms.' },
        ],
    },
    chronic: {
        label: 'Chronic and metabolic health',
        banner: '/Microscope.webp',
        bannerAlt: 'Microscope clinical image',
        whyItMatters:
            'Longer-term symptom patterns are best managed through trend tracking and regular review. Early response to worsening patterns helps prevent avoidable disruptions.',
        immediateSteps: [
            'Track symptom pattern and function impact over time.',
            'Stabilise routine: sleep, medication adherence, and hydration.',
            'Schedule review when trend shows ongoing deterioration.',
        ],
        avoid: [
            'Waiting for severe deterioration before re-evaluation.',
            'Using inconsistent symptom records.',
            'Ignoring new symptoms that differ from baseline.',
        ],
        redFlags: [
            'Sudden major functional change or severe new symptoms.',
            'Persistent worsening despite adherence to current plan.',
            'Safety concerns related to dizziness, confusion, or severe weakness.',
        ],
        prepare: [
            'Bring baseline trend notes and recent symptom changes.',
            'List medications, doses, and any adherence barriers.',
            'Prepare goals for short-term stabilisation and follow-up.',
        ],
        documentation: [
            'Use objective trend details when discussing leave needs.',
            'Request practical return-to-function guidance during review.',
            'Follow structured follow-up intervals to reduce recurrence risk.',
        ],
        faq: [
            { question: 'How often should chronic symptoms be reviewed?', answer: 'Frequency depends on symptom stability. Worsening trends should be reviewed sooner rather than later.' },
            { question: 'Can online consults help with chronic symptom flare planning?', answer: 'Yes, for non-emergency guidance, planning, and documentation support where appropriate.' },
            { question: 'When should I seek urgent care?', answer: 'Seek urgent care for sudden severe deterioration, concerning new neurological symptoms, or other acute red flags.' },
        ],
    },
    system: {
        label: 'Access and wait-time planning',
        banner: '/Lab Equipment.webp',
        bannerAlt: 'Lab equipment image',
        whyItMatters:
            'Wait-time topics are often about planning around access delays. Early triage decisions and online review can reduce disruption for non-emergency concerns.',
        immediateSteps: [
            'Classify your concern as emergency, urgent, or routine.',
            'Use online pathways for non-emergency symptoms when access delays are long.',
            'Prepare symptom summary before consultation to improve review speed.',
        ],
        avoid: [
            'Treating urgent red-flag symptoms as routine delays.',
            'Waiting without a fallback plan while symptoms worsen.',
            'Delaying documentation planning until deadlines are close.',
        ],
        redFlags: [
            'Any emergency symptom where delay increases risk.',
            'Rapid symptom deterioration while waiting for care.',
            'Safety risk due to inability to function in daily tasks.',
        ],
        prepare: [
            'List key symptoms, onset, and progression timeline.',
            'Prepare key questions and expected outcomes before consult.',
            'Document the immediate impact on work, study, or care obligations.',
        ],
        documentation: [
            'Use early consults to align timelines around leave requirements.',
            'Keep communication concise and policy-aware.',
            'Reassess if wait times change and symptoms escalate.',
        ],
        faq: [
            { question: 'Can online consults reduce wait-related delays?', answer: 'For non-emergency concerns, online review often helps with faster triage, next-step planning, and documentation support.' },
            { question: 'Should I wait for one specific clinic?', answer: 'If symptoms worsen, use the safest available pathway rather than waiting passively.' },
            { question: 'How do I decide emergency vs routine?', answer: 'Use red-flag symptoms and safety impact as the key decision points; escalate immediately when risk is high.' },
        ],
    },
    certificate: {
        label: 'Documentation and certificate planning',
        banner: '/Pipette.webp',
        bannerAlt: 'Pipette medical image',
        whyItMatters:
            'Certificate-related searches are usually time-sensitive. The best outcomes come from clear symptom timelines, prompt review, and realistic expectations around clinical appropriateness.',
        immediateSteps: [
            'Capture symptom onset, severity, and functional impact clearly.',
            'Submit context early to reduce review delays.',
            'Plan practical recovery and return timing conservatively.',
        ],
        avoid: [
            'Vague symptom descriptions without timeline detail.',
            'Last-minute requests without supporting context.',
            'Guessing return-to-work timing without clinical review.',
        ],
        redFlags: [
            'Any severe symptom that needs urgent in-person care.',
            'Symptoms worsening while waiting for documentation.',
            'Safety concerns in high-risk work or study environments.',
        ],
        prepare: [
            'Prepare concise symptom timeline and impact statement.',
            'List key leave dates and practical obligations.',
            'Keep communication factual for policy alignment.',
        ],
        documentation: [
            'Use doctor-reviewed recommendations for leave duration where appropriate.',
            'Keep workplace or institution communication simple and accurate.',
            'Reassess quickly if symptoms persist beyond expected recovery.',
        ],
        faq: [
            { question: 'How quickly can certificate outcomes be reviewed?', answer: 'Review times vary by clinical demand and complexity, but clear submissions generally support faster decisions.' },
            { question: 'Can I request support for work, study, or carers leave?', answer: 'Yes, where clinically appropriate and aligned with your circumstances and policy requirements.' },
            { question: 'What if a certificate is not issued?', answer: 'You should receive practical next-step guidance and safe alternatives based on clinical review.' },
        ],
    },
};

function getTopicBucket(slug: string): TopicBucket {
    if (/flu|covid|throat|cough|sinus|asthma|hay-fever|ear/.test(slug)) return 'respiratory';
    if (/gastro|food-poisoning|uti|stomach|ibs|dehydration/.test(slug)) return 'gastro';
    if (/migraine|headache|back-pain|neck-pain|sciatica|knee|ankle/.test(slug)) return 'pain';
    if (/anxiety|panic|depression|burnout|insomnia/.test(slug)) return 'mental';
    if (/period|endometriosis|pcos|menopause/.test(slug)) return 'womens';
    if (/rash|eczema|hives|conjunctivitis/.test(slug)) return 'skin';
    if (/blood-pressure|iron|thyroid|diabetes|fatigue/.test(slug)) return 'chronic';
    if (/wait-times|brisbane|queensland|australia/.test(slug)) return 'system';
    return 'certificate';
}

function getTopicByPath(pathname: string) {
    const normalized = pathname.toLowerCase().replace(/\/+$/, '');
    if (normalized === '/health') return null;
    let slug = '';
    if (normalized.startsWith('/health/')) {
        slug = normalized.slice('/health/'.length);
    } else if (normalized.startsWith('/')) {
        slug = normalized.slice(1);
    }
    if (!slug) return null;
    if (!HEALTH_TOPIC_SLUG_SET.has(slug)) return null;
    return HEALTH_TOPICS.find((topic) => topic.slug === slug) || null;
}

// eslint-disable-next-line react-refresh/only-export-components -- router uses this pure route helper.
export function isHealthTopicRoute(pathname: string) {
    const normalized = pathname.toLowerCase().replace(/\/+$/, '');
    if (normalized === '/health' || normalized.startsWith('/health/')) {
        if (normalized === '/health') return true;
        const slug = normalized.slice('/health/'.length);
        return HEALTH_TOPIC_SLUG_SET.has(slug);
    }
    if (normalized.startsWith('/')) {
        const slug = normalized.slice(1);
        return HEALTH_TOPIC_SLUG_SET.has(slug);
    }
    return false;
}

function estimateReadTime(topic: HealthTopic) {
    const wordCountEstimate = topic.title.split(' ').length + topic.intro.split(' ').length + 550;
    const minutes = Math.max(4, Math.min(9, Math.round(wordCountEstimate / 180)));
    return `${minutes} min read`;
}

function topicTags(topic: HealthTopic) {
    return [
        topic.title,
        'Doctor-reviewed guidance',
        'Australian health context',
        'Online consult support',
    ];
}

function buildArticleLead(topic: HealthTopic, guide: BucketGuide) {
    return `People searching for "${topic.title}" are usually trying to make a safe decision quickly while keeping work, study, or caring responsibilities on track. This guide uses a practical Australian context with plain-language next steps, warning signs, and consultation preparation advice. ${guide.whyItMatters}`;
}

function buildClinicalContext(topic: HealthTopic) {
    return `In most non-emergency situations, the safest approach is to monitor symptom trends, use conservative self-care early, and escalate review if symptoms are not improving. For ${topic.title.toLowerCase()}, clear timeline notes help clinicians decide what is likely to settle with home management and what needs earlier review.`;
}

function buildPlanningContext() {
    return `If symptoms affect attendance or performance, keep communication concise and factual, then align your next steps with clinician guidance. Onya's online consult flow is designed for non-emergency support with doctor-reviewed outcomes and clear follow-up direction.`;
}

function buildArticleSchema(topic: HealthTopic, guide: BucketGuide, canonicalUrl: string) {
    return {
        '@context': 'https://schema.org',
        '@type': 'MedicalWebPage',
        headline: topic.title,
        description: topic.intro,
        dateModified: '2026-04-07',
        mainEntityOfPage: canonicalUrl,
        author: {
            '@type': 'Organization',
            name: ARTICLE_AUTHOR.name,
        },
        reviewer: {
            '@type': 'Person',
            name: CLINICAL_REVIEWER.name,
            jobTitle: CLINICAL_REVIEWER.role,
        },
        about: guide.label,
        publisher: {
            '@type': 'Organization',
            name: 'Onya Health',
            url: SITE_URL,
        },
    };
}

export default function HealthTopicLandingPage() {
    const pathname = window.location.pathname;
    const currentTopic = useMemo(() => getTopicByPath(pathname), [pathname]);
    const bookingHref = '/doctor?view=booking';
    const canonicalUrl = currentTopic
        ? `${SITE_URL}/health/${currentTopic.slug}`
        : `${SITE_URL}/health`;

    const topicBucket = useMemo(
        () => (currentTopic ? getTopicBucket(currentTopic.slug) : null),
        [currentTopic]
    );

    const guide = useMemo(
        () => (topicBucket ? BUCKET_GUIDES[topicBucket] : null),
        [topicBucket]
    );

    const relatedTopics = useMemo(() => {
        if (!currentTopic) return HEALTH_TOPICS;
        return HEALTH_TOPICS.filter((topic) => topic.slug !== currentTopic.slug).slice(0, 12);
    }, [currentTopic]);

    useEffect(() => {
        const title = currentTopic
            ? `${currentTopic.title} | Onya Health`
            : 'Australian Health Topic Library | Onya Health';
        const description = currentTopic
            ? `${currentTopic.intro} Practical next steps, red flags, and doctor-reviewed online support options.`
            : 'Explore 50 Australian health topics with practical next steps and doctor-reviewed online support pathways.';

        document.title = title;
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute('content', description);
        }

        let canonicalTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
        if (!canonicalTag) {
            canonicalTag = document.createElement('link');
            canonicalTag.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalTag);
        }
        canonicalTag.setAttribute('href', canonicalUrl);
    }, [canonicalUrl, currentTopic]);

    return (
        <div className="min-h-screen flex flex-col font-sans bg-white">
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="border-b border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
                        <p className="inline-flex rounded-full border border-border bg-sunlight-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700">
                            Onya Health Topic Library
                        </p>

                        <h1 className="mt-4 text-3xl md:text-5xl font-serif font-bold leading-tight text-text-primary">
                            {currentTopic?.title || 'Common Australian health topics and practical next steps'}
                        </h1>

                        <p className="mt-4 max-w-4xl text-base md:text-lg leading-relaxed text-text-secondary">
                            {currentTopic?.intro || 'Read practical, consumer-focused article pages on common health concerns, then move to doctor-reviewed support when needed.'}
                        </p>

                        {currentTopic && guide && (
                            <>
                                <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-bark-600">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1">
                                        <UserRound size={14} />
                                        <span>{ARTICLE_AUTHOR.name}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1">
                                        <Stethoscope size={14} />
                                        <span>{CLINICAL_REVIEWER.name}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1">
                                        <Clock3 size={14} />
                                        <span>{estimateReadTime(currentTopic)}</span>
                                    </span>
                                    <span className="text-xs text-bark-500">Updated {LAST_UPDATED}</span>
                                </div>

                                <div className="mt-7 overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
                                    <img
                                        src={guide.banner}
                                        alt={guide.bannerAlt}
                                        className="h-48 w-full object-cover md:h-64"
                                        loading="lazy"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {currentTopic && guide ? (
                    <>
                        <script
                            type="application/ld+json"
                            dangerouslySetInnerHTML={{
                                __html: JSON.stringify(buildArticleSchema(currentTopic, guide, canonicalUrl)),
                            }}
                        />
                        <article className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
                            <section className="rounded-3xl border border-border bg-white p-6 md:p-8 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-bark-600">Category: {guide.label}</p>
                                <h2 className="mt-3 text-2xl md:text-3xl font-serif font-bold text-text-primary">What this means and what to do</h2>
                                <p className="mt-4 text-base leading-relaxed text-text-secondary">{currentTopic.intro}</p>
                                <p className="mt-3 text-base leading-relaxed text-text-secondary">{buildArticleLead(currentTopic, guide)}</p>
                                <p className="mt-3 text-base leading-relaxed text-text-secondary">{buildClinicalContext(currentTopic)}</p>
                                <p className="mt-3 text-base leading-relaxed text-text-secondary">{buildPlanningContext()}</p>

                                <div className="mt-6 flex flex-wrap gap-2">
                                    {topicTags(currentTopic).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border bg-sunlight-50 px-3 py-1 text-xs font-semibold text-bark-700">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </section>

                            <section className="mt-6 grid gap-5 md:grid-cols-2">
                                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-semibold text-text-primary">What to do today</h3>
                                    <ul className="mt-3 space-y-2">
                                        {guide.immediateSteps.map((line) => (
                                            <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-semibold text-text-primary">Common mistakes to avoid</h3>
                                    <ul className="mt-3 space-y-2">
                                        {guide.avoid.map((line) => (
                                            <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </section>

                            <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
                                <h3 className="text-lg font-semibold text-text-primary">When to seek urgent care</h3>
                                <ul className="mt-3 space-y-2">
                                    {guide.redFlags.map((line) => (
                                        <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-4 text-sm text-text-secondary">
                                    If urgent red-flag symptoms are present, seek emergency in-person care immediately.
                                </p>
                            </section>

                            <section className="mt-6 grid gap-5 md:grid-cols-2">
                                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-semibold text-text-primary">How to prepare for a doctor consult</h3>
                                    <ul className="mt-3 space-y-2">
                                        {guide.prepare.map((line) => (
                                            <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-semibold text-text-primary">Certificates and documentation</h3>
                                    <ul className="mt-3 space-y-2">
                                        {guide.documentation.map((line) => (
                                            <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </section>

                            <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
                                <h3 className="text-lg font-semibold text-text-primary">Frequently asked questions</h3>
                                <div className="mt-4 space-y-4">
                                    {guide.faq.map((item) => (
                                        <div key={item.question}>
                                            <p className="font-semibold text-text-primary">{item.question}</p>
                                            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.answer}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
                                <h3 className="text-lg font-semibold text-text-primary">Author and review information</h3>
                                <div className="mt-3 grid gap-4 md:grid-cols-2">
                                    <div className="rounded-xl border border-border bg-sunlight-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-bark-600">Written by</p>
                                        <p className="mt-1 font-semibold text-text-primary">{ARTICLE_AUTHOR.name}</p>
                                        <p className="text-sm text-text-secondary">{ARTICLE_AUTHOR.role}</p>
                                    </div>
                                    <div className="rounded-xl border border-border bg-sunlight-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-bark-600">Clinically reviewed by</p>
                                        <p className="mt-1 font-semibold text-text-primary">{CLINICAL_REVIEWER.name}</p>
                                        <p className="text-sm text-text-secondary">{CLINICAL_REVIEWER.role}</p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-text-secondary">
                                    Last updated {LAST_UPDATED}. This article provides general information only and does not replace emergency medical care.
                                </p>
                            </section>
                        </article>

                        <section className="max-w-7xl mx-auto px-5 md:px-8 pb-10">
                            <div className="rounded-3xl border border-border bg-sunlight-50 p-6 md:p-8">
                                <h2 className="text-2xl md:text-3xl font-serif font-bold text-text-primary">Need a doctor-reviewed next step?</h2>
                                <p className="mt-3 max-w-3xl text-base leading-relaxed text-text-secondary">
                                    Doctors online now. Most certificates can be delivered under 30 minutes when clinically appropriate.
                                </p>
                                <div className="mt-6">
                                    <MagneticButton
                                        variant="primary"
                                        size="lg"
                                        strength={0.46}
                                        radius={112}
                                        className="rounded-2xl px-8 shadow-lg"
                                        onClick={() => {
                                            window.location.href = bookingHref;
                                        }}
                                        aria-label="Talk to a doctor"
                                    >
                                        Talk to a doctor
                                        <ArrowRight size={18} />
                                    </MagneticButton>
                                </div>
                            </div>
                        </section>
                    </>
                ) : (
                    <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                        <h2 className="text-2xl md:text-3xl font-serif font-bold text-text-primary">Health articles for common Australian search questions</h2>
                        <p className="mt-3 text-text-secondary max-w-3xl">
                            Choose any topic below to read a practical article with warning signs, action steps, and a clear doctor-reviewed booking pathway.
                        </p>

                        <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {HEALTH_TOPICS.map((topic) => (
                                <article key={topic.slug} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="font-semibold text-text-primary">{topic.title}</h3>
                                    <p className="mt-2 text-sm text-text-secondary line-clamp-3">{topic.intro}</p>
                                    <div className="mt-4">
                                        <a
                                            href={`/health/${topic.slug}`}
                                            className="inline-flex h-10 items-center justify-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary transition hover:bg-sunlight-50"
                                        >
                                            Read article
                                            <ArrowRight size={15} className="ml-2" />
                                        </a>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                <section className="max-w-7xl mx-auto px-5 md:px-8 pb-12 md:pb-16">
                    <h2 className="text-2xl md:text-3xl font-serif font-bold text-text-primary">Related topic pages</h2>
                    <p className="mt-2 text-text-secondary">Useful reads for related symptom clusters and care questions.</p>
                    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {relatedTopics.slice(0, 12).map((topic) => (
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

            <Footer consultHref={bookingHref} />
        </div>
    );
}
