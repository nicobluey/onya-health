import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  CookingPot,
  Dumbbell,
  Flame,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Microwave,
  MilkOff,
  PencilLine,
  Pause,
  Play,
  RefreshCcw,
  ShoppingCart,
  Shuffle,
  Sprout,
  Star,
  Weight,
  Wind,
  WheatOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_DIETITIAN_PROFILE_IMAGE_URL,
  getHealthFocusDisplayLabel,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import { fetchApiJson } from '../../lib/api';
import {
  buildGroceryListFromMealPlan,
  calculateGoalProgressFromHistory,
  getCurrentWeight,
  getRecipeRequiredEquipment,
  getSwapCandidates,
} from '../mealPlanning';
import type {
  AssignedDietitianProfile,
  CookingEquipment,
  DietitianMessage,
  MealPlan,
  MealType,
  OnboardingAnswers,
  Recipe,
  WeightLogEntry,
} from '../types';
import ProfileAvatar from './ProfileAvatar';

type DashboardTab = 'overview' | 'meal-plan' | 'grocery' | 'progress' | 'messages';
type PrimaryMealType = 'breakfast' | 'lunch' | 'dinner';
const PRIMARY_MEAL_TYPE_ORDER: PrimaryMealType[] = ['breakfast', 'lunch', 'dinner'];
const EQUIPMENT_META: Record<CookingEquipment, { label: string; icon: LucideIcon }> = {
  stovetop: { label: 'Stovetop', icon: CookingPot },
  oven: { label: 'Oven', icon: Flame },
  'air fryer': { label: 'Air fryer', icon: Wind },
  microwave: { label: 'Microwave', icon: Microwave },
};

const EQUIPMENT_LABELS: Record<CookingEquipment, string> = {
  stovetop: EQUIPMENT_META.stovetop.label,
  oven: EQUIPMENT_META.oven.label,
  'air fryer': EQUIPMENT_META['air fryer'].label,
  microwave: EQUIPMENT_META.microwave.label,
};

