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
  // Pictures (Cloudinary public ids), e.g. a screenshot of what goes wrong.
  images?: string[];
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

// One thread per kitchen, every kitchen with a name included so the maker can write first: newest
// activity first, then the ones with no messages by name.
export function toThreads(kitchens: Kitchen[], messages: Message[]): Thread[] {
  const names = new Map(kitchens.filter(k => typeof k.name === 'string' && k.name !== '').map(k => [k.id, k.name]));
  const byKitchen = new Map<string, Message[]>([...names.keys()].map(id => [id, []]));
  for (const m of messages) {
    if (m.kitchenId) {
      byKitchen.set(m.kitchenId, [...(byKitchen.get(m.kitchenId) ?? []), m]);
    }
  }
  return [...byKitchen.entries()].map(([kitchenId, list]) => {
    list.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
    return {
      kitchenId, kitchenName: names.get(kitchenId) || kitchenId, messages: list,
      unread: list.filter(m => !m.seenByMaker).length, lastAt: list.length ? millis(list[list.length - 1].createdAt) : 0,
    };
  }).sort((a, b) => b.lastAt - a.lastAt || a.kitchenName.localeCompare(b.kitchenName, 'da', {numeric: true}));
}
