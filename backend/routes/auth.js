import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
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
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ success: false, error: 'initData is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error('TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ success: false, error: 'Server misconfiguration' });
    }

    let tgUser;
    try {
      tgUser = validateAndParseTelegramInitData(initData, botToken);
    } catch (err) {
      logger.warn('Telegram initData validation failed', { error: err.message });
      return res.status(401).json({ success: false, error: `Invalid initData: ${err.message}` });
    }

    const walletAddress = `tg_${tgUser.telegramUserId}`;
    const displayName =
      tgUser.username ||
      [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') ||
      `tg_${tgUser.telegramUserId}`;

    const { data: existing, error: lookupErr } = await supabase
      .from('players')
      .select('*')
      .eq('telegram_user_id', tgUser.telegramUserId)
      .maybeSingle();

    if (lookupErr) {
      logger.error('Player lookup failed', { error: lookupErr.message });
      throw lookupErr;
    }

    let player;
    let isNewUser = false;

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('players')
        .update({
          display_name: displayName,
          avatar_url: tgUser.photoUrl || null,
          last_active: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      player = updated;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('players')
        .insert({
          wallet_address: walletAddress,
          display_name: displayName,
          telegram_user_id: tgUser.telegramUserId,
          auth_provider: 'telegram',
          avatar_url: tgUser.photoUrl || null,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      player = created;
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

    logger.info('Telegram login successful', {
      telegramUserId: tgUser.telegramUserId,
      playerId: player.id,
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
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
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

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
    });
  })
);

export default router;
