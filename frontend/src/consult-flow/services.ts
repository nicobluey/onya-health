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
        heroSubtitle: 'Request a medical-certificate consult online with clear, doctor-reviewed outcomes.',
        primaryCta: 'Start online consult',
        mobileCta: 'Start consult',
        badgeText: 'Your certificate request has been submitted for doctor review.',
        homeTitle: 'Medical certificate consults online',
        homeBody: 'Submit your symptoms and context online, then receive a doctor-reviewed outcome without clinic waiting rooms.',
        homeReview: 'The steps were clear and I received a fast, professional outcome.',
        homeReviewer: 'Verified patient',
        placeholderLabel: 'Doctor consult preview',
        benefitItems: [
            'Australian-registered doctor review',
            'Conservative clinical triage',
            '100% online request and delivery',
            'Secure and confidential',
        ],
        theme: {
            pageBg: '#ffffff',
            heroBg: '#58a8ff',
            heroTopGlow: 'transparent',
            heroBottomGlow: 'transparent',
            heroPanelTint: 'transparent',
            primary: '#2e8cff',
            primaryHover: '#1f7be6',
            cardTint: '#ffffff',
        },
    },
    nutritionist: {
        slug: 'nutritionist',
        providerName: 'nutritionist',
        providerPlural: 'Nutritionists',
        heroSubtitle: 'Get personalised, caring nutrition support tailored to your goals. Meet online from home and build healthy habits with practical, understanding guidance.',
        primaryCta: 'Book now',
        mobileCta: 'Book now',
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
            pageBg: '#ffffff',
            heroBg: '#58a8ff',
            heroTopGlow: 'transparent',
            heroBottomGlow: 'transparent',
            heroPanelTint: 'transparent',
            primary: '#2e8cff',
            primaryHover: '#1f7be6',
            cardTint: '#ffffff',
        },
    },
    psychologist: {
        slug: 'psychologist',
        providerName: 'psychologist',
        providerPlural: 'Psychologists',
        heroSubtitle: 'Access personalised, professional mental health care without long wait times. Connect online from the comfort of home and get consistent support with regular sessions.',
        primaryCta: 'Book now',
        mobileCta: 'Book now',
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
            pageBg: '#ffffff',
            heroBg: '#58a8ff',
            heroTopGlow: 'transparent',
            heroBottomGlow: 'transparent',
            heroPanelTint: 'transparent',
            primary: '#2e8cff',
            primaryHover: '#1f7be6',
            cardTint: '#ffffff',
        },
    },
};

const ROUTES: Record<string, ServiceSlug> = {
    '/doctor': 'doctor',
    '/doctor/booking': 'doctor',
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
