import {Timestamp} from 'firebase/firestore';
import {Kitchen} from './kitchen';
import {millis} from '../time';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: Timestamp;
}

export interface Message {
  id: string;
  kitchenId?: string;
  text: string;
  from: 'kitchen' | 'maker';
  createdAt: Timestamp;
  seenByMaker: boolean;
  seenByKitchen: boolean;
}

export interface Thread {
  kitchenId: string;
  kitchenName: string;
  messages: Message[];
  unread: number;
  lastAt: number;
}

export function newestFirst(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

// Messages from every kitchen grouped into one thread per kitchen, newest activity first.
export function toThreads(kitchens: Kitchen[], messages: Message[]): Thread[] {
  const names = new Map(kitchens.map(k => [k.id, k.name]));
  const byKitchen = new Map<string, Message[]>();
  for (const m of messages) {
    if (m.kitchenId) {
      byKitchen.set(m.kitchenId, [...(byKitchen.get(m.kitchenId) ?? []), m]);
    }
  }
  return [...byKitchen.entries()].map(([kitchenId, list]) => {
    list.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
    return {
      kitchenId, kitchenName: names.get(kitchenId) || kitchenId, messages: list,
      unread: list.filter(m => !m.seenByMaker).length, lastAt: millis(list[list.length - 1].createdAt),
    };
  }).sort((a, b) => b.lastAt - a.lastAt);
}
