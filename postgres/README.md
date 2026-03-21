# PostgreSQL schema (consolidated)

## What this is

`schema.sql` is a **single baseline** for a **new empty database**. It replaces running the many separate files under `supabase/` in order.

It includes:

- Core tables: `players`, `multiplayer_games`, `game_events`, `game_transactions`, `solo_games`
- Full `multiplayer_games` column set (rooms, lives, `state`, `player2`, sync fields, etc.)
- Telegram columns on `players` + indexes
- Phase 2 rooms: `multiplayer_rooms`, `room_players`, `super_fruit_hits` + room trigger + `room_leaderboard` view
- `matchmaking_queue`, `chat_messages` + RLS policies
- Leaderboard views: `daily_leaderboard`, `weekly_leaderboard`, `alltime_leaderboard`, `solo_leaderboard`, `multiplayer_leaderboard`
- Functions: `cleanup_expired_games`, `cleanup_expired_queue_entries`, `generate_room_code`

## Apply

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f postgres/schema.sql
```

Use a role that can `CREATE TABLE` / `CREATE POLICY` (e.g. database owner).

**PostgreSQL 13+** recommended (`gen_random_uuid()` is built-in). For PostgreSQL 12, add at the top of the file:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

## Legacy `supabase/` folder

The old split SQL files remain for reference or incremental upgrades on **existing** databases. For **greenfield** setups, prefer **`postgres/schema.sql` only**.

**Not merged** (by design):

- `supabase/quick-setup.sql` — simplified duplicate of core schema
- `supabase/cleanup-old-games.sql` — destructive data cleanup; run manually if needed

## Backend connection

Point your app at Postgres with `DATABASE_URL` (or host/port/user/password). If you still use **Supabase** only as hosted Postgres, you can keep using `@supabase/supabase-js` with `SUPABASE_URL` + keys; the schema is compatible with standard Postgres + RLS.
