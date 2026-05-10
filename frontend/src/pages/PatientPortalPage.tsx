import { type CSSProperties, type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock3,
    CreditCard,
    FileText,
    Heart,
    Home,
    MessageCircle,
    Mail,
    Phone,
    Lock,
    Stethoscope,
    Tag,
    UserRound,
} from 'lucide-react';
import { fetchApiJson, getApiBase } from '../lib/api';
import { warmCheckoutPath } from '../lib/performanceWarmup';
import HomeTab from '../patient-portal/home/HomeTab';
import OnboardingFlow from '../weight-loss-reset/components/OnboardingFlow';
import WeightLossResetDashboard from '../weight-loss-reset/components/WeightLossResetDashboard';
import { postProcessGeneratedMealPlan, swapMealInPlan, withRecalculatedTotals } from '../weight-loss-reset/mealPlanning';
import { useWeightLossResetState } from '../weight-loss-reset/useWeightLossResetState';
import {
    type CheckoutSetupContext,
    type ConsultOption,
    type ConsultOptionId,
    type LayoutMode,
    type MainTab,
    type PatientBillingInfo,
    type DietitianProfile,
    type PatientProfile,
    type PortalProfileData,
    type PortalRequest,
    type PortalScreen,
    type RecordTab,
    type TestResultDraft,
    type TestResultEntry,
    type TextEntry,
    CONSULT_OPTIONS,
    MAIN_TABS,
    PORTAL_BACKGROUND_CARDS,
    appendRecordEntry,
    avatarInitials,
    consultTitle,
    createEmptyPortalData,
    createId,
    firstName,
    formatDate,
    isQueuedStatus,
    queueEstimatedMinutes,
    queueStageIndex,
    readPortalProfile,
    sectionCardClassName,
    statusLabel,
} from '../patient-portal/model';
import type { MealPlan, MealType, OnboardingAnswers, Recipe } from '../weight-loss-reset/types';
const MAX_WEIGHT_LOSS_RECIPE_CACHE = 2000;

function isStorageQuotaExceeded(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const value = error as { name?: string; code?: number; message?: string };
    if (value.name === 'QuotaExceededError' || value.code === 22 || value.code === 1014) return true;
    return String(value.message || '').toLowerCase().includes('quota');
}

function safeLocalStorageSetItem(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (errorObject) {
        if (isStorageQuotaExceeded(errorObject)) {
            console.warn(`Storage quota reached for key "${key}". Skipping cache write.`);
            return false;
        }
        console.error(`Failed to write localStorage key "${key}".`, errorObject);
        return false;
    }
}

function isPersistableDataRecipeImage(url: string) {
    return /^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(String(url || '').trim());
}

function isConcreteRecipeImageUrl(url: string) {
    const value = String(url || '').trim();
    if (!value) return false;
    if (isPersistableDataRecipeImage(value)) return true;
    if (value.includes('/api/patient/meal-plan/recipe-image')) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const parsed = new URL(value);
        if (parsed.pathname === '/api/patient/meal-plan/recipe-image') return true;
        if (/\.(?:webp|png|jpe?g|gif|avif)$/i.test(parsed.pathname.toLowerCase())) return true;
        const format = String(parsed.searchParams.get('fm') || parsed.searchParams.get('format') || '').trim().toLowerCase();
        if (format && /^(?:webp|png|jpe?g|gif|avif)$/.test(format)) return true;
    } catch {
        return false;
    }
    return /(?:^|[?&])(fm|format)=(?:webp|png|jpe?g|gif|avif)(?:&|$)/i.test(value);
}

function isValidWeightLossRecipe(entry: unknown): entry is Recipe {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Recipe;
    return typeof value.id === 'string' && typeof value.title === 'string' && Array.isArray(value.ingredients);
}

function resolveRecipeImageCandidate(recipe: Recipe) {
    const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
        ? (recipe.source as Record<string, unknown>)
        : {};
    return String(recipe?.imageUrl || source.image_url || source.imageUrl || '').trim();
}

function collectPlannedRecipeIds(mealPlan: MealPlan | null) {
    if (!mealPlan || !Array.isArray(mealPlan.days)) return [] as string[];
    const ids = mealPlan.days.flatMap((day) =>
        [day?.meals?.breakfast, day?.meals?.lunch, day?.meals?.dinner, ...(Array.isArray(day?.meals?.snacks) ? day.meals.snacks : [])]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean),
    );
    return [...new Set(ids)];
}

function mergeRecipeCatalog(existing: Recipe[], incoming: Recipe[]): Recipe[] {
    const merged = new Map<string, Recipe>();
    const mergeRecipe = (baseRecipe: Recipe, nextRecipe: Recipe): Recipe => {
        const baseSource =
            baseRecipe?.source && typeof baseRecipe.source === 'object' && !Array.isArray(baseRecipe.source)
                ? (baseRecipe.source as Record<string, unknown>)
                : {};
        const nextSource =
            nextRecipe?.source && typeof nextRecipe.source === 'object' && !Array.isArray(nextRecipe.source)
                ? (nextRecipe.source as Record<string, unknown>)
                : {};

        const baseImage = String(baseRecipe?.imageUrl || baseSource.image_url || baseSource.imageUrl || '').trim();
        const nextImage = String(nextRecipe?.imageUrl || nextSource.image_url || nextSource.imageUrl || '').trim();
        const chosenImage = isConcreteRecipeImageUrl(nextImage)
            ? nextImage
            : isConcreteRecipeImageUrl(baseImage)
              ? baseImage
              : nextImage || baseImage;

        const mergedSource: Record<string, unknown> = {
            ...baseSource,
            ...nextSource,
        };

        if (chosenImage) {
            mergedSource.image_url = chosenImage;
            mergedSource.imageUrl = chosenImage;
        }

        return {
            ...baseRecipe,
            ...nextRecipe,
            imageUrl: chosenImage || undefined,
            calories: nextRecipe.calories ?? baseRecipe.calories,
            protein: nextRecipe.protein ?? baseRecipe.protein,
            carbs: nextRecipe.carbs ?? baseRecipe.carbs,
            fat: nextRecipe.fat ?? baseRecipe.fat,
            prepTimeMinutes: nextRecipe.prepTimeMinutes ?? baseRecipe.prepTimeMinutes,
            cookTimeMinutes: nextRecipe.cookTimeMinutes ?? baseRecipe.cookTimeMinutes,
            totalTimeMinutes: nextRecipe.totalTimeMinutes ?? baseRecipe.totalTimeMinutes,
            serves: nextRecipe.serves ?? baseRecipe.serves,
            source: mergedSource,
        };
    };

    for (const recipe of existing) {
        if (!isValidWeightLossRecipe(recipe)) continue;
        merged.set(recipe.id, recipe);
    }
    for (const recipe of incoming) {
        if (!isValidWeightLossRecipe(recipe)) continue;
        const current = merged.get(recipe.id);
        if (!current) {
            merged.set(recipe.id, recipe);
            continue;
        }
        merged.set(recipe.id, mergeRecipe(current, recipe));
    }
    const ordered = Array.from(merged.values()).sort((a, b) => a.title.localeCompare(b.title));
    if (ordered.length <= MAX_WEIGHT_LOSS_RECIPE_CACHE) return ordered;
    return ordered.slice(ordered.length - MAX_WEIGHT_LOSS_RECIPE_CACHE);
}

function PortalBackdropArt() {
    return (
        <>
            {PORTAL_BACKGROUND_CARDS.map((card, index) => (
                <div
                    key={`${card.src}-${index}`}
                    className={`science-float-card pointer-events-none ${card.reverse ? 'is-reverse' : ''} ${card.className}`}
                    aria-hidden="true"
                    style={
                        {
                            '--science-tilt': card.tilt,
                            '--drift-duration': card.duration,
                            '--drift-delay': card.delay,
                        } as CSSProperties
                    }
                >
                    <img src={card.src} alt="" className="h-full w-full object-cover" />
                </div>
            ))}
        </>
    );
}

function normalizeBillingInfo(input: unknown): PatientBillingInfo | null {
    if (!input || typeof input !== 'object') return null;
    const value = input as Record<string, unknown>;

    return {
        hasActiveUnlimited: Boolean(value.hasActiveUnlimited),
        plan: String(value.plan || 'pay_as_you_go'),
        subscriptionStatus: String(value.subscriptionStatus || 'none'),
        stripeCustomerId: String(value.stripeCustomerId || ''),
        stripeSubscriptionId: String(value.stripeSubscriptionId || ''),
        cancelAtPeriodEnd: Boolean(value.cancelAtPeriodEnd),
        currentPeriodEnd: value.currentPeriodEnd ? String(value.currentPeriodEnd) : null,
        canManageSubscription: Boolean(value.canManageSubscription),
    };
}

function normalizePatientProfile(input: unknown, fallbackEmail = ''): PatientProfile {
    const safeFallbackEmail = String(fallbackEmail || '').trim().toLowerCase();
    if (!input || typeof input !== 'object') {
        return {
            fullName: 'Patient',
            firstName: '',
            lastName: '',
            email: safeFallbackEmail,
            dob: '',
            phone: '',
            address: '',
            profilePhotoPath: '',
            profilePhotoUrl: '',
        };
    }

    const value = input as Record<string, unknown>;
    const firstNameValue = String(value.firstName || '').trim();
    const lastNameValue = String(value.lastName || '').trim();
    const combinedName = [firstNameValue, lastNameValue].filter(Boolean).join(' ').trim();
    const fullNameValue = String(value.fullName || combinedName || '').trim() || 'Patient';
    const [derivedFirstName, ...derivedLastName] = fullNameValue.split(/\s+/).filter(Boolean);

    return {
        fullName: fullNameValue,
        firstName: firstNameValue || derivedFirstName || '',
        lastName: lastNameValue || derivedLastName.join(' ') || '',
        email: String(value.email || safeFallbackEmail || '').trim().toLowerCase(),
        dob: String(value.dob || '').trim(),
        phone: String(value.phone || '').trim(),
        address: String(value.address || '').trim(),
        profilePhotoPath: String(value.profilePhotoPath || '').trim(),
        profilePhotoUrl: String(value.profilePhotoUrl || '').trim(),
    };
}

