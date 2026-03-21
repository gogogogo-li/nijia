import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pool } from '../config/postgres.js';
import { validateAndParseTelegramInitData } from '../utils/telegram.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/auth/telegram
 * Authenticate a Telegram Mini App user via initData.
 */
router.post(
  '/telegram',
  asyncHandler(async (req, res) => {
    logger.info('[TG-AUTH] POST /api/auth/telegram received', {
      hasInitData: !!req.body.initData,
      initDataLength: req.body.initData?.length || 0,
    });

    const { initData } = req.body;

    if (!initData) {
      logger.warn('[TG-AUTH] Missing initData in request body');
      return res.status(400).json({ success: false, error: 'initData is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error('[TG-AUTH] TELEGRAM_BOT_TOKEN not configured on server');
      return res.status(500).json({ success: false, error: 'Server misconfiguration' });
    }

    let tgUser;
    try {
      tgUser = validateAndParseTelegramInitData(initData, botToken);
      logger.info('[TG-AUTH] initData validated ok', {
        telegramUserId: tgUser.telegramUserId,
        username: tgUser.username,
        firstName: tgUser.firstName,
      });
    } catch (err) {
      logger.warn('[TG-AUTH] initData validation FAILED', { error: err.message });
      return res.status(401).json({ success: false, error: `Invalid initData: ${err.message}` });
    }

    const walletAddress = `tg_${tgUser.telegramUserId}`;
    const displayName =
      tgUser.username ||
      [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') ||
      `tg_${tgUser.telegramUserId}`;

    logger.info('[TG-AUTH] Looking up player in DB', { telegramUserId: tgUser.telegramUserId });

    const { rows } = await pool.query(
      'select * from players where telegram_user_id = $1 limit 1',
      [tgUser.telegramUserId]
    );
    const existing = rows[0] || null;

    let player;
    let isNewUser = false;

    if (existing) {
      logger.info('[TG-AUTH] Existing player found, updating', { playerId: existing.id });
      const { rows: updatedRows } = await pool.query(
        `
          update players
          set display_name = $1,
              avatar_url = $2,
              last_active = $3
          where id = $4
          returning *
        `,
        [displayName, tgUser.photoUrl || null, new Date().toISOString(), existing.id]
      );
      player = updatedRows[0];
    } else {
      logger.info('[TG-AUTH] New player, inserting', { walletAddress, displayName });
      const { rows: createdRows } = await pool.query(
        `
          insert into players (wallet_address, display_name, telegram_user_id, auth_provider, avatar_url)
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [walletAddress, displayName, tgUser.telegramUserId, 'telegram', tgUser.photoUrl || null]
      );
      player = createdRows[0];
      isNewUser = true;
    }

    const tokenPayload = {
      walletAddress: player.wallet_address,
      playerId: player.id,
      provider: 'telegram',
      telegramUserId: tgUser.telegramUserId,
    };

    const token = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    logger.info('[TG-AUTH] Login complete, JWT issued', {
      telegramUserId: tgUser.telegramUserId,
      playerId: player.id,
      walletAddress: player.wallet_address,
      isNewUser,
    });

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: player.id,
        walletAddress: player.wallet_address,
        displayName: player.display_name,
        avatarUrl: player.avatar_url,
        telegramUserId: tgUser.telegramUserId,
      },
      isNewUser,
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh an access token using a valid refresh token.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    logger.info('[TG-AUTH] POST /api/auth/refresh received');

    const { refreshToken } = req.body;

    if (!refreshToken) {
      logger.warn('[TG-AUTH] refresh: missing refreshToken');
      return res.status(400).json({ success: false, error: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
      logger.info('[TG-AUTH] refresh: token verified', {
        provider: payload.provider,
        walletAddress: payload.walletAddress,
      });
    } catch (err) {
      logger.warn('[TG-AUTH] refresh: invalid/expired refresh token', { error: err.message });
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const newPayload = {
      walletAddress: payload.walletAddress,
      playerId: payload.playerId,
      provider: payload.provider,
      telegramUserId: payload.telegramUserId,
    };

    const newToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    logger.info('[TG-AUTH] refresh: new tokens issued', { walletAddress: payload.walletAddress });

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
    });
  })
);

export default router;