function RecipeEquipmentPills({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const requiredEquipment = getRecipeRequiredEquipment(recipe);

  if (requiredEquipment.length === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-[#edf4fa] ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
        } font-semibold text-[#1a3d63]`}
      >
        <CircleSlash2 size={compact ? 11 : 12} />
        No specific equipment
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {requiredEquipment.map((equipment) => {
        const meta = EQUIPMENT_META[equipment];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={`${recipe.id}-equipment-${equipment}`}
            className={`inline-flex items-center gap-1 rounded-full bg-[#edf4fa] ${
              compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
            } font-semibold text-[#0a1931]`}
            title={meta.label}
          >
            <Icon size={compact ? 11 : 12} />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

function formatInstructionStep(value: string) {
  return String(value || '')
    .replace(/^step\s*\d+\s*[:.)-]?\s*/i, '')
    .replace(/^\d+\s*[:.)-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCoreMealTypesFromAnswers(answers: OnboardingAnswers): PrimaryMealType[] {
  const fromSelection = Array.isArray(answers?.selectedMealTypes)
    ? [...new Set(
        answers.selectedMealTypes
          .map((entry) => String(entry || '').trim().toLowerCase())
          .filter((entry): entry is PrimaryMealType => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner')
      )]
    : [];
  if (fromSelection.length >= 2) {
    return PRIMARY_MEAL_TYPE_ORDER.filter((entry) => fromSelection.includes(entry));
  }
  return Number(answers.mealsPerDay || 3) <= 2 ? ['lunch', 'dinner'] : [...PRIMARY_MEAL_TYPE_ORDER];
}

function readSourceTime(recipe: Recipe, key: 'prepTime' | 'cookTime') {
  const raw = recipe.source?.[key];
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value === '-' || value.toLowerCase() === 'n/a') return '';
  return value;
}

function parseSourceMinutes(raw: string) {
  const text = String(raw || '').toLowerCase();
  if (!text) return undefined;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*min/);
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  let minutes = 0;
  if (hourMatch) minutes += Math.round(Number(hourMatch[1]) * 60);
  if (minuteMatch) minutes += Math.round(Number(minuteMatch[1]));
  if (!hourMatch && !minuteMatch && numberMatch) minutes += Math.round(Number(numberMatch[1]));
  return minutes > 0 ? minutes : undefined;
}

function parseNumberFromUnknown(value: unknown) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const text = String(value || '').trim();
  if (!text) return undefined;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveRecipeCalories(recipe: Recipe) {
  const direct = parseNumberFromUnknown(recipe?.calories);
  if (direct) return Math.round(direct);
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source as Record<string, unknown>
    : {};
  const nutritionRaw = source.nutritionRaw && typeof source.nutritionRaw === 'object' && !Array.isArray(source.nutritionRaw)
    ? source.nutritionRaw as Record<string, unknown>
    : {};
  const fromRaw = parseNumberFromUnknown(nutritionRaw.calories || nutritionRaw.Energy || nutritionRaw.Engery);
  return fromRaw ? Math.round(fromRaw) : undefined;
}

function resolveRecipeProtein(recipe: Recipe) {
  const direct = parseNumberFromUnknown(recipe?.protein);
  if (direct) return Math.round(direct * 10) / 10;
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source as Record<string, unknown>
    : {};
  const nutritionRaw = source.nutritionRaw && typeof source.nutritionRaw === 'object' && !Array.isArray(source.nutritionRaw)
    ? source.nutritionRaw as Record<string, unknown>
    : {};
  const fromRaw = parseNumberFromUnknown(nutritionRaw.protein || nutritionRaw.Protein);
  return fromRaw ? Math.round(fromRaw * 10) / 10 : undefined;
}

function buildRecipeTimeMeta(recipe: Recipe) {
  const defaultPrepMinutes = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 8;
    if (mealType === 'breakfast') return 10;
    return 12;
  };
  const defaultCookMinutes = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 5;
    if (mealType === 'breakfast') return 8;
    if (mealType === 'lunch') return 12;
    return 18;
  };
  const prepFromSource = readSourceTime(recipe, 'prepTime');
  const cookFromSource = readSourceTime(recipe, 'cookTime');
  const totalFromSource = parseSourceMinutes(String(recipe.source?.totalTime || recipe.source?.total_time || '').trim());
  const totalFromRecipe = typeof recipe.totalTimeMinutes === 'number' ? recipe.totalTimeMinutes : undefined;
  const totalMinutes = totalFromRecipe || totalFromSource;
  let prepMinutes = typeof recipe.prepTimeMinutes === 'number' ? recipe.prepTimeMinutes : parseSourceMinutes(prepFromSource);
  let cookMinutes = typeof recipe.cookTimeMinutes === 'number' ? recipe.cookTimeMinutes : parseSourceMinutes(cookFromSource);
  if (!prepMinutes && totalMinutes && cookMinutes && totalMinutes >= cookMinutes) {
    prepMinutes = Math.max(1, totalMinutes - cookMinutes);
  }
  if (!cookMinutes && totalMinutes) {
    cookMinutes = prepMinutes && totalMinutes >= prepMinutes ? Math.max(1, totalMinutes - prepMinutes) : totalMinutes;
  }
  if (!prepMinutes) prepMinutes = defaultPrepMinutes();
  if (!cookMinutes) cookMinutes = defaultCookMinutes();
  const prepLabel = Number.isFinite(prepMinutes) && prepMinutes && prepMinutes > 0 ? `${prepMinutes} min prep` : 'Prep time n/a';
  const cookLabel = Number.isFinite(cookMinutes) && cookMinutes && cookMinutes > 0 ? `${cookMinutes} min cook` : 'Cook time n/a';
  return `${prepLabel} • ${cookLabel}`;
}

type RecipeBadge = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  icon: LucideIcon;
};

type PersonalizedSummary = {
  title: string;
  intro: string;
  detail: string;
  personalNote: string;
  highlights: string[];
};

type PodcastVoiceProfile = 'happy_female';

type PodcastGenerationPayload = {
  generationKey: string;
  weekKey: string;
  estimatedDurationSec: number;
  audioMimeType: string;
};
const PODCAST_VOICE_PROFILE: PodcastVoiceProfile = 'happy_female';
const PODCAST_CACHE_STORAGE_KEY = 'weightLossReset:podcastCache:v1';
const PODCAST_CACHE_MAX_ENTRIES = 8;

type CachedPodcastAudio = {
  generationKey: string;
  weekKey: string;
  audioBase64: string;
  audioMimeType: string;
  estimatedDurationSec: number;
  savedAt: string;
};

function hashText(input: string) {
  const safe = String(input || '');
  let hash = 2166136261;
  for (let index = 0; index < safe.length; index += 1) {
    hash ^= safe.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function readPodcastCacheMap() {
  if (typeof window === 'undefined') return {} as Record<string, CachedPodcastAudio>;
  const raw = window.localStorage.getItem(PODCAST_CACHE_STORAGE_KEY);
  if (!raw) return {} as Record<string, CachedPodcastAudio>;
  try {
    const parsed = JSON.parse(raw) as Record<string, CachedPodcastAudio>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {} as Record<string, CachedPodcastAudio>;
    return parsed;
  } catch {
    return {} as Record<string, CachedPodcastAudio>;
  }
}

function writePodcastCacheMap(map: Record<string, CachedPodcastAudio>) {
  if (typeof window === 'undefined') return;
  const entries = Object.values(map).sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  const trimmed = entries.slice(0, PODCAST_CACHE_MAX_ENTRIES);
  const payload = trimmed.reduce<Record<string, CachedPodcastAudio>>((accumulator, entry) => {
    accumulator[entry.generationKey] = entry;
    return accumulator;
  }, {});
  try {
    window.localStorage.setItem(PODCAST_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/storage errors to avoid blocking the main UX.
  }
}

function normalizeToken(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeDescriptorText(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .toLowerCase();
}

function extractRecipeBadges(recipe: Recipe): RecipeBadge[] {
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source as Record<string, unknown>
    : {};
  const sourceTags = Array.isArray(source.cardTags)
    ? source.cardTags.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const tags = new Set(
    [...(recipe.dietaryTags || []), ...sourceTags].map((tag) => normalizeToken(tag)).filter(Boolean)
  );
  const descriptor = normalizeDescriptorText(
    `${recipe.title} ${recipe.description || ''} ${(recipe.dietaryTags || []).join(' ')} ${sourceTags.join(' ')}`
  );
  const protein = Number(resolveRecipeProtein(recipe) || 0);

  const badges: RecipeBadge[] = [];
  const addBadge = (badge: RecipeBadge) => {
    if (badges.some((existing) => existing.key === badge.key)) return;
    badges.push(badge);
  };

  if (
    tags.has('high-protein') ||
    tags.has('high-protien') ||
    /\bhigh[-\s]?protein\b/i.test(descriptor) ||
    protein >= 25
  ) {
    addBadge({ key: 'high-protein', shortLabel: 'HP', fullLabel: 'High protein', icon: Dumbbell });
  }

  if (tags.has('gluten-free') || tags.has('gf') || /\bgluten[-\s]?free\b/i.test(descriptor)) {
    addBadge({ key: 'gluten-free', shortLabel: 'GF', fullLabel: 'Gluten free', icon: WheatOff });
  }

  if (tags.has('vegan') || /\bvegan\b/i.test(descriptor)) {
    addBadge({ key: 'vegan', shortLabel: 'VG', fullLabel: 'Vegan', icon: Sprout });
  } else if (tags.has('vegetarian') || /\bvegetarian\b/i.test(descriptor)) {
    addBadge({ key: 'vegetarian', shortLabel: 'V', fullLabel: 'Vegetarian', icon: Leaf });
  }

  if (tags.has('dairy-free') || tags.has('lactose-free') || /\b(dairy|lactose)[-\s]?free\b/i.test(descriptor)) {
    addBadge({ key: 'dairy-free', shortLabel: 'DF', fullLabel: 'Dairy free', icon: MilkOff });
  }

  return badges.slice(0, 4);
}

function buildPersonalizedSummary({
  answers,
  displayFirstName,
}: {
  answers: OnboardingAnswers;
  displayFirstName?: string;
}): PersonalizedSummary {
  const firstName = displayFirstName || answers.firstName || 'there';
  const cleanedDietary = (answers.dietaryRequirements || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item && item !== 'no specific requirements');
  const dietaryLabel = cleanedDietary.length ? toDisplayList(cleanedDietary.slice(0, 3)) : 'your core nutrition preferences';
  const cuisines = (answers.preferredCuisines || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const cuisineLabel = cuisines.length ? toDisplayList(cuisines.slice(0, 3)) : 'your preferred flavour profile';
  const supportAreas = (answers.supportAreas || []).map((item) => String(item || '').trim()).filter(Boolean);
  const supportLabel = supportAreas.length ? toDisplayList(supportAreas.slice(0, 3)) : 'weekly accountability and routine';
  const availableEquipment = (answers.availableEquipment || [])
    .map((entry) => EQUIPMENT_LABELS[entry as CookingEquipment] || String(entry || '').trim())
    .filter(Boolean);
  const equipmentLabel = availableEquipment.length > 0 ? toDisplayList(availableEquipment.slice(0, 4)) : 'your available kitchen setup';
  const prepDay = answers.prepDay || 'Sunday';
  const preferredStyle = String(answers.preferredMealStyle || '').trim().toLowerCase();
  const styleCopy =
    preferredStyle && preferredStyle !== 'no preference'
      ? preferredStyle
      : 'keeping things simple and sustainable';
  const normalizedGoal = String(answers.mainGoal || '').trim().toLowerCase();
  const goalStatement = normalizedGoal
    ? normalizedGoal.includes('muscle')
      ? 'helping you build lean muscle while keeping meals realistic for your schedule'
      : normalizedGoal.includes('loss') || normalizedGoal.includes('fat')
        ? 'supporting steady fat loss while keeping meals realistic for your schedule'
        : `supporting ${normalizedGoal} while keeping meals realistic for your schedule`
    : 'supporting your goals while keeping meals realistic for your schedule';

  const highlights = [
    `${answers.preferredMealStyle || 'balanced'} meal style`,
    `Prep day set to ${prepDay}`,
    `Focus: ${getHealthFocusDisplayLabel(answers.primaryHealthFocus)}`,
  ];
  highlights.push(`Equipment: ${equipmentLabel}`);
  if (supportAreas.length > 0) highlights.push(`Support priorities: ${supportLabel}`);

  const personalNote = `Hi ${firstName}, I’ve aligned this plan with your intake form, preferences, and goals. I’ve included meals that should be realistic for your week, with a focus on ${styleCopy}. If anything feels hard to follow or you want changes, message me and I’ll help adjust it.`;

  return {
    title: `Hi ${firstName} — we built this week around ${goalStatement}.`,
    intro: `You are not starting from scratch. We prioritised ${dietaryLabel} meals with ${cuisineLabel} influences so this week feels calm, practical, and tailored to your body.`,
    detail: `The structure is intentionally simple: repeatable choices, lighter decision load, and support for ${supportLabel}, so consistency feels easier day to day.`,
    personalNote,
    highlights,
  };
}

function RecipeBadgePills({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const badges = extractRecipeBadges(recipe);
  if (badges.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
      {badges.map((badge) => {
        const Icon = badge.icon;
        return (
          <span
            key={`${recipe.id}-${badge.key}`}
            title={badge.fullLabel}
            className={`inline-flex items-center gap-1 rounded-full bg-[#eaf2f8] ${
              compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
            } font-semibold text-[#0a1931]`}
          >
            <Icon size={compact ? 11 : 12} />
            {badge.shortLabel}
          </span>
        );
      })}
    </div>
  );
}

function isConcreteRecipeImage(url: string) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(value)) return true;
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

function resolveRecipeImageUrl(recipe: Recipe) {
  const candidate = String(recipe?.imageUrl || '').trim();
  if (isConcreteRecipeImage(candidate)) return candidate;
  const sourceCandidate = String(recipe?.source?.image_url || recipe?.source?.imageUrl || '').trim();
  if (isConcreteRecipeImage(sourceCandidate)) return sourceCandidate;
  return '';
}

function formatMinutesLabel(totalMinutes: number) {
  const value = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (!value) return 'n/a';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function readRecipeServes(recipe: Recipe) {
  const fallbackByMealType = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 4;
    if (mealType === 'breakfast') return 2;
    if (mealType === 'lunch' || mealType === 'dinner') return 3;
    return undefined;
  };
  const direct = Number(recipe.serves || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct * 10) / 10;
  const fromSource = String(recipe.source?.serves || recipe.source?.servings || '').trim().toLowerCase();
  const values = [...fromSource.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return fallbackByMealType();
  if (values.length === 1) return Math.round(values[0] * 10) / 10;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const parsed = Math.round(average * 10) / 10;
  if (parsed > 0) return parsed;
  return fallbackByMealType();
}

function buildServesExplanation(recipe: Recipe) {
  const serves = readRecipeServes(recipe);
  if (!serves) return 'Serving size was not provided in the source recipe.';
  const sourceServes = String(recipe.source?.serves || '').trim();
  if (sourceServes) {
    return `Serves ${serves}. Source reference: "${sourceServes}".`;
  }
  return `Serves ${serves}. Derived from available recipe metadata.`;
}

function MealCard({
  recipe,
  onViewDetails,
  onSwap,
}: {
  recipe: Recipe;
  onViewDetails: () => void;
  onSwap: () => void;
}) {
  const imageUrl = resolveRecipeImageUrl(recipe);
  const serves = readRecipeServes(recipe);
  const calories = resolveRecipeCalories(recipe);
  const protein = resolveRecipeProtein(recipe);
  return (
    <article className="group overflow-hidden rounded-[26px] bg-white shadow-[0_18px_40px_-30px_rgba(10,25,49,0.42)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_54px_-34px_rgba(10,25,49,0.48)]">
      <div className="relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={recipe.title}
            className="h-44 w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="h-44 w-full bg-[#edf4fa]" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a1931]/24 to-transparent" />
        <div className="absolute left-2 top-2">
          <RecipeBadgePills recipe={recipe} compact />
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <div>
          <h4 className="line-clamp-2 text-base font-semibold leading-snug text-[#0a1931]">{recipe.title}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#1a3d63]">
            <span className="rounded-full bg-[#f6fafd] px-2.5 py-1">{calories || '—'} kcal</span>
            <span className="rounded-full bg-[#f6fafd] px-2.5 py-1">{protein || '—'}g protein</span>
            <span className="rounded-full bg-[#f6fafd] px-2.5 py-1">{buildRecipeTimeMeta(recipe)}</span>
            {serves ? <span className="rounded-full bg-[#f6fafd] px-2.5 py-1">Serves {serves}</span> : null}
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a7fa7]">Equipment</p>
            <RecipeEquipmentPills recipe={recipe} compact />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-[#edf4fa] text-xs font-semibold text-[#1a3d63] transition hover:bg-[#e4eff8]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-[#1a3d63] text-xs font-semibold text-white shadow-[0_10px_18px_-14px_rgba(10,25,49,0.8)] transition hover:bg-[#0a1931]"
          >
            Swap meal
          </button>
        </div>
      </div>
    </article>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0a1931]/55 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-[760px] overflow-auto rounded-3xl bg-white p-5 shadow-[0_34px_58px_-34px_rgba(15,23,42,0.66)]">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#edf4fa] px-3 py-1.5 text-xs font-semibold text-[#1a3d63]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[#0a1931] text-white shadow-[0_14px_24px_-18px_rgba(10,25,49,0.9)]'
          : 'text-[#1a3d63] hover:bg-white/70 hover:text-[#0a1931]'
      }`}
    >
      {label}
    </button>
  );
}

function toDisplayList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function getWeekStartIsoKey(date = new Date()) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - day);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function formatDurationClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function collectPlannedRecipeTitles(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>) {
  if (!mealPlan || !Array.isArray(mealPlan.days)) return [] as string[];
  const seen = new Set<string>();
  const titles: string[] = [];

  for (const day of mealPlan.days) {
    const ids = [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])];
    for (const recipeId of ids) {
      if (!recipeId) continue;
      const recipe = recipeMap.get(recipeId);
      const title = String(recipe?.title || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
      if (titles.length >= 4) return titles;
    }
  }

  return titles;
}

function buildWeeklyPodcastScript({
  firstName,
  focusLabel,
  personalizedSummary,
  mealPlan,
  recipeMap,
}: {
  firstName: string;
  focusLabel: string;
  personalizedSummary: PersonalizedSummary;
  mealPlan: MealPlan | null;
  recipeMap: Map<string, Recipe>;
}) {
  const safeFirstName = String(firstName || 'there').trim() || 'there';
  const focus = String(focusLabel || 'overall nutrition').trim() || 'overall nutrition';
  const recipes = collectPlannedRecipeTitles(mealPlan, recipeMap);
  const mealExampleCopy =
    recipes.length >= 2
      ? `This week includes ${recipes.slice(0, 2).join(' and ')}, chosen to keep your meals practical and satisfying.`
      : 'This week\'s meals were selected to keep prep simple while still supporting your nutrition targets.';
  const highlights = personalizedSummary.highlights.slice(0, 2);
  const highlightCopy = highlights.length > 0 ? `Key priorities this week: ${highlights.join(', ')}.` : '';
  const introLine = `Hi ${safeFirstName}, welcome to your personal science podcast tailored to your body this week.`;
  const scienceMechanismLine =
    'At a physiology level, this plan is structured to support metabolic flexibility, appetite regulation, and better nutrient partitioning through predictable meal composition.';
  const bodyEducationLine =
    'This plan is designed for metabolic stability: consistent protein distribution supports muscle protein synthesis, fiber supports satiety and glycemic control, and regular meal timing helps reduce energy volatility.';
  const executionLine =
    'From a behavior perspective, repeatable meals reduce cognitive load and improve adherence, which is one of the strongest predictors of meaningful long-term outcomes.';
  const digestionLine =
    'Hydration, fiber diversity, and meal timing together support gut motility and microbiome resilience, which can improve energy consistency and recovery through the week.';
  const progressLine = 'Your weekly target is consistency and repeatability, not perfection, so the plan stays realistic for your routine.';
  const closeLine =
    'Stay observant this week: notice hunger stability, post-meal energy, and recovery quality, then use that feedback to refine next week with small targeted adjustments.';
  const supportLine = 'If your routine changes, we can adjust quickly while preserving your core nutrition structure.';
  const detailsLine = personalizedSummary.detail ? personalizedSummary.detail : '';

  return [
    introLine,
    `Your focus this week is ${focus}.`,
    mealExampleCopy,
    scienceMechanismLine,
    bodyEducationLine,
    executionLine,
    digestionLine,
    progressLine,
    highlightCopy,
    detailsLine,
    closeLine,
    supportLine,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBase64AudioToObjectUrl(base64Audio: string, mimeType: string) {
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

function buildGenerationMessages(answers: OnboardingAnswers) {
  const normalizedDietary = (answers.dietaryRequirements || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item && item !== 'no specific requirements')
    .slice(0, 3);
  const dietaryLabel =
    normalizedDietary.length > 0 ? toDisplayList(normalizedDietary) : 'your general eating preferences';

  const allergyTerms = [
    ...answers.allergyChips,
    ...String(answers.allergiesText || '')
      .split(/[,\n;]/g)
      .map((item) => item.trim())
      .filter(Boolean),
  ].slice(0, 4);
  const allergyLabel = allergyTerms.length > 0 ? toDisplayList(allergyTerms) : 'no listed allergy triggers';
  const preferredCuisines = (answers.preferredCuisines || []).map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4);
  const cuisineLabel = preferredCuisines.length > 0 ? toDisplayList(preferredCuisines) : 'all cuisine styles';
  const favoriteFoods = (answers.favoriteFoods || []).map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4);
  const favoriteFoodsLabel = favoriteFoods.length > 0 ? toDisplayList(favoriteFoods) : 'your usual favourite ingredients';
  const availableEquipment = (answers.availableEquipment || [])
    .map((entry) => EQUIPMENT_LABELS[entry as CookingEquipment] || String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  const equipmentLabel = availableEquipment.length > 0 ? toDisplayList(availableEquipment) : 'your available kitchen equipment';

  const coreMealTypes = resolveCoreMealTypesFromAnswers(answers);
  const coreMealTypeLabel = toDisplayList(coreMealTypes);
  return [
    `Reading your intake preferences and priorities: ${dietaryLabel}.`,
    `Filtering every meal candidate for ${allergyLabel}.`,
    `Running dietitian quality checks for portions, macros, practical steps, and ${equipmentLabel}.`,
    `Prioritising ${cuisineLabel} meals and ${favoriteFoodsLabel}.`,
    `Matching ${answers.preferredMealStyle} meals across ${coreMealTypeLabel}.`,
    `Balancing calories and protein for your ${answers.primaryHealthFocus || 'weight loss'} focus.`,
    'Finalising your weekly plan, swap options, and grocery list sync.',
  ];
}

export default function WeightLossResetDashboard({
  answers,
  displayFirstName,
  dietitian,
  mealPlan,
  recipes,
  weightLogs,
  messages,
  groceryCheckedItems,
  onBackToHome,
  onRegeneratePlan,
  onUpdatePreferences,
  onSwapMeal,
  onAddWeightLog,
  onUpdateWeightLog,
  onAddMessage,
  onToggleGroceryItem,
  isGeneratingPlan = false,
}: {
  answers: OnboardingAnswers;
  displayFirstName?: string;
  dietitian?: AssignedDietitianProfile | null;
  mealPlan: MealPlan | null;
  recipes: Recipe[];
  weightLogs: WeightLogEntry[];
  messages: DietitianMessage[];
  groceryCheckedItems: string[];
  onBackToHome: () => void;
  onRegeneratePlan: () => void;
  onUpdatePreferences: () => void;
  onSwapMeal: (dayIndex: number, mealType: MealType, recipeId: string) => void;
  onAddWeightLog: (payload: { date: string; weight: number; note?: string }) => void;
  onUpdateWeightLog: (payload: { id: string; date: string; weight: number; note?: string }) => void;
  onAddMessage: (payload: { role: 'user' | 'system'; text: string }) => void;
  onToggleGroceryItem: (itemKey: string) => void;
  isGeneratingPlan?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; mealType: MealType; current: Recipe | undefined } | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [weightValue, setWeightValue] = useState('');
  const [weightNote, setWeightNote] = useState('');
  const [editingWeightLogId, setEditingWeightLogId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessageIndex, setGenerationMessageIndex] = useState(0);
  const [podcastPayload, setPodcastPayload] = useState<PodcastGenerationPayload | null>(null);
  const [podcastAudioUrl, setPodcastAudioUrl] = useState('');
  const [podcastError, setPodcastError] = useState('');
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [isPodcastPlaying, setIsPodcastPlaying] = useState(false);
  const [podcastCurrentTimeSec, setPodcastCurrentTimeSec] = useState(0);
  const [podcastDurationSec, setPodcastDurationSec] = useState(0);
  const [podcastBars, setPodcastBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.2));
  const dietitianName = String(dietitian?.fullName || '').trim() || 'Your dietitian';
  const dietitianImageUrl = String(dietitian?.profilePhotoUrl || '').trim() || DEFAULT_DIETITIAN_PROFILE_IMAGE_URL;
  const dietitianCredentials = String(dietitian?.credentials || '').trim() || 'Accredited Dietitian';
  const dietitianBio = String(dietitian?.bio || '').trim() || 'Practical, kind, realistic support.';

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const groceryGroups = useMemo(() => buildGroceryListFromMealPlan(mealPlan, recipeMap), [mealPlan, recipeMap]);
  const groceryRecipeSummaries = useMemo(() => {
    if (!mealPlan) return [] as Array<{ key: string; title: string; imageUrl: string; count: number }>;
    const byKey = new Map<string, { key: string; title: string; imageUrl: string; count: number }>();

    for (const day of mealPlan.days) {
      for (const recipeId of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])]) {
        if (!recipeId) continue;
        const recipe = recipeMap.get(recipeId);
        if (!recipe) continue;
        const dedupeKey = String(recipe.source?.url || recipe.title || recipe.id).trim().toLowerCase();
        if (!dedupeKey) continue;
        const existing = byKey.get(dedupeKey);
        if (existing) {
          existing.count += 1;
          continue;
        }
        byKey.set(dedupeKey, {
          key: dedupeKey,
          title: recipe.title,
          imageUrl: resolveRecipeImageUrl(recipe),
          count: 1,
        });
      }
    }

    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [mealPlan, recipeMap]);
  const generationMessages = useMemo(() => buildGenerationMessages(answers), [answers]);
  const focusLabel = useMemo(() => getHealthFocusDisplayLabel(answers.primaryHealthFocus), [answers.primaryHealthFocus]);
  const visibleCoreMealTypes = useMemo<PrimaryMealType[]>(
    () => resolveCoreMealTypesFromAnswers(answers),
    [answers]
  );
  const showSnackMeals = false;
  const personalizedSummary = useMemo(
    () =>
      buildPersonalizedSummary({
        answers,
        displayFirstName,
      }),
    [answers, displayFirstName]
  );
  const generationPercent = Math.round(Math.max(6, Math.min(100, generationProgress)));
  const generationStages = [
    { label: 'Preference alignment', threshold: 14 },
    { label: 'Dietitian quality checks', threshold: 40 },
    { label: 'Meal and image matching', threshold: 68 },
    { label: 'Final sync to your account', threshold: 94 },
  ];

  const currentWeight = getCurrentWeight(weightLogs, answers.currentWeightKg);
  const progressPercent = calculateGoalProgressFromHistory({
    startingWeight: answers.currentWeightKg,
    goalWeight: answers.goalWeightKg,
    currentWeight,
    historicalWeights: weightLogs.map((entry) => Number(entry.weight)),
  });

  const weekNumber = (() => {
    if (!mealPlan?.generatedAt) return 1;
    const generatedAtMs = new Date(mealPlan.generatedAt).getTime();
    if (!Number.isFinite(generatedAtMs)) return 1;
    const referenceMs = weightLogs.length > 0 ? new Date(weightLogs[0].date).getTime() : generatedAtMs;
    if (!Number.isFinite(referenceMs)) return 1;
    return Math.max(1, Math.floor((referenceMs - generatedAtMs) / (7 * 24 * 60 * 60 * 1000)) + 1);
  })();
  const currentWeekKey = getWeekStartIsoKey(new Date());
  const podcastWeekKey = `${currentWeekKey}:week-${weekNumber}`;
  const weeklyPodcastScript = useMemo(
    () =>
      buildWeeklyPodcastScript({
        firstName: displayFirstName || answers.firstName || 'there',
        focusLabel,
        personalizedSummary,
        mealPlan,
        recipeMap,
      }),
    [
      answers.firstName,
      displayFirstName,
      focusLabel,
      mealPlan,
      personalizedSummary,
      recipeMap,
    ]
  );
  const podcastGenerationKey = `${podcastWeekKey}:${hashText(weeklyPodcastScript)}`;

  const swapCandidates = swapTarget
    ? getSwapCandidates({
        recipes,
        answers,
        mealType: swapTarget.mealType,
        currentRecipe: swapTarget.current,
        limit: 32,
      })
    : [];

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );
  const selectedRecipeServes = selectedRecipe ? readRecipeServes(selectedRecipe) : undefined;
  const generationProgressRef = useRef(generationProgress);
  const mealPlanSectionRef = useRef<HTMLElement | null>(null);
  const grocerySectionRef = useRef<HTMLElement | null>(null);
  const progressSectionRef = useRef<HTMLElement | null>(null);
  const messagesSectionRef = useRef<HTMLElement | null>(null);
  const podcastAudioRef = useRef<HTMLAudioElement | null>(null);
  const podcastAudioUrlRef = useRef('');
  const podcastAudioContextRef = useRef<AudioContext | null>(null);
  const podcastAnalyserRef = useRef<AnalyserNode | null>(null);
  const podcastSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const podcastFrequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const podcastAnimationFrameRef = useRef<number | null>(null);

  const openTab = useCallback((nextTab: DashboardTab) => {
    setActiveTab(nextTab);
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target =
          nextTab === 'grocery'
            ? grocerySectionRef.current
            : nextTab === 'progress'
              ? progressSectionRef.current
              : nextTab === 'messages'
                ? messagesSectionRef.current
                : mealPlanSectionRef.current;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, []);

  useEffect(() => {
    generationProgressRef.current = generationProgress;
  }, [generationProgress]);

  useEffect(() => {
    let disposed = false;
    const TARGET_DURATION_MS = 120_000;
    const MIN_PROGRESS = 8;
    const MAX_IN_PROGRESS = 98;

    if (!isGeneratingPlan) {
      const shouldDelayReset = generationProgressRef.current > 0;
      let resetTimer: number | null = null;
      const completionTimer = window.setTimeout(() => {
        if (disposed) return;
        if (shouldDelayReset) {
          setGenerationProgress(100);
        }
        resetTimer = window.setTimeout(() => {
          if (disposed) return;
          setGenerationProgress(0);
          setGenerationMessageIndex(0);
        }, shouldDelayReset ? 900 : 0);
      }, 0);
      return () => {
        disposed = true;
        window.clearTimeout(completionTimer);
        if (resetTimer) window.clearTimeout(resetTimer);
      };
    }

    const startedAt = Date.now();
    const initialTimer = window.setTimeout(() => {
      if (disposed) return;
      setGenerationProgress(MIN_PROGRESS);
      setGenerationMessageIndex(0);
    }, 0);

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const completion = Math.max(0, Math.min(1, elapsed / TARGET_DURATION_MS));
      const eased = 1 - (1 - completion) * (1 - completion);
      const next = MIN_PROGRESS + eased * (MAX_IN_PROGRESS - MIN_PROGRESS);
      setGenerationProgress((current) => Math.max(current, next));
    }, 500);

    const messageTimer = window.setInterval(() => {
      setGenerationMessageIndex((current) => (current + 1) % generationMessages.length);
    }, 2200);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(progressTimer);
      window.clearInterval(messageTimer);
    };
  }, [generationMessages.length, isGeneratingPlan]);

  useEffect(() => {
    podcastAudioUrlRef.current = podcastAudioUrl;
  }, [podcastAudioUrl]);

  const applyCachedPodcast = useCallback((cached: CachedPodcastAudio) => {
    if (!cached?.audioBase64) return false;
    try {
      const audioUrl = decodeBase64AudioToObjectUrl(cached.audioBase64, cached.audioMimeType || 'audio/mpeg');
      setPodcastAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return audioUrl;
      });
      setPodcastCurrentTimeSec(0);
      setPodcastDurationSec(Math.max(0, Number(cached.estimatedDurationSec || 0)));
      setPodcastPayload({
        generationKey: cached.generationKey,
        weekKey: cached.weekKey,
        estimatedDurationSec: Math.max(0, Number(cached.estimatedDurationSec || 0)),
        audioMimeType: String(cached.audioMimeType || 'audio/mpeg'),
      });
      setPodcastError('');
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!mealPlan || !weeklyPodcastScript || isGeneratingPlan) return;
    if (podcastPayload?.generationKey === podcastGenerationKey && podcastAudioUrl) return;
    const cacheMap = readPodcastCacheMap();
    const cached = cacheMap[podcastGenerationKey];
    if (!cached) return;
    const restored = applyCachedPodcast(cached);
    if (!restored) {
      delete cacheMap[podcastGenerationKey];
      writePodcastCacheMap(cacheMap);
    }
  }, [
    applyCachedPodcast,
    isGeneratingPlan,
    mealPlan,
    podcastAudioUrl,
    podcastGenerationKey,
    podcastPayload?.generationKey,
    weeklyPodcastScript,
  ]);

  const resetPodcastBars = useCallback(() => {
    setPodcastBars(Array.from({ length: 24 }, (_, index) => (index % 6 === 0 ? 0.32 : 0.2)));
  }, []);

  const ensurePodcastVisualizer = useCallback(async () => {
    const audio = podcastAudioRef.current;
    if (!audio || typeof window === 'undefined') return;
    const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      resetPodcastBars();
      return;
    }

    if (!podcastAudioContextRef.current) {
      podcastAudioContextRef.current = new AudioContextConstructor();
    }
    if (podcastAudioContextRef.current.state === 'suspended') {
      await podcastAudioContextRef.current.resume();
    }

    if (!podcastAnalyserRef.current) {
      const analyser = podcastAudioContextRef.current.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      podcastAnalyserRef.current = analyser;
      podcastFrequencyDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }

    if (!podcastSourceNodeRef.current) {
      const source = podcastAudioContextRef.current.createMediaElementSource(audio);
      source.connect(podcastAnalyserRef.current);
      podcastAnalyserRef.current.connect(podcastAudioContextRef.current.destination);
      podcastSourceNodeRef.current = source;
    }
  }, [resetPodcastBars]);

  useEffect(() => {
    return () => {
      if (podcastAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(podcastAnimationFrameRef.current);
      }
      if (podcastAudioUrlRef.current) {
        URL.revokeObjectURL(podcastAudioUrlRef.current);
      }
      if (podcastAudioContextRef.current) {
        podcastAudioContextRef.current.close().catch(() => {
          // ignore cleanup errors
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!isPodcastPlaying) {
      if (podcastAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(podcastAnimationFrameRef.current);
        podcastAnimationFrameRef.current = null;
      }
      resetPodcastBars();
      return;
    }

    const analyser = podcastAnalyserRef.current;
    const frequencyData = podcastFrequencyDataRef.current;
    if (!analyser || !frequencyData) return;

    const barsCount = 24;
    const animate = () => {
      analyser.getByteFrequencyData(frequencyData);
      const buckets = Array.from({ length: barsCount }, (_, index) => {
        const start = Math.floor((index * frequencyData.length) / barsCount);
        const end = Math.max(start + 1, Math.floor(((index + 1) * frequencyData.length) / barsCount));
        let sum = 0;
        for (let pointer = start; pointer < end; pointer += 1) {
          sum += frequencyData[pointer] || 0;
        }
        const normalized = sum / ((end - start) * 255);
        return Math.min(1, 0.16 + normalized * 1.05);
      });
      setPodcastBars(buckets);
      podcastAnimationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (podcastAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(podcastAnimationFrameRef.current);
        podcastAnimationFrameRef.current = null;
      }
    };
  }, [isPodcastPlaying, resetPodcastBars]);

  const generateWeeklyPodcast = useCallback(
    async () => {
      if (!mealPlan || !weeklyPodcastScript) return;
      if (isGeneratingPodcast) return;
      const activeToken = window.localStorage.getItem('onya_patient_token') || '';
      if (!activeToken) {
        setPodcastError('Please sign in again to generate this week\'s podcast brief.');
        return;
      }

      setIsGeneratingPodcast(true);
      setPodcastError('');
      setIsPodcastPlaying(false);
      resetPodcastBars();
      if (podcastAudioRef.current) {
        podcastAudioRef.current.pause();
        podcastAudioRef.current.currentTime = 0;
      }

      try {
        const cacheMap = readPodcastCacheMap();
        const cached = cacheMap[podcastGenerationKey];
        if (cached && applyCachedPodcast(cached)) {
          setIsGeneratingPodcast(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 35_000);
        const { response, payload } = await fetchApiJson('/api/patient/meal-plan/podcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            voiceProfile: PODCAST_VOICE_PROFILE,
            weekKey: podcastWeekKey,
            weekNumber,
            answers,
            mealPlan,
            mealHighlights: collectPlannedRecipeTitles(mealPlan, recipeMap).slice(0, 3),
            script: weeklyPodcastScript,
          }),
        }).finally(() => {
          window.clearTimeout(timeoutId);
        });

        if (!response.ok || !payload?.ok || typeof payload?.audioBase64 !== 'string' || !payload.audioBase64.trim()) {
          throw new Error(String(payload?.error || '').trim() || 'Unable to generate this week\'s podcast brief.');
        }

        const audioUrl = decodeBase64AudioToObjectUrl(payload.audioBase64, String(payload?.audioMimeType || 'audio/mpeg'));
        setPodcastAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return audioUrl;
        });
        setPodcastCurrentTimeSec(0);
        setPodcastDurationSec(Math.max(0, Number(payload?.estimatedDurationSec || 0)));
        setPodcastPayload({
          generationKey: podcastGenerationKey,
          weekKey: String(payload?.weekKey || podcastWeekKey),
          estimatedDurationSec: Math.max(0, Number(payload?.estimatedDurationSec || 0)),
          audioMimeType: String(payload?.audioMimeType || 'audio/mpeg'),
        });
        writePodcastCacheMap({
          ...readPodcastCacheMap(),
          [podcastGenerationKey]: {
            generationKey: podcastGenerationKey,
            weekKey: String(payload?.weekKey || podcastWeekKey),
            audioBase64: String(payload.audioBase64 || ''),
            audioMimeType: String(payload?.audioMimeType || 'audio/mpeg'),
            estimatedDurationSec: Math.max(0, Number(payload?.estimatedDurationSec || 0)),
            savedAt: new Date().toISOString(),
          },
        });
      } catch (errorObject) {
        const message =
          errorObject instanceof DOMException && errorObject.name === 'AbortError'
            ? 'Podcast generation timed out. Please try again in a few seconds.'
            : errorObject instanceof Error
              ? errorObject.message
              : 'Unable to generate this week\'s podcast brief.';
        setPodcastError(message);
        setPodcastPayload(null);
      } finally {
        setIsGeneratingPodcast(false);
      }
    },
    [
      applyCachedPodcast,
      answers,
      isGeneratingPodcast,
      mealPlan,
      podcastGenerationKey,
      podcastWeekKey,
      recipeMap,
      resetPodcastBars,
      weekNumber,
      weeklyPodcastScript,
    ]
  );

  useEffect(() => {
    if (!mealPlan || isGeneratingPlan) return;
    if (podcastPayload?.generationKey === podcastGenerationKey && podcastAudioUrl) return;
    const cacheMap = readPodcastCacheMap();
    const cached = cacheMap[podcastGenerationKey];
    if (cached && applyCachedPodcast(cached)) return;
    void generateWeeklyPodcast();
  }, [
    applyCachedPodcast,
    generateWeeklyPodcast,
    isGeneratingPlan,
    mealPlan,
    podcastAudioUrl,
    podcastGenerationKey,
    podcastPayload?.generationKey,
  ]);

  const togglePodcastPlayback = async () => {
    const audio = podcastAudioRef.current;
    if (!audio || !podcastAudioUrl) return;
    if (audio.paused) {
      try {
        await ensurePodcastVisualizer();
        await audio.play();
      } catch (errorObject) {
        setPodcastError(errorObject instanceof Error ? errorObject.message : 'Unable to start audio playback.');
      }
      return;
    }
    audio.pause();
  };

  const onPodcastSeek = (seconds: number) => {
    const audio = podcastAudioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setPodcastCurrentTimeSec(seconds);
  };

  const resetWeightForm = useCallback(() => {
    setEditingWeightLogId(null);
    setWeightDate(new Date().toISOString().slice(0, 10));
    setWeightValue('');
    setWeightNote('');
  }, []);

  const startEditingWeightLog = useCallback((entry: WeightLogEntry) => {
    const parsedDate = new Date(entry.date);
    const safeDate = Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    setEditingWeightLogId(entry.id);
    setWeightDate(safeDate);
    setWeightValue(String(entry.weight));
    setWeightNote(entry.note || '');
    openTab('progress');
  }, [openTab]);

  const submitWeight = (event: FormEvent) => {
    event.preventDefault();
    const numericWeight = Number(weightValue);
    if (!Number.isFinite(numericWeight) || numericWeight < 30 || numericWeight > 350) return;
    const parsedDate = new Date(weightDate);
    if (!Number.isFinite(parsedDate.getTime())) return;
    if (numericWeight > 250 && !window.confirm(`You entered ${numericWeight} kg. Save this value?`)) return;

    const payload = {
      date: parsedDate.toISOString(),
      weight: numericWeight,
      note: weightNote,
    };

    if (editingWeightLogId) {
      onUpdateWeightLog({
        id: editingWeightLogId,
        ...payload,
      });
    } else {
      onAddWeightLog(payload);
    }
    resetWeightForm();
    openTab('progress');
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;
    onAddMessage({ role: 'user', text });
    onAddMessage({
      role: 'system',
      text: 'Saved locally for demo mode. Live dietitian messaging can be connected later without losing your notes.',
    });
    setMessageInput('');
  };

  return (
    <section className="space-y-7 font-[Inter,sans-serif] text-[#0a1931]">
      <header className="relative overflow-hidden rounded-[34px] bg-gradient-to-br from-white via-[#f6fafd] to-[#f2f8fc] p-5 shadow-[0_30px_56px_-40px_rgba(10,25,49,0.45)] sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#e9dcc9]/55 blur-2xl" />
        <div className="pointer-events-none absolute left-10 top-20 h-16 w-16 rounded-full bg-white/70 blur-xl" />

        <div className="relative grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[#1a3d63]">
                {WEIGHT_LOSS_RESET_PROGRAM_NAME} • Week {weekNumber} • Focus: {focusLabel}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e9dcc9]/80 px-2.5 py-1 text-[11px] font-semibold text-[#0a1931]">
                <CheckCircle2 size={12} />
                Reviewed today
              </span>
            </div>

            <h1 className="mt-3 max-w-[720px] text-[2.05rem] font-semibold leading-tight tracking-[-0.02em] text-[#0a1931] sm:text-[2.45rem]">
              {personalizedSummary.title}
            </h1>
            <p className="mt-3 max-w-[720px] text-[1rem] leading-7 text-[#24496f] sm:text-[1.06rem]">
              {personalizedSummary.intro}
            </p>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:max-w-[560px]">
              <button
                type="button"
                onClick={() => openTab('progress')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#1a3d63] px-4 text-sm font-semibold text-white shadow-[0_16px_26px_-20px_rgba(10,25,49,0.9)] transition hover:bg-[#0a1931]"
              >
                <Weight size={16} />
                Log weight
              </button>
              <button
                type="button"
                onClick={() => openTab('messages')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 text-sm font-semibold text-[#1a3d63] shadow-[0_14px_24px_-20px_rgba(10,25,49,0.35)] transition hover:bg-white"
              >
                <MessageCircle size={16} />
                Message {dietitianName}
              </button>
              <button
                type="button"
                onClick={() => openTab('meal-plan')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 text-sm font-semibold text-[#1a3d63] shadow-[0_14px_24px_-20px_rgba(10,25,49,0.35)] transition hover:bg-white"
              >
                <Shuffle size={16} />
                Swap a meal
              </button>
              <button
                type="button"
                onClick={() => openTab('grocery')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 text-sm font-semibold text-[#1a3d63] shadow-[0_14px_24px_-20px_rgba(10,25,49,0.35)] transition hover:bg-white"
              >
                <ShoppingCart size={16} />
                View grocery list
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <article className="rounded-[28px] bg-white/95 p-4 shadow-[0_24px_42px_-30px_rgba(10,25,49,0.45)]">
              <div className="flex items-start gap-4">
                <ProfileAvatar
                  name={dietitianName}
                  imageUrl={dietitianImageUrl}
                  fallbackImageUrl={DEFAULT_DIETITIAN_PROFILE_IMAGE_URL}
                  alt={`${dietitianName} profile`}
                  className="h-24 w-24 rounded-3xl object-cover shadow-[0_12px_22px_-16px_rgba(10,25,49,0.65)] sm:h-28 sm:w-28"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#4a7fa7]">Your Dietitian</p>
                  <p className="mt-1 text-[1.65rem] font-semibold leading-none text-[#0a1931]">{dietitianName}</p>
                  <p className="mt-1 text-sm text-[#1a3d63]">{dietitianCredentials}</p>
                  <p className="mt-2 text-sm leading-6 text-[#2e577f]">{dietitianBio}</p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white/90 px-4 py-3 shadow-[0_18px_34px_-26px_rgba(10,25,49,0.4)]">
              <div className="flex items-center justify-between text-base font-medium text-[#1a3d63]">
                <span>Current {currentWeight || '—'} kg</span>
                <span>Goal {answers.goalWeightKg || '—'} kg</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#d8e9f5]">
                <div className="h-full rounded-full bg-[#1a3d63] transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-2 text-sm font-semibold text-[#1a3d63]">{progressPercent}% toward your goal</p>
            </article>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#eef5fb] p-2">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-[#1a3d63] shadow-[0_12px_22px_-18px_rgba(10,25,49,0.45)] transition hover:text-[#0a1931]"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <TabButton active={activeTab === 'overview'} label="Overview" onClick={() => openTab('overview')} />
        <TabButton active={activeTab === 'meal-plan'} label="Meal plan" onClick={() => openTab('meal-plan')} />
        <TabButton active={activeTab === 'grocery'} label="Grocery list" onClick={() => openTab('grocery')} />
        <TabButton active={activeTab === 'progress'} label="Progress" onClick={() => openTab('progress')} />
        <TabButton active={activeTab === 'messages'} label={`Message ${dietitianName}`} onClick={() => openTab('messages')} />
      </nav>

      {(activeTab === 'overview' || activeTab === 'meal-plan') && (
        <section ref={mealPlanSectionRef} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] text-[#0a1931]">Weekly meal plan</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUpdatePreferences}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#1a3d63] shadow-[0_14px_24px_-20px_rgba(10,25,49,0.42)]"
              >
                Update intake preferences
              </button>
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#1a3d63] shadow-[0_14px_24px_-20px_rgba(10,25,49,0.42)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCcw size={14} />
                {isGeneratingPlan ? 'Refreshing plan...' : 'Refresh weekly plan'}
              </button>
            </div>
          </div>

          {!mealPlan && (
            <article className="rounded-3xl bg-white p-6 text-sm text-[#1a3d63] shadow-[0_24px_40px_-32px_rgba(10,25,49,0.5)]">
              Weekly meals are not generated yet.
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#1a3d63] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGeneratingPlan ? 'Generating weekly meals...' : 'Generate weekly meals'}
                <ArrowRight size={15} />
              </button>
            </article>
          )}

          {isGeneratingPlan ? (
            <article className="rounded-3xl bg-[#f5f9fc] p-5 shadow-[0_24px_42px_-34px_rgba(10,25,49,0.42)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#0a1931]">
                    <LoaderCircle size={15} className="animate-spin text-[#1a3d63]" />
                    Building your updated weekly plan
                  </p>
                  <p className="mt-1 text-sm text-[#1a3d63]">{generationMessages[generationMessageIndex]}</p>
                </div>
                <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0a1931] shadow-[0_10px_20px_-16px_rgba(10,25,49,0.45)]">
                  {generationPercent}%
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#b3cfe5]">
                <div className="h-full rounded-full bg-[#1a3d63] transition-[width] duration-300" style={{ width: `${generationPercent}%` }} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {generationStages.map((stage) => {
                  const completed = generationPercent >= stage.threshold;
                  return (
                    <p
                      key={stage.label}
                      className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold ${
                        completed
                          ? 'bg-white text-[#0a1931]'
                          : 'bg-[#eaf2f9] text-[#4a7fa7]'
                      }`}
                    >
                      {stage.label}
                    </p>
                  );
                })}
              </div>
            </article>
          ) : null}

          {mealPlan ? (
            <article className="rounded-[30px] bg-white p-5 shadow-[0_28px_52px_-38px_rgba(10,25,49,0.48)] sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#4a7fa7]">Week at a glance</p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-[-0.015em] text-[#0a1931]">
                    Built for consistency, energy, and realistic execution.
                  </h3>
                  <p className="mt-2 max-w-[760px] text-[0.98rem] leading-7 text-[#2f5d86]">{personalizedSummary.detail}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <p className="rounded-full bg-[#edf4fa] px-3 py-1.5 text-xs font-semibold text-[#1a3d63]">Focus: {focusLabel}</p>
                  <p className="rounded-full bg-[#edf4fa] px-3 py-1.5 text-xs font-semibold text-[#1a3d63]">Prep day: {answers.prepDay || 'Sunday'}</p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl bg-[#f8f1e7] p-4 shadow-[inset_0_0_0_1px_rgba(180,151,112,0.15)] sm:p-5">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7b5a33]">
                  <Star size={12} />
                  Comment from Felicity
                </p>
                <p className="mt-3 border-l-2 border-[#cba978] pl-4 text-[1rem] leading-7 text-[#533f29] italic">{personalizedSummary.personalNote}</p>
                <p className="mt-2 pl-4 text-sm font-medium text-[#7b5a33]">Felicity</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {personalizedSummary.highlights.slice(0, 3).map((highlight) => (
                  <p key={highlight} className="rounded-full bg-[#edf4fa] px-3 py-1.5 text-xs font-semibold text-[#1a3d63]">
                    {highlight}
                  </p>
                ))}
              </div>

              <div className="mt-5 rounded-[28px] bg-gradient-to-br from-[#102a47] via-[#163356] to-[#1a3d63] p-4 text-white shadow-[0_24px_48px_-34px_rgba(10,25,49,0.9)] sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#e3eef8]">
                    <AudioLines size={15} />
                    Personal science podcast tailored to your body
                  </p>
                  <p className="text-xs font-semibold text-[#c7dcf0]">
                    {isGeneratingPodcast
                      ? 'Generating...'
                      : `${formatDurationClock(podcastCurrentTimeSec)} / ${formatDurationClock(
                          podcastDurationSec || Math.max(0, Math.round(Number(podcastPayload?.estimatedDurationSec || 0)))
                        )}`}
                  </p>
                </div>

                <p className="mt-1 text-sm leading-6 text-[#c7dcf0]">
                  A weekly evidence-led audio briefing built once per week and tailored to your current nutrition plan, routines, and goals.
                </p>

                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                  <button
                    type="button"
                    onClick={() => void togglePodcastPlayback()}
                    disabled={!podcastAudioUrl || isGeneratingPodcast}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#0a1931] shadow-[0_12px_24px_-16px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-55"
                    aria-label={isPodcastPlaying ? 'Pause weekly podcast brief' : 'Play weekly podcast brief'}
                  >
                    {isGeneratingPodcast ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : isPodcastPlaying ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} className="translate-x-[1px]" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, Number(podcastDurationSec || podcastPayload?.estimatedDurationSec || 1))}
                      step={1}
                      value={Math.min(
                        Math.max(0, Math.round(podcastCurrentTimeSec)),
                        Math.max(1, Number(podcastDurationSec || podcastPayload?.estimatedDurationSec || 1))
                      )}
                      onChange={(event) => onPodcastSeek(Number(event.target.value))}
                      disabled={!podcastAudioUrl}
                      className="h-1.5 w-full accent-[#cddff1]"
                      aria-label="Weekly podcast playback position"
                    />
                    <div
                      className="mt-3 grid h-10 items-end gap-1 rounded-xl bg-white/8 px-2.5"
                      style={{ gridTemplateColumns: `repeat(${podcastBars.length}, minmax(0, 1fr))` }}
                      aria-hidden="true"
                    >
                      {podcastBars.map((barLevel, index) => (
                        <span
                          key={`podcast-visualizer-${index}`}
                          className="rounded-sm bg-[#c4dbef] transition-[height] duration-75 ease-linear"
                          style={{ height: `${Math.round(5 + barLevel * 24)}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <audio
                  ref={podcastAudioRef}
                  src={podcastAudioUrl}
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const audio = event.currentTarget;
                    setPodcastDurationSec(Number.isFinite(audio.duration) ? Math.max(0, Math.round(audio.duration)) : 0);
                  }}
                  onTimeUpdate={(event) => {
                    setPodcastCurrentTimeSec(Math.max(0, event.currentTarget.currentTime || 0));
                  }}
                  onPlay={() => setIsPodcastPlaying(true)}
                  onPause={() => setIsPodcastPlaying(false)}
                  onEnded={() => setIsPodcastPlaying(false)}
                  className="hidden"
                />

                {podcastError ? (
                  <p className="mt-3 rounded-xl bg-[#ffe9e8] px-3 py-2 text-xs text-[#a93736]">
                    {podcastError}
                  </p>
                ) : null}
              </div>
            </article>
          ) : null}

          {mealPlan?.prepDayPlan ? (
            <article className="rounded-[30px] bg-white p-5 shadow-[0_24px_44px_-34px_rgba(10,25,49,0.45)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-[#0a1931]">{mealPlan.prepDayPlan.title}</h3>
                <p className="inline-flex items-center gap-1 rounded-full bg-[#e9dcc9]/75 px-3 py-1 text-xs font-semibold text-[#0a1931]">
                  <Clock3 size={12} />
                  {mealPlan.prepDayPlan.prepDay || answers.prepDay || 'Sunday'} • ~{formatMinutesLabel(mealPlan.prepDayPlan.totalPrepMinutes)}
                </p>
              </div>

              {mealPlan.prepDayPlan.sharedIngredients.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[#4a7fa7]">Shared ingredients</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mealPlan.prepDayPlan.sharedIngredients.slice(0, 18).map((ingredient) => (
                      <span key={ingredient} className="rounded-full bg-[#edf4fa] px-3 py-1.5 text-xs font-semibold text-[#1a3d63]">
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl bg-[#f5f9fc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[#4a7fa7]">Prep timeline</p>
                <ol className="mt-3 space-y-2.5 text-sm text-[#1a3d63]">
                  {mealPlan.prepDayPlan.steps.map((step, index) => (
                    <li key={`prep-step-${index}`} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#1a3d63]">
                        {index + 1}
                      </span>
                      <span className="leading-6">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ) : null}

          {mealPlan?.days.map((day) => (
            <article key={day.dayIndex} className="rounded-[30px] bg-white p-5 shadow-[0_24px_44px_-36px_rgba(10,25,49,0.44)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-semibold text-[#0a1931]">{day.label}</h3>
                <p className="rounded-full bg-[#edf4fa] px-3 py-1 text-xs font-semibold text-[#1a3d63]">
                  {day.totals?.calories || '—'} cal • {day.totals?.protein || '—'}g protein
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {visibleCoreMealTypes.map((mealType) => {
                  const recipeId = day.meals[mealType];
                  const recipe = recipeId ? recipeMap.get(recipeId) : null;
                  if (!recipe) {
                    return (
                      <div key={mealType} className="rounded-2xl bg-[#f5f9fc] p-4 text-xs text-[#1a3d63]">
                        {mealType}
                        <p className="mt-1">No recipe available for this slot.</p>
                      </div>
                    );
                  }

                  return (
                    <div key={mealType}>
                      <p className="mb-2 text-sm font-semibold text-[#1a3d63]">{mealType}</p>
                      <MealCard
                        recipe={recipe}
                        onViewDetails={() => setSelectedRecipe(recipe)}
                        onSwap={() => setSwapTarget({ dayIndex: day.dayIndex, mealType, current: recipe })}
                      />
                    </div>
                  );
                })}

                {showSnackMeals && day.meals.snacks?.[0] && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#1a3d63]">snack</p>
                    {recipeMap.get(day.meals.snacks[0]) ? (
                      <MealCard
                        recipe={recipeMap.get(day.meals.snacks[0]) as Recipe}
                        onViewDetails={() => setSelectedRecipe(recipeMap.get(day.meals.snacks?.[0] || '') || null)}
                        onSwap={() =>
                          setSwapTarget({
                            dayIndex: day.dayIndex,
                            mealType: 'snack',
                            current: recipeMap.get(day.meals.snacks?.[0] || ''),
                          })
                        }
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'grocery' && (
        <section ref={grocerySectionRef} className="space-y-4 rounded-[30px] bg-white p-5 shadow-[0_24px_46px_-36px_rgba(10,25,49,0.44)] sm:p-6">
          <h2 className="text-xl font-semibold text-[#0a1931]">Weekly grocery list</h2>
          {groceryGroups.length === 0 ? (
            <p className="rounded-2xl bg-[#f5f9fc] px-3 py-2 text-sm text-[#1a3d63]">
              Grocery ingredients will appear after your weekly meal plan is generated.
            </p>
          ) : (
            <div className="space-y-4">
              <article className="rounded-2xl bg-[#f5f9fc] p-3.5">
                <h3 className="text-sm font-semibold text-[#0a1931]">How quantities are calculated</h3>
                <p className="mt-1 text-xs text-[#1a3d63]">
                  Weekly quantities are estimated by recipe usage count and serving size. Example: if a recipe serves 4 and is used in 2 meals,
                  ingredients are scaled to roughly 0.5x that recipe for the week.
                </p>
              </article>

              {groceryRecipeSummaries.length > 0 && (
                <article className="rounded-2xl bg-[#f5f9fc] p-3.5">
                  <h3 className="text-sm font-semibold text-[#0a1931]">Meals included in this week</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {groceryRecipeSummaries.map((entry) => {
                      return (
                        <div
                          key={`grocery-recipe-${entry.key}`}
                          className="inline-flex max-w-[280px] items-center gap-2 rounded-full bg-white px-2 py-1 shadow-[0_10px_20px_-16px_rgba(10,25,49,0.4)]"
                          title={entry.title}
                        >
                          <img
                            src={entry.imageUrl}
                            alt={entry.title}
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                          <span className="truncate text-xs text-[#1a3d63]">{entry.title}</span>
                          {entry.count > 1 ? (
                            <span className="rounded-full bg-[#edf4fa] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a3d63]">
                              x{entry.count}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              )}

              <article className="rounded-2xl bg-[#f5f9fc] p-3.5">
                <h3 className="text-sm font-semibold text-[#0a1931]">Total ingredients across all selected meals</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {groceryGroups.map((group) => (
                    <article key={`grocery-total-${group.category}`} className="rounded-xl bg-white p-3 shadow-[0_12px_24px_-18px_rgba(10,25,49,0.38)]">
                      <h4 className="text-xs font-semibold text-[#1a3d63]">{group.category}</h4>
                      <ul className="mt-2 space-y-2">
                        {group.items.map((item) => {
                          const checked = groceryCheckedItems.includes(item.key);
                          return (
                            <li key={`grocery-total-${item.key}`} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleGroceryItem(item.key)}
                                className="mt-0.5 h-4 w-4 rounded border-[#b3cfe5]"
                              />
                              <div>
                                <p className={`text-sm ${checked ? 'text-[#b3cfe5] line-through' : 'text-[#1a3d63]'}`}>{item.name}</p>
                                {item.quantities.length > 0 && (
                                  <p className="text-xs text-[#1a3d63]">Approx total: {item.quantities.join(' · ')}</p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}
          <p className="text-xs text-[#1a3d63]">If ingredient details are incomplete in the source data, items may be simplified.</p>
        </section>
      )}

      {activeTab === 'progress' && (
        <section ref={progressSectionRef} className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[30px] bg-white p-5 shadow-[0_24px_46px_-36px_rgba(10,25,49,0.44)] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-[#0a1931]">Log weight</h2>
              {editingWeightLogId ? (
                <p className="rounded-full bg-[#edf4fa] px-2.5 py-1 text-[11px] font-semibold text-[#1a3d63]">
                  Editing entry
                </p>
              ) : null}
            </div>
            <form className="mt-4 space-y-3" onSubmit={submitWeight}>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#1a3d63]">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(event) => setWeightDate(event.target.value)}
                  className="h-10 w-full rounded-xl bg-[#f5f9fc] px-3 text-sm outline-none ring-1 ring-[#d5e4f1] focus:ring-[#1a3d63]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#1a3d63]">Weight (kg)</span>
                <input
                  type="number"
                  value={weightValue}
                  onChange={(event) => setWeightValue(event.target.value)}
                  className="h-10 w-full rounded-xl bg-[#f5f9fc] px-3 text-sm outline-none ring-1 ring-[#d5e4f1] focus:ring-[#1a3d63]"
                  placeholder="e.g. 78.4"
                  min={30}
                  max={350}
                  step={0.1}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#1a3d63]">Note (optional)</span>
                <textarea
                  value={weightNote}
                  onChange={(event) => setWeightNote(event.target.value)}
                  className="min-h-20 w-full rounded-xl bg-[#f5f9fc] px-3 py-2 text-sm outline-none ring-1 ring-[#d5e4f1] focus:ring-[#1a3d63]"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1a3d63] px-4 text-sm font-semibold text-white">
                  {editingWeightLogId ? 'Save changes' : 'Save entry'}
                </button>
                {editingWeightLogId ? (
                  <button
                    type="button"
                    onClick={resetWeightForm}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#edf4fa] px-4 text-sm font-semibold text-[#1a3d63]"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="rounded-[30px] bg-white p-5 shadow-[0_24px_46px_-36px_rgba(10,25,49,0.44)] sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-[#0a1931]">Progress to goal</h2>
                <p className="text-sm text-[#1a3d63]">
                  Current {currentWeight || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
                </p>
              </div>
              <div className="rounded-full bg-[#edf4fa] px-3 py-1 text-sm font-semibold text-[#1a3d63]">{progressPercent}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#b3cfe5]">
              <div className="h-full rounded-full bg-[#1a3d63]" style={{ width: `${progressPercent}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {weightLogs.length === 0 ? (
                <li className="rounded-xl bg-[#f5f9fc] px-3 py-2 text-sm text-[#1a3d63]">
                  No entries yet. Add your first weight log above.
                </li>
              ) : (
                weightLogs.slice(0, 12).map((entry) => (
                  <li
                    key={entry.id}
                    className={`rounded-xl px-3 py-2 shadow-[inset_0_0_0_1px_rgba(179,207,229,0.5)] ${
                      editingWeightLogId === entry.id ? 'bg-white' : 'bg-[#f5f9fc]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#0a1931]">{entry.weight} kg</span>
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-[#1a3d63]">{new Date(entry.date).toLocaleDateString('en-AU')}</span>
                        <button
                          type="button"
                          onClick={() => startEditingWeightLog(entry)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-semibold text-[#1a3d63] shadow-[0_12px_20px_-16px_rgba(10,25,49,0.46)]"
                          aria-label={`Edit weight entry for ${new Date(entry.date).toLocaleDateString('en-AU')}`}
                        >
                          <PencilLine size={12} />
                          Edit
                        </button>
                      </div>
                    </div>
                    {entry.note && <p className="mt-1 text-xs text-[#1a3d63]">{entry.note}</p>}
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      )}

      {activeTab === 'messages' && (
        <section ref={messagesSectionRef} className="rounded-[30px] bg-white p-5 shadow-[0_24px_46px_-36px_rgba(10,25,49,0.44)] sm:p-6">
          <h2 className="text-xl font-semibold text-[#0a1931]">Message {dietitianName}</h2>
          <p className="mt-1 text-sm text-[#1a3d63]">
            Send {dietitianName} a note about what you&apos;d like adjusted. In this demo, messages are saved locally until live dietitian messaging is
            connected.
          </p>
          <div className="mt-4 space-y-2 rounded-2xl bg-[#f5f9fc] p-3.5">
            {sortedMessages.length === 0 ? (
              <p className="text-sm text-[#1a3d63]">Ask for meal adjustments, motivation support, grocery planning, or progress check-ins.</p>
            ) : (
              sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-[#1a3d63] text-white shadow-[0_16px_24px_-18px_rgba(10,25,49,0.9)]'
                      : 'bg-white text-[#1a3d63] shadow-[0_12px_22px_-18px_rgba(10,25,49,0.36)]'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className={`mt-1 text-[11px] ${message.role === 'user' ? 'text-white/70' : 'text-[#1a3d63]'}`}>
                    {new Date(message.createdAt).toLocaleString('en-AU')}
                  </p>
                </article>
              ))
            )}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
            <input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder={`Type your note for ${dietitianName}`}
              className="h-10 flex-1 rounded-xl bg-[#f5f9fc] px-3 text-sm outline-none ring-1 ring-[#d5e4f1] focus:ring-[#1a3d63]"
            />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1a3d63] px-4 text-sm font-semibold text-white">
              Send
            </button>
          </form>
        </section>
      )}

      {selectedRecipe && (
        <ModalShell onClose={() => setSelectedRecipe(null)}>
          <article>
            {resolveRecipeImageUrl(selectedRecipe) ? (
              <img src={resolveRecipeImageUrl(selectedRecipe)} alt={selectedRecipe.title} className="h-56 w-full rounded-2xl object-cover" />
            ) : (
              <div className="h-56 w-full rounded-2xl bg-[#f6fafd]" />
            )}
            <h3 className="mt-4 text-2xl font-semibold text-[#0a1931]">{selectedRecipe.title}</h3>
            <RecipeBadgePills recipe={selectedRecipe} />
            {selectedRecipe.description && <p className="mt-2 text-sm text-[#1a3d63]">{selectedRecipe.description}</p>}
            <p className="mt-2 text-sm text-[#1a3d63]">
              {resolveRecipeCalories(selectedRecipe) || '—'} cal • {resolveRecipeProtein(selectedRecipe) || '—'}g protein • {selectedRecipe.carbs || '—'}g carbs •{' '}
              {selectedRecipe.fat || '—'}g fat
            </p>
            <p className="mt-1 text-sm text-[#1a3d63]">{buildRecipeTimeMeta(selectedRecipe)}</p>
            {selectedRecipeServes ? (
              <p className="mt-1 text-sm text-[#1a3d63]">{buildServesExplanation(selectedRecipe)}</p>
            ) : null}
            <div className="mt-1 space-y-1">
              <p className="text-sm text-[#1a3d63]">Required equipment</p>
              <RecipeEquipmentPills recipe={selectedRecipe} />
            </div>

            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#0a1931]">Ingredients</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecipe(null);
                      openTab('grocery');
                    }}
                    className="rounded-lg bg-[#edf4fa] px-2.5 py-1 text-xs font-semibold text-[#1a3d63]"
                  >
                    View on grocery list
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-[#1a3d63]">
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <li key={`${selectedRecipe.id}-${ingredient.name}`}>• {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ')}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#0a1931]">Instructions</h4>
                <ol className="mt-2 space-y-1 text-sm text-[#1a3d63]">
                  {(selectedRecipe.instructions || [])
                    .map((instruction) => formatInstructionStep(instruction))
                    .filter(Boolean)
                    .map((instruction, index) => (
                    <li key={`${selectedRecipe.id}-step-${index}`}>
                      {index + 1}. {instruction}
                    </li>
                    ))}
                </ol>
              </div>
            </section>
            <div className="mt-3 text-xs text-[#1a3d63]">
              {selectedRecipe.dietaryTags.length > 0 && <p>Dietary tags: {selectedRecipe.dietaryTags.join(', ')}</p>}
              {selectedRecipe.allergens.length > 0 && <p>Allergens: {selectedRecipe.allergens.join(', ')}</p>}
              {typeof selectedRecipe.source?.dietitian === 'string' && selectedRecipe.source?.dietitian ? (
                <p>Recipe courtesy of: {selectedRecipe.source.dietitian}</p>
              ) : null}
              {typeof selectedRecipe.source?.url === 'string' && selectedRecipe.source?.url ? (
                <p>
                  Source:{' '}
                  <a
                    href={selectedRecipe.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#1a3d63] underline"
                  >
                    View original recipe
                  </a>
                </p>
              ) : null}
            </div>
          </article>
        </ModalShell>
      )}

      {swapTarget && (
        <ModalShell onClose={() => setSwapTarget(null)}>
          <article>
            <h3 className="text-xl font-semibold text-[#0a1931]">Swap this {swapTarget.mealType}</h3>
            <p className="mt-1 text-sm text-[#1a3d63]">
              Alternatives are matched to your dietary preferences and allergy settings where possible.
            </p>
            {swapCandidates.length === 0 ? (
              <p className="mt-4 rounded-xl bg-[#f5f9fc] px-3 py-2 text-sm text-[#1a3d63]">
                No suitable swaps were found for this meal right now.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {swapCandidates.map((recipe) => (
                  <article key={recipe.id} className="rounded-2xl bg-[#f5f9fc] p-3">
                    <div className="flex items-start gap-3">
                      {resolveRecipeImageUrl(recipe) ? (
                        <img
                          src={resolveRecipeImageUrl(recipe)}
                          alt={recipe.title}
                          className="h-14 w-14 shrink-0 rounded-xl object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-xl bg-[#eaf2f9]" />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-[#0a1931]">{recipe.title}</p>
                        <RecipeBadgePills recipe={recipe} compact />
                        <p className="mt-1 text-xs text-[#1a3d63]">
                          {resolveRecipeCalories(recipe) || '—'} cal • {resolveRecipeProtein(recipe) || '—'}g protein • {buildRecipeTimeMeta(recipe)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSwapMeal(swapTarget.dayIndex, swapTarget.mealType, recipe.id);
                        setSwapTarget(null);
                      }}
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a3d63] px-3 text-xs font-semibold text-white"
                    >
                      Use this meal
                    </button>
                  </article>
                ))}
              </div>
            )}
          </article>
        </ModalShell>
      )}

      <footer className="rounded-3xl bg-[#edf4fa] px-4 py-3 text-xs text-[#1a3d63]">
        This is general nutrition support, not medical advice. For urgent or complex conditions, seek care from an appropriate healthcare
        professional.
      </footer>
    </section>
  );
}