function normalizeDietitianProfile(input: unknown): DietitianProfile | null {
    if (!input || typeof input !== 'object') return null;
    const value = input as Record<string, unknown>;
    const id = String(value.id || '').trim();
    const fullName = String(value.fullName || '').trim();
    if (!id || !fullName) return null;

    return {
        id,
        fullName,
        phone: String(value.phone || '').trim(),
        credentials: String(value.credentials || '').trim(),
        bio: String(value.bio || '').trim(),
        profilePhotoPath: String(value.profilePhotoPath || '').trim(),
        profilePhotoUrl: String(value.profilePhotoUrl || '').trim(),
    };
}

function DesktopSidebar({
    activeTab,
    onTabChange,
    patient,
    onProfileClick,
}: {
    activeTab: MainTab;
    onTabChange: (next: MainTab) => void;
    patient: PatientProfile;
    onProfileClick: () => void;
}) {
    return (
        <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-[#cbd5e1] bg-[#f8fbff]/95 backdrop-blur">
            <div className="px-5 pt-5">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.webp" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#475569]">Platform</p>
                <nav className="mt-3 space-y-1">
                    {[
                        { id: 'home' as const, label: 'Home', icon: Home },
                        { id: 'consult' as const, label: 'Consult', icon: Stethoscope },
                        { id: 'account' as const, label: 'Account', icon: UserRound },
                    ].map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onTabChange(item.id)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                                    active
                                        ? 'bg-[#0f172a] text-white'
                                        : 'text-[#334155] hover:bg-[#f1f8ff] hover:text-[#020617]'
                                }`}
                            >
                                <Icon size={16} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="mt-auto border-t border-[#cbd5e1] p-4">
                <button
                    type="button"
                    onClick={onProfileClick}
                    className="w-full rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3 text-left transition hover:border-[#b7dcff]"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbeeff] text-sm font-semibold text-[#2e8cff]">
                            {avatarInitials(patient.fullName)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#020617]">{patient.fullName || 'Patient'}</p>
                            <p className="truncate text-xs text-[#475569]">{patient.email || 'No email'}</p>
                        </div>
                    </div>
                </button>
            </div>
        </aside>
    );
}

function MobileTopBar({ activeTab }: { activeTab: MainTab }) {
    const label = activeTab.slice(0, 1).toUpperCase() + activeTab.slice(1);

    return (
        <header className="sticky top-0 z-40 border-b border-[#cbd5e1] bg-[#f8fbff]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-4">
                <a href="/" className="inline-flex items-center" aria-label="Go to home page">
                    <img src="/logo.webp" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>
                <span className="rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#334155]">
                    {label}
                </span>
            </div>
        </header>
    );
}

function MobileBottomNav({
    activeTab,
    onTabChange,
}: {
    activeTab: MainTab;
    onTabChange: (next: MainTab) => void;
}) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#cbd5e1] bg-[#f8fbff]">
            <div className="mx-auto flex h-16 w-full max-w-[740px] items-center px-1">
                {[
                    { id: 'home' as const, label: 'Home', icon: Home },
                    { id: 'consult' as const, label: 'Consult', icon: Stethoscope },
                    { id: 'account' as const, label: 'Account', icon: UserRound },
                ].map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onTabChange(item.id)}
                            className={`flex flex-1 flex-col items-center justify-center gap-1.5 py-2 ${
                                active ? 'text-[#2e8cff]' : 'text-[#475569]'
                            }`}
                        >
                            <Icon size={20} />
                            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function QueueBanner({
    request,
    onTap,
}: {
    request: PortalRequest;
    onTap: () => void;
}) {
    const stageIndex = queueStageIndex(request.status);
    const etaMinutes = queueEstimatedMinutes(request);
    const queueTitle = stageIndex >= 2 ? 'Doctor review in progress' : 'Payment confirmation in progress';
    const queueSubtitle =
        stageIndex >= 2 ? `Estimated time remaining: ${etaMinutes} min` : 'This usually updates within 1-2 minutes';

    return (
        <button
            type="button"
            onClick={onTap}
            className="fixed bottom-16 left-3 right-3 z-40 overflow-hidden rounded-2xl border border-[#b7dcff] bg-white px-4 py-3 text-left shadow-[0_24px_40px_-30px_rgba(15,23,42,0.55)]"
        >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#2e8cff]" aria-hidden="true" />
            <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbeeff] text-[#2e8cff]">
                    <Heart size={18} className="fill-current stroke-current" />
                    <span className="portal-live-dot absolute -right-0.5 -top-0.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#020617]">{queueTitle}</p>
                    <p className="text-xs text-[#475569]">{queueSubtitle}</p>
                </div>
                <ChevronRight size={18} className="ml-auto text-[#64748b]" />
            </div>
        </button>
    );
}

function ConsultTab({
    onSelectOption,
    billing,
}: {
    onSelectOption: (optionId: ConsultOptionId) => void;
    billing: PatientBillingInfo | null;
}) {
    return (
        <section className="space-y-5">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Book a consultation</h1>
                <p className="mt-1 text-base text-[#475569]">Choose a service to continue. Live services open instantly, others are previewable.</p>
            </header>

            <article className="rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef5ff] text-[#2e8cff]">
                        <CreditCard size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#020617]">
                            {billing?.hasActiveUnlimited
                                ? 'Unlimited plan active'
                                : 'Pay-as-you-go or unlimited available'}
                        </p>
                        <p className="mt-1 text-sm text-[#475569]">
                            {billing?.hasActiveUnlimited
                                ? 'Your next medical certificate request will go straight to doctor review with no checkout screen.'
                                : 'Start a medical certificate request and you can choose one-off payment or unlimited at checkout.'}
                        </p>
                    </div>
                </div>
            </article>

            <div className="grid gap-3 md:grid-cols-2">
                {CONSULT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const live = option.status === 'available';
                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelectOption(option.id)}
                            onMouseEnter={option.id === 'medical-certificate' ? warmCheckoutPath : undefined}
                            onFocus={option.id === 'medical-certificate' ? warmCheckoutPath : undefined}
                            className={`${sectionCardClassName(
                                'group p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_26px_50px_-36px_rgba(15,23,42,0.46)]'
                            )} ${live ? 'border-[#b7dcff] bg-[#f8fbff]' : ''}`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                        live ? 'bg-[#dbeeff] text-[#2e8cff]' : 'bg-[#f1f5f9] text-[#64748b]'
                                    }`}
                                >
                                    <Icon size={18} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-[#020617]">{option.title}</h2>
                                    <p className="mt-1 text-sm text-[#475569]">{option.subtitle}</p>
                                </div>
                                <span
                                    className={`ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                        live ? 'bg-[#dbeeff] text-[#165fad]' : 'bg-[#e2e8f0] text-[#475569]'
                                    }`}
                                >
                                    {option.badge}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                                    {live ? 'Available now' : 'Preview available'}
                                </p>
                                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#2e8cff] transition group-hover:gap-1.5">
                                    {live ? 'Continue' : 'View details'}
                                    <ChevronRight size={15} />
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function ConsultComingSoonScreen({
    option,
    onBack,
}: {
    option: ConsultOption | null;
    onBack: () => void;
}) {
    return (
        <section className="space-y-5">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back to consult options
            </button>

            <article className="overflow-hidden rounded-3xl border border-[#cbd5e1] bg-white">
                <div className="border-b border-[#dbeeff] bg-[#f8fbff] px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Coming soon</p>
                    <h1 className="mt-1 text-2xl font-semibold text-[#020617]">{option?.title ?? 'Service'}</h1>
                </div>
                <div className="p-5">
                    <p className="text-sm leading-relaxed text-[#475569]">
                        {option?.subtitle ?? 'This service is being prepared.'} We&apos;re currently finalizing workflows and clinician availability.
                    </p>
                    <div className="mt-4 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">What happens next</p>
                        <p className="mt-1 text-sm text-[#475569]">
                            Keep using live services today. This option will automatically appear as available once launched.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onBack}
                        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white"
                    >
                        Got it
                        <ChevronRight size={16} />
                    </button>
                </div>
            </article>
        </section>
    );
}

function AccountTab({
    patient,
    latestRequest,
    billing,
    data,
    onDownloadCertificate,
    onManageBilling,
    onCancelSubscription,
    billingActionState,
    billingError,
    onSaveProfile,
}: {
    patient: PatientProfile;
    latestRequest: PortalRequest | null;
    billing: PatientBillingInfo | null;
    data: PortalProfileData;
    onDownloadCertificate: (request: PortalRequest) => void;
    onManageBilling: () => void;
    onCancelSubscription: () => void;
    billingActionState: 'idle' | 'opening_portal' | 'cancelling';
    billingError: string;
    onSaveProfile: (payload: {
        fullName: string;
        dob: string;
        phone: string;
        address: string;
        profilePhotoDataUrl?: string;
    }) => Promise<void>;
}) {
    const [fullName, setFullName] = useState(patient.fullName || '');
    const [dob, setDob] = useState(patient.dob || '');
    const [phone, setPhone] = useState(patient.phone || '');
    const [address, setAddress] = useState(patient.address || '');
    const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState('');
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState(patient.profilePhotoUrl || '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileSaveError, setProfileSaveError] = useState('');
    const [profileSaveSuccess, setProfileSaveSuccess] = useState('');

    useEffect(() => {
        setFullName(patient.fullName || '');
        setDob(patient.dob || '');
        setPhone(patient.phone || '');
        setAddress(patient.address || '');
        setPhotoPreviewUrl(patient.profilePhotoUrl || '');
        setProfilePhotoDataUrl('');
    }, [patient.address, patient.dob, patient.fullName, patient.phone, patient.profilePhotoUrl]);

    const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setProfileSaveError('Please choose a valid image file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl) return;
            setProfilePhotoDataUrl(dataUrl);
            setPhotoPreviewUrl(dataUrl);
            setProfileSaveError('');
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async (event: FormEvent) => {
        event.preventDefault();
        setProfileSaveError('');
        setProfileSaveSuccess('');
        if (!fullName.trim()) {
            setProfileSaveError('Full name is required.');
            return;
        }
        setSavingProfile(true);
        try {
            await onSaveProfile({
                fullName: fullName.trim(),
                dob: dob.trim(),
                phone: phone.trim(),
                address: address.trim(),
                profilePhotoDataUrl: profilePhotoDataUrl || undefined,
            });
            setProfileSaveSuccess('Account settings updated.');
            setProfilePhotoDataUrl('');
        } catch (errorObject) {
            setProfileSaveError(errorObject instanceof Error ? errorObject.message : 'Unable to save account settings.');
        } finally {
            setSavingProfile(false);
        }
    };

    const stats = [
        { label: 'Medical history', value: data.medicalHistory.length },
        { label: 'Lifestyle notes', value: data.lifestyleNotes.length },
        { label: 'Test results', value: data.testResults.length },
    ];

    return (
        <section className="space-y-5">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Account</h1>
                <p className="mt-1 text-base text-[#475569]">Edit your details and manage profile activity</p>
            </header>

            <section className={sectionCardClassName()}>
                <div className="border-b border-[#dbeeff] px-5 py-4">
                    <h2 className="text-lg font-semibold text-[#020617]">Account Settings</h2>
                </div>
                <form className="space-y-4 p-4" onSubmit={handleSaveProfile}>
                    <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-[#b7dcff] bg-[#dbeeff] text-sm font-semibold text-[#2e8cff]">
                            {photoPreviewUrl ? (
                                <img src={photoPreviewUrl} alt="Profile preview" className="h-full w-full object-cover" />
                            ) : (
                                avatarInitials(fullName || patient.email || 'P')
                            )}
                        </div>
                        <label className="inline-flex cursor-pointer items-center rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-semibold text-[#334155] hover:border-[#b7dcff]">
                            Upload photo
                            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelection} />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Full name</span>
                            <input
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 text-sm outline-none focus:border-[#7dbdff]"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Email</span>
                            <input
                                value={patient.email || ''}
                                disabled
                                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#eef5ff] px-3 text-sm text-[#475569] outline-none"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Date of birth</span>
                            <input
                                type="date"
                                value={dob || ''}
                                onChange={(event) => setDob(event.target.value)}
                                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 text-sm outline-none focus:border-[#7dbdff]"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Phone</span>
                            <input
                                value={phone}
                                onChange={(event) => setPhone(event.target.value)}
                                className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 text-sm outline-none focus:border-[#7dbdff]"
                            />
                        </label>
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Address</span>
                        <input
                            value={address}
                            onChange={(event) => setAddress(event.target.value)}
                            className="h-11 w-full rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 text-sm outline-none focus:border-[#7dbdff]"
                        />
                    </label>
                    {profileSaveError && <p className="text-sm font-semibold text-red-600">{profileSaveError}</p>}
                    {profileSaveSuccess && <p className="text-sm font-semibold text-[#2e8cff]">{profileSaveSuccess}</p>}
                    <button
                        type="submit"
                        disabled={savingProfile}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {savingProfile ? 'Saving...' : 'Save account settings'}
                    </button>
                </form>
            </section>

            <section className={sectionCardClassName()}>
                <div className="border-b border-[#dbeeff] px-5 py-4">
                    <h2 className="text-lg font-semibold text-[#020617]">Billing & Subscription</h2>
                </div>
                <div className="space-y-3 px-5 py-4">
                    <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">Current plan</p>
                        <p className="mt-1 text-base font-semibold text-[#020617]">
                            {billing?.hasActiveUnlimited ? 'Unlimited certificates' : 'Pay as you go'}
                        </p>
                        <p className="mt-1 text-sm text-[#475569]">
                            {billing?.hasActiveUnlimited
                                ? `Subscription status: ${billing.subscriptionStatus || 'active'}`
                                : 'No active unlimited subscription found.'}
                        </p>
                        {billing?.hasActiveUnlimited && billing.currentPeriodEnd && (
                            <p className="mt-1 text-xs text-[#64748b]">Current period ends {formatDate(billing.currentPeriodEnd)}</p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {billing?.canManageSubscription ? (
                            <button
                                type="button"
                                onClick={onManageBilling}
                                disabled={billingActionState !== 'idle'}
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {billingActionState === 'opening_portal' ? 'Opening billing...' : 'Manage subscription'}
                            </button>
                        ) : (
                            <a
                                href="/doctor"
                                className="lw-shine inline-flex h-10 items-center justify-center rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white"
                                data-magnetic-strength="0.44"
                                data-magnetic-radius="110"
                            >
                                Start unlimited plan
                            </a>
                        )}

                        {billing?.hasActiveUnlimited && !billing.cancelAtPeriodEnd && (
                            <button
                                type="button"
                                onClick={onCancelSubscription}
                                disabled={billingActionState !== 'idle'}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {billingActionState === 'cancelling' ? 'Updating...' : 'Cancel at period end'}
                            </button>
                        )}
                    </div>

                    {billing?.cancelAtPeriodEnd && (
                        <p className="text-sm text-[#475569]">
                            Cancellation scheduled. Your unlimited access remains active until period end.
                        </p>
                    )}
                    {billingError && <p className="text-sm font-semibold text-red-600">{billingError}</p>}
                </div>
            </section>

            <section className={sectionCardClassName()}>
                <div className="border-b border-[#dbeeff] px-5 py-4">
                    <h2 className="text-lg font-semibold text-[#020617]">Profile Summary</h2>
                </div>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                    {stats.map((item) => (
                        <article key={item.label} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-[#020617]">{item.value}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className={sectionCardClassName()}>
                <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">Latest consult</p>
                    {latestRequest ? (
                        <>
                            <h2 className="mt-2 text-lg font-semibold text-[#020617]">{consultTitle(latestRequest.serviceType)}</h2>
                            <p className="mt-1 text-sm text-[#475569]">{statusLabel(latestRequest.status)}</p>
                            <p className="mt-1 text-xs text-[#64748b]">Updated {formatDate(latestRequest.createdAt)}</p>
                            {latestRequest.certificatePdfUrl && (
                                <button
                                    type="button"
                                    onClick={() => onDownloadCertificate(latestRequest)}
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#2e8cff] px-3 py-2 text-sm font-semibold text-white"
                                >
                                    <FileText size={15} />
                                    Download Medical Certificate
                                </button>
                            )}
                        </>
                    ) : (
                        <p className="mt-2 text-sm text-[#475569]">No consult history yet.</p>
                    )}
                </div>
            </section>
        </section>
    );
}

function CallPrepScreen({
    onBack,
    onStartCall,
}: {
    onBack: () => void;
    onStartCall: () => void;
}) {
    const wavePattern = [16, 26, 19, 31, 18, 34, 22, 27, 17, 30, 21, 29, 16, 24];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#dbeeff]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back
            </button>

            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Ready to start?</h1>
                <p className="mt-2 text-base text-[#475569]">A quick chat with AI to help your doctor prepare</p>
            </header>

            <article className={sectionCardClassName('overflow-hidden')}>
                {[
                    { icon: Phone, text: '2-3 minute voice call' },
                    { icon: Clock3, text: 'Confirm your certificate dates' },
                    { icon: MessageCircle, text: 'Describe your symptoms' },
                    { icon: CheckCircle2, text: 'Summary sent to your doctor' },
                ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.text} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#dbeeff]' : ''}`}>
                            <Icon size={18} className="text-[#2e8cff]" />
                            <p className="text-sm text-[#475569]">{item.text}</p>
                        </div>
                    );
                })}
            </article>

            <article className="overflow-hidden rounded-3xl border border-[#dbeeff] bg-white p-4">
                <div className="flex items-center gap-2">
                    <Phone size={16} className="text-[#2e8cff]" />
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Live call preview</p>
                </div>
                <div className="audio-wave mt-2 min-h-[86px] rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-2">
                    {wavePattern.map((height, index) => (
                        <span
                            // intentional index key for fixed static visual bars
                            key={index}
                            style={
                                {
                                    '--wave-height': `${height}px`,
                                    '--wave-duration': `${1 + ((index % 4) * 0.1)}s`,
                                    '--wave-delay': `${index * 0.04}s`,
                                } as CSSProperties
                            }
                        />
                    ))}
                </div>
            </article>

            <button
                type="button"
                onClick={onStartCall}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2e8cff] text-sm font-semibold text-white"
            >
                <Phone size={16} />
                Start call
            </button>
        </section>
    );
}

function QueuedWaitingScreen({
    request,
    onBack,
    onSendMessage,
}: {
    request: PortalRequest | null;
    onBack: () => void;
    onSendMessage: () => void;
}) {
    const queueSteps = ['Submitted', 'Payment', 'Review', 'Issued'];
    const stageIndex = queueStageIndex(request?.status || '');
    const etaMinutes = queueEstimatedMinutes(request);
    const reviewActive = stageIndex === 2;
    const queueHeading = reviewActive ? 'Under doctor review' : 'Queued';
    const queueSubheading = reviewActive ? `Estimated time remaining: ${etaMinutes} min` : statusLabel(request?.status || '');
    const rows = [
        { label: 'Type', value: 'Medical Certificate', icon: Tag },
        { label: 'Leave type', value: request?.purpose || '—', icon: FileText },
        { label: 'Main symptom', value: request?.symptom || '—', icon: FileText },
        { label: 'Certificate period', value: request?.startDate ? formatDate(request.startDate) : '—', icon: CalendarDays },
    ];

    return (
        <section className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
                <div className="h-1.5 rounded-full bg-[#2e8cff]" />
            </div>

            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
                <ArrowLeft size={16} />
                Back
            </button>

            <article className="overflow-hidden rounded-3xl border border-[#b7dcff] bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dbeeff] text-[#2e8cff]">
                        <Heart size={20} className="fill-current stroke-current" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold text-[#020617]">{queueHeading}</h1>
                        <p className="text-sm text-[#475569]">{queueSubheading}</p>
                    </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                    <div className="grid grid-cols-4 gap-2">
                        {queueSteps.map((step, index) => {
                            const completed = index < stageIndex;
                            const active = index === stageIndex && stageIndex < 3;
                            const pulse = active && index === 2;
                            return (
                                <div key={step} className="relative text-center">
                                    <span
                                        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                            completed
                                                ? 'border-[#2e8cff] bg-[#2e8cff] text-white'
                                                : active
                                                  ? 'border-[#2e8cff] bg-[#dbeeff] text-[#2e8cff]'
                                                  : 'border-[#cbd5e1] bg-white text-[#94a3b8]'
                                        } ${pulse ? 'animate-pulse' : ''}`}
                                    >
                                        {completed ? <Check size={12} /> : index + 1}
                                    </span>
                                    <span className="mt-1 block text-[11px] font-semibold text-[#64748b]">{step}</span>
                                    {index < queueSteps.length - 1 && (
                                        <span
                                            className={`absolute left-[58%] top-3 h-[2px] w-[84%] ${
                                                completed ? 'bg-[#9ecbff]' : 'bg-[#dbeafe]'
                                            }`}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {reviewActive && (
                        <p className="mt-3 text-xs text-[#475569]">
                            Review is active now. The pulsing step updates to issued once your certificate is completed.
                        </p>
                    )}
                    {!reviewActive && stageIndex < 2 && (
                        <p className="mt-3 text-xs text-[#475569]">
                            Payment is being confirmed. Completed steps will tick automatically as your request moves forward.
                        </p>
                    )}
                    {stageIndex >= 3 && (
                        <p className="mt-3 text-xs text-[#475569]">
                            Your certificate has been issued. Go back to Home or Account to download it.
                        </p>
                    )}
                </div>
            </article>

            <article className={sectionCardClassName('overflow-hidden')}>
                {rows.map((row, index) => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-[#dbeeff]' : ''}`}>
                            <Icon size={16} className="text-[#94a3b8]" />
                            <span className="text-sm text-[#475569]">{row.label}</span>
                            <span className="ml-auto text-sm font-semibold text-[#020617]">{row.value}</span>
                        </div>
                    );
                })}
            </article>

            <button
                type="button"
                onClick={onSendMessage}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2e8cff] text-sm font-semibold text-white"
            >
                <MessageCircle size={16} />
                Message Doctor
            </button>
        </section>
    );
}

function CheckoutAccountSetupScreen({
    setup,
    onComplete,
}: {
    setup: CheckoutSetupContext;
    onComplete: (payload: { token: string; patientEmail: string }) => void;
}) {
    const [email, setEmail] = useState(setup.consultEmail || '');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [existingAccountEmail, setExistingAccountEmail] = useState('');

    const handleUseSameEmail = () => {
        setEmail(setup.consultEmail);
        setConfirmEmail(setup.consultEmail);
        setErrorMessage('');
        setExistingAccountEmail('');
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setErrorMessage('');
        setExistingAccountEmail('');

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedConfirm = confirmEmail.trim().toLowerCase();
        const normalizedConsult = setup.consultEmail.trim().toLowerCase();

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            setErrorMessage('Enter a valid email address.');
            return;
        }
        if (normalizedConsult && normalizedEmail !== normalizedConsult) {
            setErrorMessage(`Use the same consult email: ${setup.consultEmail}`);
            return;
        }
        if (normalizedEmail !== normalizedConfirm) {
            setErrorMessage('Email confirmation does not match.');
            return;
        }
        if (!password || password.length < 8) {
            setErrorMessage('Password must be at least 8 characters.');
            return;
        }
        if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
            setErrorMessage('Password must include at least one letter and one number.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage('Password confirmation does not match.');
            return;
        }

        try {
            setSubmitting(true);
            const { response, payload } = await fetchApiJson('/api/patient/checkout/account/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: setup.sessionId,
                    email: normalizedEmail,
                    confirmEmail: normalizedConfirm,
                    password,
                }),
            });

            if (!response.ok) {
                if (response.status === 409 && String(payload?.code || '').toUpperCase() === 'ACCOUNT_EXISTS') {
                    const accountEmail = String(payload?.patientEmail || normalizedEmail).trim().toLowerCase();
                    setExistingAccountEmail(accountEmail);
                    throw new Error('An account already exists for this email. Sign in to continue.');
                }
                throw new Error(payload?.error || 'Unable to complete account setup right now.');
            }

            const token = String(payload?.token || '').trim();
            const patientEmail = String(payload?.patientEmail || normalizedEmail).trim();
            if (!token) {
                throw new Error('Account setup completed but no login token was returned.');
            }

            onComplete({ token, patientEmail });
        } catch (errorObject) {
            setErrorMessage(errorObject instanceof Error ? errorObject.message : 'Unable to complete account setup right now.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
            <PortalBackdropArt />
            <div className="relative z-10 mx-auto w-full max-w-[760px]">
                <section className="overflow-hidden rounded-3xl border border-[#cbd5e1] bg-white shadow-[0_30px_55px_-36px_rgba(15,23,42,0.46)]">
                    <div className="border-b border-[#dbeeff] bg-[#f8fbff] px-5 py-4 md:px-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Payment confirmed</p>
                        <h1 className="mt-1 text-2xl font-semibold text-[#020617] md:text-[2rem]">Create your portal password</h1>
                        <p className="mt-2 text-sm text-[#475569]">
                            Confirm your consult email and set a password to access your patient portal.
                        </p>
                    </div>

                    <form className="space-y-4 px-5 py-5 md:px-6" onSubmit={handleSubmit}>
                        <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">Consult email on file</p>
                            <p className="mt-1 text-sm font-semibold text-[#020617]">{setup.consultEmail}</p>
                        </div>

                        {setup.consultEmail && (
                            <button
                                type="button"
                                onClick={handleUseSameEmail}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#b7dcff] bg-[#eff6ff] px-4 text-sm font-semibold text-[#165fad]"
                            >
                                Use the same email as {setup.consultEmail}
                            </button>
                        )}

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Email</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Mail size={16} className="text-[#64748b]" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Confirm email</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Mail size={16} className="text-[#64748b]" />
                                <input
                                    type="email"
                                    value={confirmEmail}
                                    onChange={(event) => setConfirmEmail(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="Retype your email"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Create password</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Lock size={16} className="text-[#64748b]" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="At least 8 chars with a letter and number"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[#334155]">Confirm password</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3">
                                <Lock size={16} className="text-[#64748b]" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="h-11 w-full bg-transparent text-sm outline-none"
                                    placeholder="Retype your password"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </label>

                        {errorMessage && <p className="text-sm font-semibold text-red-600">{errorMessage}</p>}
                        {existingAccountEmail && (
                            <a
                                href={`/patient-login?email=${encodeURIComponent(existingAccountEmail)}`}
                                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#cbd5e1] bg-white text-sm font-semibold text-[#0f172a]"
                            >
                                Sign in to existing account
                            </a>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#2e8cff] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {submitting ? 'Creating account...' : 'Continue to patient portal'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}

export default function PatientPortalPage() {
    const initialSearchParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const requestedProgram = initialSearchParams.get('program')?.toLowerCase() || '';
    const openWeightLossFromRoute = requestedProgram === 'weight-loss-reset' || requestedProgram === 'nutritionist';
    const [mainTab, setMainTab] = useState<MainTab>('home');
    const {
        state: weightLossResetState,
        cardState: weightLossResetCardState,
        latestWeight: latestWeightFromWeightLoss,
        progressPercent: weightLossProgressPercent,
        updateOnboardingAnswers,
        saveOnboardingStep,
        completeOnboarding,
        markBookingComplete,
        setMealPlan,
        replaceMealPlan,
        addWeightLog,
        addMessage,
        toggleGroceryItem,
    } = useWeightLossResetState();
    const [weightLossRecipes, setWeightLossRecipes] = useState<Recipe[]>([]);
    const [weightLossCatalogRecipes, setWeightLossCatalogRecipes] = useState<Recipe[]>([]);
    const [weightLossRecipeError, setWeightLossRecipeError] = useState('');
    const [hasLoadedWeightLossCatalogRecipes, setHasLoadedWeightLossCatalogRecipes] = useState(false);
    const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
    const isGeneratingMealPlanRef = useRef(false);
    const weightLossStateRef = useRef(weightLossResetState);
    const isHydratingCatalogRef = useRef(false);
    const catalogHydrationRequestedAtRef = useRef(0);
    const isHydratingLatestMealPlanRef = useRef(false);
    const latestMealPlanHydrationRequestedAtRef = useRef(0);

    const [portalScreen, setPortalScreen] = useState<PortalScreen>('main');
    const [weightLossOnboardingMode, setWeightLossOnboardingMode] = useState<'initial' | 'update'>('initial');
    const [programRouteHandled, setProgramRouteHandled] = useState(false);
    const [lastMainTab, setLastMainTab] = useState<MainTab>('home');
    const [selectedConsultOptionId, setSelectedConsultOptionId] = useState<ConsultOptionId | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [patient, setPatient] = useState<PatientProfile>(() =>
        normalizePatientProfile(
            {
                email: window.localStorage.getItem('onya_patient_email') || '',
            },
            window.localStorage.getItem('onya_patient_email') || '',
        ),
    );
    const [primaryDietitian, setPrimaryDietitian] = useState<DietitianProfile | null>(null);
    const [requests, setRequests] = useState<PortalRequest[]>([]);
    const [billing, setBilling] = useState<PatientBillingInfo | null>(null);
    const [billingActionState, setBillingActionState] = useState<'idle' | 'opening_portal' | 'cancelling'>('idle');
    const [billingError, setBillingError] = useState('');
    const [activeQueuedRequest, setActiveQueuedRequest] = useState<PortalRequest | null>(null);
    const [recordTab, setRecordTab] = useState<RecordTab>('medical-history');
    const [portalData, setPortalData] = useState<PortalProfileData>(createEmptyPortalData);
    const [portalDataReady, setPortalDataReady] = useState(false);
    const [checkoutSetupContext, setCheckoutSetupContext] = useState<CheckoutSetupContext | null>(null);

    const [token, setToken] = useState(() => window.localStorage.getItem('onya_patient_token') || '');
    const profileStorageKey = useMemo(() => {
        const emailPart = (patient.email || 'guest').trim().toLowerCase() || 'guest';
        return `onya_patient_profile:${emailPart}`;
    }, [patient.email]);
    const allWeightLossRecipes = useMemo(
        () => mergeRecipeCatalog(weightLossCatalogRecipes, weightLossRecipes),
        [weightLossCatalogRecipes, weightLossRecipes]
    );

    useEffect(() => {
        const saved = window.localStorage.getItem(profileStorageKey);
        setPortalData(readPortalProfile(saved));
        setPortalDataReady(true);
    }, [profileStorageKey]);

    useEffect(() => {
        if (!portalDataReady) return;
        safeLocalStorageSetItem(profileStorageKey, JSON.stringify(portalData));
    }, [portalDataReady, portalData, profileStorageKey]);

    const hydrateRecipeCatalogFromServer = useCallback(
        async ({ force = false } = {}) => {
            const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';
            if (!activeToken) return false;
            if (isHydratingCatalogRef.current) return false;
            const now = Date.now();
            if (!force && now - catalogHydrationRequestedAtRef.current < 6_000) return false;

            catalogHydrationRequestedAtRef.current = now;
            isHydratingCatalogRef.current = true;
            try {
                const { response, payload } = await fetchApiJson('/api/patient/meal-plan/catalog?limit=420&includeDataImages=1', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${activeToken}`,
                    },
                });
                const remoteRecipes = Array.isArray(payload?.recipes) ? (payload.recipes as Recipe[]) : [];
                if (!response.ok || !payload?.ok) return false;
                const validRemoteRecipes = remoteRecipes.filter((recipe) => isValidWeightLossRecipe(recipe));
                setWeightLossCatalogRecipes(validRemoteRecipes);
                return validRemoteRecipes.length > 0;
            } catch (errorObject) {
                console.error('Unable to load patient meal catalog.', errorObject);
                return false;
            } finally {
                setHasLoadedWeightLossCatalogRecipes(true);
                isHydratingCatalogRef.current = false;
            }
        },
        [token]
    );

    useEffect(() => {
        void hydrateRecipeCatalogFromServer({ force: true });
    }, [hydrateRecipeCatalogFromServer, token]);

    useEffect(() => {
        weightLossStateRef.current = weightLossResetState;
    }, [weightLossResetState]);

    const hydrateLatestMealPlanFromServer = useCallback(
        async ({ force = false } = {}) => {
            const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';
            if (!activeToken) return false;
            if (isHydratingLatestMealPlanRef.current) return false;
            const now = Date.now();
            if (!force && now - latestMealPlanHydrationRequestedAtRef.current < 6_000) return false;

            latestMealPlanHydrationRequestedAtRef.current = now;
            isHydratingLatestMealPlanRef.current = true;
            try {
                const { response, payload } = await fetchApiJson('/api/patient/meal-plan/latest?includeDataImages=1', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${activeToken}`,
                    },
                });
                if (!response.ok || !payload?.ok || !payload?.found) return false;

                const serverMealPlan = payload?.mealPlan as MealPlan | null;
                const serverRecipes = Array.isArray(payload?.recipes) ? (payload.recipes as Recipe[]) : [];
                const serverOnboardingAnswers =
                    payload?.onboardingAnswers && typeof payload.onboardingAnswers === 'object'
                        ? (payload.onboardingAnswers as Partial<OnboardingAnswers>)
                        : null;
                if (!serverMealPlan || serverRecipes.length === 0) return false;

                const validServerRecipes = serverRecipes.filter((recipe): recipe is Recipe => isValidWeightLossRecipe(recipe));
                if (validServerRecipes.length === 0) return false;

                if (serverOnboardingAnswers) {
                    updateOnboardingAnswers(serverOnboardingAnswers);
                    if (!weightLossStateRef.current.onboardingComplete || !weightLossStateRef.current.dietitianBookingComplete) {
                        markBookingComplete();
                    }
                }

                setWeightLossRecipes((current) => mergeRecipeCatalog(current, validServerRecipes));

                const shouldApplyServerPlan = (() => {
                    const currentPlan = weightLossStateRef.current.mealPlan;
                    if (!currentPlan) return true;
                    const knownIds = new Set(
                        mergeRecipeCatalog(allWeightLossRecipes, validServerRecipes).map((recipe) => recipe.id)
                    );
                    const currentPlanIds = collectPlannedRecipeIds(currentPlan);
                    return currentPlanIds.some((id) => !knownIds.has(id));
                })();

                if (!shouldApplyServerPlan) return true;

                const mergedRecipes = mergeRecipeCatalog(allWeightLossRecipes, validServerRecipes);
                const recipeMap = new Map(mergedRecipes.map((recipe) => [recipe.id, recipe]));
                setMealPlan(
                    postProcessGeneratedMealPlan(
                        serverMealPlan,
                        weightLossStateRef.current.onboardingAnswers,
                        recipeMap
                    )
                );
                return true;
            } catch (errorObject) {
                console.error('Unable to hydrate latest meal plan cache for this patient.', errorObject);
                return false;
            } finally {
                isHydratingLatestMealPlanRef.current = false;
            }
        },
        [allWeightLossRecipes, markBookingComplete, setMealPlan, token, updateOnboardingAnswers]
    );

    useEffect(() => {
        if (!token) return;
        void hydrateLatestMealPlanFromServer();
    }, [hydrateLatestMealPlanFromServer, token]);

    useEffect(() => {
        if (portalScreen !== 'weight-loss-reset') return;
        if (!token) return;
        if (weightLossCatalogRecipes.length >= 24) return;
        void hydrateRecipeCatalogFromServer({ force: true });
    }, [hydrateRecipeCatalogFromServer, portalScreen, token, weightLossCatalogRecipes.length]);

    useEffect(() => {
        if (portalScreen !== 'weight-loss-reset') return;
        if (!token) return;
        if (weightLossResetState.mealPlan) return;
        void hydrateLatestMealPlanFromServer({ force: true });
    }, [hydrateLatestMealPlanFromServer, portalScreen, token, weightLossResetState.mealPlan]);

    useEffect(() => {
        if (!openWeightLossFromRoute || programRouteHandled) return;
        setMainTab('home');
        setPortalScreen(
            weightLossResetState.dietitianBookingComplete && weightLossResetState.onboardingComplete
                ? 'weight-loss-reset'
                : 'weight-loss-onboarding'
        );
        setProgramRouteHandled(true);

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('program');
        const search = nextUrl.searchParams.toString();
        window.history.replaceState({}, '', `${nextUrl.pathname}${search ? `?${search}` : ''}${nextUrl.hash}`);
    }, [
        openWeightLossFromRoute,
        programRouteHandled,
        weightLossResetState.dietitianBookingComplete,
        weightLossResetState.onboardingComplete,
    ]);


    useEffect(() => {
        let disposed = false;

        const bootstrapCheckoutIfPresent = async () => {
            const url = new URL(window.location.href);
            const checkout = url.searchParams.get('checkout');
            const sessionId =
                url.searchParams.get('session_id') ||
                window.localStorage.getItem('onya_last_checkout_session_id');
            if (checkout !== 'success' || !sessionId) {
                return null;
            }

            window.localStorage.removeItem('onya_patient_token');
            setToken('');

            try {
                const { response, payload } = await fetchApiJson(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                });
                if (response.ok) {
                    const consultEmail = String(payload?.patientEmail || '').trim().toLowerCase();
                    if (consultEmail) {
                        window.localStorage.setItem('onya_patient_email', consultEmail);
                    }
                    const requiresAccountSetup = Boolean(payload?.requiresAccountSetup);
                    if (!requiresAccountSetup) {
                        const loginUrl = new URL('/patient-login', window.location.origin);
                        if (consultEmail) {
                            loginUrl.searchParams.set('email', consultEmail);
                        }
                        loginUrl.searchParams.set('checkout', 'success');
                        window.location.href = `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`;
                        return null;
                    }
                    return {
                        sessionId,
                        consultEmail: consultEmail || String(window.localStorage.getItem('onya_patient_email') || '').trim().toLowerCase(),
                    };
                }
            } catch {
                // Keep polling for status updates even if confirmation fails once.
            } finally {
                window.localStorage.removeItem('onya_last_checkout_session_id');
                url.searchParams.delete('checkout');
                url.searchParams.delete('session_id');
                const nextSearch = url.searchParams.toString();
                const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`;
                window.history.replaceState({}, '', nextUrl);
            }
            return null;
        };

        const fetchPortalData = async (silent = false) => {
            if (checkoutSetupContext) {
                if (!silent) {
                    setLoading(false);
                    setLoadError('');
                }
                return;
            }

            if (!silent) {
                setLoading(true);
                setLoadError('');
                const setupContext = await bootstrapCheckoutIfPresent();
                if (setupContext) {
                    if (!disposed) {
                        setCheckoutSetupContext(setupContext);
                        setLoading(false);
                    }
                    return;
                }
            }

            const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';
            if (!activeToken) {
                const currentWeightLossState = weightLossStateRef.current;
                if (
                    openWeightLossFromRoute ||
                    currentWeightLossState.onboardingStep > 0 ||
                    currentWeightLossState.onboardingComplete ||
                    currentWeightLossState.dietitianBookingComplete
                ) {
                    const preferredName = currentWeightLossState.onboardingAnswers.firstName?.trim() || 'Patient';
                    const preferredEmail = window.localStorage.getItem('onya_patient_email') || 'patient@demo.local';
                    setPatient({
                        fullName: preferredName,
                        firstName: preferredName,
                        lastName: '',
                        email: preferredEmail,
                        dob: '',
                        phone: '',
                        address: '',
                        profilePhotoPath: '',
                        profilePhotoUrl: '',
                    });
                    setPrimaryDietitian(null);
                    setRequests([]);
                    setBilling(null);
                    setBillingError('');
                    setBillingActionState('idle');
                    if (!silent) {
                        setLoading(false);
                        setLoadError('');
                    }
                    return;
                }
                window.location.href = '/patient-login';
                return;
            }
            if (activeToken !== token) {
                setToken(activeToken);
            }

            try {
                const headers = {
                    Authorization: `Bearer ${activeToken}`,
                };
                if (silent) {
                    const { response, payload } = await fetchApiJson('/api/patient/requests', { headers });
                    if (response.status === 401) {
                        window.localStorage.removeItem('onya_patient_token');
                        setToken('');
                        window.location.href = '/patient-login';
                        return;
                    }
                    if (!response.ok) {
                        throw new Error(payload.error || 'Unable to refresh patient requests');
                    }
                    if (disposed) return;
                    const items: PortalRequest[] = Array.isArray(payload?.requests) ? payload.requests : [];
                    setRequests(items);
                    const firstQueued = items.find((item) => isQueuedStatus(item.status)) || null;
                    setActiveQueuedRequest(firstQueued);
                    return;
                }

                const { response, payload } = await fetchApiJson('/api/patient/bootstrap', { headers });
                if (response.status === 401) {
                    window.localStorage.removeItem('onya_patient_token');
                    setToken('');
                    window.location.href = '/patient-login';
                    return;
                }

                if (!response.ok) {
                    throw new Error(payload.error || 'Unable to load patient portal');
                }

                if (disposed) return;

                const patientProfile = normalizePatientProfile(
                    payload?.patient,
                    window.localStorage.getItem('onya_patient_email') || '',
                );
                const assignedDietitian = normalizeDietitianProfile(payload?.dietitian);
                setPatient(patientProfile);
                setPrimaryDietitian(assignedDietitian);
                window.localStorage.setItem('onya_patient_email', patientProfile.email);
                setBilling(normalizeBillingInfo(payload?.billing));
                setBillingError('');
                setBillingActionState('idle');

                const items: PortalRequest[] = Array.isArray(payload?.requests) ? payload.requests : [];
                setRequests(items);
                const firstQueued = items.find((item) => isQueuedStatus(item.status)) || null;
                setActiveQueuedRequest(firstQueued);
            } catch (errorObject) {
                if (!disposed && !silent) {
                    setLoadError(errorObject instanceof Error ? errorObject.message : 'Unable to load patient account');
                }
            } finally {
                if (!disposed && !silent) {
                    setLoading(false);
                }
            }
        };

        fetchPortalData(false);
        const pollTimer = window.setInterval(() => {
            fetchPortalData(true);
        }, 10000);

        return () => {
            disposed = true;
            window.clearInterval(pollTimer);
        };
    }, [token, checkoutSetupContext, openWeightLossFromRoute]);

    const firstNameValue = useMemo(() => firstName(patient.fullName || ''), [patient.fullName]);
    const latestRequest = useMemo(() => (requests.length > 0 ? requests[0] : null), [requests]);
    const selectedConsultOption = useMemo(
        () => CONSULT_OPTIONS.find((item) => item.id === selectedConsultOptionId) || null,
        [selectedConsultOptionId]
    );
    const queuedRequest = useMemo(
        () => activeQueuedRequest || requests.find((item) => isQueuedStatus(item.status)) || null,
        [activeQueuedRequest, requests]
    );

    useEffect(() => {
        warmCheckoutPath();
    }, []);

    const openQueuedScreen = () => {
        setLastMainTab(mainTab);
        setActiveQueuedRequest(queuedRequest);
        setPortalScreen('queued');
    };

    const closeOverlayScreen = () => {
        setPortalScreen('main');
        setMainTab(lastMainTab);
        setSelectedConsultOptionId(null);
    };

    const setTab = (next: MainTab) => {
        setMainTab(next);
        setPortalScreen('main');
        setSelectedConsultOptionId(null);
    };

    const openAccountSettings = () => {
        setTab('account');
    };

    const startUnlimitedCertificateRequest = async () => {
        warmCheckoutPath();
        if (!token) {
            window.location.href = '/patient-login';
            return;
        }

        const patientEmail = (patient.email || window.localStorage.getItem('onya_patient_email') || '').trim().toLowerCase();
        if (!patientEmail) {
            window.alert('Your account email is missing. Refresh and try again.');
            return;
        }

        const startDateIso = new Date().toISOString();
        const fallbackPurpose = latestRequest?.purpose || 'Personal leave';
        const fallbackSymptom = latestRequest?.symptom || 'General medical condition';
        const fallbackDescription = 'Requested from patient portal using active unlimited plan.';

        try {
            const { response, payload } = await fetchApiJson('/api/checkout/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    uiMode: 'hosted',
                    serviceType: 'doctor',
                    patient: {
                        fullName: patient.fullName || 'Patient',
                        email: patientEmail,
                        dob: patient.dob || '',
                        phone: patient.phone || '',
                    },
                    consult: {
                        purpose: fallbackPurpose,
                        symptom: fallbackSymptom,
                        symptomVisibility: 'private',
                        description: fallbackDescription,
                        startDate: startDateIso,
                        durationDays: 1,
                        complianceChecked: true,
                        isUnlimited: true,
                        includeCarerCertificate: false,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to start your certificate request right now.');
            }

            if (payload?.checkoutBypassed) {
                const syntheticRequest: PortalRequest = {
                    id: String(payload?.certificateId || `local-${createId()}`),
                    createdAt: new Date().toISOString(),
                    status: String(payload?.status || 'pending'),
                    serviceType: 'doctor',
                    purpose: fallbackPurpose,
                    symptom: fallbackSymptom,
                    symptomVisibility: 'private',
                    description: fallbackDescription,
                    startDate: startDateIso,
                    durationDays: 1,
                };
                setRequests((current) => [syntheticRequest, ...current.filter((item) => item.id !== syntheticRequest.id)]);
                setActiveQueuedRequest(syntheticRequest);
                setPortalScreen('queued');
                return;
            }

            if (payload?.checkoutUrl) {
                window.location.assign(String(payload.checkoutUrl));
                return;
            }

            if (payload?.redirectUrl) {
                window.location.assign(String(payload.redirectUrl));
                return;
            }

            throw new Error('Unable to start your certificate request right now.');
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to start your certificate request right now.');
        }
    };

    const openWeightLossOnboarding = () => {
        setWeightLossOnboardingMode('initial');
        setLastMainTab(mainTab);
        setMainTab('home');
        setPortalScreen('weight-loss-onboarding');
    };

    const openWeightLossPreferenceEditor = useCallback(() => {
        setWeightLossOnboardingMode('update');
        saveOnboardingStep(1);
        setLastMainTab(mainTab);
        setMainTab('home');
        setPortalScreen('weight-loss-onboarding');
    }, [mainTab, saveOnboardingStep]);

    const openWeightLossDashboard = () => {
        setLastMainTab(mainTab);
        setMainTab('home');
        setPortalScreen('weight-loss-reset');
    };

    const generateAndStoreWeightLossMealPlan = useCallback(
        async (
            answers = weightLossStateRef.current.onboardingAnswers,
            options: { refresh?: boolean } = {},
        ) => {
            if (isGeneratingMealPlanRef.current) return;
            isGeneratingMealPlanRef.current = true;
            setIsGeneratingMealPlan(true);
            try {
                setWeightLossRecipeError('');
                const seedSalt = options.refresh ? String(Date.now()) : '';
                const includeSnack = false;
                const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';

                if (activeToken) {
                    try {
                        const { response, payload } = await fetchApiJson('/api/patient/meal-plan/generate', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${activeToken}`,
                            },
                            body: JSON.stringify({
                                answers,
                                includeSnack,
                                seedSalt,
                                generationMode: 'ai_recipes',
                                generateRecipes: true,
                            }),
                        });

                        const serverMealPlan = payload?.mealPlan;
                        const serverRecipes = Array.isArray(payload?.recipes) ? (payload.recipes as Recipe[]) : [];
                        if (response.ok && payload?.ok && serverMealPlan && serverRecipes.length > 0) {
                            const validServerRecipes = serverRecipes.filter(
                                (recipe): recipe is Recipe => isValidWeightLossRecipe(recipe),
                            );
                            if (validServerRecipes.length === 0) {
                                setWeightLossRecipeError('API returned a meal plan without a valid recipe catalog.');
                                return;
                            } else {
                                const mergedRecipes = mergeRecipeCatalog(allWeightLossRecipes, validServerRecipes);
                                setWeightLossRecipes((current) => mergeRecipeCatalog(current, validServerRecipes));
                                const recipeMap = new Map(mergedRecipes.map((recipe) => [recipe.id, recipe]));
                                const withRealImageCount = validServerRecipes.filter((recipe) => {
                                    const url = resolveRecipeImageCandidate(recipe);
                                    return isConcreteRecipeImageUrl(url);
                                }).length;
                                const imageCoverage =
                                    validServerRecipes.length > 0 ? withRealImageCount / validServerRecipes.length : 0;
                                setWeightLossRecipeError(
                                    imageCoverage < 0.85
                                        ? 'Meal plan generated. Some meal images are unavailable right now, but your meals are saved and usable.'
                                        : withRealImageCount > 0
                                          ? ''
                                          : 'Meal plan generated, but some image links are unavailable right now.'
                                );
                                setMealPlan(postProcessGeneratedMealPlan(serverMealPlan, answers, recipeMap));
                                return;
                            }
                        } else {
                            setWeightLossRecipeError(
                                String(payload?.error || '').trim() || `AI meal plan response was not usable (${response.status}).`
                            );
                            return;
                        }
                    } catch (errorObject) {
                        console.error('Meal generation API failed.', errorObject);
                        setWeightLossRecipeError(
                            errorObject instanceof Error ? errorObject.message : 'Meal generation API request failed.'
                        );
                        return;
                    }
                } else {
                    setWeightLossRecipeError('No authenticated patient session found for AI meal generation.');
                }
            } finally {
                isGeneratingMealPlanRef.current = false;
                setIsGeneratingMealPlan(false);
            }
        },
        [allWeightLossRecipes, setMealPlan, token]
    );

    const handleWeightLossOnboardingProgress = useCallback(
        (answers: OnboardingAnswers, step: number) => {
            updateOnboardingAnswers(answers);
            saveOnboardingStep(step);
        },
        [saveOnboardingStep, updateOnboardingAnswers]
    );

    const handleWeightLossBookingComplete = useCallback(
        async (answers: OnboardingAnswers) => {
            updateOnboardingAnswers(answers);
            completeOnboarding();
            markBookingComplete();
            await generateAndStoreWeightLossMealPlan(answers, { refresh: true });
        },
        [
            completeOnboarding,
            generateAndStoreWeightLossMealPlan,
            markBookingComplete,
            updateOnboardingAnswers,
        ]
    );

    const handleWeightLossPreferencesUpdated = useCallback(
        async (answers: OnboardingAnswers) => {
            updateOnboardingAnswers(answers);
            completeOnboarding();
            await generateAndStoreWeightLossMealPlan(answers, { refresh: true });
        },
        [completeOnboarding, generateAndStoreWeightLossMealPlan, updateOnboardingAnswers]
    );

    const handleWeightLossSwapMeal = useCallback(
        (dayIndex: number, mealType: MealType, recipeId: string) => {
            if (!weightLossResetState.mealPlan) return;
            const recipeMap = new Map(allWeightLossRecipes.map((recipe) => [recipe.id, recipe]));
            const swapped = swapMealInPlan({
                mealPlan: weightLossResetState.mealPlan,
                dayIndex,
                mealType,
                replacementRecipeId: recipeId,
            });
            // For manual swaps, preserve the user's explicit choice and only recompute totals/grocery/prep metadata.
            replaceMealPlan(withRecalculatedTotals(swapped, recipeMap));
        },
        [allWeightLossRecipes, replaceMealPlan, weightLossResetState.mealPlan]
    );

    useEffect(() => {
        if (!hasLoadedWeightLossCatalogRecipes) return;
        const hasRecipes = allWeightLossRecipes.length > 0;
        if (!weightLossResetState.mealPlan) return;

        if (!hasRecipes) {
            return;
        }

        const recipeIdSet = new Set(allWeightLossRecipes.map((recipe) => recipe.id));
        const plannedIds = weightLossResetState.mealPlan.days.flatMap((day) =>
            [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])].filter(Boolean),
        ) as string[];

        const hasUnknownRecipes = plannedIds.some((id) => !recipeIdSet.has(id));
        if (!hasUnknownRecipes) {
            const recipeMap = new Map(allWeightLossRecipes.map((recipe) => [recipe.id, recipe]));
            const recalculated = withRecalculatedTotals(weightLossResetState.mealPlan, recipeMap);
            const currentTotals = JSON.stringify(weightLossResetState.mealPlan.days.map((day) => day.totals || {}));
            const nextTotals = JSON.stringify(recalculated.days.map((day) => day.totals || {}));
            const currentStructure = JSON.stringify(weightLossResetState.mealPlan.days.map((day) => day.meals || {}));
            const nextStructure = JSON.stringify(recalculated.days.map((day) => day.meals || {}));
            if (currentTotals === nextTotals && currentStructure === nextStructure) return;
            replaceMealPlan(recalculated);
            return;
        }

        setWeightLossRecipeError((current) =>
            current ||
            'Some saved meals are unavailable in your current recipe library. Generate again to refresh this specific week.'
        );
    }, [
        allWeightLossRecipes,
        hasLoadedWeightLossCatalogRecipes,
        replaceMealPlan,
        weightLossResetState.mealPlan,
    ]);

    const openConsultOption = (optionId: ConsultOptionId) => {
        const option = CONSULT_OPTIONS.find((item) => item.id === optionId);
        if (!option) return;

        setLastMainTab('consult');
        if (option.status === 'available') {
            if (option.id === 'medical-certificate') {
                if (billing?.hasActiveUnlimited) {
                    void startUnlimitedCertificateRequest();
                    return;
                }
                window.location.href = '/doctor';
                return;
            }

            if (option.id === 'weight-loss') {
                if (weightLossResetState.dietitianBookingComplete && weightLossResetState.onboardingComplete) {
                    openWeightLossDashboard();
                    return;
                }
                openWeightLossOnboarding();
                return;
            }

            setPortalScreen('call-prep');
            return;
        }

        setSelectedConsultOptionId(optionId);
        setPortalScreen('consult-coming-soon');
    };

    const addRecordEntry = (tab: RecordTab, title: string, details: string) => {
        const entry: TextEntry = {
            id: createId(),
            title,
            details,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => appendRecordEntry(current, tab, entry));
    };

    const addLifestyleNote = (title: string, details: string) => {
        const entry: TextEntry = {
            id: createId(),
            title,
            details,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => ({
            ...current,
            lifestyleNotes: [entry, ...current.lifestyleNotes],
        }));
    };

    const addTestResult = (draft: TestResultDraft) => {
        const entry: TestResultEntry = {
            id: createId(),
            name: draft.name,
            summary: draft.summary,
            testDate: draft.testDate,
            fileName: draft.fileName,
            createdAt: new Date().toISOString(),
        };
        setPortalData((current) => ({
            ...current,
            testResults: [entry, ...current.testResults],
        }));
    };

    const savePatientProfile = async (payload: {
        fullName: string;
        dob: string;
        phone: string;
        address: string;
        profilePhotoDataUrl?: string;
    }) => {
        const activeToken = token || window.localStorage.getItem('onya_patient_token') || '';
        if (!activeToken) {
            throw new Error('Please sign in again to update account settings.');
        }

        const { response, payload: apiPayload } = await fetchApiJson('/api/patient/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${activeToken}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(apiPayload?.error || 'Unable to update account settings.');
        }

        const nextPatient = normalizePatientProfile(apiPayload?.patient, patient.email || '');
        setPatient(nextPatient);
        window.localStorage.setItem('onya_patient_email', nextPatient.email || patient.email || '');
        const nextDietitian = normalizeDietitianProfile(apiPayload?.dietitian);
        if (nextDietitian) {
            setPrimaryDietitian(nextDietitian);
        }
    };

    const sendMessageToDoctor = async () => {
        if (!queuedRequest || !token) return;
        const message = window.prompt('Message for the doctor');
        if (!message || !message.trim()) return;

        try {
            const { response, payload } = await fetchApiJson(
                `/api/patient/requests/${encodeURIComponent(queuedRequest.id)}/message`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ message }),
                }
            );
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to send message');
            }
            window.alert('Message sent to doctor.');
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to send message');
        }
    };

    const downloadCertificatePdf = async (request: PortalRequest) => {
        if (!request.certificatePdfUrl || !token) return;

        try {
            const response = await fetch(`${getApiBase()}${request.certificatePdfUrl}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                let message = 'Unable to download certificate';
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const payload = await response.json();
                    message = payload?.error || message;
                } else {
                    const text = await response.text();
                    if (text) {
                        message = text.slice(0, 180);
                    }
                }
                throw new Error(message);
            }

            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `medical-certificate-${request.id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(objectUrl);
        } catch (errorObject) {
            window.alert(errorObject instanceof Error ? errorObject.message : 'Unable to download certificate');
        }
    };

    const startCallAndQueue = () => {
        const syntheticRequest: PortalRequest =
            queuedRequest ||
            latestRequest || {
                id: `local-${createId()}`,
                createdAt: new Date().toISOString(),
                status: 'submitted',
                serviceType: 'doctor',
                purpose: 'Personal leave',
                symptom: 'General symptoms',
                description: '',
                startDate: new Date().toISOString(),
                durationDays: 1,
            };

        setActiveQueuedRequest(syntheticRequest);
        setPortalScreen('queued');
    };

    const completeCheckoutSetup = ({ token: nextToken, patientEmail }: { token: string; patientEmail: string }) => {
        window.localStorage.setItem('onya_patient_token', nextToken);
        if (patientEmail) {
            window.localStorage.setItem('onya_patient_email', patientEmail);
        }
        setPatient((current) => ({
            ...current,
            email: patientEmail || current.email,
        }));
        setCheckoutSetupContext(null);
        setLoadError('');
        setLoading(true);
        setToken(nextToken);
    };

    const openBillingPortal = async () => {
        if (!token) return;
        try {
            setBillingError('');
            setBillingActionState('opening_portal');
            const { response, payload } = await fetchApiJson('/api/patient/billing/portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    returnUrl: `${window.location.origin}/patient`,
                }),
            });
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to open billing portal right now.');
            }
            const portalUrl = String(payload?.url || '').trim();
            if (!portalUrl) {
                throw new Error('Billing portal did not return a URL.');
            }
            window.location.assign(portalUrl);
        } catch (errorObject) {
            setBillingError(errorObject instanceof Error ? errorObject.message : 'Unable to open billing portal right now.');
            setBillingActionState('idle');
        }
    };

    const cancelSubscriptionAtPeriodEnd = async () => {
        if (!token) return;
        try {
            setBillingError('');
            setBillingActionState('cancelling');
            const { response, payload } = await fetchApiJson('/api/patient/subscription/cancel', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to update subscription right now.');
            }
            setBilling(normalizeBillingInfo(payload?.billing));
            setBillingActionState('idle');
        } catch (errorObject) {
            setBillingError(errorObject instanceof Error ? errorObject.message : 'Unable to update subscription right now.');
            setBillingActionState('idle');
        }
    };

    const renderPortalContent = (mode: LayoutMode) => {
        if (portalScreen === 'weight-loss-onboarding') {
            return (
                <OnboardingFlow
                    initialAnswers={weightLossResetState.onboardingAnswers}
                    initialStep={weightLossResetState.onboardingStep}
                    dietitian={primaryDietitian}
                    mode={weightLossOnboardingMode}
                    onSaveProgress={handleWeightLossOnboardingProgress}
                    onMarkOnboardingComplete={completeOnboarding}
                    onBookingComplete={handleWeightLossBookingComplete}
                    onCompletePreferenceUpdate={handleWeightLossPreferencesUpdated}
                    onOpenDashboard={openWeightLossDashboard}
                />
            );
        }

        if (portalScreen === 'weight-loss-reset') {
            return (
                <div className="space-y-3">
                    {weightLossRecipeError && (
                        <p className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">
                            {weightLossRecipeError}
                        </p>
                    )}
                    <WeightLossResetDashboard
                        answers={weightLossResetState.onboardingAnswers}
                        displayFirstName={firstNameValue}
                        dietitian={primaryDietitian}
                        mealPlan={weightLossResetState.mealPlan}
                        recipes={allWeightLossRecipes}
                        weightLogs={weightLossResetState.weightLogs}
                        messages={weightLossResetState.messages}
                        groceryCheckedItems={weightLossResetState.groceryCheckedItems}
                        isGeneratingPlan={isGeneratingMealPlan}
                        onUpdatePreferences={openWeightLossPreferenceEditor}
                        onRegeneratePlan={() => {
                            void generateAndStoreWeightLossMealPlan(weightLossResetState.onboardingAnswers, { refresh: true });
                        }}
                        onSwapMeal={handleWeightLossSwapMeal}
                        onAddWeightLog={addWeightLog}
                        onAddMessage={addMessage}
                        onToggleGroceryItem={toggleGroceryItem}
                    />
                </div>
            );
        }

        if (portalScreen === 'call-prep') {
            return <CallPrepScreen onBack={closeOverlayScreen} onStartCall={startCallAndQueue} />;
        }
        if (portalScreen === 'queued') {
            return (
                <QueuedWaitingScreen
                    request={queuedRequest}
                    onBack={closeOverlayScreen}
                    onSendMessage={sendMessageToDoctor}
                />
            );
        }
        if (portalScreen === 'consult-coming-soon') {
            return <ConsultComingSoonScreen option={selectedConsultOption} onBack={closeOverlayScreen} />;
        }

        if (mainTab === 'home') {
            return (
                <HomeTab
                    mode={mode}
                    firstNameValue={firstNameValue}
                    requests={requests}
                    queuedRequest={queuedRequest}
                    patient={patient}
                    dietitian={primaryDietitian}
                    data={portalData}
                    recordTab={recordTab}
                    onRecordTabChange={setRecordTab}
                    onAddRecordEntry={addRecordEntry}
                    onAddLifestyleNote={addLifestyleNote}
                    onAddTestResult={addTestResult}
                    onOpenQueue={openQueuedScreen}
                    onDownloadCertificate={downloadCertificatePdf}
                    onGoToTab={setTab}
                    weightLossResetCard={{
                        cardState: weightLossResetCardState,
                        primaryHealthFocus: weightLossResetState.onboardingAnswers.primaryHealthFocus,
                        currentWeight: latestWeightFromWeightLoss,
                        goalWeight: weightLossResetState.onboardingAnswers.goalWeightKg,
                        progressPercent: weightLossProgressPercent,
                        onStart: openWeightLossOnboarding,
                        onContinueBooking: openWeightLossOnboarding,
                        onOpen: openWeightLossDashboard,
                    }}
                />
            );
        }

        if (mainTab === 'consult') {
            return <ConsultTab onSelectOption={openConsultOption} billing={billing} />;
        }

        return (
            <AccountTab
                patient={patient}
                latestRequest={latestRequest}
                billing={billing}
                data={portalData}
                onDownloadCertificate={downloadCertificatePdf}
                onManageBilling={openBillingPortal}
                onCancelSubscription={cancelSubscriptionAtPeriodEnd}
                billingActionState={billingActionState}
                billingError={billingError}
                onSaveProfile={savePatientProfile}
            />
        );
    };

    if (checkoutSetupContext) {
        return <CheckoutAccountSetupScreen setup={checkoutSetupContext} onComplete={completeCheckoutSetup} />;
    }

    if (loading) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
                <PortalBackdropArt />
                <div className="relative z-10 mx-auto max-w-[900px] rounded-3xl border border-[#cbd5e1] bg-white p-6">
                    <p className="text-sm text-[#475569]">Loading your patient account...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[#f8fbff] px-4 py-8 font-sans text-[#020617]">
                <PortalBackdropArt />
                <div className="relative z-10 mx-auto max-w-[900px] rounded-3xl border border-[#cbd5e1] bg-white p-6">
                    <h1 className="text-2xl font-semibold text-[#020617]">Unable to load account</h1>
                    <p className="mt-2 text-[#475569]">{loadError}</p>
                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="rounded-xl bg-[#2e8cff] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Retry
                        </button>
                        <a
                            href="/patient-login"
                            className="rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#020617]"
                        >
                            Back to login
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="relative hidden min-h-screen overflow-hidden bg-[#f8fbff] text-[#020617] md:flex">
                <PortalBackdropArt />
                <DesktopSidebar activeTab={mainTab} onTabChange={setTab} patient={patient} onProfileClick={openAccountSettings} />
                <main className="relative z-10 flex-1">
                    <div className="mx-auto w-full max-w-[1160px] px-8 py-7">
                        {portalScreen === 'main' && (
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#475569]">
                                <Home size={14} />
                                {MAIN_TABS.find((tab) => tab === mainTab)?.toUpperCase()}
                            </div>
                        )}
                        {renderPortalContent('desktop')}
                    </div>
                </main>
            </div>

            <div className={`relative min-h-screen overflow-hidden bg-[#f8fbff] text-[#020617] md:hidden ${portalScreen === 'main' ? 'pb-28' : 'pb-6'}`}>
                <PortalBackdropArt />
                <MobileTopBar activeTab={mainTab} />
                <main className="relative z-10 px-4 py-5">{renderPortalContent('mobile')}</main>
                {portalScreen === 'main' && queuedRequest && <QueueBanner request={queuedRequest} onTap={openQueuedScreen} />}
                {portalScreen === 'main' && <MobileBottomNav activeTab={mainTab} onTabChange={setTab} />}
            </div>
        </>
    );
}
