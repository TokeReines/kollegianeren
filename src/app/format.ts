// Amounts in kroner the Danish way, "1.234,5 kr.".
export function kr(amount: number, minDecimals = 0, maxDecimals = 2): string {
  return new Intl.NumberFormat('da-DK', {minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals}).format(amount) + ' kr.';
}

// A typed amount in kroner: "40,5", "40.50" or "40" (tablet keyboards give a comma or a point).
// Null when it is not one, so nothing is saved that was not meant: a browser's number field turns
// "40,5" into 405 without a word, which is why amounts are typed in plain text fields.
export const AMOUNT_PATTERN = '\\s*\\d+([.,]\\d{1,2})?\\s*';
export function parseKr(text: string | null | undefined): number | null {
  const s = (text ?? '').trim();
  return new RegExp(`^${AMOUNT_PATTERN}$`).test(s) ? Number(s.replace(',', '.')) : null;
}

// An amount as it is typed back into a field: "6,5", or empty.
export function krInput(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? '' : String(amount).replace('.', ',');
}
