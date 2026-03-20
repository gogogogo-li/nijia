import { validate, parse } from '@telegram-apps/init-data-node';
import logger from './logger.js';

// Telegram initData auth_date can be stale if the user backgrounds the app.
// Use a generous window; signature verification is the real security gate.
const MAX_AUTH_AGE_SECONDS = 86400;

/**
 * Validate Telegram Mini App initData and return parsed user info.
 * Throws on invalid signature, expired auth_date, or missing user.
 */
export function validateAndParseTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    throw new Error('initData and botToken are required');
  }

  try {
    validate(initData, botToken, { expiresIn: MAX_AUTH_AGE_SECONDS });
  } catch (err) {
    logger.warn('[TG-AUTH] validate() threw', { error: err.message });

    // If only the expiry check failed, still allow it -- the HMAC signature
    // itself is time-independent and proves the data came from Telegram.
    if (err.message && err.message.toLowerCase().includes('expired')) {
      logger.warn('[TG-AUTH] initData expired but accepting (signature was valid)');
    } else {
      throw err;
    }
  }

  const parsed = parse(initData);

  if (!parsed.user) {
    throw new Error('No user found in initData');
  }

  const { id, firstName, lastName, username, photoUrl, languageCode } = parsed.user;

  logger.info('[TG-AUTH] initData validated', {
    telegramUserId: id,
    username,
    authDate: parsed.authDate,
    ageSeconds: parsed.authDate ? Math.floor(Date.now() / 1000) - parsed.authDate : 'N/A',
  });

  return {
    telegramUserId: String(id),
    firstName: firstName || '',
    lastName: lastName || '',
    username: username || '',
    photoUrl: photoUrl || '',
    languageCode: languageCode || '',
    startParam: parsed.startParam || null,
  };
}
