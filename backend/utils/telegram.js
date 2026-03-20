import { validate, parse } from '@telegram-apps/init-data-node';
import logger from './logger.js';

const MAX_AUTH_AGE_SECONDS = 300;

/**
 * Validate Telegram Mini App initData and return parsed user info.
 * Throws on invalid signature, expired auth_date, or missing user.
 */
export function validateAndParseTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    throw new Error('initData and botToken are required');
  }

  validate(initData, botToken, { expiresIn: MAX_AUTH_AGE_SECONDS });

  const parsed = parse(initData);

  if (!parsed.user) {
    throw new Error('No user found in initData');
  }

  const { id, firstName, lastName, username, photoUrl, languageCode } = parsed.user;

  logger.info('Telegram initData validated', { telegramUserId: id, username });

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
