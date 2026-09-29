export interface Kitchen {
  id: string;
  name: string;
}

// "Gl4", "Gamle 4" and "gamle4" are the same kitchen.
export function kitchenKey(name: string): string {
  return String(name).toLowerCase().replace(/[\s.]/g, '').replace(/^gamle/, 'gl').replace(/^(mellemste|ml)/, 'm');
}
