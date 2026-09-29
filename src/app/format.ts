// Amounts in kroner the Danish way, "1.234,5 kr.".
export function kr(amount: number, minDecimals = 0, maxDecimals = 2): string {
  return new Intl.NumberFormat('da-DK', {minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals}).format(amount) + ' kr.';
}
