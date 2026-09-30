import {Timestamp} from 'firebase/firestore';
import {millis} from '../time';

export const MEAL_TAGS = ['meat', 'pork', 'fish', 'vegetarian', 'vegan', 'glutenFree', 'lactoseFree', 'nuts'] as const;
export type MealTag = typeof MEAL_TAGS[number];

// How many hours before the meal the sign-up closes; 0 is when we eat.
export const CLOSE_HOURS = [48, 24, 12, 0] as const;

// A food club dinner (kitchens/{kid}/meals): one or more residents cook, the others sign up. The sign-ups
// live in the document, so the whole list costs one read per meal.
export interface Meal {
  // The day, "2026-10-01", also in `day`: one meal a day.
  id: string;
  day: string;
  // When we eat.
  date: Timestamp;
  // One or more residents; the first booked the day.
  cooks: string[];
  menu: string;
  notes: string;
  tags: MealTag[];
  closesAt: Timestamp;
  // No sign-up button: people ask a cook, who adds them.
  askCook: boolean;
  // Resident ids, the cooks included.
  signups: string[];
  createdAt: Timestamp;
}

export type MealFields = Pick<Meal, 'date' | 'cooks' | 'menu' | 'notes' | 'tags' | 'closesAt' | 'askCook'>;

// A meal's document id: its local day.
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function signupOpen(meal: Pick<Meal, 'askCook' | 'closesAt'>, now = Date.now()): boolean {
  return !meal.askCook && now < millis(meal.closesAt);
}

// The closing time a meal was made with, as the nearest choice in CLOSE_HOURS.
export function closeHours(meal: Pick<Meal, 'date' | 'closesAt'>): number {
  const hours = (millis(meal.date) - millis(meal.closesAt)) / 3.6e6;
  return CLOSE_HOURS.reduce((best, h) => Math.abs(h - hours) < Math.abs(best - hours) ? h : best, 24);
}

// A day is booked with only the cook, as on the paper list; the rest is filled in later.
export const DEFAULT_TIME = '18:30';
export const DEFAULT_CLOSE_HOURS = 24;

// The closing time for a dinner at `date`: `wanted` hours before if that is still ahead, or else
// the longest shorter choice that is, so a dinner booked the same day is not closed from the start.
// A dinner already eaten (history) keeps what was asked for.
export function closeHoursFor(date: Date, wanted: number, now = Date.now()): number {
  if (date.getTime() <= now) {
    return wanted;
  }
  return CLOSE_HOURS.find(h => h <= wanted && date.getTime() - h * 3.6e6 > now) ?? 0;
}

export function newMeal(day: Date, cookId: string, now = Date.now()): MealFields {
  const date = atTime(day, DEFAULT_TIME);
  const hours = closeHoursFor(date, DEFAULT_CLOSE_HOURS, now);
  return {
    date: Timestamp.fromDate(date), closesAt: Timestamp.fromMillis(date.getTime() - hours * 3.6e6),
    cooks: [cookId], menu: '', notes: '', tags: [], askCook: false,
  };
}

export interface FoodDay {
  day: Date;
  meals: Meal[];
  // Before today: history, nothing to book.
  past: boolean;
}

// How far the week pages go: a year back (as long as backups keep purchases), half a year ahead.
export const WEEKS_BACK = 52;
export const WEEKS_AHEAD = 26;

// Monday of the week `weeks` after the one `today` is in.
export function weekStart(today: Date, weeks = 0): Date {
  const back = (today.getDay() + 6) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - back + 7 * weeks);
}

// The seven days of the week starting `monday`, free or not; days before `today` are past.
export function weekDays(meals: Meal[], monday: Date, today: Date): FoodDay[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Array.from({length: 7}, (_, i) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return {
      day, past: day.getTime() < start,
      meals: meals.filter(m => m.date.toDate().toDateString() === day.toDateString()).sort((a, b) => millis(a.date) - millis(b.date)),
    };
  });
}

// ISO week number, as on Danish calendars ("uge 41").
export function isoWeek(day: Date): number {
  const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

// "18:30" on the chosen day, as a Date.
export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}
