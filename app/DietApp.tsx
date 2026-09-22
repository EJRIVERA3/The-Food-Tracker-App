"use client";

import {
  ArrowLeft,
  Ban,
  Box,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock,
  Copy,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Info,
  LayoutGrid,
  LineChart,
  LockKeyhole,
  Map,
  Menu,
  Minus,
  MoreHorizontal,
  PartyPopper,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Settings,
  Share2,
  Target,
  TriangleAlert,
  UnlockKeyhole,
  Utensils,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { computeCoachTips, type CoachTip } from "./coach";

type Tab = "schedule" | "progress" | "explore" | "more";
type Sheet =
  | "actions"
  | "meal"
  | "copy"
  | "advanced"
  | "cloud"
  | "weighin"
  | "calendar"
  | "adjust"
  | "foodpicker"
  | null;
type FullScreen =
  | "workout"
  | "busy"
  | "edit"
  | "shopping"
  | "settings"
  | "foods"
  | "plan-week"
  | null;
type ShoppingView = "home" | "this-week" | "next-week" | "custom";
type ShoppingUnit = "grams" | "oz";
type ShoppingState = "raw" | "cooked";

/** A food you saved once, with the nutrition it carries into any meal. */
type CustomFood = {
  id: string;
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type Profile = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  stepMin: number;
  stepMax: number;
  startDate: string;
  startWeight: number;
  goalWeight: number;
  goalDate: string;
  /** Rides along with the profile so the library syncs to every device. */
  foods: CustomFood[];
  meals: CustomMeal[];
};

/** A combination you eat often, like "Chicken and rice bowl", saved to reuse whole. */
type CustomMeal = {
  id: string;
  name: string;
  foods: Food[];
};

type Food = {
  id: string;
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

/** A hand-written shopping list line. Nothing is eaten from it, so it has no macros. */
type ShoppingItem = {
  id: string;
  name: string;
  amount: string;
};

type Meal = {
  id: string;
  name: string;
  time: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  locked: boolean;
  foods: Food[];
  targetStatus?: "met" | "under";
  countsTowardProgress?: boolean;
};

type Workout = {
  id: string;
  type: string;
  startTime: string;
  duration: string;
  intensity: string;
  shake: boolean;
  optimize: boolean;
  updateTargets: boolean;
};

type BusyBlock = {
  id: string;
  startTime: string;
  endTime: string;
  optimize: boolean;
};

type WeighIn = {
  time: string;
  weight: number | null;
};

type DayLog = {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  stepMin: number;
  stepMax: number;
  weighIn: WeighIn;
  meals: Meal[];
  workouts: Workout[];
  busyBlocks: BusyBlock[];
};

type Totals = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

/** A coach you have granted read access to. Mirrors /api/coach/shares. */
type CoachShare = {
  id: string;
  coachId: string;
  label: string;
  status: string;
  scope: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

/** Weights stay strings while editing so the field can be cleared mid-typing. */
type SettingsDraft = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  stepMin: number;
  stepMax: number;
  startDate: string;
  startWeight: string;
  goalWeight: string;
  goalDate: string;
};

type CustomFoodDraft = {
  id: string | null;
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type MealDraft = {
  id: string | null;
  name: string;
  time: string;
  /** The planned target. Only used while the meal has no foods of its own. */
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  locked: boolean;
  foods: Food[];
};

type CopyOptions = {
  activity: boolean;
  mealCount: boolean;
  meals: boolean;
  mealTargets: boolean;
  mealFoods: boolean;
  lockedMeals: boolean;
  workouts: boolean;
  busy: boolean;
};

type AdjustedMeal = Meal & {
  adjustedCalories: number;
  adjustedProtein: number;
  adjustedFat: number;
  adjustedCarbs: number;
};

const USER_KEY_RE = /^[A-Za-z0-9_-]{24,128}$/;
const SYNC_KEY_STORAGE = "daily-diet-cloud.sync-key";
const APP_STATE_PREFIX = "daily-diet-cloud.state.";
const SHOPPING_CUSTOM_KEY = "daily-diet-cloud.shopping-custom";
const PLANNED_WEEKS_KEY = "daily-diet-cloud.planned-weeks";
const BOOT_DATE = "2026-06-13";

/** How close to its share of the day's targets a meal counts as "on target". */
const MEAL_TARGET_TOLERANCE = 0.9;

/** Pounds the weight chart always spans, so daily noise does not look dramatic. */
const WEIGHT_CHART_MIN_SPAN = 4;

const EMPTY_TOTALS: Totals = {
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
};

const DEFAULT_COPY_OPTIONS: CopyOptions = {
  activity: true,
  mealCount: true,
  meals: true,
  mealTargets: true,
  mealFoods: true,
  lockedMeals: true,
  workouts: true,
  busy: true,
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, amount: number) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function weekStart(value: string) {
  const date = parseDateKey(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return dateKey(date);
}

function timeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) {
    return 24 * 60;
  }

  const [, hourValue, minuteValue = "0", periodValue] = match;
  const period = periodValue.toUpperCase();
  let hour = Number(hourValue) % 12;
  if (period === "PM") {
    hour += 12;
  }

  return hour * 60 + Number(minuteValue);
}

function dateOrdinal(value: string) {
  const date = parseDateKey(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function daysBetween(start: string, end: string) {
  return Math.round(dateOrdinal(end) - dateOrdinal(start));
}

function dietWeekNumber(value: string, startDate: string) {
  return Math.max(1, Math.floor(daysBetween(weekStart(startDate), weekStart(value)) / 7) + 1);
}

function weekStartForNumber(startDate: string, weekNumber: number) {
  return addDays(weekStart(startDate), (weekNumber - 1) * 7);
}

function sameDay(a: string, b: string) {
  return a === b;
}

function formatHeaderTitle(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(parseDateKey(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(value));
}

function formatSheetDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  })
    .format(parseDateKey(value))
    .toUpperCase();
}

function formatGoalDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(value));
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function makeSyncKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createDefaultProfile(today: string): Profile {
  return {
    calories: 1900,
    protein: 160,
    fat: 60,
    carbs: 180,
    stepMin: 8000,
    stepMax: 13000,
    startDate: addDays(today, -2),
    startWeight: 233,
    goalWeight: 220,
    goalDate: addDays(today, 54),
    foods: [],
    meals: [],
  };
}

const MEAL_SLOTS = [
  { name: "Meal 1", time: "9:00 AM" },
  { name: "Meal 2", time: "1:00 PM" },
  { name: "Meal 3", time: "5:00 PM" },
  { name: "Meal 4", time: "8:30 PM" },
];

function plannedMeals(date = "default"): Meal[] {
  return MEAL_SLOTS.map((meal) => ({
    id: `meal-${date}-${meal.name.toLowerCase().replaceAll(" ", "-")}`,
    name: meal.name,
    time: meal.time,
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    locked: false,
    foods: [],
  }));
}

function createStartDay(value: string, profile: Profile): DayLog {
  return {
    date: value,
    calories: profile.calories,
    protein: profile.protein,
    fat: profile.fat,
    carbs: profile.carbs,
    stepMin: profile.stepMin,
    stepMax: profile.stepMax,
    weighIn: {
      time: "8:30 AM",
      weight: profile.startWeight,
    },
    meals: plannedMeals(value),
    workouts: [],
    busyBlocks: [],
  };
}

function createDay(value: string, profile: Profile, sample = false): DayLog {
  if (sameDay(value, profile.startDate) && !sample) {
    return createStartDay(value, profile);
  }

  return {
    date: value,
    calories: profile.calories,
    protein: profile.protein,
    fat: profile.fat,
    carbs: profile.carbs,
    stepMin: profile.stepMin,
    stepMax: profile.stepMax,
    weighIn: {
      time: "8:30 AM",
      weight: null,
    },
    meals: plannedMeals(value),
    workouts: [],
    busyBlocks: [],
  };
}

function seedDays(today: string, profile: Profile) {
  const start = weekStart(today);
  const seeded: Record<string, DayLog> = {};

  for (let index = 0; index < 7; index += 1) {
    const value = addDays(start, index);
    seeded[value] = createDay(value, profile);
  }

  return seeded;
}

function normalizeProfile(value: unknown, today: string): Profile {
  const defaults = createDefaultProfile(today);
  const source = value && typeof value === "object" ? (value as Partial<Profile>) : {};

  return {
    calories: Number(source.calories ?? defaults.calories),
    protein: Number(source.protein ?? defaults.protein),
    fat: Number(source.fat ?? defaults.fat),
    carbs: Number(source.carbs ?? defaults.carbs),
    stepMin: Number(source.stepMin ?? defaults.stepMin),
    stepMax: Number(source.stepMax ?? defaults.stepMax),
    startDate: typeof source.startDate === "string" ? source.startDate : defaults.startDate,
    startWeight: Number(source.startWeight ?? defaults.startWeight),
    goalWeight: Number(source.goalWeight ?? defaults.goalWeight),
    goalDate: typeof source.goalDate === "string" ? source.goalDate : defaults.goalDate,
    foods: Array.isArray(source.foods)
      ? source.foods
          .filter((food) => food && typeof food.name === "string")
          .map((food) => ({
            id: typeof food.id === "string" ? food.id : makeId("custom-food"),
            name: food.name,
            amount: typeof food.amount === "string" ? food.amount : "",
            calories: clamp(Number(food.calories ?? 0)),
            protein: clamp(Number(food.protein ?? 0)),
            fat: clamp(Number(food.fat ?? 0)),
            carbs: clamp(Number(food.carbs ?? 0)),
          }))
      : [],
    meals: Array.isArray(source.meals)
      ? source.meals
          .filter((meal) => meal && typeof meal.name === "string" && Array.isArray(meal.foods))
          .map((meal) => ({
            id: typeof meal.id === "string" ? meal.id : makeId("custom-meal"),
            name: meal.name,
            foods: meal.foods.map((food, index) => normalizeMealFood(food, {}, index)),
          }))
      : [],
  };
}

function normalizeDay(value: unknown, date: string, profile: Profile): DayLog {
  const defaults = createDay(date, profile);
  const source = value && typeof value === "object" ? (value as Partial<DayLog>) : {};
  const meals = Array.isArray(source.meals) ? source.meals : defaults.meals;
  const workouts = Array.isArray(source.workouts) ? source.workouts : [];
  const busyBlocks = Array.isArray(source.busyBlocks) ? source.busyBlocks : [];
  const weighIn = source.weighIn && typeof source.weighIn === "object" ? source.weighIn : defaults.weighIn;

  const day = {
    date,
    calories: Number(source.calories ?? defaults.calories),
    protein: Number(source.protein ?? defaults.protein),
    fat: Number(source.fat ?? defaults.fat),
    carbs: Number(source.carbs ?? defaults.carbs),
    stepMin: Number(source.stepMin ?? defaults.stepMin),
    stepMax: Number(source.stepMax ?? defaults.stepMax),
    weighIn: {
      time: typeof weighIn.time === "string" ? weighIn.time : "8:30 AM",
      weight: weighIn.weight === null || weighIn.weight === undefined ? null : Number(weighIn.weight),
    },
    meals: meals.map((meal, index) => ({
      id: meal.id ?? makeId("meal"),
      name: meal.name ?? `Meal ${index + 1}`,
      time: meal.time ?? "12:00 PM",
      calories: Number(meal.calories ?? 0),
      protein: Number(meal.protein ?? 0),
      fat: Number(meal.fat ?? 0),
      carbs: Number(meal.carbs ?? 0),
      locked: Boolean(meal.locked),
      targetStatus: meal.targetStatus === "met" || meal.targetStatus === "under" ? meal.targetStatus : undefined,
      countsTowardProgress:
        typeof meal.countsTowardProgress === "boolean" ? meal.countsTowardProgress : undefined,
      foods: Array.isArray(meal.foods)
        ? meal.foods.map((food, foodIndex) => normalizeMealFood(food, meal, foodIndex))
        : [],
    })).map(withFoodTotals),
    workouts: workouts.map((workout) => ({
      id: workout.id ?? makeId("workout"),
      type: workout.type ?? "weight training",
      startTime: workout.startTime ?? "12:00 PM",
      duration: workout.duration ?? "1h",
      intensity: workout.intensity ?? "light",
      shake: Boolean(workout.shake),
      optimize: Boolean(workout.optimize),
      updateTargets: Boolean(workout.updateTargets),
    })),
    busyBlocks: busyBlocks.map((block) => ({
      id: block.id ?? makeId("busy"),
      startTime: block.startTime ?? "12:00 PM",
      endTime: block.endTime ?? "1:00 PM",
      optimize: Boolean(block.optimize),
    })),
  };

  return emptyDefaultPlannedDay(
    normalizeStartDayTemplate(normalizeLegacySampleDay(hydrateStartDayIfEmpty(day, profile), profile), profile),
  );
}

function sumFoods(foods: Food[]): Totals {
  return foods.reduce(
    (totals, food) => ({
      calories: totals.calories + Number(food.calories || 0),
      protein: totals.protein + Number(food.protein || 0),
      fat: totals.fat + Number(food.fat || 0),
      carbs: totals.carbs + Number(food.carbs || 0),
    }),
    EMPTY_TOTALS,
  );
}

/**
 * A meal that has foods reports what those foods add up to. An empty meal keeps
 * the macros it was planned with, which is what the day's targets distribute onto.
 */
function withFoodTotals(meal: Meal): Meal {
  return meal.foods.length === 0 ? meal : { ...meal, ...sumFoods(meal.foods) };
}

function normalizeMealFood(food: Partial<Food>, meal: Partial<Meal>, index: number): Food {
  // Foods logged before meals tracked per-food nutrition carry none of their own.
  // Back then a meal held one food and the meal's macros described it, so hand
  // those down instead of zeroing out every meal anyone has already logged.
  const inherits = food.calories === undefined && index === 0;
  const macro = (key: "calories" | "protein" | "fat" | "carbs") =>
    clamp(Number((inherits ? meal[key] : food[key]) ?? 0));

  return {
    id: food.id ?? makeId("food"),
    name: food.name ?? "Food",
    amount: food.amount ?? "",
    calories: macro("calories"),
    protein: macro("protein"),
    fat: macro("fat"),
    carbs: macro("carbs"),
  };
}

function getTotals(day: DayLog | null | undefined): Totals {
  if (!day) {
    return EMPTY_TOTALS;
  }

  return day.meals.reduce(
    (totals, meal) => ({
      calories: totals.calories + Number(meal.calories || 0),
      protein: totals.protein + Number(meal.protein || 0),
      fat: totals.fat + Number(meal.fat || 0),
      carbs: totals.carbs + Number(meal.carbs || 0),
    }),
    EMPTY_TOTALS,
  );
}

function getLoggedTotals(day: DayLog | null | undefined): Totals {
  if (!day) {
    return EMPTY_TOTALS;
  }

  return day.meals.reduce((totals, meal) => {
    if (meal.foods.length === 0 || meal.countsTowardProgress === false) {
      return totals;
    }

    return {
      calories: totals.calories + Number(meal.calories || 0),
      protein: totals.protein + Number(meal.protein || 0),
      fat: totals.fat + Number(meal.fat || 0),
      carbs: totals.carbs + Number(meal.carbs || 0),
    };
  }, EMPTY_TOTALS);
}

function hydrateStartDayIfEmpty(day: DayLog, profile: Profile): DayLog {
  if (
    !sameDay(day.date, profile.startDate) ||
    day.weighIn.weight !== null ||
    day.meals.some((meal) => meal.foods.length > 0) ||
    day.workouts.length > 0 ||
    day.busyBlocks.length > 0
  ) {
    return day;
  }

  const hydrated = createStartDay(day.date, profile);
  return {
    ...hydrated,
    calories: day.calories,
    protein: day.protein,
    fat: day.fat,
    carbs: day.carbs,
    stepMin: day.stepMin,
    stepMax: day.stepMax,
  };
}

function isStartDayTemplate(day: DayLog, profile: Profile) {
  return (
    sameDay(day.date, profile.startDate) &&
    day.meals.some((meal) =>
      meal.foods.some((food) => food.name === "Turkey Bacon" || food.name.startsWith("Venti Iced Chai")),
    )
  );
}

function isLegacySampleDay(day: DayLog) {
  const [meal1, ...rest] = day.meals;

  return (
    day.weighIn.weight === null &&
    day.workouts.length === 0 &&
    day.busyBlocks.length === 0 &&
    day.meals.length === 4 &&
    meal1?.name === "Meal 1" &&
    meal1.time === "9:00 AM" &&
    meal1.calories === 275 &&
    meal1.protein === 5 &&
    meal1.fat === 15 &&
    meal1.carbs === 30 &&
    meal1.foods.length === 1 &&
    meal1.foods[0]?.name === "Cheese Danish" &&
    rest.every(
      (meal, index) =>
        meal.name === `Meal ${index + 2}` &&
        meal.foods.length === 0 &&
        meal.calories === 475 &&
        meal.protein === 40 &&
        meal.fat === 15 &&
        meal.carbs === 45,
    )
  );
}

function normalizeLegacySampleDay(day: DayLog, profile: Profile): DayLog {
  if (!isLegacySampleDay(day)) {
    return day;
  }

  const fresh = createDay(day.date, profile);

  return {
    ...fresh,
    calories: day.calories,
    protein: day.protein,
    fat: day.fat,
    carbs: day.carbs,
    stepMin: day.stepMin,
    stepMax: day.stepMax,
    weighIn: {
      time: day.weighIn.time,
      weight: null,
    },
  };
}

function normalizeStartDayTemplate(day: DayLog, profile: Profile): DayLog {
  if (!isStartDayTemplate(day, profile)) {
    return day;
  }

  const template = createStartDay(day.date, profile);

  return {
    ...template,
    calories: day.calories,
    protein: day.protein,
    fat: day.fat,
    carbs: day.carbs,
    stepMin: day.stepMin,
    stepMax: day.stepMax,
    weighIn: day.weighIn.weight === null ? template.weighIn : day.weighIn,
  };
}

function isDefaultPlannedDay(day: DayLog) {
  return (
    day.workouts.length === 0 &&
    day.busyBlocks.length === 0 &&
    day.meals.length === 4 &&
    day.meals.every(
      (meal, index) =>
        meal.name === `Meal ${index + 1}` &&
        meal.foods.length === 0 &&
        meal.calories === 475 &&
        meal.protein === 40 &&
        meal.fat === 15 &&
        meal.carbs === 45,
    )
  );
}

function emptyDefaultPlannedDay(day: DayLog): DayLog {
  if (!isDefaultPlannedDay(day)) {
    return day;
  }

  return { ...day, meals: plannedMeals(day.date) };
}

function clamp(value: number, min = 0) {
  return Number.isFinite(value) ? Math.max(min, Math.round(value)) : min;
}

function distributeValue(total: number, count: number, index: number) {
  if (count <= 0) {
    return 0;
  }

  const safeTotal = clamp(total);
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;
  return base + (index < remainder ? 1 : 0);
}

function underText(value: number, unit = "") {
  if (value > 0) {
    return `${value}${unit} under`;
  }

  if (value < 0) {
    return `${Math.abs(value)}${unit} over`;
  }

  return "on track";
}

function foodCountText(count: number) {
  return `${count} ${count === 1 ? "food" : "foods"}`;
}

function percent(value: number, target: number) {
  if (!target || value <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(3, (value / target) * 100));
}

function cloneDay(day: DayLog): DayLog {
  return JSON.parse(JSON.stringify(day)) as DayLog;
}

/** Renames default-named meals so their numbers follow the order they are eaten. */
function renumberMeals(meals: Meal[]): Meal[] {
  const order = [...meals].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const positions = new globalThis.Map(order.map((meal, index) => [meal.id, index + 1]));

  return meals.map((meal) =>
    /^Meal \d+$/.test(meal.name) ? { ...meal, name: `Meal ${positions.get(meal.id)}` } : meal,
  );
}

type ShoppingTally = { qty: number; unit: string; cooked: boolean };

const COOKED_PREFIX = "COOKED ";

/** Splits "COOKED 250 G" into its parts so a week's amounts can be added up. */
function parseShoppingAmount(amount: string): ShoppingTally | null {
  const cooked = amount.startsWith(COOKED_PREFIX);
  const base = (cooked ? amount.slice(COOKED_PREFIX.length) : amount).trim();
  const match = base.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);

  if (!match) {
    return null;
  }

  return { qty: Number(match[1]), unit: match[2].trim(), cooked };
}

