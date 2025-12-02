import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== GAME QUERIES ==========

/**
 * Get all available games to join (waiting for player 2)
 */
export async function getAvailableGames(betTier = null) {
  try {
    let query = supabase
      .from('games')
      .select('*')
      .eq('state', 0)
      .order('created_at', { ascending: false });

    if (betTier) {
      query = query.eq('bet_tier', betTier);
    }

    const { data, error } = await query;

    if (error) throw error;

    console.log('📋 Available games:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching available games:', error);
    return [];
  }
}

/**
 * Get games created by a specific player
 */
export async function getPlayerCreatedGames(playerAddress) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('player1_address', playerAddress)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    console.log('🎮 Player created games:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching player created games:', error);
    return [];
  }
}

/**
 * Get games where player is participating
 */
export async function getPlayerGames(playerAddress) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .or(`player1_address.eq.${playerAddress},player2_address.eq.${playerAddress}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    console.log('👥 Player games:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching player games:', error);
    return [];
  }
}

/**
 * Get active games (in progress, not finished)
 */
export async function getActiveGames(playerAddress) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .or(`player1_address.eq.${playerAddress},player2_address.eq.${playerAddress}`)
      .in('state', [0, 1])
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('⚡ Active games:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching active games:', error);
    return [];
  }
}

/**
 * Get a specific game by game_id
 */
export async function getGame(gameId) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();

    if (error) throw error;

    console.log('🎯 Game details:', data);
    return data;
  } catch (error) {
    console.error('Error fetching game:', error);
    return null;
  }
}

/**
 * Mark player as finished with their game
 */
export async function markPlayerFinished(gameId, playerAddress, score) {
  try {
    const game = await getGame(gameId);
    if (!game) throw new Error('Game not found');

    const isPlayer1 = game.player1_address === playerAddress;
    const updateField = isPlayer1 ? 'player1_finished' : 'player2_finished';
    const scoreField = isPlayer1 ? 'player1_score' : 'player2_score';

    const { data, error } = await supabase
      .from('games')
      .update({
        [updateField]: true,
        [scoreField]: score
      })
      .eq('game_id', gameId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Player marked as finished:', data);
    return data;
  } catch (error) {
    console.error('Error marking player finished:', error);
    throw error;
  }
}

// ========== PLAYER STATS ==========

/**
 * Get player statistics
 */
export async function getPlayerStats(playerAddress) {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('address', playerAddress)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    console.log('📊 Player stats:', data);
    return data || {
      address: playerAddress,
      games_played: 0,
      games_won: 0,
      total_wagered: '0',
      total_winnings: '0'
    };
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }
}

/**
 * Get leaderboard (top players by winnings)
 */
export async function getLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('total_winnings', { ascending: false })
      .limit(limit);

    if (error) throw error;

    console.log('🏆 Leaderboard:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Get match history for leaderboard
 */
export async function getMatchHistory(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('state', 2) // finished games only
      .not('winner_address', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    console.log('📜 Match history:', data);
    return data || [];
  } catch (error) {
    console.error('Error fetching match history:', error);
    return [];
  }
}

// ========== REAL-TIME SUBSCRIPTIONS ==========

/**
 * Subscribe to changes in available games
 */
export function subscribeToAvailableGames(callback, betTier = null) {
  let subscription = supabase
    .channel('available-games')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: 'state=eq.0'
      },
      (payload) => {
        console.log('🔔 Game update:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Subscribe to a specific game's updates
 */
export function subscribeToGame(gameId, callback) {
  const subscription = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `game_id=eq.${gameId}`
      },
      (payload) => {
        console.log('🎮 Game update:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Subscribe to player stats updates
 */
export function subscribeToPlayerStats(playerAddress, callback) {
  const subscription = supabase
    .channel(`player-${playerAddress}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `address=eq.${playerAddress}`
      },
      (payload) => {
        console.log('📊 Player stats update:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribe(subscription) {
  if (subscription) {
    supabase.removeChannel(subscription);
  }
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Convert octas to APT
 */
export function octasToApt(octas) {
  return Number(BigInt(octas)) / 100000000;
}

/**
 * Format address for display
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get bet tier display name
 */
export function getBetTierName(tier) {
  const tiers = {
    1: '0.1 APT',
    2: '0.5 APT',
    3: '1 APT',
    4: '5 APT'
  };
  return tiers[tier] || 'Unknown';
}

/**
 * Get game state display name
 */
export function getGameStateName(state) {
  const states = {
    0: 'Waiting for Player',
    1: 'In Progress',
    2: 'Finished'
  };
  return states[state] || 'Unknown';
}
