import {Signal, computed, effect, signal, untracked} from '@angular/core';
import {Row} from '../../interfaces/kollegiet';

export interface Bump {
  kitchenId: string;
  n: number;
  at: number;
}

// What moved since the last look at a scoreboard: who went up and by how much, and whether the
// lead changed hands. Shared by the scoreboard screen and the buy page ticker.
export function liveBoard(rows: Signal<Row[]>, key: Signal<string>) {
  const bumps = signal<Bump[]>([]);
  const leadChange = signal<string | null>(null);
  let last = new Map<string, number>();
  let lastKey = '';
  let leader: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    const now = rows();
    const k = key();
    untracked(() => {
      // A different battle, or still loading (key ''): start over without popping everything.
      if (!k || k !== lastKey) {
        lastKey = k;
        last = new Map(now.map(r => [r.kitchenId, r.score]));
        leader = now[0]?.score ? now[0].kitchenId : null;
        return;
      }
      const fresh = now.filter(r => r.score > (last.get(r.kitchenId) ?? 0))
        .map(r => ({kitchenId: r.kitchenId, n: r.score - (last.get(r.kitchenId) ?? 0), at: Date.now()}));
      if (fresh.length) {
        bumps.update(b => [...b, ...fresh].slice(-6));
        setTimeout(() => bumps.update(b => b.filter(x => Date.now() - x.at < 4000)), 4200);
      }
      const top = now[0]?.score ? now[0].kitchenId : null;
      if (top && leader && top !== leader && now[0].rank === 1 && (now[1]?.score ?? -1) < now[0].score) {
        leadChange.set(top);
        clearTimeout(timer);
        timer = setTimeout(() => leadChange.set(null), 5000);
      }
      if (top && (now[1]?.score ?? -1) < now[0].score) {
        leader = top;
      }
      last = new Map(now.map(r => [r.kitchenId, r.score]));
    });
  });

  const bumped = computed(() => new Set(bumps().map(b => b.kitchenId)));
  return {bumps, bumped, leadChange};
}