function formatShoppingTally(tally: ShoppingTally) {
  const qty = Number(tally.qty.toFixed(2));
  return `${tally.cooked ? COOKED_PREFIX : ""}${qty}${tally.unit ? ` ${tally.unit}` : ""}`;
}

function IconLabel({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <>
      <Icon size={26} strokeWidth={active ? 2.4 : 2} />
      <span>{label}</span>
    </>
  );
}

function MacroBadge({
  kind,
  children,
}: {
  kind: "cal" | "protein" | "fat" | "carbs";
  children: React.ReactNode;
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

function MiniBadge({
  kind,
  children,
}: {
  kind: "cal" | "protein" | "fat" | "carbs";
  children: React.ReactNode;
}) {
  return <span className={`mini-badge ${kind}`}>{children}</span>;
}

export default function DietApp() {
  const [today, setToday] = useState(BOOT_DATE);
  const [selectedDate, setSelectedDate] = useState(BOOT_DATE);
  const [profile, setProfile] = useState<Profile>(() => createDefaultProfile(BOOT_DATE));
  const [days, setDays] = useState<Record<string, DayLog>>(() =>
    seedDays(BOOT_DATE, createDefaultProfile(BOOT_DATE)),
  );
  const [activeTab, setActiveTab] = useState<Tab>("schedule");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [fullScreen, setFullScreen] = useState<FullScreen>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [syncKey, setSyncKey] = useState("");
  const [restoreKey, setRestoreKey] = useState("");
  const [coachCode, setCoachCode] = useState("");
  const [coachShares, setCoachShares] = useState<CoachShare[]>([]);
  const [coachStatus, setCoachStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("Starting cloud backup");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [mealDraft, setMealDraft] = useState<MealDraft>(() => newMealDraft());
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyOptions, setCopyOptions] = useState<CopyOptions>(DEFAULT_COPY_OPTIONS);
  const [workoutDraft, setWorkoutDraft] = useState<Workout>(() => newWorkout());
  const [busyDraft, setBusyDraft] = useState<BusyBlock>(() => newBusyBlock());
  const [weighDraft, setWeighDraft] = useState("");
  const [weighError, setWeighError] = useState("");
  const [dismissedMealTotals, setDismissedMealTotals] = useState<string[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [foodDraft, setFoodDraft] = useState<CustomFoodDraft | null>(null);
  const [foodError, setFoodError] = useState("");
  const [libraryView, setLibraryView] = useState<"foods" | "meals">("foods");
  const [mealTemplateDraft, setMealTemplateDraft] = useState<CustomMeal | null>(null);
  const [mealTemplateError, setMealTemplateError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(BOOT_DATE);
  const [adjustSelectedMealIds, setAdjustSelectedMealIds] = useState<string[]>([]);
  const [adjustReset, setAdjustReset] = useState(false);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const [shoppingView, setShoppingView] = useState<ShoppingView>("home");
  const [shoppingState, setShoppingState] = useState<ShoppingState>("raw");
  const [shoppingUnit, setShoppingUnit] = useState<ShoppingUnit>("grams");
  const [shoppingChecked, setShoppingChecked] = useState<string[]>([]);
  const [customShoppingFoods, setCustomShoppingFoods] = useState<ShoppingItem[]>([]);
  const [shoppingHydrated, setShoppingHydrated] = useState(false);
  const [shoppingAddOpen, setShoppingAddOpen] = useState(false);
  const [shoppingDraftName, setShoppingDraftName] = useState("");
  const [shoppingDraftAmount, setShoppingDraftAmount] = useState("");
  const [planStep, setPlanStep] = useState(1);
  const [planShowPreview, setPlanShowPreview] = useState(false);
  const [planGoalChoice, setPlanGoalChoice] = useState<"keep" | "update" | "new" | "end">("keep");
  const [planCalChoice, setPlanCalChoice] = useState<"repeat-changes" | "repeat" | "custom">("repeat-changes");
  const [planCustomCal, setPlanCustomCal] = useState(0);
  const [planWeighDrafts, setPlanWeighDrafts] = useState<Record<string, string>>({});
  const [plannedWeeks, setPlannedWeeks] = useState<string[]>([]);
  const saveTouchedRef = useRef(false);

  const currentDay = days[selectedDate] ?? createDay(selectedDate, profile);
  const totals = useMemo(() => getTotals(currentDay), [currentDay]);
  const loggedTotals = useMemo(() => getLoggedTotals(currentDay), [currentDay]);
  const calorieDelta = currentDay.calories - totals.calories;
  const proteinDelta = currentDay.protein - totals.protein;
  const currentWeekNumber = dietWeekNumber(selectedDate, profile.startDate);
  const weekOptions = useMemo(() => {
    const finalWeek = Math.max(
      2,
      dietWeekNumber(selectedDate, profile.startDate),
      dietWeekNumber(today, profile.startDate) + 1,
    );

    return Array.from({ length: finalWeek }, (_, index) => {
      const number = index + 1;
      const start = weekStartForNumber(profile.startDate, number);

      return {
        number,
        start,
        end: addDays(start, 6),
      };
    });
  }, [profile.startDate, selectedDate, today]);
  // Reads localStorage, which the server cannot see, so this has to happen after
  // mount: seeding it in useState would make the client markup diverge from SSR.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHOPPING_CUSTOM_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCustomShoppingFoods(
            parsed
              .filter((entry) => entry && typeof entry.name === "string")
              .map((entry) => ({
                id: typeof entry.id === "string" ? entry.id : makeId("food"),
                name: entry.name,
                amount: typeof entry.amount === "string" ? entry.amount : "",
              })),
          );
        }
      }
    } catch {
      // ignore malformed storage
    }
    setShoppingHydrated(true);
  }, []);
  useEffect(() => {
    if (!shoppingHydrated) {
      return;
    }
    try {
      localStorage.setItem(SHOPPING_CUSTOM_KEY, JSON.stringify(customShoppingFoods));
    } catch {
      // ignore storage write failures
    }
  }, [customShoppingFoods, shoppingHydrated]);
  // Reads localStorage, which the server cannot see, so this has to happen after
  // mount: seeding it in useState would make the client markup diverge from SSR.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLANNED_WEEKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPlannedWeeks(parsed.filter((w: unknown) => typeof w === "string"));
        }
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PLANNED_WEEKS_KEY, JSON.stringify(plannedWeeks));
    } catch {
      // ignore
    }
  }, [plannedWeeks]);
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const localToday = dateKey(new Date());
      const storedKey = localStorage.getItem(SYNC_KEY_STORAGE);
      const nextKey = storedKey && USER_KEY_RE.test(storedKey) ? storedKey : makeSyncKey();
      localStorage.setItem(SYNC_KEY_STORAGE, nextKey);
      const cached = readCachedState(nextKey, localToday);

      await Promise.resolve();

      if (cancelled) {
        return;
      }

      setToday(localToday);
      setSelectedDate((current) => (current === BOOT_DATE ? localToday : current));
      setSyncKey(nextKey);
      if (cached) {
        setProfile(cached.profile);
        setDays(cached.days);
      } else {
        // The initial state is built from BOOT_DATE so server and client render the
        // same markup. Once mounted, rebuild it from the real date, or a new user
        // starts on week 14 of a diet whose goal date has already passed.
        const fresh = createDefaultProfile(localToday);
        setProfile(fresh);
        setDays(seedDays(localToday, fresh));
      }

      void loadCloudKey(nextKey, cached, localToday);
    }

    void boot();

    return () => {
      cancelled = true;
    };
    // The first load is intentionally controlled here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!booted || !syncKey) {
      return;
    }

    localStorage.setItem(`${APP_STATE_PREFIX}${syncKey}`, JSON.stringify({ profile, days }));
    setSyncStatus(saveTouchedRef.current ? "Saving to cloud" : "Cloud backup active");

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/diet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userKey: syncKey, profile, days }),
        });

        if (!response.ok) {
          throw new Error("Cloud save failed");
        }

        setLastSync(new Date().toISOString());
        setSyncStatus("Cloud backup active");
        saveTouchedRef.current = false;
      } catch {
        setSyncStatus("Cloud backup waiting for connection");
      }
    }, saveTouchedRef.current ? 650 : 1200);

    return () => window.clearTimeout(timer);
  }, [booted, days, profile, syncKey]);

  /* Refresh the share list whenever the Cloud Sync sheet is opened. The state
     update happens after the await, not in the effect body. */
  useEffect(() => {
    if (sheet !== "cloud" || !syncKey) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/coach/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userKey: syncKey }),
        });

        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as { shares?: CoachShare[] };

        if (!cancelled) {
          setCoachShares(payload.shares ?? []);
        }
      } catch {
        /* sharing is optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sheet, syncKey]);

  async function loadCloudKey(
    key: string,
    cached: { profile: Profile; days: Record<string, DayLog> } | null = null,
    baseToday = today,
  ) {
    setSyncStatus("Restoring from cloud");

    try {
      /* Sync key goes in a header, never the URL: query strings end up in
         proxy logs, server access logs, browser history and Referer. */
      const response = await fetch("/api/diet", { headers: { "X-Sync-Key": key } });
      if (!response.ok) {
        throw new Error("Cloud restore failed");
      }

      const payload = (await response.json()) as {
        profile: unknown;
        days: Array<{ date: string; payload: unknown }>;
      };
      const nextProfile = payload.profile
        ? normalizeProfile(payload.profile, baseToday)
        : cached?.profile ?? createDefaultProfile(baseToday);
      const nextDays: Record<string, DayLog> = {};

      for (const row of payload.days ?? []) {
        if (row.date) {
          nextDays[row.date] = normalizeDay(row.payload, row.date, nextProfile);
        }
      }

      const hasRemoteDays = Object.keys(nextDays).length > 0;
      const finalDays = hasRemoteDays ? nextDays : cached?.days ?? seedDays(baseToday, nextProfile);

      setProfile(nextProfile);
      setDays(finalDays);
      setLastSync(new Date().toISOString());
      setSyncStatus("Cloud backup active");
      setBooted(true);
    } catch {
      if (cached) {
        setProfile(cached.profile);
        setDays(cached.days);
      }
      setSyncStatus("Cloud backup waiting for connection");
      setBooted(true);
    }
  }

  function readCachedState(key: string, baseToday = today) {
    const cached = localStorage.getItem(`${APP_STATE_PREFIX}${key}`);
    if (!cached) {
      return null;
    }

    try {
      const parsed = JSON.parse(cached) as { profile: unknown; days: Record<string, unknown> };
      const cachedProfile = normalizeProfile(parsed.profile, baseToday);
      const cachedDays = Object.fromEntries(
        Object.entries(parsed.days ?? {}).map(([value, day]) => [
          value,
          normalizeDay(day, value, cachedProfile),
        ]),
      );

      return {
        profile: cachedProfile,
        days: cachedDays,
      };
    } catch {
      return null;
    }
  }

  function touch() {
    saveTouchedRef.current = true;
  }

  function updateDay(value: string, updater: (day: DayLog) => DayLog) {
    touch();
    setDays((current) => {
      const base = current[value] ?? createDay(value, profile);
      return {
        ...current,
        [value]: updater(cloneDay(base)),
      };
    });
  }

  function updateProfile(next: Partial<Profile>) {
    touch();
    setProfile((current) => ({ ...current, ...next }));
  }

  function chooseDate(value: string) {
    setSelectedDate(value);
    setDays((current) => {
      if (current[value]) {
        return current;
      }

      touch();
      return {
        ...current,
        [value]: createDay(value, profile),
      };
    });
  }

  function chooseWeek(weekNumber: number) {
    const targetStart = weekStartForNumber(profile.startDate, weekNumber);
    const weekdayOffset = Math.max(0, Math.min(6, daysBetween(weekStart(selectedDate), selectedDate)));
    chooseDate(addDays(targetStart, weekdayOffset));
    setWeekMenuOpen(false);
  }

  function openCalendar() {
    setWeekMenuOpen(false);
    setCalendarMonth(selectedDate);
    setSheet("calendar");
  }

  function openAdjustMeals() {
    setWeekMenuOpen(false);
    const unlockedMeals = currentDay.meals.filter((meal) => !meal.locked && meal.foods.length === 0);
    setAdjustSelectedMealIds((unlockedMeals.length ? unlockedMeals : currentDay.meals).map((meal) => meal.id));
    setAdjustReset(false);
    setSheet("adjust");
  }

  function openNewMeal() {
    setWeekMenuOpen(false);
    setMealDraft(newMealDraft(currentDay.meals.length + 1));
    setSheet("meal");
  }

  function openMeal(meal: Meal) {
    setWeekMenuOpen(false);
    setMealDraft({
      id: meal.id,
      name: meal.name,
      time: meal.time,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
      locked: meal.locked,
      foods: meal.foods.map((food) => ({ ...food })),
    });
    setSheet("meal");
  }

  function saveMeal() {
    const meal: Meal = withFoodTotals({
      id: mealDraft.id ?? makeId("meal"),
      name: mealDraft.name.trim() || `Meal ${currentDay.meals.length + 1}`,
      time: mealDraft.time.trim() || "12:00 PM",
      calories: clamp(mealDraft.calories),
      protein: clamp(mealDraft.protein),
      fat: clamp(mealDraft.fat),
      carbs: clamp(mealDraft.carbs),
      locked: mealDraft.locked,
      targetStatus: undefined,
      foods: mealDraft.foods,
    });

    updateDay(selectedDate, (day) => ({
      ...day,
      meals: mealDraft.id
        ? day.meals.map((item) => (item.id === mealDraft.id ? meal : item))
        : renumberMeals([...day.meals, meal]),
    }));
    setSheet(null);
  }

  function deleteMeal(id: string | null) {
    if (!id) {
      setSheet(null);
      return;
    }

    updateDay(selectedDate, (day) => ({
      ...day,
      meals: day.meals.filter((meal) => meal.id !== id),
    }));
    setSheet(null);
  }

  function saveWorkout() {
    updateDay(selectedDate, (day) => {
      const calories = workoutDraft.updateTargets ? day.calories + 180 : day.calories;
      return {
        ...day,
        calories,
        workouts: [...day.workouts, { ...workoutDraft, id: makeId("workout") }],
      };
    });
    setFullScreen(null);
  }

  function saveBusy() {
    updateDay(selectedDate, (day) => ({
      ...day,
      busyBlocks: [...day.busyBlocks, { ...busyDraft, id: makeId("busy") }],
    }));
    setFullScreen(null);
  }

  function saveWeighIn() {
    const raw = weighDraft.trim();
    let weight: number | null = null;

    if (raw) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setWeighError("Enter a weight in pounds, for example 182.4.");
        return;
      }
      weight = parsed;
    }

    setWeighError("");
    updateDay(selectedDate, (day) => ({
      ...day,
      weighIn: { ...day.weighIn, weight },
    }));
    setSheet(null);
  }

  function openCustomFoods() {
    setFoodDraft(null);
    setFoodError("");
    setFullScreen("foods");
  }

  function newFoodDraft(): CustomFoodDraft {
    return { id: null, name: "", amount: "", calories: 0, protein: 0, fat: 0, carbs: 0 };
  }

  function editCustomFood(food: CustomFood) {
    setFoodDraft({ ...food });
    setFoodError("");
  }

  function updateFoodDraft(next: Partial<CustomFoodDraft>) {
    setFoodDraft((current) => (current ? { ...current, ...next } : current));
    setFoodError("");
  }

  function saveCustomFood() {
    if (!foodDraft) {
      return;
    }

    const name = foodDraft.name.trim();
    if (!name) {
      setFoodError("Give your food a name.");
      return;
    }

    const food: CustomFood = {
      id: foodDraft.id ?? makeId("custom-food"),
      name,
      amount: foodDraft.amount.trim(),
      calories: clamp(foodDraft.calories),
      protein: clamp(foodDraft.protein),
      fat: clamp(foodDraft.fat),
      carbs: clamp(foodDraft.carbs),
    };

    updateProfile({
      foods: foodDraft.id
        ? profile.foods.map((entry) => (entry.id === foodDraft.id ? food : entry))
        : [...profile.foods, food],
    });
    setFoodDraft(null);
    setFoodError("");
  }

  function deleteCustomFood(id: string) {
    updateProfile({ foods: profile.foods.filter((entry) => entry.id !== id) });
    setFoodDraft(null);
    setFoodError("");
  }

  function editMealTemplate(meal: CustomMeal) {
    setMealTemplateDraft({ ...meal, foods: meal.foods.map((food) => ({ ...food })) });
    setMealTemplateError("");
  }

  function updateMealTemplateDraft(next: Partial<CustomMeal>) {
    setMealTemplateDraft((current) => (current ? { ...current, ...next } : current));
    setMealTemplateError("");
  }

  function saveMealTemplate() {
    if (!mealTemplateDraft) {
      return;
    }

    const name = mealTemplateDraft.name.trim();
    if (!name) {
      setMealTemplateError("Give this meal a name.");
      return;
    }

    if (mealTemplateDraft.foods.length === 0) {
      setMealTemplateError("Add at least one food to this meal.");
      return;
    }

    const template: CustomMeal = { ...mealTemplateDraft, name };
    const exists = profile.meals.some((entry) => entry.id === template.id);

    updateProfile({
      meals: exists
        ? profile.meals.map((entry) => (entry.id === template.id ? template : entry))
        : [...profile.meals, template],
    });
    setMealTemplateDraft(null);
    setMealTemplateError("");
  }

  function deleteMealTemplate(id: string) {
    updateProfile({ meals: profile.meals.filter((entry) => entry.id !== id) });
    setMealTemplateDraft(null);
    setMealTemplateError("");
  }

  /** Captures the meal you are editing as a reusable template. */
  function saveMealDraftAsTemplate() {
    if (mealDraft.foods.length === 0) {
      return;
    }

    setMealTemplateDraft({
      id: makeId("custom-meal"),
      name: /^Meal \d+$/.test(mealDraft.name.trim()) ? "" : mealDraft.name.trim(),
      foods: mealDraft.foods.map((food) => ({ ...food })),
    });
    setMealTemplateError("");
    setSheet(null);
    setLibraryView("meals");
    setFullScreen("foods");
  }

  /** Drops every food from a saved meal into the meal you are editing. */
  function addMealTemplateToDraft(template: CustomMeal) {
    setMealDraft((current) => ({
      ...current,
      foods: [
        ...current.foods,
        ...template.foods.map((food) => ({ ...food, id: makeId("food") })),
      ],
    }));
    setSheet("meal");
  }

  /** Adds a saved meal to the selected day as its own meal. */
  function addMealTemplateToDay(template: CustomMeal) {
    const nextMeal: Meal = withFoodTotals({
      id: makeId("meal"),
      name: template.name,
      time: "7:45 PM",
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      locked: false,
      foods: template.foods.map((food) => ({ ...food, id: makeId("food") })),
    });

    updateDay(selectedDate, (day) => ({
      ...day,
      meals: renumberMeals([...day.meals, nextMeal]),
    }));
    setFullScreen(null);
    setActiveTab("schedule");
  }

  /** Adds a saved food to the meal you are editing, macros and all. */
  function addFoodToMealDraft(food: CustomFood) {
    setMealDraft((current) => ({
      ...current,
      foods: [...current.foods, { ...food, id: makeId("food") }],
    }));
    setSheet("meal");
  }

  function addManualFoodToMealDraft() {
    if (!foodDraft) {
      return;
    }

    const name = foodDraft.name.trim();
    if (!name) {
      setFoodError("Give the food a name.");
      return;
    }

    setMealDraft((current) => ({
      ...current,
      foods: [
        ...current.foods,
        {
          id: makeId("food"),
          name,
          amount: foodDraft.amount.trim(),
          calories: clamp(foodDraft.calories),
          protein: clamp(foodDraft.protein),
          fat: clamp(foodDraft.fat),
          carbs: clamp(foodDraft.carbs),
        },
      ],
    }));
    setFoodDraft(null);
    setFoodError("");
    setSheet("meal");
  }

  function removeFoodFromMealDraft(id: string) {
    setMealDraft((current) => ({
      ...current,
      foods: current.foods.filter((food) => food.id !== id),
    }));
  }

  function openFoodPicker() {
    setFoodDraft(newFoodDraft());
    setFoodError("");
    setSheet("foodpicker");
  }

  function openSettings() {
    setSettingsDraft({
      calories: profile.calories,
      protein: profile.protein,
      fat: profile.fat,
      carbs: profile.carbs,
      stepMin: profile.stepMin,
      stepMax: profile.stepMax,
      startDate: profile.startDate,
      startWeight: String(profile.startWeight),
      goalWeight: String(profile.goalWeight),
      goalDate: profile.goalDate,
    });
    setSettingsError("");
    setFullScreen("settings");
  }

  function updateSettingsDraft(next: Partial<SettingsDraft>) {
    setSettingsDraft((current) => (current ? { ...current, ...next } : current));
    setSettingsError("");
  }

  function saveSettings() {
    if (!settingsDraft) {
      return;
    }

    const startWeight = Number(settingsDraft.startWeight);
    const goalWeight = Number(settingsDraft.goalWeight);

    if (![startWeight, goalWeight].every((value) => Number.isFinite(value) && value > 0)) {
      setSettingsError("Enter both weights in pounds, for example 233.");
      return;
    }

    if (settingsDraft.goalDate < settingsDraft.startDate) {
      setSettingsError("Your goal date cannot be before your start date.");
      return;
    }

    if (settingsDraft.stepMin > settingsDraft.stepMax) {
      setSettingsError("Your lowest step target cannot be above the highest.");
      return;
    }

    const { calories, protein, fat, carbs, stepMin, stepMax } = settingsDraft;

    updateProfile({
      calories,
      protein,
      fat,
      carbs,
      stepMin,
      stepMax,
      startDate: settingsDraft.startDate,
      startWeight,
      goalWeight,
      goalDate: settingsDraft.goalDate,
    });

    // Carry the new targets onto today and everything ahead of it. Past days keep
    // what they were logged against, so history stays honest.
    setDays((current) =>
      Object.fromEntries(
        Object.entries(current).map(([date, day]) =>
          date < today
            ? [date, day]
            : [date, { ...day, calories, protein, fat, carbs, stepMin, stepMax }],
        ),
      ),
    );

    setSettingsError("");
    setFullScreen(null);
  }

  function getAdjustedMeals(day = currentDay): AdjustedMeal[] {
    const selectedIds = new Set(adjustReset ? day.meals.map((meal) => meal.id) : adjustSelectedMealIds);
    const selectedMeals = day.meals.filter((meal) => selectedIds.has(meal.id));
    const fixedMeals = day.meals.filter((meal) => !selectedIds.has(meal.id));
    const fixedTotals = getTotals({
      ...day,
      meals: fixedMeals,
    });

    const remaining = {
      calories: Math.max(0, day.calories - fixedTotals.calories),
      protein: Math.max(0, day.protein - fixedTotals.protein),
      fat: Math.max(0, day.fat - fixedTotals.fat),
      carbs: Math.max(0, day.carbs - fixedTotals.carbs),
    };

    let selectedIndex = 0;

    return day.meals.map((meal) => {
      if (!selectedIds.has(meal.id)) {
        return {
          ...meal,
          adjustedCalories: meal.calories,
          adjustedProtein: meal.protein,
          adjustedFat: meal.fat,
          adjustedCarbs: meal.carbs,
        };
      }

      const index = selectedIndex;
      selectedIndex += 1;

      return {
        ...meal,
        adjustedCalories: distributeValue(remaining.calories, selectedMeals.length, index),
        adjustedProtein: distributeValue(remaining.protein, selectedMeals.length, index),
        adjustedFat: distributeValue(remaining.fat, selectedMeals.length, index),
        adjustedCarbs: distributeValue(remaining.carbs, selectedMeals.length, index),
      };
    });
  }

  function getAdjustedTotals(adjustedMeals = getAdjustedMeals()) {
    return adjustedMeals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.adjustedCalories,
        protein: sum.protein + meal.adjustedProtein,
        fat: sum.fat + meal.adjustedFat,
        carbs: sum.carbs + meal.adjustedCarbs,
      }),
      EMPTY_TOTALS,
    );
  }

  function saveAdjustedMeals() {
    const selectedIds = new Set(
      adjustReset ? currentDay.meals.map((meal) => meal.id) : adjustSelectedMealIds,
    );
    const adjustedMeals = getAdjustedMeals();

    updateDay(selectedDate, (day) => ({
      ...day,
      meals: day.meals.map((meal) => {
        const adjusted = adjustedMeals.find((item) => item.id === meal.id);
        if (!adjusted || !selectedIds.has(meal.id)) {
          return meal;
        }

        return {
          ...meal,
          calories: adjusted.adjustedCalories,
          protein: adjusted.adjustedProtein,
          fat: adjusted.adjustedFat,
          carbs: adjusted.adjustedCarbs,
        };
      }),
    }));
    setSheet(null);
  }

  function openCopyDay() {
    const targets = Array.from({ length: 10 }, (_, index) => addDays(selectedDate, index - 2)).filter(
      (value) => value !== selectedDate,
    );
    setCopyTargets(targets.slice(2, 5));
    setSheet("copy");
  }

  function applyCopyDay() {
    const source = cloneDay(currentDay);
    touch();
    setDays((current) => {
      const next = { ...current };

      for (const target of copyTargets) {
        const fallback = next[target] ?? createDay(target, profile);
        const copied = cloneDay(source);
        copied.date = target;
        // A weigh-in is a measurement of the destination day, never something the
        // source day can supply. Copying it would overwrite real readings.
        copied.weighIn = fallback.weighIn;

        if (!copyOptions.activity) {
          copied.stepMin = fallback.stepMin;
          copied.stepMax = fallback.stepMax;
        }

        if (!copyOptions.meals) {
          copied.meals = fallback.meals;
        } else {
          copied.meals = copied.meals.map((meal, index) => ({
            ...meal,
            id: makeId("meal"),
            name: copyOptions.mealCount ? meal.name : `Meal ${index + 1}`,
            calories: copyOptions.mealTargets ? meal.calories : fallback.meals[index]?.calories ?? meal.calories,
            protein: copyOptions.mealTargets ? meal.protein : fallback.meals[index]?.protein ?? meal.protein,
            fat: copyOptions.mealTargets ? meal.fat : fallback.meals[index]?.fat ?? meal.fat,
            carbs: copyOptions.mealTargets ? meal.carbs : fallback.meals[index]?.carbs ?? meal.carbs,
            foods: copyOptions.mealFoods
              ? meal.foods.map((food) => ({ ...food, id: makeId("food") }))
              : [],
            locked: copyOptions.lockedMeals ? meal.locked : false,
          }));
        }

        if (!copyOptions.workouts) {
          copied.workouts = [];
        }

        if (!copyOptions.busy) {
          copied.busyBlocks = [];
        }

        next[target] = copied;
      }

      return next;
    });
    setSheet(null);
  }

  function toggleCopyTarget(value: string) {
    setCopyTargets((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function addLibraryMeal(name: string, macros: Totals, amount = "1 serving") {
    const nextMeal: Meal = {
      id: makeId("meal"),
      name: `Meal ${currentDay.meals.length + 1}`,
      time: "7:45 PM",
      calories: macros.calories,
      protein: macros.protein,
      fat: macros.fat,
      carbs: macros.carbs,
      locked: false,
      foods: [{ id: makeId("food"), name, amount, ...macros }],
    };

    updateDay(selectedDate, (day) => ({
      ...day,
      // Meals read in time order, so renumber or the new one lands as "Meal 5"
      // sitting between Meal 3 and Meal 4.
      meals: renumberMeals([...day.meals, nextMeal]),
    }));
    setActiveTab("schedule");
  }

  async function copySyncKey() {
    try {
      await navigator.clipboard.writeText(syncKey);
      setSyncStatus("Sync key copied");
    } catch {
      setSyncStatus("Copy unavailable");
    }
  }

  function restoreCloudKey() {
    const nextKey = restoreKey.trim();
    if (!USER_KEY_RE.test(nextKey)) {
      setSyncStatus("Enter a valid sync key");
      return;
    }

    localStorage.setItem(SYNC_KEY_STORAGE, nextKey);
    setSyncKey(nextKey);
    setBooted(false);
    setSheet(null);
    void loadCloudKey(nextKey, readCachedState(nextKey), today);
  }

  /* ---- coach sharing -----------------------------------------------------
     Your sync key is a read/write key to everything here, so it is never sent
     to a coach. Instead you accept their invite code, the server records the
     link, and you can revoke it at any time without affecting your data. */

  async function loadCoachShares(key: string) {
    if (!USER_KEY_RE.test(key)) {
      return;
    }

    try {
      const response = await fetch("/api/coach/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: key }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { shares?: CoachShare[] };
      setCoachShares(payload.shares ?? []);
    } catch {
      /* sharing is optional; stay quiet if the endpoint is unavailable */
    }
  }

  async function acceptCoachInvite() {
    const code = coachCode.trim().toUpperCase().replace(/[\s-]/g, "");

    if (code.length !== 8) {
      setCoachStatus("Enter the 8-character code from your coach.");
      return;
    }

    setCoachStatus("Linking…");

    try {
      const response = await fetch("/api/coach/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userKey: syncKey }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setCoachStatus(payload.error ?? "That code did not work.");
        return;
      }

      setCoachCode("");
      setCoachStatus("Linked. Your coach can now see your logs.");
      await loadCoachShares(syncKey);
    } catch {
      setCoachStatus("Could not reach the server.");
    }
  }

  async function revokeCoachShare(id: string) {
    setCoachStatus("Revoking…");

    try {
      const response = await fetch(`/api/coach/links/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: syncKey }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setCoachStatus(payload.error ?? "Could not revoke that share.");
        return;
      }

      setCoachStatus("Access revoked.");
      await loadCoachShares(syncKey);
    } catch {
      setCoachStatus("Could not reach the server.");
    }
  }

  function renderBody() {
    if (fullScreen === "workout") {
      return renderWorkoutScreen();
    }

    if (fullScreen === "busy") {
      return renderBusyScreen();
    }

    if (fullScreen === "edit") {
      return renderEditSchedule();
    }

    if (fullScreen === "shopping") {
      return renderShoppingScreen();
    }

    if (fullScreen === "settings") {
      return renderSettingsScreen();
    }

    if (fullScreen === "foods") {
      return renderCustomFoodsScreen();
    }

    if (fullScreen === "plan-week") {
      return renderPlanWeek();
    }

    return (
      <main className="app-main">
        {activeTab === "schedule" && renderSchedule()}
        {activeTab === "progress" && renderProgress()}
        {activeTab === "explore" && renderExplore()}
        {activeTab === "more" && renderMore()}
      </main>
    );
  }

  function openPlanWeek() {
    const reviewWkStart = weekStart(today);
    const drafts: Record<string, string> = {};
    for (let i = 0; i < 7; i++) {
      const d = addDays(reviewWkStart, i);
      const w = days[d]?.weighIn.weight;
      if (w !== null && w !== undefined) {
        drafts[d] = w.toString();
      }
    }
    setPlanWeighDrafts(drafts);
    setPlanStep(1);
    setPlanShowPreview(false);
    setPlanGoalChoice("keep");
    setPlanCalChoice("repeat-changes");
    setPlanCustomCal(profile.calories);
    setFullScreen("plan-week");
  }

  function renderPlanWeekBanner() {
    const nextWkStart = addDays(weekStart(today), 7);
    if (plannedWeeks.includes(nextWkStart)) return null;

    return (
      <button className="plan-week-banner" onClick={openPlanWeek}>
        <div className="plan-week-icon">
          <ClipboardList size={22} />
        </div>
        <span className="plan-week-label">Plan your week to continue</span>
        <div className="plan-week-arrow">
          <ChevronRight size={22} color="#ffffff" />
        </div>
      </button>
    );
  }

  function renderPlanWeek() {
    const reviewWkStart = weekStart(today);
    const reviewWkEnd = addDays(reviewWkStart, 6);
    const nextWkStart = addDays(reviewWkStart, 7);
    const nextWeekNumber = dietWeekNumber(nextWkStart, profile.startDate);
    const reviewDays = Array.from({ length: 7 }, (_, i) => addDays(reviewWkStart, i));
    const reviewWeighIns = reviewDays.filter((d) => {
      const day = days[d];
      return day && day.weighIn.weight !== null && day.weighIn.weight !== undefined;
    });
    const outstandingMeals = reviewDays
      .filter((d) => d <= today)
      .flatMap((d) => {
        const day = days[d];
        if (!day) return [];
        return day.meals.filter((m) => m.foods.length === 0).map((m) => ({ date: d, meal: m }));
      });
    const allWeighIns = Object.values(days)
      .filter((d) => d.weighIn.weight !== null && d.weighIn.weight !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
    const currentWeight = allWeighIns.at(-1)?.weighIn.weight ?? profile.startWeight;
    const change = currentWeight - profile.startWeight;
    const daysElapsed = daysBetween(profile.startDate, today);
    const weightPerDay = daysElapsed > 0 ? (currentWeight - profile.startWeight) / daysElapsed : 0;
    const daysToGoal = daysBetween(today, profile.goalDate);
    const predictedFinalWeight = Math.round((currentWeight + weightPerDay * daysToGoal) * 10) / 10;
    const goalDiff = Math.abs(predictedFinalWeight - profile.goalWeight);
    const paceGood = goalDiff <= 2;
    const paceSlightlyOff = goalDiff > 2 && goalDiff <= 8;
    const weekCalTarget = days[reviewWkStart]?.calories ?? profile.calories;
    const weekAvgLogged = Math.round(
      reviewDays.reduce((sum, d) => sum + getLoggedTotals(days[d]).calories, 0) / 7,
    );
    const nextCalories = planCalChoice === "custom" ? planCustomCal : weekCalTarget;
    const dateRange = `${formatShortDate(reviewWkStart)} to ${formatShortDate(reviewWkEnd)}`;

    function planStepHeader(title: string, subtitle: string) {
      return (
        <div className="nav-row plan-header">
          <button
            className="icon-button flat"
            onClick={() => {
              if (planStep > 1) setPlanStep((s) => s - 1);
              else setFullScreen(null);
            }}
          >
            <ArrowLeft size={28} />
          </button>
          <div className="plan-header-center">
            <h1>{title}</h1>
            {subtitle && <span className="muted plan-subtitle">{subtitle}</span>}
          </div>
          <div className="plan-step-count">{planStep}/5</div>
        </div>
      );
    }

    function planNextBtn(disabled = false) {
      return (
        <div className="plan-footer">
          <button
            className="plan-next-btn"
            disabled={disabled}
            onClick={() => {
              if (planStep < 5) setPlanStep((s) => s + 1);
              else setPlanShowPreview(true);
            }}
          >
            Next
          </button>
        </div>
      );
    }

    if (planShowPreview) {
      const firstDay = nextWkStart;
      const firstDayData = days[firstDay] ?? createDay(firstDay, profile);

      return (
        <main className="app-main plan-main">
          <div className="nav-row plan-header">
            <button
              className="icon-button flat"
              onClick={() => {
                setPlanShowPreview(false);
                setPlanStep(5);
              }}
            >
              <ArrowLeft size={28} />
            </button>
            <h1>Preview and confirm</h1>
            <button className="primary-button" onClick={commitPlanWeek}>
              Save
            </button>
          </div>

          <div className="topbar" style={{ paddingTop: 0 }}>
            <div className="week-pill" style={{ pointerEvents: "none" }}>
              WEEK <span>{nextWeekNumber}</span>
            </div>
            <div>
              <div className="header-row" style={{ gap: 6 }}>
                <MacroBadge kind="cal">
                  <Flame size={16} />
                </MacroBadge>
                <strong className="mono">{weekCalTarget}</strong>
              </div>
              <span className="muted">Trending avg</span>
            </div>
            <div>
              <div className="header-row" style={{ gap: 6 }}>
                <Target size={24} />
                <strong className="mono">{nextCalories}</strong>
              </div>
              <span className="muted">Daily target</span>
            </div>
            <div />
          </div>

          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(nextWkStart, i);
              const date = parseDateKey(d);
              return (
                <div className={`day-chip ${i === 0 ? "active" : ""}`} key={d}>
                  <span className="day-letter">
                    {new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(date)}
                  </span>
                  <span className="date-dot">{date.getDate()}</span>
                  <span className="day-target">{nextCalories}</span>
                </div>
              );
            })}
          </div>

          <h2 className="section-title">{formatHeaderTitle(firstDay)}</h2>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <strong>Day targets</strong>
            <div className="target-grid" style={{ marginTop: 12 }}>
              <div>
                <MiniBadge kind="cal">
                  <Flame size={16} />
                </MiniBadge>
                <span className="mono">{nextCalories}</span>
              </div>
              <div>
                <MiniBadge kind="protein">P</MiniBadge>
                <span className="mono">{firstDayData.protein}</span>
              </div>
              <div>
                <MiniBadge kind="fat">F</MiniBadge>
                <span className="mono">{firstDayData.fat}</span>
              </div>
              <div>
                <MiniBadge kind="carbs">C</MiniBadge>
                <span className="mono">{firstDayData.carbs}</span>
              </div>
              <div />
            </div>
          </div>

          <div className="step-row header-row">
            <strong className="header-row" style={{ gap: 8 }}>
              <Footprints /> Step count target
            </strong>
            <input
              className="text-input mono"
              readOnly
              value={`${Math.round(firstDayData.stepMin / 1000)} - ${Math.round(firstDayData.stepMax / 1000)}k steps`}
            />
          </div>
          <div className="step-row header-row">
            <strong className="header-row" style={{ gap: 8 }}>
              <Utensils /> {firstDayData.meals.length} meals
            </strong>
            <span className="time-pill">
              {firstDayData.meals[0]?.time ?? "9:00 AM"} -{" "}
              {firstDayData.meals.at(-1)?.time ?? "9:00 PM"}
            </span>
          </div>

          <div className="split-row" style={{ justifyContent: "space-between", marginTop: 20 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Meals and activities
            </h2>
            <button className="round-button" onClick={() => setSheet("actions")} title="Add">
              <Plus size={28} />
            </button>
          </div>

          <div className="schedule-list" style={{ marginTop: 12 }}>
            <article className="card disabled-card">
              <div className="split-row" style={{ justifyContent: "space-between" }}>
                <strong className="meal-title">
                  <Gauge size={24} /> Weigh-in
                </strong>
                <span className="time-pill">{firstDayData.weighIn.time}</span>
              </div>
            </article>
            {firstDayData.meals.map((meal) => (
              <article className="card" key={meal.id}>
                <div className="meal-card-head" style={{ justifyContent: "space-between" }}>
                  <strong className="meal-title">
                    <Utensils size={22} /> {meal.name}
                  </strong>
                  <span className="time-pill">{meal.time}</span>
                </div>
                <div className="meal-macros">
                  <div className="macro-value">
                    <MacroBadge kind="cal">
                      <Flame size={16} />
                    </MacroBadge>
                    <strong>{Math.round(nextCalories / firstDayData.meals.length)}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="protein">P</MacroBadge>
                    <strong>{Math.round(firstDayData.protein / firstDayData.meals.length)}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="fat">F</MacroBadge>
                    <strong>{Math.round(firstDayData.fat / firstDayData.meals.length)}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="carbs">C</MacroBadge>
                    <strong>{Math.round(firstDayData.carbs / firstDayData.meals.length)}</strong>
                  </div>
                </div>
                <div style={{ padding: "2px 0 4px", color: "var(--muted)", fontSize: 13 }}>
                  Targets
                </div>
              </article>
            ))}
          </div>
        </main>
      );
    }

    if (planStep === 1) {
      return (
        <main className="app-main plan-main">
          {planStepHeader("Review your weigh-ins", dateRange)}

          <section className="progress-hero">
            {allWeighIns.length >= 4 ? (
              renderWeightChart(allWeighIns)
            ) : (
              <div>
                <LineChart size={82} color="#73747a" />
                <p className="muted" style={{ marginTop: 24 }}>
                  Your graph will become available once you have four days of weigh-ins.
                </p>
              </div>
            )}
          </section>

          <h2 className="section-title">Fat loss summary</h2>
          <div className="summary-grid" style={{ marginBottom: 20 }}>
            <div>
              <strong className="muted">Start</strong>
              <h3>{profile.startWeight} lbs <Scale size={18} /></h3>
              <p className="muted">{formatShortDate(profile.startDate)}</p>
            </div>
            <div>
              <strong className="muted">Change</strong>
              <h3>{change === 0 ? "-" : `${change > 0 ? "+" : ""}${change.toFixed(1)} lbs`}</h3>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong className="muted">Goal</strong>
              <h3>{profile.goalWeight} lbs</h3>
              <p className="muted">{formatShortDate(profile.goalDate)}</p>
            </div>
          </div>

          <h2 className="section-title">Weigh-ins</h2>
          {reviewWeighIns.length < 4 && (
            <div className="plan-warning">
              <TriangleAlert size={20} color="#b86b00" />
              <p>
                We need at least 4 weigh-ins within 7 days of the week you are trying to program to
                adjust your plan accurately. Until then, we&apos;ll repeat your last programmed week.
              </p>
            </div>
          )}

          {reviewDays
            .slice()
            .reverse()
            .map((d) => {
              const dayData = days[d];
              const weight = dayData?.weighIn.weight;
              const date = parseDateKey(d);
              const dayName = new Intl.DateTimeFormat("en-US", { weekday: "short" })
                .format(date)
                .toUpperCase();
              const isPast = d <= today;

              return (
                <div className="plan-weigh-row" key={d}>
                  <span className="plan-weigh-label">
                    <strong>{dayName}</strong> {formatShortDate(d)}
                  </span>
                  {isPast ? (
                    weight !== null && weight !== undefined ? (
                      <button
                        className="plan-weigh-btn logged"
                        onClick={() => {
                          setWeighDraft(weight.toString());
                          setSheet("weighin");
                        }}
                      >
                        {weight} lbs
                      </button>
                    ) : (
                      <input
                        className="plan-weigh-input"
                        placeholder="- lbs"
                        inputMode="decimal"
                        value={planWeighDrafts[d] ?? ""}
                        onChange={(e) =>
                          setPlanWeighDrafts((prev) => ({ ...prev, [d]: e.target.value }))
                        }
                        onBlur={() => {
                          const val = parseFloat(planWeighDrafts[d] ?? "");
                          if (!isNaN(val) && val > 0) {
                            updateDay(d, (day) => ({
                              ...day,
                              weighIn: { ...day.weighIn, weight: val },
                            }));
                          }
                        }}
                      />
                    )
                  ) : (
                    <span className="plan-weigh-future">-</span>
                  )}
                </div>
              );
            })}

          {planNextBtn()}
        </main>
      );
    }

    if (planStep === 2) {
      const allCheckedIn = outstandingMeals.length === 0;

      return (
        <main className="app-main plan-main">
          {planStepHeader("Check in meals", dateRange)}

          {allCheckedIn ? (
            <div className="plan-success">
              <PartyPopper size={60} color="#37c768" strokeWidth={1.5} />
              <h2>Excellent work, keep it up!</h2>
              <p className="muted">
                Great job checking in your meals this week. You&apos;ve checked in all your meals on
                time!
              </p>
              <button className="ghost-button" style={{ marginTop: 12 }}>
                See details
              </button>
            </div>
          ) : (
            <>
              <div className="plan-warning">
                <TriangleAlert size={20} color="#b86b00" />
                <p>You have {outstandingMeals.length} outstanding meals to check in.</p>
              </div>

              {reviewDays
                .filter((d) => d <= today)
                .map((d) => {
                  const day = days[d];
                  if (!day) return null;
                  const dayMeals = day.meals.filter((m) => m.foods.length === 0);
                  if (dayMeals.length === 0) return null;
                  return (
                    <div key={d}>
                      <h3 className="section-title" style={{ marginTop: 16 }}>
                        {formatSheetDate(d)}
                      </h3>
                      {dayMeals.map((meal) => (
                        <article className="card" key={meal.id} style={{ marginBottom: 8 }}>
                          <div
                            className="meal-card-head"
                            style={{ justifyContent: "space-between", padding: "12px 16px" }}
                          >
                            <strong className="meal-title">
                              <Utensils size={20} />
                              {meal.name}
                            </strong>
                            <span className="time-pill">{meal.time}</span>
                          </div>
                          <div className="meal-macros" style={{ padding: "0 16px 12px" }}>
                            <div className="macro-value">
                              <MacroBadge kind="cal">
                                <Flame size={16} />
                              </MacroBadge>
                              <strong>{meal.calories}</strong>
                            </div>
                            <div className="macro-value">
                              <MacroBadge kind="protein">P</MacroBadge>
                              <strong>{meal.protein}</strong>
                            </div>
                            <div className="macro-value">
                              <MacroBadge kind="fat">F</MacroBadge>
                              <strong>{meal.fat}</strong>
                            </div>
                            <div className="macro-value">
                              <MacroBadge kind="carbs">C</MacroBadge>
                              <strong>{meal.carbs}</strong>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })}

              <button
                className="ghost-button"
                style={{ width: "100%", marginTop: 8, marginBottom: 16 }}
                onClick={() => {
                  touch();
                  setDays((current) => {
                    const next = { ...current };
                    for (const d of reviewDays) {
                      if (d > today) continue;
                      const day = next[d];
                      if (!day) continue;
                      next[d] = {
                        ...day,
                        meals: day.meals.map((m) =>
                          m.foods.length === 0 ? { ...m, targetStatus: "met" as const } : m,
                        ),
                      };
                    }
                    return next;
                  });
                }}
              >
                Check in all outstanding meals
              </button>
            </>
          )}

          {planNextBtn()}
        </main>
      );
    }

    if (planStep === 3) {
      const paceTitle = paceGood
        ? "You're on track!"
        : paceSlightlyOff
          ? "Your pace is slightly off your goal"
          : "Your pace needs adjustment";
      const paceMsg = paceGood
        ? "Great work! Keep up what you're doing."
        : "You're on track today. Stay consistent and you'll get there.";

      return (
        <main className="app-main plan-main">
          {planStepHeader("Review your progress", dateRange)}

          <div className="plan-centered">
            {paceGood ? (
              <CheckCircle2 size={52} color="#37c768" strokeWidth={1.5} />
            ) : (
              <TriangleAlert size={52} color="#73747a" strokeWidth={1.5} />
            )}
            <h2 style={{ marginTop: 16, textAlign: "center" }}>{paceTitle}</h2>
            <p className="muted" style={{ textAlign: "center" }}>
              {paceMsg}
            </p>
          </div>

          <section className="progress-hero" style={{ marginTop: 24 }}>
            {allWeighIns.length >= 4 ? (
              renderWeightChart(allWeighIns)
            ) : (
              <div>
                <LineChart size={82} color="#73747a" />
                <p className="muted" style={{ marginTop: 24 }}>
                  Your graph will become available once you have four days of weigh-ins.
                </p>
              </div>
            )}
          </section>

          {planNextBtn()}
        </main>
      );
    }

    if (planStep === 4) {
      return (
        <main className="app-main plan-main">
          {planStepHeader("Review your goal", "")}

          <div className="plan-goal-summary">
            <strong>Your goal</strong>
            <div>
              <span className="muted">End date</span>
              <strong>{formatGoalDate(profile.goalDate)}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="muted">Target</span>
              <strong>{profile.goalWeight} lbs</strong>
            </div>
          </div>

          <h2 className="section-title" style={{ marginTop: 20 }}>
            Recommended
          </h2>
          <button
            className={`plan-option ${planGoalChoice === "keep" ? "selected" : ""}`}
            onClick={() => setPlanGoalChoice("keep")}
          >
            <div className="plan-option-body">
              <strong>Keep current goal</strong>
              <div className="plan-rp-tag">
                <Target size={13} /> RP Recommended
              </div>
              <p className="muted" style={{ margin: "6px 0" }}>
                Skip to calorie recommendation
              </p>
              <div className="plan-option-details">
                <span>
                  End date: <strong>{formatGoalDate(profile.goalDate)}</strong>
                </span>
                <span>
                  Target: <strong>{profile.goalWeight} lbs</strong>
                </span>
              </div>
            </div>
            {planGoalChoice === "keep" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          <h2 className="section-title" style={{ marginTop: 20 }}>
            More options
          </h2>
          <button
            className={`plan-option ${planGoalChoice === "update" ? "selected" : ""}`}
            onClick={() => setPlanGoalChoice("update")}
          >
            <div className="plan-option-body">
              <strong>Update target weight</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                We predict you will be {predictedFinalWeight} lbs by the end of your diet on{" "}
                {formatGoalDate(profile.goalDate)}. Update my diet goal&apos;s target weight from{" "}
                {profile.goalWeight} lbs, keeping my end date the same.
              </p>
              <div className="plan-option-details">
                <span>
                  End date: <strong>{formatGoalDate(profile.goalDate)}</strong>
                </span>
                <span>
                  Target: <strong>{predictedFinalWeight} lbs</strong>
                </span>
              </div>
            </div>
            {planGoalChoice === "update" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          <button
            className={`plan-option ${planGoalChoice === "new" ? "selected" : ""}`}
            onClick={() => setPlanGoalChoice("new")}
          >
            <div className="plan-option-body">
              <strong>Choose a new goal</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                I&apos;d like to choose a new end date or target weight.
              </p>
            </div>
            {planGoalChoice === "new" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          <button
            className={`plan-option ${planGoalChoice === "end" ? "selected" : ""}`}
            onClick={() => setPlanGoalChoice("end")}
          >
            <div className="plan-option-body">
              <strong>End my diet</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                I&apos;m ready to start my next diet phase.
              </p>
            </div>
            {planGoalChoice === "end" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          {planNextBtn()}
        </main>
      );
    }

    if (planStep === 5) {
      const hasEnoughWeighIns = reviewWeighIns.length >= 4;

      return (
        <main className="app-main plan-main">
          {planStepHeader("Choose calories", dateRange)}

          <div className="plan-cal-stats">
            <span className="muted">Last week&apos;s average daily calories</span>
            <div className="plan-cal-row">
              <div>
                <span className="muted">Target</span>
                <strong>{weekCalTarget}</strong>
              </div>
              <div>
                <span className="muted">Consumed</span>
                <strong>{weekAvgLogged}</strong>
              </div>
            </div>
          </div>

          <div className="plan-goal-summary" style={{ marginTop: 12 }}>
            <strong>Your goal</strong>
            <div>
              <span className="muted">End date</span>
              <strong>{formatGoalDate(profile.goalDate)}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="muted">Target</span>
              <strong>{profile.goalWeight} lbs</strong>
            </div>
          </div>

          <h2 className="section-title" style={{ marginTop: 20 }}>
            Recommended
          </h2>
          <button
            className={`plan-option ${planCalChoice === "repeat-changes" ? "selected" : ""}`}
            onClick={() => setPlanCalChoice("repeat-changes")}
          >
            <div className="plan-option-body">
              <strong>Repeat this week with schedule changes</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                {hasEnoughWeighIns
                  ? "Repeat this week's calorie target with any schedule adjustments."
                  : "Because you didn't weigh in at least 4 times this week, we're not able to provide a recommendation. These calories are the equivalent to what you did last week, taking into account your planned energy expenditure."}
              </p>
              <div className="plan-option-details">
                <span>New target:</span>
                <strong>{weekCalTarget} calories</strong>
              </div>
            </div>
            {planCalChoice === "repeat-changes" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          <h2 className="section-title" style={{ marginTop: 20 }}>
            More options
          </h2>
          <button
            className={`plan-option ${planCalChoice === "repeat" ? "selected" : ""}`}
            onClick={() => setPlanCalChoice("repeat")}
          >
            <div className="plan-option-body">
              <strong>Repeat this week</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                I&apos;m happy with my current progress. I want the same target for next week.
              </p>
              <div className="plan-option-details">
                <span>New target:</span>
                <strong>{weekCalTarget} calories</strong>
              </div>
            </div>
            {planCalChoice === "repeat" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          <button
            className={`plan-option ${planCalChoice === "custom" ? "selected" : ""}`}
            onClick={() => setPlanCalChoice("custom")}
          >
            <div className="plan-option-body">
              <strong>Choose my own calories</strong>
              <p className="muted" style={{ margin: "6px 0" }}>
                I&apos;ll set my own calories for next week.
              </p>
              {planCalChoice === "custom" && (
                <input
                  className="number-input"
                  inputMode="numeric"
                  value={planCustomCal}
                  onChange={(e) => setPlanCustomCal(clamp(Number(e.target.value)))}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
            {planCalChoice === "custom" && (
              <CheckCircle2 size={28} className="plan-option-check" />
            )}
          </button>

          {planNextBtn()}
        </main>
      );
    }

    return null;
  }

  function commitPlanWeek() {
    const reviewWkStart = weekStart(today);
    const nextWkStart = addDays(reviewWkStart, 7);
    const weekCalTarget = days[reviewWkStart]?.calories ?? profile.calories;
    const nextCalories = planCalChoice === "custom" ? planCustomCal : weekCalTarget;

    if (planGoalChoice === "update") {
      const allWeighIns = Object.values(days)
        .filter((d) => d.weighIn.weight !== null && d.weighIn.weight !== undefined)
        .sort((a, b) => a.date.localeCompare(b.date));
      const currentWeight = allWeighIns.at(-1)?.weighIn.weight ?? profile.startWeight;
      const daysElapsed = daysBetween(profile.startDate, today);
      const weightPerDay =
        daysElapsed > 0 ? (currentWeight - profile.startWeight) / daysElapsed : 0;
      const daysToGoal = daysBetween(today, profile.goalDate);
      const predicted = Math.round((currentWeight + weightPerDay * daysToGoal) * 10) / 10;
      updateProfile({ goalWeight: predicted });
    }

    const templateDay = days[reviewWkStart] ?? createDay(reviewWkStart, profile);
    touch();
    setDays((current) => {
      const next = { ...current };
      for (let i = 0; i < 7; i++) {
        const d = addDays(nextWkStart, i);
        const cloned = cloneDay(templateDay);
        cloned.date = d;
        cloned.calories = nextCalories;
        cloned.weighIn = { time: templateDay.weighIn.time, weight: null };
        cloned.meals = cloned.meals.map((meal) => ({
          ...meal,
          id: makeId("meal"),
          foods: [],
          targetStatus: undefined,
          countsTowardProgress: undefined,
        }));
        next[d] = cloned;
      }
      return next;
    });

    setPlannedWeeks((prev) => {
      const filtered = prev.filter((w) => w !== nextWkStart);
      return [...filtered, nextWkStart];
    });
    setSelectedDate(nextWkStart);
    setFullScreen(null);
    setPlanShowPreview(false);
    setPlanStep(1);
  }

  function getCoachTips(): CoachTip[] {
    const weighIns = Object.values(days)
      .filter((day) => typeof day.weighIn.weight === "number" && day.weighIn.weight)
      .map((day) => ({ date: day.date, weight: day.weighIn.weight as number }));
    return computeCoachTips({
      calorieTarget: Number(currentDay.calories || 0),
      proteinTarget: Number(currentDay.protein || 0),
      loggedCalories: loggedTotals.calories,
      loggedProtein: loggedTotals.protein,
      isFuture: selectedDate > today,
      weighIns,
    });
  }

  function renderCoachCard() {
    const tips = getCoachTips();
    return (
      <section className="coach-card">
        <div className="coach-head">
          <WandSparkles size={20} color="#ef3f49" />
          <h2>Coach</h2>
        </div>
        {tips.map((tip) => (
          <div key={tip.id} className={`coach-tip ${tip.tone}`}>
            <span className="coach-dot" />
            <p>{tip.text}</p>
          </div>
        ))}
        <p className="coach-disclaimer">General guidance, not medical or nutrition advice.</p>
      </section>
    );
  }

  function renderSchedule() {
    const inputDay = isStartDayTemplate(currentDay, profile);
    const mealTotalNoticeDismissed = dismissedMealTotals.includes(selectedDate);

    return (
      <>
      <div className="topbar">
          {renderWeekPill()}
          <h1 className="screen-title">{formatHeaderTitle(selectedDate)}</h1>
          <div className="icon-row">
            <button
              className="icon-button flat"
              onClick={() => {
                setWeekMenuOpen(false);
                setFullScreen("edit");
              }}
              title="Edit schedule"
            >
              <LayoutGrid size={26} />
            </button>
            <button className="icon-button flat" onClick={() => setSheet("actions")} title="Actions">
              <Menu size={28} />
            </button>
          </div>
        </div>

        {renderWeekStrip()}
        {renderMacroGrid(currentDay, loggedTotals)}

        {!inputDay && renderCoachCard()}

        {!inputDay && (
          <div className="step-row schedule-step-row header-row">
            <span className="label-strong header-row" style={{ gap: 8 }}>
              <Footprints size={22} /> Step count target
            </span>
            <strong className="mono">
              {Math.round(currentDay.stepMin / 1000)} - {Math.round(currentDay.stepMax / 1000)}k
            </strong>
          </div>
        )}

        {calorieDelta !== 0 && totals.calories > 0 && !inputDay && !mealTotalNoticeDismissed && (
          <div className="notice">
            <Info size={24} color="#2c95b8" />
            <p>
              Your day target is {currentDay.calories} cal, but your meals total {totals.calories}.
            </p>
            <button
              className="icon-button flat"
              onClick={() => setDismissedMealTotals((current) => [...current, selectedDate])}
              title="Dismiss"
            >
              <X size={22} />
            </button>
          </div>
        )}

        {!inputDay && renderPlanWeekBanner()}

        <div className="schedule-list">{renderScheduleItems()}</div>
        {inputDay && (
          <button className="input-day-menu-button" onClick={() => setSheet("actions")} title="Day actions">
            <Menu size={30} />
          </button>
        )}
      </>
    );
  }

  function renderWeekPill() {
    return (
      <button
        className="week-pill"
        type="button"
        aria-expanded={weekMenuOpen}
        aria-haspopup="menu"
        onClick={() => setWeekMenuOpen((open) => !open)}
        title="Choose week"
      >
        Week <span>{currentWeekNumber}</span>
      </button>
    );
  }

  function renderWeekMenu() {
    if (!weekMenuOpen) {
      return null;
    }

    return (
      <>
        <button className="week-menu-backdrop" aria-label="Close week picker" onClick={() => setWeekMenuOpen(false)} />
        <div className="week-menu" role="menu" aria-label="Choose week">
          {weekOptions.map((week) => {
            const active = week.number === currentWeekNumber;

            return (
              <button
                className="week-menu-item"
                key={week.number}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => chooseWeek(week.number)}
              >
                <span>Week {week.number}</span>
                {active && <Check size={28} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderWeekStrip() {
    const start = weekStart(selectedDate);

    return (
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, index) => {
          const value = addDays(start, index);
          const date = parseDateKey(value);
          const day = days[value];
          const dayLoggedTotals = getLoggedTotals(day);
          const beforeStart = value < profile.startDate;
          const target = day?.calories ?? profile.calories;
          const isUnder = Boolean(day && value < today && target - dayLoggedTotals.calories > 0 && !beforeStart);

          return (
            <button
              className={`day-chip ${sameDay(value, selectedDate) ? "active" : ""} ${
                sameDay(value, today) ? "today" : ""
              }`}
              key={value}
          onClick={() => chooseDate(value)}
            >
              <span className="day-letter">
                {new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(date)}
              </span>
              <span className="date-dot">
                {date.getDate()}
                {isUnder && <span className="warn-dot" />}
              </span>
              <span className="day-target">{beforeStart ? "-" : target}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderMacroGrid(day: DayLog, dayTotals: Totals) {
    const items = [
      { key: "calories", label: "Cal", value: dayTotals.calories, target: day.calories, color: "cal" as const, text: <Flame size={16} /> },
      { key: "protein", label: "P", value: dayTotals.protein, target: day.protein, color: "protein" as const, text: "P" },
      { key: "fat", label: "F", value: dayTotals.fat, target: day.fat, color: "fat" as const, text: "F" },
      { key: "carbs", label: "C", value: dayTotals.carbs, target: day.carbs, color: "carbs" as const, text: "C" },
    ];

    return (
      <div className="macro-grid">
        {items.map((item) => (
          <div className="macro-meter" key={item.key}>
            <div className="meter-track" title={item.label}>
              <div
                className={`meter-fill ${item.color}`}
                style={{ width: `${percent(item.value, item.target)}%` }}
              />
            </div>
            <div className="meter-label">
              <MiniBadge kind={item.color}>{item.text}</MiniBadge>
              {item.value}/{item.target}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderScheduleItems() {
    const items = [
      ...currentDay.meals.map((meal) => ({
        key: meal.id,
        order: 1,
        time: timeToMinutes(meal.time),
        node: renderMealCard(meal),
      })),
      {
        key: "weigh-in",
        order: 2,
        time: timeToMinutes(currentDay.weighIn.time),
        node: renderWeighInCard(),
      },
      ...currentDay.workouts.map((workout) => ({
        key: workout.id,
        order: 3,
        time: timeToMinutes(workout.startTime),
        node: renderWorkoutCard(workout),
      })),
      ...currentDay.busyBlocks.map((block) => ({
        key: block.id,
        order: 4,
        time: timeToMinutes(block.startTime),
        node: renderBusyCard(block),
      })),
    ];

    return items
      .sort((a, b) => a.time - b.time || a.order - b.order)
      .map((item) => <Fragment key={item.key}>{item.node}</Fragment>);
  }

  function renderWeighInCard() {
    const hasWeight = currentDay.weighIn.weight !== null;

    return (
      <button
        className={`card ${hasWeight ? "disabled-card complete-card" : "weigh-card"}`}
        key="weigh-in"
        style={{ textAlign: "left" }}
        onClick={() => {
          setWeighDraft(currentDay.weighIn.weight?.toString() ?? "");
          setWeighError("");
          setSheet("weighin");
        }}
      >
        <div className="split-row" style={{ justifyContent: "space-between" }}>
          <strong className="meal-title">
            <Gauge size={24} color={hasWeight ? "#51bf75" : undefined} />
            <span>Weigh-in</span>
            {hasWeight && <span className="weigh-value">{currentDay.weighIn.weight} lb</span>}
          </strong>
          <span className="time-pill">{currentDay.weighIn.time}</span>
        </div>
      </button>
    );
  }

  function renderMealCard(meal: Meal) {
    // Judge the meal against its share of the day's targets, not a fixed number:
    // on a 1200 cal plan every meal would otherwise read "Under targets" forever.
    const mealCount = Math.max(1, currentDay.meals.length);
    const calorieShare = (currentDay.calories / mealCount) * MEAL_TARGET_TOLERANCE;
    const proteinShare = (currentDay.protein / mealCount) * MEAL_TARGET_TOLERANCE;
    const under = meal.calories < calorieShare || meal.protein < proteinShare;
    const foodCount = meal.foods.length;
    const targetStatus = meal.targetStatus ?? (foodCount > 0 ? (under ? "under" : "met") : null);
    const foodStatus = targetStatus ? `${foodCountText(foodCount)} - ${targetStatus === "under" ? "Under targets" : "Targets met"}` : null;

    return (
      <article className="card" key={meal.id}>
        <button
          className="meal-card-head"
          style={{ background: "#ffffff", border: 0, textAlign: "left", width: "100%" }}
          onClick={() => openMeal(meal)}
        >
          <div className="meal-title">
            <Utensils size={25} />
            <span className="meal-name">{meal.name}</span>
            {foodStatus && (
              <span className={`target-pill ${targetStatus === "under" ? "" : "met"}`}>
                {targetStatus === "under" ? <X size={13} /> : <Check size={13} />}
                {foodStatus}
              </span>
            )}
          </div>
          <span className="time-pill">{meal.time}</span>
        </button>
        <div className="meal-macros">
          <div className="macro-value">
            <MacroBadge kind="cal">
              <Flame size={16} />
            </MacroBadge>
            <strong>{meal.calories}</strong>
          </div>
          <div className="macro-value">
            <MacroBadge kind="protein">P</MacroBadge>
            <strong>{meal.protein}</strong>
          </div>
          <div className="macro-value">
            <MacroBadge kind="fat">F</MacroBadge>
            <strong>{meal.fat}</strong>
          </div>
          <div className="macro-value">
            <MacroBadge kind="carbs">C</MacroBadge>
            <strong>{meal.carbs}</strong>
          </div>
        </div>
        {meal.foods.map((food) => (
          <div className="food-row" key={food.id}>
            <span>{food.name}</span>
            {renderFoodAmount(food.amount)}
          </div>
        ))}
      </article>
    );
  }

  function renderFoodAmount(amount: string) {
    const cookedPrefix = "COOKED ";
    if (amount.startsWith(cookedPrefix)) {
      return (
        <small>
          <span className="food-state">COOKED</span>
          <span>{amount.slice(cookedPrefix.length)}</span>
        </small>
      );
    }

    return <small>{amount}</small>;
  }

  function renderWorkoutCard(workout: Workout) {
    return (
      <article className="card disabled-card" key={workout.id}>
        <div className="split-row" style={{ justifyContent: "space-between" }}>
          <strong className="meal-title">
            <Dumbbell size={24} /> {workout.type}
          </strong>
          <span className="time-pill">{workout.startTime}</span>
        </div>
      </article>
    );
  }

  function renderBusyCard(block: BusyBlock) {
    return (
      <article className="card disabled-card" key={block.id}>
        <div className="split-row" style={{ justifyContent: "space-between" }}>
          <strong className="meal-title">
            <Clock size={24} /> Busy
          </strong>
          <span className="time-pill">
            {block.startTime} - {block.endTime}
          </span>
        </div>
      </article>
    );
  }

  /**
   * What actually happened in a week: only days that have already passed and
   * have food logged count, so an unlogged week reads as unknown rather than
   * as success.
   */
  function getWeekSummary(startValue: string) {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(startValue, index));
    const elapsed = dates.filter((date) => date <= today);
    const logged = elapsed
      .map((date) => days[date])
      .filter((day): day is DayLog => Boolean(day) && getLoggedTotals(day).calories > 0);

    const loggedTotal = logged.reduce((sum, day) => sum + getLoggedTotals(day).calories, 0);
    const targetTotal = logged.reduce((sum, day) => sum + Number(day.calories || 0), 0);
    const weekWeighIns = dates
      .map((date) => days[date])
      .filter((day) => day && typeof day.weighIn.weight === "number" && day.weighIn.weight);

    return {
      elapsedDays: elapsed.length,
      loggedDays: logged.length,
      avgLogged: logged.length ? Math.round(loggedTotal / logged.length) : 0,
      avgTarget: logged.length ? Math.round(targetTotal / logged.length) : 0,
      latestWeight: weekWeighIns.at(-1)?.weighIn.weight ?? null,
    };
  }

  function renderWeekAdherence(summary: ReturnType<typeof getWeekSummary>) {
    if (summary.loggedDays === 0) {
      return (
        <div className="notice">
          <Info size={28} color="#2c95b8" />
          <div>
            <strong>Nothing logged yet</strong>
            <p style={{ margin: 0 }}>
              Log your meals and this will show how your week is tracking against your targets.
            </p>
          </div>
        </div>
      );
    }

    const gap = summary.avgLogged - summary.avgTarget;
    const dayCount = `${summary.loggedDays} of ${summary.elapsedDays} ${
      summary.elapsedDays === 1 ? "day" : "days"
    } logged`;

    if (Math.abs(gap) <= summary.avgTarget * 0.05) {
      return (
        <div className="green-note">
          <CheckCircle2 size={28} color="var(--ok)" />
          <div>
            <strong>On track</strong>
            <p style={{ margin: 0 }}>
              Averaging {summary.avgLogged} cal against a {summary.avgTarget} target. {dayCount}.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="notice">
        <Info size={28} color="#2c95b8" />
        <div>
          <strong>{gap > 0 ? "Running over" : "Running under"}</strong>
          <p style={{ margin: 0 }}>
            Averaging {summary.avgLogged} cal against a {summary.avgTarget} target,{" "}
            {Math.abs(gap)} {gap > 0 ? "over" : "under"} a day. {dayCount}.
          </p>
        </div>
      </div>
    );
  }

  function renderProgress() {
    const weighIns = Object.values(days)
      .filter((day) => day.weighIn.weight)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = weighIns.at(-1)?.weighIn.weight ?? profile.startWeight;
    const change = latest - profile.startWeight;
    const weekStartValue = weekStart(selectedDate);
    const weekEndValue = addDays(weekStartValue, 6);
    const weekSummary = getWeekSummary(weekStartValue);

    return (
      <>
        <h1 className="progress-title">Your fat loss progress</h1>
        <section className="progress-hero">
          {weighIns.length >= 4 ? (
            renderWeightChart(weighIns)
          ) : (
            <div>
              <LineChart size={82} color="#73747a" />
              <p className="muted" style={{ marginTop: 24 }}>
                Your graph will become available once you have four days of weigh-ins.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="section-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Summary <Info size={24} color="#777982" />
          </h2>
          <div className="summary-grid">
            <div>
              <strong className="muted">Start</strong>
              <h3>{profile.startWeight} lbs</h3>
              <p className="muted">{formatShortDate(profile.startDate)}</p>
            </div>
            <div>
              <strong className="muted">Change</strong>
              <h3>{change === 0 ? "-" : `${change > 0 ? "+" : ""}${change.toFixed(1)} lbs`}</h3>
            </div>
            <div>
              <strong className="muted">Goal</strong>
              <h3>{profile.goalWeight} lbs</h3>
              <p className="muted">{formatGoalDate(profile.goalDate)}</p>
            </div>
          </div>

          <h2 className="section-title">This week</h2>
          {renderWeekAdherence(weekSummary)}

          <div className="card" style={{ padding: 16 }}>
            <div className="split-row" style={{ justifyContent: "space-between" }}>
              <strong>W-{dietWeekNumber(weekStartValue, profile.startDate)}</strong>
              <strong>
                {formatShortDate(weekStartValue)} - {formatShortDate(weekEndValue)}
              </strong>
              <button className="danger-button" onClick={() => setFullScreen("edit")}>
                Edit Schedule
              </button>
            </div>
            <div className="split-row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <span className="muted">
                Avg logged{" "}
                <strong className="mono">{weekSummary.loggedDays ? weekSummary.avgLogged : "-"}</strong>
              </span>
              <span className="muted">
                Avg target{" "}
                <strong className="mono">{weekSummary.loggedDays ? weekSummary.avgTarget : "-"}</strong>
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <span className="muted">Latest weigh-in this week </span>
              <strong>{weekSummary.latestWeight ? `${weekSummary.latestWeight} lbs` : "- lbs"}</strong>
            </div>
          </div>

          <button className="ghost-button" style={{ marginTop: 18, width: "100%" }} onClick={openCalendar}>
            <RotateCcw size={24} /> View progress history
          </button>
        </section>
      </>
    );
  }

  function renderWeightChart(weighIns: DayLog[]) {
    const values = weighIns.map((day) => day.weighIn.weight ?? profile.startWeight);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    // Scaling straight to min..max makes half a pound of daily noise fill the
    // whole chart. Hold a minimum span so small changes read as small.
    const middle = (dataMin + dataMax) / 2;
    const halfSpan = Math.max(((dataMax - dataMin) / 2) * 1.3, WEIGHT_CHART_MIN_SPAN / 2);
    const domainMin = middle - halfSpan;
    const domainMax = middle + halfSpan;

    const left = 46;
    const right = 310;
    const top = 16;
    const bottom = 168;
    const toX = (index: number) =>
      left + (index / Math.max(1, values.length - 1)) * (right - left);
    const toY = (weight: number) =>
      bottom - ((weight - domainMin) / (domainMax - domainMin)) * (bottom - top);

    const ticks = [domainMax, middle, domainMin];
    const goalInRange = profile.goalWeight >= domainMin && profile.goalWeight <= domainMax;
    const first = values[0];
    const last = values[values.length - 1];
    const net = last - first;

    return (
      <svg
        viewBox="0 0 320 200"
        role="img"
        aria-label={`Weight from ${first} to ${last} pounds across ${values.length} weigh-ins, a change of ${net.toFixed(1)} pounds`}
        style={{ width: "100%" }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              y1={toY(tick)}
              x2={right}
              y2={toY(tick)}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text
              x={left - 8}
              y={toY(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted)"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        {goalInRange && (
          <>
            <line
              x1={left}
              y1={toY(profile.goalWeight)}
              x2={right}
              y2={toY(profile.goalWeight)}
              stroke="var(--ok)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <text x={right} y={toY(profile.goalWeight) - 6} textAnchor="end" fontSize="11" fill="var(--ok)">
              Goal {profile.goalWeight}
            </text>
          </>
        )}

        <polyline
          fill="none"
          points={values.map((weight, index) => `${toX(index)},${toY(weight)}`).join(" ")}
          stroke="var(--red)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {values.map((weight, index) => (
          <circle
            key={weighIns[index].date}
            cx={toX(index)}
            cy={toY(weight)}
            r="4"
            fill="var(--red)"
          />
        ))}

        <text x={left} y={190} fontSize="11" fill="var(--muted)">
          {formatShortDate(weighIns[0].date)}
        </text>
        <text x={right} y={190} textAnchor="end" fontSize="11" fill="var(--muted)">
          {formatShortDate(weighIns[weighIns.length - 1].date)}
        </text>
      </svg>
    );
  }

  function renderExplore() {
    const starters = [
      { name: "Grilled chicken bowl", amount: "1 serving", macros: { calories: 520, protein: 48, fat: 14, carbs: 48 } },
      { name: "Greek yogurt and berries", amount: "1 serving", macros: { calories: 240, protein: 24, fat: 4, carbs: 32 } },
      { name: "Salmon rice plate", amount: "1 serving", macros: { calories: 610, protein: 42, fat: 24, carbs: 54 } },
      { name: "Protein shake", amount: "1 serving", macros: { calories: 180, protein: 30, fat: 3, carbs: 8 } },
    ];
    const saved = profile.foods.map((food) => ({
      name: food.name,
      amount: food.amount || "1 serving",
      macros: { calories: food.calories, protein: food.protein, fat: food.fat, carbs: food.carbs },
    }));

    return (
      <>
        <h1 className="more-title">Explore</h1>

        <div className="split-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Your foods
          </h2>
          <button className="icon-button flat" onClick={openCustomFoods}>
            Manage
          </button>
        </div>

        {profile.meals.length > 0 && (
          <section className="schedule-list" style={{ marginBottom: 18 }}>
            {profile.meals.map((template) => {
              const totals = sumFoods(template.foods);

              return (
                <button
                  className="card"
                  key={template.id}
                  onClick={() => addMealTemplateToDay(template)}
                  style={{ padding: 16, textAlign: "left" }}
                >
                  <div className="split-row" style={{ justifyContent: "space-between" }}>
                    <strong>{template.name}</strong>
                    <span className="time-pill">{foodCountText(template.foods.length)}</span>
                  </div>
                  <div className="meal-macros" style={{ margin: "14px -16px -16px" }}>
                    <span>{totals.calories} cal</span>
                    <span>{totals.protein} P</span>
                    <span>{totals.fat} F</span>
                    <span>{totals.carbs} C</span>
                  </div>
                </button>
              );
            })}
          </section>
        )}
        {saved.length === 0 ? (
          <p className="muted">Foods you save show up here, ready to add to a day.</p>
        ) : (
          <section className="schedule-list">{saved.map(renderExploreFoodCard)}</section>
        )}

        <h2 className="section-title">Starters</h2>
        <section className="schedule-list">{starters.map(renderExploreFoodCard)}</section>
      </>
    );
  }

  function renderExploreFoodCard(food: { name: string; amount: string; macros: Totals }) {
    return (
      <button
        className="card"
        key={food.name}
        onClick={() => addLibraryMeal(food.name, food.macros, food.amount)}
        style={{ padding: 16, textAlign: "left" }}
      >
        <div className="split-row" style={{ justifyContent: "space-between" }}>
          <strong>{food.name}</strong>
          <ChevronRight />
        </div>
        <div className="meal-macros" style={{ margin: "14px -16px -16px" }}>
          <span>{food.macros.calories} cal</span>
          <span>{food.macros.protein} P</span>
          <span>{food.macros.fat} F</span>
          <span>{food.macros.carbs} C</span>
        </div>
      </button>
    );
  }

  function renderMore() {
    const rows: Array<[LucideIcon, string, () => void, string?]> = [
      [Box, "Foods & Meals", openCustomFoods],
      [ClipboardList, "Shopping List", () => { setShoppingView("home"); setFullScreen("shopping"); }],
      [
        Scale,
        "Weigh-ins",
        () => {
          setWeighDraft(currentDay.weighIn.weight?.toString() ?? "");
          setWeighError("");
          setSheet("weighin");
        },
      ],
      [Share2, "Share Progress", () => null],
      [Settings, "Settings", openSettings],
      [CircleHelp, "Help", () => null],
      [RefreshCw, "Cloud Sync", () => setSheet("cloud"), syncStatus],
      [Ban, "End Current Diet", () => null],
    ];

    return (
      <>
        <h1 className="more-title">More</h1>
        <div className="more-list">
          {rows.map(([Icon, label, action, sub]) => (
            <button key={label} onClick={action}>
              <Icon color="#cf2038" size={28} />
              <span>
                {label}
                {sub && <small className="muted" style={{ display: "block", marginTop: 4 }}>{sub}</small>}
              </span>
              <ChevronRight color="#8b8c93" />
            </button>
          ))}
        </div>
      </>
    );
  }

  function renderCustomFoodsScreen() {
    if (foodDraft) {
      return renderCustomFoodEditor(foodDraft);
    }

    if (mealTemplateDraft) {
      return renderMealTemplateEditor(mealTemplateDraft);
    }

    const showingMeals = libraryView === "meals";

    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>Foods &amp; Meals</h1>
          <button
            className="primary-button"
            onClick={() =>
              showingMeals
                ? setMealTemplateDraft({ id: makeId("custom-meal"), name: "", foods: [] })
                : setFoodDraft(newFoodDraft())
            }
          >
            Add
          </button>
        </div>

        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={!showingMeals}
            className={showingMeals ? "" : "selected"}
            onClick={() => setLibraryView("foods")}
          >
            Foods
          </button>
          <button
            role="tab"
            aria-selected={showingMeals}
            className={showingMeals ? "selected" : ""}
            onClick={() => setLibraryView("meals")}
          >
            Meals
          </button>
        </div>

        {showingMeals ? renderMealTemplateList() : renderCustomFoodList()}
      </main>
    );
  }

  function renderMealTemplateList() {
    if (profile.meals.length === 0) {
      return (
        <div className="notice" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Save a combination you eat often, like a chicken and rice bowl, and add the whole thing
            to a day in one tap. You can also save a meal straight from your schedule while editing it.
          </p>
        </div>
      );
    }

    return (
      <div className="schedule-list">
        {profile.meals.map((template) => {
          const totals = sumFoods(template.foods);

          return (
            <article className="card" key={template.id}>
              <button
                className="meal-card-head"
                style={{ background: "#ffffff", border: 0, textAlign: "left", width: "100%" }}
                onClick={() => editMealTemplate(template)}
              >
                <div className="meal-title">
                  <Utensils size={24} />
                  <span className="meal-name">{template.name}</span>
                </div>
                <span className="time-pill">{foodCountText(template.foods.length)}</span>
              </button>
              <div className="meal-macros">
                <div className="macro-value">
                  <MacroBadge kind="cal">
                    <Flame size={16} />
                  </MacroBadge>
                  <strong>{totals.calories}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="protein">P</MacroBadge>
                  <strong>{totals.protein}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="fat">F</MacroBadge>
                  <strong>{totals.fat}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="carbs">C</MacroBadge>
                  <strong>{totals.carbs}</strong>
                </div>
              </div>
              {template.foods.map((food) => (
                <div className="food-row" key={food.id}>
                  <span>{food.name}</span>
                  <small>{food.amount}</small>
                </div>
              ))}
              <button
                className="ghost-button"
                style={{ margin: 12, width: "calc(100% - 24px)" }}
                onClick={() => addMealTemplateToDay(template)}
              >
                <Plus size={20} /> Add to {formatShortDate(selectedDate)}
              </button>
            </article>
          );
        })}
      </div>
    );
  }

  function renderCustomFoodList() {
    return (
      <>
        {profile.foods.length === 0 ? (
          <div className="notice" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              Save the foods you eat often with their macros. Once saved, you can drop one into any
              meal and its calories and macros come with it.
            </p>
          </div>
        ) : (
          <div className="schedule-list">
            {profile.foods.map((food) => (
              <article className="card" key={food.id}>
                <button
                  className="meal-card-head"
                  style={{ background: "#ffffff", border: 0, textAlign: "left", width: "100%" }}
                  onClick={() => editCustomFood(food)}
                >
                  <div className="meal-title">
                    <Box size={24} />
                    <span className="meal-name">{food.name}</span>
                  </div>
                  {food.amount && <span className="time-pill">{food.amount}</span>}
                </button>
                <div className="meal-macros">
                  <div className="macro-value">
                    <MacroBadge kind="cal">
                      <Flame size={16} />
                    </MacroBadge>
                    <strong>{food.calories}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="protein">P</MacroBadge>
                    <strong>{food.protein}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="fat">F</MacroBadge>
                    <strong>{food.fat}</strong>
                  </div>
                  <div className="macro-value">
                    <MacroBadge kind="carbs">C</MacroBadge>
                    <strong>{food.carbs}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderMealTemplateEditor(draft: CustomMeal) {
    const totals = sumFoods(draft.foods);
    const saved = profile.meals.some((entry) => entry.id === draft.id);

    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setMealTemplateDraft(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>{saved ? "Edit meal" : "New meal"}</h1>
          <button className="primary-button" onClick={saveMealTemplate}>
            Save
          </button>
        </div>

        <div className="form-stack">
          <div className="form-row">
            <label htmlFor="meal-template-name">Name</label>
            <input
              id="meal-template-name"
              className="text-input"
              placeholder="Chicken and rice bowl"
              value={draft.name}
              onChange={(event) => updateMealTemplateDraft({ name: event.target.value })}
            />
          </div>

          <h2 className="section-title">Foods</h2>
          {draft.foods.length === 0 ? (
            <p className="muted">Add the foods that make up this meal.</p>
          ) : (
            <div className="schedule-list">
              {draft.foods.map((food) => (
                <article className="card" key={food.id}>
                  <div className="meal-card-head">
                    <div className="meal-title">
                      <span className="meal-name">{food.name}</span>
                      {food.amount && <small className="muted">{food.amount}</small>}
                    </div>
                    <button
                      className="icon-button flat"
                      title={`Remove ${food.name}`}
                      onClick={() =>
                        updateMealTemplateDraft({
                          foods: draft.foods.filter((entry) => entry.id !== food.id),
                        })
                      }
                    >
                      <X size={22} />
                    </button>
                  </div>
                  <div className="meal-macros">
                    <div className="macro-value">
                      <MacroBadge kind="cal">
                        <Flame size={16} />
                      </MacroBadge>
                      <strong>{food.calories}</strong>
                    </div>
                    <div className="macro-value">
                      <MacroBadge kind="protein">P</MacroBadge>
                      <strong>{food.protein}</strong>
                    </div>
                    <div className="macro-value">
                      <MacroBadge kind="fat">F</MacroBadge>
                      <strong>{food.fat}</strong>
                    </div>
                    <div className="macro-value">
                      <MacroBadge kind="carbs">C</MacroBadge>
                      <strong>{food.carbs}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {draft.foods.length > 0 && (
            <div className="step-row header-row" style={{ marginTop: 12 }}>
              <strong>Meal total</strong>
              <span className="header-row" style={{ gap: 10 }}>
                <MiniBadge kind="cal">
                  <Flame size={16} />
                </MiniBadge>
                <strong className="mono">{totals.calories}</strong>
                <MiniBadge kind="protein">P</MiniBadge>
                <strong className="mono">{totals.protein}</strong>
                <MiniBadge kind="fat">F</MiniBadge>
                <strong className="mono">{totals.fat}</strong>
                <MiniBadge kind="carbs">C</MiniBadge>
                <strong className="mono">{totals.carbs}</strong>
              </span>
            </div>
          )}

          <h2 className="section-title">Add from your foods</h2>
          {profile.foods.length === 0 ? (
            <p className="muted">Save some foods first and they will show up here.</p>
          ) : (
            <div className="schedule-list">
              {profile.foods.map((food) => (
                <button
                  className="card"
                  key={food.id}
                  style={{ padding: 16, textAlign: "left" }}
                  onClick={() =>
                    updateMealTemplateDraft({
                      foods: [...draft.foods, { ...food, id: makeId("food") }],
                    })
                  }
                >
                  <div className="split-row" style={{ justifyContent: "space-between" }}>
                    <strong>{food.name}</strong>
                    <Plus size={22} />
                  </div>
                  <div className="meal-macros" style={{ margin: "14px -16px -16px" }}>
                    <span>{food.calories} cal</span>
                    <span>{food.protein} P</span>
                    <span>{food.fat} F</span>
                    <span>{food.carbs} C</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {mealTemplateError && <p className="form-error">{mealTemplateError}</p>}

          {saved && (
            <button
              className="danger-button"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => deleteMealTemplate(draft.id)}
            >
              Delete meal
            </button>
          )}
        </div>
      </main>
    );
  }

  function renderCustomFoodEditor(draft: CustomFoodDraft) {
    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFoodDraft(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>{draft.id ? "Edit food" : "New food"}</h1>
          <button className="primary-button" onClick={saveCustomFood}>
            Save
          </button>
        </div>

        <div className="form-stack">
          <div className="form-row">
            <label htmlFor="custom-food-name">Name</label>
            <input
              id="custom-food-name"
              className="text-input"
              placeholder="Chicken breast"
              value={draft.name}
              onChange={(event) => updateFoodDraft({ name: event.target.value })}
            />
          </div>
          <div className="form-row">
            <label htmlFor="custom-food-amount">Amount</label>
            <input
              id="custom-food-amount"
              className="text-input"
              placeholder="250 G"
              value={draft.amount}
              onChange={(event) => updateFoodDraft({ amount: event.target.value })}
            />
          </div>

          <h2 className="section-title">Nutrition for that amount</h2>
          <div className="number-grid">
            <NutrientInput
              kind="cal"
              icon={<Flame size={16} />}
              label="Calories (kcal)"
              value={draft.calories}
              step={25}
              onChange={(calories) => updateFoodDraft({ calories })}
            />
            <NutrientInput
              kind="protein"
              icon="P"
              label="Protein (g)"
              value={draft.protein}
              onChange={(protein) => updateFoodDraft({ protein })}
            />
            <NutrientInput
              kind="fat"
              icon="F"
              label="Fat (g)"
              value={draft.fat}
              onChange={(fat) => updateFoodDraft({ fat })}
            />
            <NutrientInput
              kind="carbs"
              icon="C"
              label="Carbs (g)"
              value={draft.carbs}
              onChange={(carbs) => updateFoodDraft({ carbs })}
            />
          </div>

          {foodError && <p className="form-error">{foodError}</p>}

          {draft.id && (
            <button className="danger-button" style={{ width: "100%", marginTop: 8 }} onClick={() => deleteCustomFood(draft.id as string)}>
              Delete food
            </button>
          )}
        </div>
      </main>
    );
  }

  function renderSettingsScreen() {
    if (!settingsDraft) {
      return null;
    }

    const draft = settingsDraft;
    const projectedChange = Number(draft.goalWeight) - Number(draft.startWeight);

    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>
            <Settings size={22} /> Settings
          </h1>
          <button className="primary-button" onClick={saveSettings}>
            Save
          </button>
        </div>

        <div className="form-stack">
          <h2 className="section-title">Daily targets</h2>
          <p className="muted">Applies to today and every day ahead. Past days keep what you logged.</p>
          <div className="number-grid">
            <NutrientInput
              kind="cal"
              icon={<Flame size={16} />}
              label="Calories (kcal)"
              value={draft.calories}
              step={25}
              onChange={(calories) => updateSettingsDraft({ calories })}
            />
            <NutrientInput
              kind="protein"
              icon="P"
              label="Protein (g)"
              value={draft.protein}
              onChange={(protein) => updateSettingsDraft({ protein })}
            />
            <NutrientInput
              kind="fat"
              icon="F"
              label="Fat (g)"
              value={draft.fat}
              onChange={(fat) => updateSettingsDraft({ fat })}
            />
            <NutrientInput
              kind="carbs"
              icon="C"
              label="Carbs (g)"
              value={draft.carbs}
              onChange={(carbs) => updateSettingsDraft({ carbs })}
            />
          </div>

          <h2 className="section-title">Step count target</h2>
          <div className="step-row header-row">
            <strong className="header-row" style={{ gap: 8 }}>
              <Footprints /> Steps per day
            </strong>
            <span className="step-range">
              <input
                className="mono"
                inputMode="numeric"
                aria-label="Lowest daily step target"
                value={draft.stepMin}
                onChange={(event) => updateSettingsDraft({ stepMin: clamp(Number(event.target.value)) })}
              />
              <span className="muted">-</span>
              <input
                className="mono"
                inputMode="numeric"
                aria-label="Highest daily step target"
                value={draft.stepMax}
                onChange={(event) => updateSettingsDraft({ stepMax: clamp(Number(event.target.value)) })}
              />
            </span>
          </div>

          <h2 className="section-title">Your plan</h2>
          <FormDate
            label="Start date"
            value={draft.startDate}
            onChange={(startDate) => updateSettingsDraft({ startDate })}
          />
          <div className="form-row">
            <label htmlFor="settings-start-weight">Start weight</label>
            <input
              id="settings-start-weight"
              className="number-input mono"
              inputMode="decimal"
              placeholder="lbs"
              value={draft.startWeight}
              onChange={(event) => updateSettingsDraft({ startWeight: event.target.value })}
            />
          </div>
          <div className="form-row">
            <label htmlFor="settings-goal-weight">Goal weight</label>
            <input
              id="settings-goal-weight"
              className="number-input mono"
              inputMode="decimal"
              placeholder="lbs"
              value={draft.goalWeight}
              onChange={(event) => updateSettingsDraft({ goalWeight: event.target.value })}
            />
          </div>
          <FormDate
            label="Goal date"
            value={draft.goalDate}
            onChange={(goalDate) => updateSettingsDraft({ goalDate })}
          />

          {Number.isFinite(projectedChange) && projectedChange !== 0 && (
            <p className="muted">
              That is {Math.abs(projectedChange).toFixed(1)} lbs to {projectedChange < 0 ? "lose" : "gain"} by{" "}
              {formatGoalDate(draft.goalDate)}.
            </p>
          )}

          {settingsError && <p className="form-error">{settingsError}</p>}
        </div>
      </main>
    );
  }

  function renderWorkoutScreen() {
    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>
            <Dumbbell size={22} /> Workout
            <small>{formatShortDate(selectedDate)}</small>
          </h1>
          <button className="primary-button" onClick={saveWorkout}>
            Save
          </button>
        </div>

        <div className="form-stack">
          <FormSelect
            label="Workout type"
            value={workoutDraft.type}
            onChange={(type) => setWorkoutDraft((current) => ({ ...current, type }))}
            options={["weight training", "cardio", "walk", "sport"]}
          />
          <FormText
            label="Start time"
            value={workoutDraft.startTime}
            onChange={(startTime) => setWorkoutDraft((current) => ({ ...current, startTime }))}
          />
          <FormSelect
            label="Duration"
            value={workoutDraft.duration}
            onChange={(duration) => setWorkoutDraft((current) => ({ ...current, duration }))}
            options={["30m", "45m", "1h", "90m", "2h"]}
          />
          <FormSelect
            label="Intensity"
            value={workoutDraft.intensity}
            onChange={(intensity) => setWorkoutDraft((current) => ({ ...current, intensity }))}
            options={["light", "moderate", "hard"]}
          />
          <ToggleRow
            label="Use workout shake"
            value={workoutDraft.shake}
            onChange={(shake) => setWorkoutDraft((current) => ({ ...current, shake }))}
          />

          <h2 className="section-title">Automation</h2>
          <ToggleRow
            label="Optimize when finished"
            value={workoutDraft.optimize}
            onChange={(optimize) => setWorkoutDraft((current) => ({ ...current, optimize }))}
          />
          <p className="muted">Rearranges unlocked meal times and macros around your workout.</p>
          <ToggleRow
            label="Update my day's calorie targets"
            value={workoutDraft.updateTargets}
            onChange={(updateTargets) => setWorkoutDraft((current) => ({ ...current, updateTargets }))}
          />
          <p className="muted">Updates day targets to match the workout, even when locked.</p>
        </div>
      </main>
    );
  }

  function renderBusyScreen() {
    return (
      <main className="full-screen phone-frame">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>
            <Clock size={22} /> Busy
            <small>{formatShortDate(selectedDate)}</small>
          </h1>
          <button className="primary-button" onClick={saveBusy}>
            Save
          </button>
        </div>

        <div className="form-stack">
          <FormText
            label="Start time"
            value={busyDraft.startTime}
            onChange={(startTime) => setBusyDraft((current) => ({ ...current, startTime }))}
          />
          <FormText
            label="End time"
            value={busyDraft.endTime}
            onChange={(endTime) => setBusyDraft((current) => ({ ...current, endTime }))}
          />

          <h2 className="section-title">Automation</h2>
          <ToggleRow
            label="Optimize when finished"
            value={busyDraft.optimize}
            onChange={(optimize) => setBusyDraft((current) => ({ ...current, optimize }))}
          />
          <p className="muted">Shifts unlocked meal times around this busy block.</p>
        </div>
      </main>
    );
  }

  function renderEditSchedule() {
    return (
      <main className="app-main">
        <div className="nav-row">
          <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
            <ArrowLeft size={32} />
          </button>
          <h1>Edit schedule</h1>
          <button className="primary-button" onClick={() => setFullScreen(null)}>
            Save
          </button>
        </div>

        <div className="topbar" style={{ paddingTop: 0 }}>
          {renderWeekPill()}
          <div>
            <div className="header-row" style={{ gap: 6 }}>
              <MacroBadge kind="cal">
                <Flame size={16} />
              </MacroBadge>
              <strong className="mono">{profile.calories}</strong>
            </div>
            <span className="muted">Trending avg</span>
          </div>
          <div>
            <div className="header-row" style={{ gap: 6 }}>
              <Target size={24} />
              <strong className="mono">{currentDay.calories}</strong>
            </div>
            <span className="muted">Daily target</span>
          </div>
          <Menu />
        </div>

        {renderWeekStrip()}

        <h2 className="section-title">{formatShortDate(selectedDate)}</h2>
        <div className="edit-summary">
          <div className="card" style={{ padding: 16 }}>
            <strong>Day targets</strong>
            <div className="target-grid" style={{ marginTop: 12 }}>
              <EditableTarget kind="cal" value={currentDay.calories} onChange={(calories) => updateDay(selectedDate, (day) => ({ ...day, calories }))}>
                <Flame size={16} />
              </EditableTarget>
              <EditableTarget kind="protein" value={currentDay.protein} onChange={(protein) => updateDay(selectedDate, (day) => ({ ...day, protein }))}>
                P
              </EditableTarget>
              <EditableTarget kind="fat" value={currentDay.fat} onChange={(fat) => updateDay(selectedDate, (day) => ({ ...day, fat }))}>
                F
              </EditableTarget>
              <EditableTarget kind="carbs" value={currentDay.carbs} onChange={(carbs) => updateDay(selectedDate, (day) => ({ ...day, carbs }))}>
                C
              </EditableTarget>
              <button onClick={() => { updateProfile({ calories: currentDay.calories, protein: currentDay.protein, fat: currentDay.fat, carbs: currentDay.carbs }); setProfileSaved(true); setTimeout(() => setProfileSaved(false), 1200); }}>
                {profileSaved ? <Check size={18} color="#51bf75" /> : <ChevronRight />}
              </button>
            </div>
          </div>
          <div className="step-row header-row">
            <strong className="header-row" style={{ gap: 8 }}>
              <Footprints /> Step count target
            </strong>
            <span className="step-range">
              <input
                className="mono"
                inputMode="numeric"
                aria-label="Minimum daily steps"
                value={currentDay.stepMin}
                onChange={(event) =>
                  updateDay(selectedDate, (day) => ({ ...day, stepMin: clamp(Number(event.target.value)) }))
                }
              />
              <span className="muted">-</span>
              <input
                className="mono"
                inputMode="numeric"
                aria-label="Maximum daily steps"
                value={currentDay.stepMax}
                onChange={(event) =>
                  updateDay(selectedDate, (day) => ({ ...day, stepMax: clamp(Number(event.target.value)) }))
                }
              />
            </span>
          </div>
          <div className="step-row header-row">
            <strong className="header-row" style={{ gap: 8 }}>
              <Utensils /> {currentDay.meals.length} meals
            </strong>
            <span className="time-pill">
              {currentDay.meals[0]?.time ?? "9:00 AM"} - {currentDay.meals.at(-1)?.time ?? "9:00 PM"}
            </span>
          </div>
        </div>

        <div className="split-row" style={{ justifyContent: "space-between" }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Meals and activities
          </h2>
          <button className="round-button" onClick={() => setSheet("actions")} title="Add">
            <Plus size={30} />
          </button>
        </div>

        <div className="schedule-list" style={{ marginTop: 16 }}>
          {renderWeighInCard()}
          {currentDay.meals.map((meal) => renderMealCard(meal))}
        </div>
      </main>
    );
  }

  function getShoppingFoods(startDate: string, endDate: string) {
    const order: string[] = [];
    const tallies: Record<string, ShoppingTally[]> = {};
    const unparsed: Record<string, string> = {};

    let date = startDate;
    while (date <= endDate) {
      const day = days[date];
      if (day) {
        for (const meal of day.meals) {
          for (const food of meal.foods) {
            if (!(food.name in tallies)) {
              order.push(food.name);
              tallies[food.name] = [];
            }

            const parsed = parseShoppingAmount(food.amount);
            if (!parsed) {
              if (!(food.name in unparsed)) {
                unparsed[food.name] = food.amount;
              }
              continue;
            }

            const bucket = tallies[food.name];
            const match = bucket.find(
              (entry) => entry.cooked === parsed.cooked && entry.unit === parsed.unit,
            );
            if (match) {
              match.qty += parsed.qty;
            } else {
              bucket.push(parsed);
            }
          }
        }
      }
      date = addDays(date, 1);
    }

    return order.map((name) => {
      const bucket = tallies[name] ?? [];
      if (bucket.length === 0) {
        return { name, amount: unparsed[name] ?? "" };
      }
      return { name, amount: bucket.map(formatShoppingTally).join(" + ") };
    });
  }

  function parseShoppingFoodName(name: string): { brand: string; product: string } {
    const commaIdx = name.indexOf(",");
    if (commaIdx > 0 && commaIdx < name.length - 1) {
      return { brand: name.slice(0, commaIdx).trim(), product: name.slice(commaIdx + 1).trim() };
    }
    return { brand: name, product: name };
  }

  function formatShoppingAmount(amount: string, unit: ShoppingUnit): { display: string; isRaw: boolean } {
    const cookedPrefix = "COOKED ";
    const isCooked = amount.startsWith(cookedPrefix);
    const base = isCooked ? amount.slice(cookedPrefix.length) : amount;
    const gMatch = base.match(/(\d+(?:\.\d+)?)\s*G\b/i);
    const mlMatch = base.match(/(\d+(?:\.\d+)?)\s*ML\b/i);

    if (unit === "oz") {
      if (gMatch) return { display: `${(parseFloat(gMatch[1]) * 0.035274).toFixed(1)} oz`, isRaw: !isCooked };
      if (mlMatch) return { display: `${(parseFloat(mlMatch[1]) * 0.033814).toFixed(1)} fl-oz`, isRaw: !isCooked };
    } else {
      if (gMatch) return { display: `${gMatch[1]} g`, isRaw: !isCooked };
      if (mlMatch) return { display: `${mlMatch[1]} ml`, isRaw: !isCooked };
    }
    return { display: base, isRaw: !isCooked };
  }

  function renderShoppingScreen() {
    const thisWeekStart = weekStart(today);
    const thisWeekEnd = addDays(thisWeekStart, 6);
    const nextWeekStart = addDays(thisWeekStart, 7);
    const nextWeekEnd = addDays(thisWeekStart, 13);

    function openShoppingDetail(view: ShoppingView) {
      setShoppingChecked([]);
      setShoppingView(view);
    }

    function toggleChecked(name: string) {
      setShoppingChecked((prev) =>
        prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
      );
    }

    function addCustomFood() {
      const name = shoppingDraftName.trim();
      if (!name) {
        return;
      }
      setCustomShoppingFoods((prev) => [...prev, { id: makeId("food"), name, amount: shoppingDraftAmount.trim() }]);
      setShoppingDraftName("");
      setShoppingDraftAmount("");
      setShoppingAddOpen(false);
    }

    function removeCustomFood(id: string) {
      setCustomShoppingFoods((prev) => prev.filter((food) => food.id !== id));
      setShoppingChecked((prev) => prev.filter((key) => key !== `custom:${id}`));
    }

    if (shoppingView === "home") {
      return (
        <main className="full-screen phone-frame">
          <div className="nav-row">
            <button className="icon-button flat" onClick={() => setFullScreen(null)} title="Back">
              <ArrowLeft size={32} />
            </button>
            <h1>Shopping List</h1>
            <span style={{ width: 32 }} />
          </div>
          <div className="notice" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              For any meals you have configured, the Shopping List will tell you how much of each food you&apos;ll need for the week so that you can make all of your meals to their specifications!
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Choose from one of the default shopping list options or create your own custom list.
            </p>
          </div>
          <div className="schedule-list" style={{ marginTop: 8 }}>
            <button className="card" style={{ padding: 16, textAlign: "left", width: "100%" }} onClick={() => openShoppingDetail("this-week")}>
              <div className="split-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>This week</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Dates: {formatShortDate(thisWeekStart)} – {formatShortDate(thisWeekEnd)}</p>
                </div>
                <ChevronRight color="#8b8c93" />
              </div>
            </button>
            <button className="card" style={{ padding: 16, textAlign: "left", width: "100%" }} onClick={() => openShoppingDetail("next-week")}>
              <div className="split-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>Next week</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Dates: {formatShortDate(nextWeekStart)} – {formatShortDate(nextWeekEnd)}</p>
                </div>
                <ChevronRight color="#8b8c93" />
              </div>
            </button>
            <button className="card" style={{ padding: 16, textAlign: "left", width: "100%" }} onClick={() => openShoppingDetail("custom")}>
              <div className="split-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>Custom</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Tap here to create your custom list</p>
                </div>
                <ChevronRight color="#8b8c93" />
              </div>
            </button>
          </div>
        </main>
      );
    }

    const isNextWeek = shoppingView === "next-week";
    const rangeStart = isNextWeek ? nextWeekStart : thisWeekStart;
    const rangeEnd = isNextWeek ? nextWeekEnd : thisWeekEnd;
    const title = isNextWeek ? "Next week" : shoppingView === "custom" ? "Custom" : "This week";
    const foods = shoppingView === "custom" ? [] : getShoppingFoods(rangeStart, rangeEnd);
    const totalCount = foods.length + customShoppingFoods.length;
    const checkedCount =
      foods.filter((f) => shoppingChecked.includes(f.name)).length +
      customShoppingFoods.filter((f) => shoppingChecked.includes(`custom:${f.id}`)).length;

    return (
      <main className="full-screen phone-frame" style={{ paddingBottom: 24 }}>
        <div className="nav-row">
          <button className="icon-button flat" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={() => setShoppingView("home")} title="Back">
            <ArrowLeft size={20} /><span>Back</span>
          </button>
          <span />
          <span style={{ width: 64 }} />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, padding: "0 16px 8px" }}>{title}</h1>

        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="segment-control">
            <button className={shoppingState === "raw" ? "active" : ""} onClick={() => setShoppingState("raw")}>Raw</button>
            <button className={shoppingState === "cooked" ? "active" : ""} onClick={() => setShoppingState("cooked")}>Cooked</button>
          </div>
          <div className="segment-control">
            <button className={shoppingUnit === "grams" ? "active" : ""} onClick={() => setShoppingUnit("grams")}>grams / ml</button>
            <button className={shoppingUnit === "oz" ? "active" : ""} onClick={() => setShoppingUnit("oz")}>oz / fl oz</button>
          </div>
        </div>

        <div className="notice" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          {shoppingView !== "custom" && (
            <p className="muted" style={{ margin: 0 }}>Dates: {formatShortDate(rangeStart)} – {formatShortDate(rangeEnd)}</p>
          )}
          <p className="muted" style={{ margin: 0 }}>Selected: {checkedCount} out of {totalCount} foods</p>
        </div>

        {foods.length === 0 && customShoppingFoods.length === 0 ? (
          <p style={{ padding: "16px" }}>
            {shoppingView === "custom"
              ? "Tap “Add food” below to start building your custom shopping list."
              : "You must choose food for at least 1 meal to view the shopping list, or add foods manually below."}
          </p>
        ) : (
          <>
            {foods.length > 0 && (
              <>
                <p className="shopping-section-header">Other foods</p>
                {foods.map((food) => {
                  const checked = shoppingChecked.includes(food.name);
                  const { brand, product } = parseShoppingFoodName(food.name);
                  const { display: amountDisplay, isRaw } = formatShoppingAmount(food.amount ?? "", shoppingUnit);
                  const showRawLabel = isRaw && shoppingState === "cooked";
                  const showCookedLabel = !isRaw && shoppingState === "raw";
                  return (
                    <button key={food.name} className="shopping-food-row" onClick={() => toggleChecked(food.name)}>
                      <span className={`shopping-check ${checked ? "checked" : ""}`}>
                        <Check size={18} strokeWidth={3} color={checked ? "#ffffff" : "#cccccc"} />
                      </span>
                      <span className="shopping-food-info">
                        <strong>{brand}</strong>
                        {product !== brand && <span>{product}</span>}
                        {(showRawLabel || showCookedLabel) && (
                          <span className="muted" style={{ fontSize: 12 }}>{showRawLabel ? "raw" : "cooked"}</span>
                        )}
                      </span>
                      <span className="shopping-amount muted">{amountDisplay}</span>
                    </button>
                  );
                })}
              </>
            )}
            {customShoppingFoods.length > 0 && (
              <>
                <p className="shopping-section-header">Custom foods</p>
                {customShoppingFoods.map((food) => {
                  const checkKey = `custom:${food.id}`;
                  const checked = shoppingChecked.includes(checkKey);
                  const { brand, product } = parseShoppingFoodName(food.name);
                  const { display: amountDisplay } = formatShoppingAmount(food.amount ?? "", shoppingUnit);
                  return (
                    <div key={checkKey} className="shopping-food-row">
                      <button className="shopping-toggle" onClick={() => toggleChecked(checkKey)}>
                        <span className={`shopping-check ${checked ? "checked" : ""}`}>
                          <Check size={18} strokeWidth={3} color={checked ? "#ffffff" : "#cccccc"} />
                        </span>
                        <span className="shopping-food-info">
                          <strong>{brand}</strong>
                          {product !== brand && <span>{product}</span>}
                        </span>
                        {amountDisplay && <span className="shopping-amount muted">{amountDisplay}</span>}
                      </button>
                      <button className="shopping-remove" onClick={() => removeCustomFood(food.id)} aria-label="Remove food">
                        <X size={18} color="#8b8c93" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        <div style={{ padding: 16 }}>
          {shoppingAddOpen ? (
            <div className="form-stack">
              <input
                className="text-input"
                placeholder="Food name (e.g. Eggs)"
                value={shoppingDraftName}
                autoFocus
                onChange={(event) => setShoppingDraftName(event.target.value)}
              />
              <input
                className="text-input"
                placeholder="Amount (e.g. 200 G)"
                value={shoppingDraftAmount}
                onChange={(event) => setShoppingDraftAmount(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") addCustomFood(); }}
              />
              <div className="split-row" style={{ gap: 12 }}>
                <button
                  className="ghost-button"
                  style={{ flex: 1 }}
                  onClick={() => { setShoppingAddOpen(false); setShoppingDraftName(""); setShoppingDraftAmount(""); }}
                >
                  Cancel
                </button>
                <button className="primary-button" style={{ flex: 1 }} onClick={addCustomFood} disabled={!shoppingDraftName.trim()}>
                  Add food
                </button>
              </div>
            </div>
          ) : (
            <button className="ghost-button" style={{ width: "100%" }} onClick={() => setShoppingAddOpen(true)}>
              <Plus size={20} /> Add food
            </button>
          )}
        </div>
      </main>
    );
  }

  function renderSheets() {
    if (!sheet) {
      return null;
    }

    return (
      <>
        <button className="sheet-backdrop" aria-label="Close sheet" onClick={() => setSheet(null)} />
        <section className="sheet">
          <div className="sheet-handle" />
          {sheet === "actions" && renderActionsSheet()}
          {sheet === "meal" && renderMealSheet()}
          {sheet === "copy" && renderCopySheet()}
          {sheet === "advanced" && renderAdvancedSheet()}
          {sheet === "cloud" && renderCloudSheet()}
          {sheet === "weighin" && renderWeighInSheet()}
          {sheet === "calendar" && renderCalendarSheet()}
          {sheet === "adjust" && renderAdjustMealsSheet()}
          {sheet === "foodpicker" && renderFoodPickerSheet()}
        </section>
      </>
    );
  }

  function renderAdjustMealsSheet() {
    const selectedIds = new Set(adjustReset ? currentDay.meals.map((meal) => meal.id) : adjustSelectedMealIds);
    const adjustedMeals = getAdjustedMeals();
    const projectedTotals = getAdjustedTotals(adjustedMeals);
    const projectedCalorieDelta = currentDay.calories - projectedTotals.calories;
    const projectedProteinDelta = currentDay.protein - projectedTotals.protein;

    function toggleMeal(id: string) {
      if (adjustReset) {
        setAdjustReset(false);
        setAdjustSelectedMealIds(currentDay.meals.filter((meal) => meal.id !== id).map((meal) => meal.id));
        return;
      }

      setAdjustSelectedMealIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
    }

    return (
      <>
        <div className="sheet-title-row adjust-title-row">
          <button className="icon-button flat" onClick={() => setSheet(null)}>
            Cancel
          </button>
          <div>
            <small>{formatSheetDate(selectedDate)}</small>
            <h2>Adjust meals</h2>
          </div>
          <div className="adjust-title-actions">
            <button className="icon-button flat" title="Adjust info" aria-label="Adjust info">
              <Info size={26} />
            </button>
            <button className="primary-button" onClick={saveAdjustedMeals}>
              Save
            </button>
          </div>
        </div>

        <div className="adjust-target-strip">
          <span>
            <MiniBadge kind="cal">
              <Flame size={14} />
            </MiniBadge>
            {currentDay.calories}
          </span>
          <span>
            <MiniBadge kind="protein">P</MiniBadge>
            {currentDay.protein}
          </span>
          <span>
            <MiniBadge kind="fat">F</MiniBadge>
            {currentDay.fat}
          </span>
          <span>
            <MiniBadge kind="carbs">C</MiniBadge>
            {currentDay.carbs}
          </span>
          <strong>Day targets</strong>
        </div>

        <div className="adjust-reset-card">
          <div>
            <strong>Reset to recommendations</strong>
            <p>Rebuilds your meal plan from your day targets.</p>
          </div>
          <button className={`toggle ${adjustReset ? "on" : ""}`} onClick={() => setAdjustReset(!adjustReset)} aria-pressed={adjustReset} />
        </div>

        <div className="adjust-meal-list">
          {adjustedMeals.map((meal) => {
            const selected = selectedIds.has(meal.id);
            const changed =
              meal.adjustedCalories !== meal.calories ||
              meal.adjustedProtein !== meal.protein ||
              meal.adjustedFat !== meal.fat ||
              meal.adjustedCarbs !== meal.carbs;

            return (
              <article className="adjust-meal-card" key={meal.id}>
                <div className="adjust-meal-head">
                  <div className="meal-title">
                    <Utensils size={25} />
                    <span className="meal-name">{meal.name}</span>
                    {meal.foods.length > 0 && <span className="target-pill met">1 food - Targets met</span>}
                  </div>
                  <span className="time-pill">{meal.time}</span>
                  <button
                    className={`adjust-select ${selected ? "selected" : ""}`}
                    onClick={() => toggleMeal(meal.id)}
                    title={selected ? "Include in adjustment" : "Keep current targets"}
                    aria-label={selected ? `Adjust ${meal.name}` : `Keep ${meal.name}`}
                  >
                    {selected && <CheckCircle2 size={26} />}
                  </button>
                </div>
                <MacroLine meal={meal} label={meal.foods.length > 0 ? "Foods" : "Targets"} muted={selected && changed} />
                {(selected || changed) && (
                  <MacroLine
                    meal={{
                      ...meal,
                      calories: meal.adjustedCalories,
                      protein: meal.adjustedProtein,
                      fat: meal.adjustedFat,
                      carbs: meal.adjustedCarbs,
                    }}
                    label="New"
                  />
                )}
              </article>
            );
          })}
        </div>

        <div className="adjust-projection">
          <h3>
            <CalendarDays size={26} /> Your day is projected to be:
          </h3>
          <div>
            <span>
              <MacroBadge kind="cal">
                <Flame size={16} />
              </MacroBadge>
              Calories
            </span>
            <strong>{underText(projectedCalorieDelta)} {"->"} <em>on track</em></strong>
          </div>
          <div>
            <span>
              <MacroBadge kind="protein">P</MacroBadge>
              Protein
            </span>
            <strong>{underText(projectedProteinDelta, "g")} {"->"} <em>on track</em></strong>
          </div>
        </div>
      </>
    );
  }

  function renderCalendarSheet() {
    const base = parseDateKey(calendarMonth);
    const year = base.getFullYear();
    const monthIndex = base.getMonth();
    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(base);
    const startOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let index = 0; index < startOffset; index += 1) {
      cells.push(null);
    }
    for (let date = 1; date <= daysInMonth; date += 1) {
      cells.push(dateKey(new Date(year, monthIndex, date)));
    }

    function shiftMonth(amount: number) {
      setCalendarMonth(dateKey(new Date(year, monthIndex + amount, 1)));
    }

    function pickDate(value: string) {
      chooseDate(value);
      setActiveTab("schedule");
      setSheet(null);
    }

    return (
      <>
        <div className="sheet-title-row">
          <button
            className="icon-button flat"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            title="Previous month"
          >
            <ArrowLeft size={24} />
          </button>
          <h2>{monthLabel}</h2>
          <button
            className="icon-button flat"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="calendar-weekdays">
          {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((value, index) => {
            if (!value) {
              return <span className="calendar-cell empty" key={`pad-${index}`} />;
            }

            const day = days[value];
            const hasData = Boolean(day && (getLoggedTotals(day).calories > 0 || day.weighIn.weight));

            return (
              <button
                key={value}
                className={`calendar-cell ${sameDay(value, selectedDate) ? "active" : ""} ${
                  sameDay(value, today) ? "today" : ""
                }`}
                onClick={() => pickDate(value)}
                title={formatHeaderTitle(value)}
              >
                <span className="calendar-day-num">{parseDateKey(value).getDate()}</span>
                {hasData && <span className="calendar-data-dot" />}
              </button>
            );
          })}
        </div>

        <button
          className="ghost-button"
          style={{ marginTop: 18, width: "100%" }}
          onClick={() => pickDate(today)}
        >
          <CalendarDays size={22} /> Jump to today
        </button>
      </>
    );
  }

  function renderActionsSheet() {
    return (
      <div className="action-list">
        <ActionRow icon={Utensils} label="Add meal" onClick={openNewMeal} />
        <ActionRow
          icon={Dumbbell}
          label="Add workout"
          onClick={() => {
            setWorkoutDraft(newWorkout());
            setSheet(null);
            setFullScreen("workout");
          }}
        />
        <ActionRow
          icon={Clock}
          label="Add busy period"
          onClick={() => {
            setBusyDraft(newBusyBlock());
            setSheet(null);
            setFullScreen("busy");
          }}
        />
        <ActionRow icon={Copy} label="Copy day" onClick={openCopyDay} />
        <ActionRow
          icon={Pencil}
          label="Edit schedule"
          onClick={() => {
            setSheet(null);
            setFullScreen("edit");
          }}
        />
      </div>
    );
  }

  function renderFoodPickerSheet() {
    const draft = foodDraft ?? newFoodDraft();

    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet("meal")}>
            Back
          </button>
          <h2>Add food</h2>
          <button className="primary-button" onClick={addManualFoodToMealDraft}>
            Add
          </button>
        </div>

        {profile.meals.length > 0 && (
          <>
            <h2 className="section-title">Your saved meals</h2>
            <div className="schedule-list">
              {profile.meals.map((template) => {
                const totals = sumFoods(template.foods);

                return (
                  <button
                    className="card"
                    key={template.id}
                    onClick={() => addMealTemplateToDraft(template)}
                    style={{ padding: 16, textAlign: "left" }}
                  >
                    <div className="split-row" style={{ justifyContent: "space-between" }}>
                      <strong>{template.name}</strong>
                      <span className="time-pill">{foodCountText(template.foods.length)}</span>
                    </div>
                    <div className="meal-macros" style={{ margin: "14px -16px -16px" }}>
                      <span>{totals.calories} cal</span>
                      <span>{totals.protein} P</span>
                      <span>{totals.fat} F</span>
                      <span>{totals.carbs} C</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {profile.foods.length > 0 && (
          <>
            <h2 className="section-title">Your saved foods</h2>
            <div className="schedule-list">
              {profile.foods.map((food) => (
                <button
                  className="card"
                  key={food.id}
                  onClick={() => addFoodToMealDraft(food)}
                  style={{ padding: 16, textAlign: "left" }}
                >
                  <div className="split-row" style={{ justifyContent: "space-between" }}>
                    <strong>{food.name}</strong>
                    {food.amount && <span className="time-pill">{food.amount}</span>}
                  </div>
                  <div className="meal-macros" style={{ margin: "14px -16px -16px" }}>
                    <span>{food.calories} cal</span>
                    <span>{food.protein} P</span>
                    <span>{food.fat} F</span>
                    <span>{food.carbs} C</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className="section-title">{profile.foods.length > 0 ? "Or enter one" : "Enter a food"}</h2>
        <div className="form-stack">
          <input
            className="text-input"
            placeholder="Food name"
            aria-label="Food name"
            value={draft.name}
            onChange={(event) => updateFoodDraft({ name: event.target.value })}
          />
          <input
            className="text-input"
            placeholder="Amount, for example 250 G"
            aria-label="Food amount"
            value={draft.amount}
            onChange={(event) => updateFoodDraft({ amount: event.target.value })}
          />
          <div className="number-grid">
            <NutrientInput
              kind="cal"
              icon={<Flame size={16} />}
              label="Calories (kcal)"
              value={draft.calories}
              step={25}
              onChange={(calories) => updateFoodDraft({ calories })}
            />
            <NutrientInput
              kind="protein"
              icon="P"
              label="Protein (g)"
              value={draft.protein}
              onChange={(protein) => updateFoodDraft({ protein })}
            />
            <NutrientInput
              kind="fat"
              icon="F"
              label="Fat (g)"
              value={draft.fat}
              onChange={(fat) => updateFoodDraft({ fat })}
            />
            <NutrientInput
              kind="carbs"
              icon="C"
              label="Carbs (g)"
              value={draft.carbs}
              onChange={(carbs) => updateFoodDraft({ carbs })}
            />
          </div>
          {foodError && <p className="form-error">{foodError}</p>}
        </div>
      </>
    );
  }

  function renderMealDraftFoods() {
    const totals = sumFoods(mealDraft.foods);

    return (
      <>
        <h2 className="section-title">Foods</h2>
        <div className="schedule-list">
          {mealDraft.foods.map((food) => (
            <article className="card" key={food.id}>
              <div className="meal-card-head">
                <div className="meal-title">
                  <span className="meal-name">{food.name}</span>
                  {food.amount && <small className="muted">{food.amount}</small>}
                </div>
                <button
                  className="icon-button flat"
                  onClick={() => removeFoodFromMealDraft(food.id)}
                  title={`Remove ${food.name}`}
                >
                  <X size={22} />
                </button>
              </div>
              <div className="meal-macros">
                <div className="macro-value">
                  <MacroBadge kind="cal">
                    <Flame size={16} />
                  </MacroBadge>
                  <strong>{food.calories}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="protein">P</MacroBadge>
                  <strong>{food.protein}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="fat">F</MacroBadge>
                  <strong>{food.fat}</strong>
                </div>
                <div className="macro-value">
                  <MacroBadge kind="carbs">C</MacroBadge>
                  <strong>{food.carbs}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="step-row header-row" style={{ marginTop: 12 }}>
          <strong>Meal total</strong>
          <span className="header-row" style={{ gap: 10 }}>
            <MiniBadge kind="cal">
              <Flame size={16} />
            </MiniBadge>
            <strong className="mono">{totals.calories}</strong>
            <MiniBadge kind="protein">P</MiniBadge>
            <strong className="mono">{totals.protein}</strong>
            <MiniBadge kind="fat">F</MiniBadge>
            <strong className="mono">{totals.fat}</strong>
            <MiniBadge kind="carbs">C</MiniBadge>
            <strong className="mono">{totals.carbs}</strong>
          </span>
        </div>
      </>
    );
  }

  function renderMealSheet() {
    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet(null)}>
            Cancel
          </button>
          <h2>{mealDraft.id ? "Edit meal" : "Add meal"}</h2>
          <button className="primary-button" onClick={saveMeal}>
            Save
          </button>
        </div>

        <FormText
          label="Meal time"
          value={mealDraft.time}
          onChange={(time) => setMealDraft((current) => ({ ...current, time }))}
        />

        {mealDraft.foods.length === 0 ? (
          <>
            <h2 className="section-title">Planned targets</h2>
            <div className="number-grid">
              <NutrientInput
                kind="cal"
                icon={<Flame size={24} />}
                label="Calories (kcal)"
                value={mealDraft.calories}
                onChange={(calories) => setMealDraft((current) => ({ ...current, calories }))}
                step={25}
              />
              <NutrientInput
                kind="protein"
                icon="P"
                label="Protein (g)"
                value={mealDraft.protein}
                onChange={(protein) => setMealDraft((current) => ({ ...current, protein }))}
              />
              <NutrientInput
                kind="fat"
                icon="F"
                label="Fat (g)"
                value={mealDraft.fat}
                onChange={(fat) => setMealDraft((current) => ({ ...current, fat }))}
              />
              <NutrientInput
                kind="carbs"
                icon="C"
                label="Carbs (g)"
                value={mealDraft.carbs}
                onChange={(carbs) => setMealDraft((current) => ({ ...current, carbs }))}
              />
            </div>
          </>
        ) : (
          renderMealDraftFoods()
        )}

        <div className="form-stack" style={{ marginTop: 18 }}>
          <button className="ghost-button" style={{ width: "100%" }} onClick={openFoodPicker}>
            <Plus size={22} /> Add food
          </button>
          {mealDraft.foods.length > 0 && (
            <button className="ghost-button" style={{ width: "100%" }} onClick={saveMealDraftAsTemplate}>
              <Utensils size={22} /> Save as a meal I eat often
            </button>
          )}
        </div>

        <div className="split-row" style={{ gap: 12, marginTop: 24 }}>
          <button className="ghost-button" style={{ flex: 1 }} onClick={() => setMealDraft(newMealDraft(currentDay.meals.length + 1))}>
            <RotateCcw size={22} /> Reset
          </button>
          <button
            className="ghost-button"
            style={{ flex: 1 }}
            onClick={() => setMealDraft((current) => ({ ...current, locked: !current.locked }))}
          >
            {mealDraft.locked ? <LockKeyhole size={22} /> : <UnlockKeyhole size={22} />}
            {mealDraft.locked ? "Locked" : "Unlocked"}
          </button>
        </div>

        {mealDraft.id && (
          <button className="danger-button" style={{ marginTop: 12, width: "100%" }} onClick={() => deleteMeal(mealDraft.id)}>
            Delete meal
          </button>
        )}
      </>
    );
  }

  function renderCopySheet() {
    const candidates = Array.from({ length: 10 }, (_, index) => addDays(selectedDate, index - 2)).filter(
      (value) => value !== selectedDate,
    );

    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet(null)}>
            Cancel
          </button>
          <h2>Copy day</h2>
          <button className="primary-button" onClick={applyCopyDay} disabled={copyTargets.length === 0}>
            Copy
          </button>
        </div>

        <div className="notice">
          <Info size={24} color="#2c95b8" />
          <p>Copying replaces the selected destination days.</p>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="split-row" style={{ justifyContent: "space-between" }}>
            <strong>Target average daily calories</strong>
            <strong className="mono">{currentDay.calories}</strong>
          </div>
        </div>

        <div className="split-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="muted">Copy {formatShortDate(selectedDate)} to</span>
          <button className="icon-button flat" onClick={() => setCopyTargets(candidates)}>
            Select all
          </button>
        </div>
        <div className="copy-dates">
          {candidates.map((value) => (
            <button
              className={copyTargets.includes(value) ? "selected" : ""}
              key={value}
              onClick={() => toggleCopyTarget(value)}
            >
              {parseDateKey(value).getDate()}
            </button>
          ))}
        </div>

        <button className="card split-row" style={{ justifyContent: "space-between", marginTop: 16, padding: 16, width: "100%" }} onClick={() => setSheet("advanced")}>
          <span>Advanced options</span>
          <ChevronRight />
        </button>
      </>
    );
  }

  function renderAdvancedSheet() {
    const options: Array<[keyof CopyOptions, string, string?]> = [
      ["activity", "Copy activity level"],
      ["mealCount", "Copy meal names"],
      ["meals", "Copy meals", "Includes meal times and lock state."],
      ["mealTargets", "Copy meal macro targets"],
      ["mealFoods", "Copy meal foods"],
      ["lockedMeals", "Copy fully-locked meals"],
      ["workouts", "Copy workouts"],
      ["busy", "Copy busy periods"],
    ];

    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet("copy")}>
            <ArrowLeft size={28} />
          </button>
          <h2>Advanced options</h2>
          <button
            className="icon-button flat"
            onClick={() =>
              setCopyOptions((current) => {
                const allOn = Object.values(current).every(Boolean);
                return Object.fromEntries(
                  Object.keys(current).map((key) => [key, !allOn]),
                ) as CopyOptions;
              })
            }
          >
            {Object.values(copyOptions).every(Boolean) ? "Deselect all" : "Select all"}
          </button>
        </div>

        {options.map(([key, label, detail]) => (
          <button
            className="option-row"
            key={key}
            onClick={() => setCopyOptions((current) => ({ ...current, [key]: !current[key] }))}
            style={{ width: "100%", textAlign: "left" }}
          >
            <span>
              <strong>{label}</strong>
              {detail && <small className="muted" style={{ display: "block", marginTop: 6 }}>{detail}</small>}
            </span>
            {copyOptions[key] && <CheckCircle2 color="var(--ok)" size={30} />}
          </button>
        ))}
      </>
    );
  }

  function renderCloudSheet() {
    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet(null)}>
            Close
          </button>
          <h2>Cloud Sync</h2>
          <button className="primary-button" onClick={copySyncKey}>
            Copy
          </button>
        </div>

        <div className="status-card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="split-row" style={{ justifyContent: "space-between" }}>
            <strong>{syncStatus}</strong>
            <RefreshCw size={24} color="#cf2038" />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {lastSync ? `Last sync ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Sync starts after your first save."}
          </p>
        </div>

        <label className="muted">Your cloud backup key</label>
        <div className="sync-key">{syncKey}</div>

        <div className="form-stack" style={{ marginTop: 18 }}>
          <input
            className="text-input"
            placeholder="Restore with another sync key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
          />
          <button className="primary-button" onClick={restoreCloudKey}>
            Restore backup
          </button>
        </div>

        <h3 style={{ marginTop: 28, marginBottom: 4 }}>Your coach</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Enter the code your coach gave you and they can see your logged meals, macros and
          weigh-ins. They never get your sync key, and you can stop sharing at any time.
        </p>

        {coachShares.filter((share) => share.status === "active").length > 0 ? (
          <div className="form-stack" style={{ marginTop: 12 }}>
            {coachShares
              .filter((share) => share.status === "active")
              .map((share) => (
                <div
                  key={share.id}
                  className="status-card"
                  style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>Sharing with your coach</strong>
                    <p className="muted" style={{ marginBottom: 0 }}>
                      Read-only
                      {share.acceptedAt
                        ? ` · since ${new Date(share.acceptedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <button className="icon-button flat" onClick={() => revokeCoachShare(share.id)}>
                    Stop sharing
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div className="form-stack" style={{ marginTop: 12 }}>
            <input
              className="text-input"
              placeholder="Coach invite code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={9}
              value={coachCode}
              onChange={(event) => setCoachCode(event.target.value)}
            />
            <button className="primary-button" onClick={acceptCoachInvite}>
              Link my coach
            </button>
          </div>
        )}

        {coachStatus ? (
          <p className="muted" style={{ marginTop: 10 }}>
            {coachStatus}
          </p>
        ) : null}
      </>
    );
  }

  function renderWeighInSheet() {
    return (
      <>
        <div className="sheet-title-row">
          <button className="icon-button flat" onClick={() => setSheet(null)}>
            Cancel
          </button>
          <h2>Weigh-in</h2>
          <button className="primary-button" onClick={saveWeighIn}>
            Save
          </button>
        </div>
        <FormText label="Time" value={currentDay.weighIn.time} onChange={(time) => updateDay(selectedDate, (day) => ({ ...day, weighIn: { ...day.weighIn, time } }))} />
        <div className="form-row">
          <label>Weight</label>
          <input
            className="number-input"
            inputMode="decimal"
            value={weighDraft}
            aria-invalid={weighError ? true : undefined}
            onChange={(event) => {
              setWeighDraft(event.target.value);
              setWeighError("");
            }}
            placeholder="lbs"
          />
        </div>
        {weighError && <p className="form-error">{weighError}</p>}
      </>
    );
  }

  function renderDock() {
    if (activeTab !== "schedule" && fullScreen !== "edit") {
      return null;
    }

    const dayPlanOnTrack = calorieDelta === 0 && proteinDelta === 0;

    return (
      <div className="dock">
        <div className="summary-stat" style={{ position: "relative" }}>
          {dayPlanOnTrack ? (
            <CalendarCheck color="#35246c" size={30} />
          ) : (
            <>
              <CalendarX color="#cc1f35" size={30} />
              <span className="nav-dot" />
            </>
          )}
        </div>
        <div className="summary-stat">
          <MacroBadge kind="cal">
            <Flame size={16} />
          </MacroBadge>
          <span>{underText(calorieDelta)}</span>
        </div>
        <div className="summary-stat">
          <MacroBadge kind="protein">P</MacroBadge>
          <span>{underText(proteinDelta, "g")}</span>
        </div>
        <button className="icon-button" onClick={openAdjustMeals} title="Adjust meals">
          <WandSparkles size={28} />
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="phone-frame">{renderBody()}</div>
      {renderDock()}
      {!fullScreen && (
        <nav className="tabbar" aria-label="Primary">
          <button className={activeTab === "schedule" ? "active" : ""} onClick={() => setActiveTab("schedule")}>
            <span className="nav-dot" />
            <IconLabel icon={CalendarDays} label="Schedule" active={activeTab === "schedule"} />
          </button>
          <button className={activeTab === "progress" ? "active" : ""} onClick={() => setActiveTab("progress")}>
            <IconLabel icon={LineChart} label="Progress" active={activeTab === "progress"} />
          </button>
          <button className={activeTab === "explore" ? "active" : ""} onClick={() => setActiveTab("explore")}>
            <IconLabel icon={Map} label="Explore" active={activeTab === "explore"} />
          </button>
          <button className={activeTab === "more" ? "active" : ""} onClick={() => setActiveTab("more")}>
            <IconLabel icon={MoreHorizontal} label="More" active={activeTab === "more"} />
          </button>
        </nav>
      )}
      {renderWeekMenu()}
      {renderSheets()}
    </div>
  );
}

function newMealDraft(index = 1): MealDraft {
  return {
    id: null,
    name: `Meal ${index}`,
    time: "7:45 PM",
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    locked: false,
    foods: [],
  };
}

function newWorkout(): Workout {
  return {
    id: makeId("workout"),
    type: "weight training",
    startTime: "12:00 PM",
    duration: "1h",
    intensity: "light",
    shake: false,
    optimize: false,
    updateTargets: true,
  };
}

function newBusyBlock(): BusyBlock {
  return {
    id: makeId("busy"),
    startTime: "12:00 PM",
    endTime: "1:00 PM",
    optimize: false,
  };
}

function FormText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <input className="text-input mono" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function FormDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `form-date-${label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <div className="form-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="text-input mono"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <select className="select-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <button className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value} />
    </div>
  );
}

function NutrientInput({
  kind,
  icon,
  label,
  value,
  step = 5,
  onChange,
}: {
  kind: "cal" | "protein" | "fat" | "carbs";
  icon: React.ReactNode;
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="nutrient-row">
      <MacroBadge kind={kind}>{icon}</MacroBadge>
      <label className="text-input" style={{ display: "grid" }}>
        <span className="muted">{label}</span>
        <input
          style={{ background: "transparent", border: 0, outline: 0, width: "100%" }}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
      </label>
      <div className="stepper">
        <button onClick={() => onChange(clamp(value - step))} title={`Decrease ${label}`}>
          <Minus />
        </button>
        <button onClick={() => onChange(clamp(value + step))} title={`Increase ${label}`}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}>
      <Icon size={28} />
      <span>{label}</span>
      <ChevronRight />
    </button>
  );
}

function MacroLine({
  meal,
  label,
  muted,
}: {
  meal: Pick<Meal, "calories" | "protein" | "fat" | "carbs">;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className={`adjust-macro-line ${muted ? "muted-line" : ""}`}>
      <span>
        <MacroBadge kind="cal">
          <Flame size={16} />
        </MacroBadge>
        {meal.calories}
      </span>
      <span>
        <MacroBadge kind="protein">P</MacroBadge>
        {meal.protein}
      </span>
      <span>
        <MacroBadge kind="fat">F</MacroBadge>
        {meal.fat}
      </span>
      <span>
        <MacroBadge kind="carbs">C</MacroBadge>
        {meal.carbs}
      </span>
      <strong>{label}</strong>
    </div>
  );
}

function EditableTarget({
  kind,
  value,
  children,
  onChange,
}: {
  kind: "cal" | "protein" | "fat" | "carbs";
  value: number;
  children: React.ReactNode;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <MiniBadge kind={kind}>{children}</MiniBadge>
      <input
        className="mono"
        inputMode="numeric"
        style={{ background: "transparent", border: 0, outline: 0, width: 54 }}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
    </div>
  );
}
