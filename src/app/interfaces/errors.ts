// Firebase Auth errors as i18n keys, so nobody sees "Firebase: Error (auth/…)".
const KEYS: Record<string, string> = {
  'auth/email-already-in-use': 'AUTH_EMAIL_IN_USE',
  'auth/invalid-email': 'AUTH_INVALID_EMAIL',
  'auth/weak-password': 'AUTH_WEAK_PASSWORD',
  'auth/network-request-failed': 'AUTH_NETWORK',
  'auth/too-many-requests': 'AUTH_TOO_MANY',
};

export function authErrorKey(e: unknown): string {
  return KEYS[errorCode(e)] ?? 'AUTH_FAILED';
}

function errorCode(e: unknown): string {
  const code = (e as {code?: unknown} | null)?.code;
  return typeof code === 'string' ? code : '';
}

// Firestore errors ("PERMISSION_DENIED: evaluation error at L677…") as i18n keys for a snackbar.
const FIRESTORE_KEYS: Record<string, string> = {
  'permission-denied': 'ERROR_NOT_ALLOWED',
  'unavailable': 'ERROR_OFFLINE',
  'deadline-exceeded': 'ERROR_OFFLINE',
  'resource-exhausted': 'ERROR_QUOTA',
  'not-found': 'ERROR_GONE',
};

// Any Firebase error (it has a code) as an i18n key; null for the app's own errors, whose message
// is shown as it is.
export function errorKey(e: unknown): string | null {
  const code = errorCode(e);
  if (!code) {
    return null;
  }
  return code.startsWith('auth/') ? authErrorKey(e) : FIRESTORE_KEYS[code] ?? 'ERROR_FAILED';
}

// A reset for an email with no login is not an error to show: saying so would tell anyone which
// emails have a login. The page says "if there is a login…" either way.
export function resetLooksSent(e: unknown): boolean {
  return (e as {code?: string} | null)?.code === 'auth/user-not-found';
}
