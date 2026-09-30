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

// "18:30" on the chosen day, as a Date.
export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}
