// sessionKey — anonymous tracking ID for recommendation events.
//
// We persist a UUID in localStorage so the server can tie together a
// visitor's product views across page navigations without requiring
// an authenticated account. The key never carries PII; it is only
// used as a tiebreaker for the recommendation strategies.
//
// The constant is centralised in `utils/constants.js` as
// `STORAGE_KEYS.SESSION_KEY`.
import { STORAGE_KEYS } from '@utils/constants';

const generate = () => {
  // crypto.randomUUID is available in all modern browsers; the fallback
  // covers older runtimes without sacrificing uniqueness.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'sk-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

/**
 * Read the persisted session key, or mint + persist a new one.
 * Safe to call from SSR — returns an empty string if `window` is missing.
 */
export const getSessionKey = () => {
  if (typeof window === 'undefined') return '';
  try {
    let key = window.localStorage.getItem(STORAGE_KEYS.SESSION_KEY);
    if (!key) {
      key = generate();
      window.localStorage.setItem(STORAGE_KEYS.SESSION_KEY, key);
    }
    return key;
  } catch {
    // localStorage can throw in privacy modes or when quota is exceeded.
    // The recommendation endpoints will simply behave as if anonymous.
    return '';
  }
};

export default getSessionKey;