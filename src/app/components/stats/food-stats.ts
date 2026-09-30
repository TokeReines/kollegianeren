import {Meal, MealTag} from '../../interfaces/meal';

export interface FoodDayRow { date: Date; meals: number; eaters: number; }
export interface WeekdayRow { weekday: number; meals: number; eaters: number; }
export interface TagRow { tag: MealTag; meals: number; }
export interface PersonRow { ate: number; cooked: number; }

export interface FoodStats {
  totals: {meals: number, eaters: number, perMeal: number, cooks: number, dayShare: number};
  // One row per day of the period, days without food club included.
  daily: FoodDayRow[];
  // Monday first.
  weekdays: WeekdayRow[];
  // Most used first; tags never used are left out.
  tags: TagRow[];
  // Per resident id, looked up one at a time on the page (never listed as a ranking).
  people: Record<string, PersonRow>;
}

// Food club over the `days` days from `from`, counting meals that have been eaten (before `now`).
// Like the beer statistics, nobody is ranked: not even who cooks the most. One resident's own
// count can be looked up.
export function computeFoodStats(meals: Pick<Meal, 'date' | 'cooks' | 'signups' | 'tags'>[], from: Date, days: number, now = Date.now()): FoodStats {
  const byDay = new Map<string, FoodDayRow>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    byDay.set(d.toDateString(), {date: d, meals: 0, eaters: 0});
  }
  const weekdays: WeekdayRow[] = Array.from({length: 7}, (_, weekday) => ({weekday, meals: 0, eaters: 0}));
  const tags = new Map<MealTag, number>();
  const cooks = new Set<string>();
  const people: Record<string, PersonRow> = {};
  const person = (id: string) => people[id] ??= {ate: 0, cooked: 0};
  let count = 0, eaters = 0;
  for (const m of meals) {
    const t = m.date?.toDate?.();
    const day = t && byDay.get(t.toDateString());
    if (!t || !day || t.getTime() >= now) {
      continue;
    }
    const n = m.signups.length;
    count++;
    eaters += n;
    day.meals++;
    day.eaters += n;
    const wd = weekdays[(t.getDay() + 6) % 7];
    wd.meals++;
    wd.eaters += n;
    m.cooks.forEach(c => {
      cooks.add(c);
      person(c).cooked++;
    });
    m.signups.forEach(id => person(id).ate++);
    m.tags.forEach(tag => tags.set(tag, (tags.get(tag) ?? 0) + 1));
  }
  const daily = [...byDay.values()];
  return {
    totals: {meals: count, eaters, perMeal: count ? eaters / count : 0, cooks: cooks.size, dayShare: days ? daily.filter(d => d.meals).length / days : 0},
    daily,
    weekdays,
    tags: [...tags.entries()].map(([tag, n]) => ({tag, meals: n})).sort((a, b) => b.meals - a.meals),
    people,
  };
}
