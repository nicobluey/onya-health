export type ServiceSlug = 'doctor' | 'nutritionist' | 'psychologist';

export interface ServiceTheme {
    pageBg: string;
    heroBg: string;
    heroTopGlow: string;
    heroBottomGlow: string;
    heroPanelTint: string;
    primary: string;
    primaryHover: string;
    cardTint: string;
}

export interface ServiceConfig {
    slug: ServiceSlug;
    providerName: string;
    providerPlural: string;
    heroSubtitle: string;
    primaryCta: string;
    mobileCta: string;
    badgeText: string;
    homeTitle: string;
    homeBody: string;
    homeReview: string;
    homeReviewer: string;
    placeholderLabel: string;
    benefitItems: string[];
    theme: ServiceTheme;
}

export const SERVICE_CONFIGS: Record<ServiceSlug, ServiceConfig> = {
    doctor: {
        slug: 'doctor',
        providerName: 'doctor',
        providerPlural: 'Doctors',
        heroSubtitle: 'Get a valid medical certificate in minutes. No waiting rooms, 100% online, and reviewed by real Australian GPs.',
        primaryCta: 'Book Medical Certificate',
        mobileCta: 'Book Now',
        badgeText: 'Dr. Wilson has sent you your medical certificate as requested.',
        homeTitle: 'Fast doctor consults from home',
        homeBody: 'Speak with a doctor online in minutes and receive clear clinical guidance with certificates and follow-up support when needed.',
        homeReview: 'Super quick and clear. I had my consult and certificate handled on the same day without leaving home.',
        homeReviewer: 'Alex, Brisbane',
        placeholderLabel: 'Doctor consult preview',
        benefitItems: [
            'AHPRA-Registered Partner Doctors',
            'Top rated health platform',
            '100% online - hassle free',
            'Secure & confidential',
        ],
        theme: {
            pageBg: '#e8f1ff',
            heroBg: '#0f66e8',
            heroTopGlow: 'rgba(255, 255, 255, 0.30)',
            heroBottomGlow: 'rgba(104, 169, 255, 0.50)',
            heroPanelTint: 'rgba(94, 162, 255, 0.55)',
            primary: '#0f66e8',
            primaryHover: '#0a4ebf',
            cardTint: '#e3efff',
        },
    },
    nutritionist: {
        slug: 'nutritionist',
        providerName: 'nutritionist',
        providerPlural: 'Nutritionists',
        heroSubtitle: 'Get personalised, caring nutrition support tailored to your goals. Meet online from home and build healthy habits with practical, understanding guidance.',
        primaryCta: 'Book Nutritionist Appointment',
        mobileCta: 'Book Nutritionist',
        badgeText: 'Your nutritionist has shared your personalised care plan and next steps.',
        homeTitle: 'Personalised nutrition support',
        homeBody: 'Work with a caring nutritionist who understands your routine, food preferences, and goals to build a plan that actually fits your life.',
        homeReview: 'I finally have a realistic plan I can stick to. The support felt personal, not generic.',
        homeReviewer: 'Mia, Melbourne',
        placeholderLabel: 'Nutrition plan preview',
        benefitItems: [
            'Qualified Australian nutrition professionals',
            'Personalised meal and habit plans',
            '100% online consultations',
            'Supportive, judgement-free care',
        ],
        theme: {
            pageBg: '#effaf2',
            heroBg: '#6ca886',
            heroTopGlow: 'rgba(255, 255, 255, 0.35)',
            heroBottomGlow: 'rgba(164, 211, 181, 0.50)',
            heroPanelTint: 'rgba(159, 205, 177, 0.60)',
            primary: '#6ca886',
            primaryHover: '#5a9172',
            cardTint: '#e4f4ea',
        },
    },
    psychologist: {
        slug: 'psychologist',
        providerName: 'psychologist',
        providerPlural: 'Psychologists',
        heroSubtitle: 'Access personalised, professional mental health care without long wait times. Connect online from the comfort of home and get consistent support with regular sessions.',
        primaryCta: 'Book Psychologist Appointment',
        mobileCta: 'Book Psychologist',
        badgeText: 'Your psychologist has prepared your first care plan and follow-up session.',
        homeTitle: 'Professional therapy from home',
        homeBody: 'Connect with a psychologist online for consistent, confidential care that helps you feel supported between sessions and over time.',
        homeReview: 'No long waitlists and I could speak from home. It made getting started so much easier.',
        homeReviewer: 'Sam, Sydney',
        placeholderLabel: 'Psychology session preview',
        benefitItems: [
            'Registered mental health professionals',
            'Regular online support sessions',
            'Care from the comfort of home',
            'Private and confidential',
        ],
        theme: {
            pageBg: '#fff1f8',
            heroBg: '#d48eb0',
            heroTopGlow: 'rgba(255, 255, 255, 0.35)',
            heroBottomGlow: 'rgba(242, 184, 214, 0.45)',
            heroPanelTint: 'rgba(234, 172, 205, 0.58)',
            primary: '#d48eb0',
            primaryHover: '#b67494',
            cardTint: '#fbe8f2',
        },
    },
};

const ROUTES: Record<string, ServiceSlug> = {
    '/doctor': 'doctor',
    '/nutritionist': 'nutritionist',
    '/psychologist': 'psychologist',
};

export function getServiceForPath(pathname: string): ServiceSlug | null {
    const normalized = pathname.endsWith('/') && pathname.length > 1
        ? pathname.slice(0, -1).toLowerCase()
        : pathname.toLowerCase();

    return ROUTES[normalized] ?? null;
}

export const SERVICE_LIST: ServiceConfig[] = [
    SERVICE_CONFIGS.doctor,
    SERVICE_CONFIGS.nutritionist,
    SERVICE_CONFIGS.psychologist,
];
