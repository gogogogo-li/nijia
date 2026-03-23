import crypto from 'crypto';
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
import { signZkLoginJwt, getJwks, verifyZkLoginJwt } from '../services/zkLoginJwt.js';
import { jwtToAddress } from '@onelabs/sui/zklogin';

const router = express.Router();

/**
 * GET /api/auth/.well-known/jwks.json
 * Serves the RSA public key in JWKS format so the ZK Prover can verify JWTs.
 */
router.get('/.well-known/jwks.json', (req, res) => {
  logger.info('[zkLogin] JWKS endpoint hit', { ip: req.ip, userAgent: req.get('user-agent')?.substring(0, 60) });
  try {
    const jwks = getJwks();
    logger.info('[zkLogin] JWKS served OK', { keyCount: jwks.keys.length, kid: jwks.keys[0]?.kid });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(jwks);
  } catch (err) {
    logger.error('[zkLogin] JWKS endpoint error', { error: err.message });
    res.status(500).json({ error: 'JWKS unavailable' });
  }
});

/**
 * POST /api/auth/telegram
 * Authenticate a Telegram Mini App user via initData.
 * If `nonce` is provided, also returns a zkLogin-compatible JWT (RS256).
 */
router.post(
  '/telegram',
  asyncHandler(async (req, res) => {
    logger.info('[TG-AUTH] POST /api/auth/telegram received', {
      hasInitData: !!req.body.initData,
      initDataLength: req.body.initData?.length || 0,
    });

    const { initData, nonce } = req.body;

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

    let existing = null;
    try {
      logger.info('[TG-AUTH] DB query start: select player by telegram_user_id', {
        telegramUserId: tgUser.telegramUserId,
      });
      const { rows } = await pool.query(
        'select * from players where telegram_user_id = $1 limit 1',
        [tgUser.telegramUserId]
      );
      existing = rows[0] || null;
      logger.info('[TG-AUTH] DB query ok: select player by telegram_user_id', {
        telegramUserId: tgUser.telegramUserId,
        found: !!existing,
        playerId: existing?.id,
      });
    } catch (dbErr) {
      logger.error('[TG-AUTH] DB query failed: select player by telegram_user_id', {
        telegramUserId: tgUser.telegramUserId,
        error: dbErr.message,
        code: dbErr.code,
        detail: dbErr.detail,
        hint: dbErr.hint,
        table: dbErr.table,
        column: dbErr.column,
        constraint: dbErr.constraint,
      });
      throw dbErr;
    }

    let player;
    let isNewUser = false;

    if (existing) {
      logger.info('[TG-AUTH] Existing player found, updating', { playerId: existing.id });
      try {
        logger.info('[TG-AUTH] DB query start: update existing player', {
          playerId: existing.id,
          telegramUserId: tgUser.telegramUserId,
        });
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
        logger.info('[TG-AUTH] DB query ok: update existing player', {
          playerId: player?.id,
        });
      } catch (dbErr) {
        logger.error('[TG-AUTH] DB query failed: update existing player', {
          playerId: existing.id,
          telegramUserId: tgUser.telegramUserId,
          error: dbErr.message,
          code: dbErr.code,
          detail: dbErr.detail,
          hint: dbErr.hint,
          table: dbErr.table,
          column: dbErr.column,
          constraint: dbErr.constraint,
        });
        throw dbErr;
      }
    } else {
      logger.info('[TG-AUTH] New player, inserting', { walletAddress, displayName });
      try {
        logger.info('[TG-AUTH] DB query start: insert new player', {
          telegramUserId: tgUser.telegramUserId,
          walletAddress,
          displayName,
        });
        const { rows: createdRows } = await pool.query(
          `
            insert into players (wallet_address, display_name, telegram_user_id, auth_provider, avatar_url)
            values ($1, $2, $3, $4, $5)
            returning *
          `,
          [walletAddress, displayName, tgUser.telegramUserId, 'telegram', tgUser.photoUrl || null]
        );
        player = createdRows[0];
        logger.info('[TG-AUTH] DB query ok: insert new player', {
          playerId: player?.id,
          telegramUserId: tgUser.telegramUserId,
        });
      } catch (dbErr) {
        logger.error('[TG-AUTH] DB query failed: insert new player', {
          telegramUserId: tgUser.telegramUserId,
          walletAddress,
          error: dbErr.message,
          code: dbErr.code,
          detail: dbErr.detail,
          hint: dbErr.hint,
          table: dbErr.table,
          column: dbErr.column,
          constraint: dbErr.constraint,
        });
        throw dbErr;
      }
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
      hasNonce: !!nonce,
    });

    const response = {
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
    };

    if (nonce) {
      try {
        response.zkLoginJwt = signZkLoginJwt(tgUser.telegramUserId, nonce);
        logger.info('[TG-AUTH] zkLogin JWT signed', { telegramUserId: tgUser.telegramUserId });
      } catch (err) {
        logger.error('[TG-AUTH] Failed to sign zkLogin JWT', { error: err.message });
      }
    }

    res.json(response);
  })
);

/**
 * POST /api/auth/salt
 * Return a deterministic salt for a given zkLogin JWT's subject.
 * Same sub always produces the same salt, ensuring stable address derivation.
 */
