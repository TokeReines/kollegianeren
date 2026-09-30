import {Timestamp} from 'firebase/firestore';
import {millis} from '../time';

export const MEAL_TAGS = ['meat', 'pork', 'fish', 'vegetarian', 'vegan', 'dairy', 'gluten', 'nuts'] as const;
export type MealTag = typeof MEAL_TAGS[number];

// How many hours before the meal the sign-up closes; 0 is when we eat.
export const CLOSE_HOURS = [48, 24, 12, 0] as const;

// A food club dinner (kitchens/{kid}/meals): one resident cooks, the others sign up. The sign-ups
// live in the document, so the whole list costs one read per meal.
export interface Meal {
  id: string;
  // When we eat.
  date: Timestamp;
  cookId: string;
  menu: string;
  notes: string;
  tags: MealTag[];
  closesAt: Timestamp;
  // No sign-up button: people ask the cook, who adds them.
  askCook: boolean;
  // Resident ids, the cook included.
  signups: string[];
  createdAt: Timestamp;
}

export type MealFields = Pick<Meal, 'date' | 'cookId' | 'menu' | 'notes' | 'tags' | 'closesAt' | 'askCook'>;

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

export function newMeal(day: Date, cookId: string): MealFields {
  const date = atTime(day, DEFAULT_TIME);
  return {
    date: Timestamp.fromDate(date), closesAt: Timestamp.fromMillis(date.getTime() - DEFAULT_CLOSE_HOURS * 3.6e6),
    cookId, menu: '', notes: '', tags: [], askCook: false,
  };
}

export interface FoodDay {
  day: Date;
  meals: Meal[];
}

// Monday of the week `weeks` after the one `today` is in.
export function weekStart(today: Date, weeks = 0): Date {
  const back = (today.getDay() + 6) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - back + 7 * weeks);
}

// The days of the week starting `monday`, free or not, from `today` on.
export function weekDays(meals: Meal[], monday: Date, today: Date): FoodDay[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days: FoodDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    if (day.getTime() >= start) {
      days.push({day, meals: meals.filter(m => m.date.toDate().toDateString() === day.toDateString())
        .sort((a, b) => millis(a.date) - millis(b.date))});
    }
  }
  return days;
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
