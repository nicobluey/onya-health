export type ServiceSlug = 'doctor';

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
        homeReview: 'Guided intake, clear triage, and fast digital outcomes for common certificate requests.',
        homeReviewer: 'Experience highlight',
        placeholderLabel: 'Doctor consult preview',
        benefitItems: [
            'Australian-registered doctor review',
            'Conservative clinical triage',
            '100% online request and delivery',
            'Secure and confidential',
        ],
        theme: {
            pageBg: '#ffffff',
            heroBg: '#4a7fa7',
            heroTopGlow: 'transparent',
            heroBottomGlow: 'transparent',
            heroPanelTint: 'transparent',
            primary: '#1a3d63',
            primaryHover: '#0a1931',
            cardTint: '#ffffff',
        },
    },
};

const ROUTES: Record<string, ServiceSlug> = {
    '/doctor': 'doctor',
};

export function getServiceForPath(pathname: string): ServiceSlug | null {
    const normalized = pathname.endsWith('/') && pathname.length > 1
        ? pathname.slice(0, -1).toLowerCase()
        : pathname.toLowerCase();

    return ROUTES[normalized] ?? null;
}

export const SERVICE_LIST: ServiceConfig[] = [
    SERVICE_CONFIGS.doctor,
];