router.post(
  '/salt',
  asyncHandler(async (req, res) => {
    logger.info('[zkLogin] POST /api/auth/salt received', { hasJwt: !!req.body.jwt, jwtLength: req.body.jwt?.length || 0 });

    const { jwt } = req.body;
    if (!jwt) {
      logger.warn('[zkLogin] salt: missing jwt in body');
      return res.status(400).json({ success: false, error: 'jwt is required' });
    }

    let decoded;
    try {
      decoded = verifyZkLoginJwt(jwt);
      logger.info('[zkLogin] salt: JWT verified', { sub: decoded.sub, iss: decoded.iss });
    } catch (err) {
      logger.warn('[zkLogin] salt: JWT verification failed', { error: err.message });
      return res.status(401).json({ success: false, error: 'Invalid zkLogin JWT' });
    }

    const masterKey = process.env.ZKLOGIN_SALT_MASTER_KEY;
    if (!masterKey) {
      logger.error('[zkLogin] ZKLOGIN_SALT_MASTER_KEY not configured');
      return res.status(500).json({ success: false, error: 'Server misconfiguration' });
    }

    const hmac = crypto.createHmac('sha256', Buffer.from(masterKey, 'hex'));
    hmac.update(decoded.sub);
    const hashBytes = hmac.digest();
    const salt = BigInt('0x' + hashBytes.subarray(0, 16).toString('hex')).toString();

    logger.info('[zkLogin] salt issued OK', { sub: decoded.sub, saltLength: salt.length, saltPrefix: salt.substring(0, 8) });
    res.json({ success: true, salt });
  })
);

/**
 * POST /api/auth/zklogin
 * Final authentication step: verify the zkLogin address matches jwtToAddress(jwt, salt),
 * upsert the player record with the real on-chain address, and issue session tokens.
 */
router.post(
  '/zklogin',
  asyncHandler(async (req, res) => {
    logger.info('[zkLogin] POST /api/auth/zklogin received', {
      hasJwt: !!req.body.jwt,
      hasSalt: !!req.body.salt,
      hasAddress: !!req.body.zkLoginAddress,
      hasProof: !!req.body.zkProof,
      maxEpoch: req.body.maxEpoch,
    });

    const { jwt, salt, zkLoginAddress, zkProof, ephemeralPublicKey, maxEpoch } = req.body;

    if (!jwt || !salt || !zkLoginAddress) {
      logger.warn('[zkLogin] auth: missing required fields');
      return res.status(400).json({ success: false, error: 'jwt, salt, and zkLoginAddress are required' });
    }

    let decoded;
    try {
      decoded = verifyZkLoginJwt(jwt);
      logger.info('[zkLogin] auth: JWT verified', { sub: decoded.sub, iss: decoded.iss, aud: decoded.aud });
    } catch (err) {
      logger.warn('[zkLogin] auth: JWT verification failed', { error: err.message });
      return res.status(401).json({ success: false, error: 'Invalid zkLogin JWT' });
    }

    let expectedAddress;
    try {
      expectedAddress = jwtToAddress(jwt, salt);
      logger.info('[zkLogin] auth: jwtToAddress result', { expectedAddress, receivedAddress: zkLoginAddress });
    } catch (err) {
      logger.error('[zkLogin] auth: jwtToAddress failed', { error: err.message });
      return res.status(400).json({ success: false, error: 'Failed to derive address from JWT + salt' });
    }

    if (expectedAddress !== zkLoginAddress) {
      logger.warn('[zkLogin] auth: ADDRESS MISMATCH', { expected: expectedAddress, received: zkLoginAddress });
      return res.status(400).json({ success: false, error: 'zkLogin address mismatch' });
    }

    logger.info('[zkLogin] auth: address MATCH confirmed', { address: zkLoginAddress });

    const sub = decoded.sub;
    const telegramUserId = sub.startsWith('tg_') ? sub.slice(3) : sub;
    const displayName = `tg_${telegramUserId}`;

    logger.info('[zkLogin] auth: address verified, upserting player', {
      sub,
      telegramUserId,
      zkLoginAddress,
    });

    // Upsert: find by telegram_user_id, update wallet_address if changed
    let player;
    let isNewUser = false;

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM players WHERE telegram_user_id = $1 LIMIT 1',
      [telegramUserId]
    );
    const existing = existingRows[0] || null;

    if (existing) {
      // Only update wallet_address if it actually changed
      if (existing.wallet_address === zkLoginAddress) {
        await pool.query(
          `UPDATE players SET auth_provider = 'zklogin', last_active = $1 WHERE id = $2`,
          [new Date().toISOString(), existing.id]
        );
        player = { ...existing, auth_provider: 'zklogin' };
      } else {
        const { rows: updatedRows } = await pool.query(
          `UPDATE players
           SET wallet_address = $1, auth_provider = 'zklogin', last_active = $2
           WHERE id = $3
           RETURNING *`,
          [zkLoginAddress, new Date().toISOString(), existing.id]
        );
        player = updatedRows[0];
      }
      logger.info('[zkLogin] auth: existing player updated', {
        playerId: player.id,
        oldAddress: existing.wallet_address,
        newAddress: zkLoginAddress,
      });
    } else {
      const { rows: createdRows } = await pool.query(
        `INSERT INTO players (wallet_address, display_name, telegram_user_id, auth_provider)
         VALUES ($1, $2, $3, 'zklogin')
         RETURNING *`,
        [zkLoginAddress, displayName, telegramUserId]
      );
      player = createdRows[0];
      isNewUser = true;
      logger.info('[zkLogin] auth: new player created', {
        playerId: player.id,
        zkLoginAddress,
      });
    }

    const tokenPayload = {
      walletAddress: player.wallet_address,
      playerId: player.id,
      provider: 'zklogin',
      telegramUserId,
    };

    const token = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    logger.info('[zkLogin] auth: COMPLETE — session tokens issued', {
      telegramUserId,
      playerId: player.id,
      walletAddress: player.wallet_address,
      isNewUser,
      authProvider: 'zklogin',
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
        telegramUserId,
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
