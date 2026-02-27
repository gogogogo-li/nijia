module ninja_addr::multiplayer_game {
    use one::coin::{Self, Coin};
    use one::balance::{Self, Balance};
    use one::event;
    use one::clock::{Self, Clock};
    use one::dynamic_field as df;
    use one::object::{Self, UID, ID};
    use one::tx_context::{Self, TxContext};
    use one::transfer;

    // Bet tiers (in MIST, 1 HACK = 1,000,000,000 MIST)
    const BET_TIER_1: u64 = 100000000;    // 0.1 HACK
    const BET_TIER_2: u64 = 500000000;    // 0.5 HACK
    const BET_TIER_3: u64 = 1000000000;   // 1 HACK
    const BET_TIER_4: u64 = 5000000000;   // 5 HACK

    // Solo game difficulty tiers (stake amounts in MIST)
    const SOLO_EASY_STAKE: u64 = 500000000;      // 0.5 HACK
    const SOLO_MEDIUM_STAKE: u64 = 1000000000;   // 1 HACK
    const SOLO_HARD_STAKE: u64 = 2000000000;     // 2 HACK
    const SOLO_EXTREME_STAKE: u64 = 5000000000;  // 5 HACK

    // Solo game target scores
    const SOLO_EASY_TARGET: u64 = 100;
    const SOLO_MEDIUM_TARGET: u64 = 200;
    const SOLO_HARD_TARGET: u64 = 350;
    const SOLO_EXTREME_TARGET: u64 = 500;

    // Game states
    const STATE_WAITING: u8 = 0;
    const STATE_IN_PROGRESS: u8 = 1;
    const STATE_FINISHED: u8 = 2;

    // Error codes
    const E_GAME_NOT_FOUND: u64 = 3;
    const E_GAME_ALREADY_STARTED: u64 = 4;
    const E_NOT_YOUR_GAME: u64 = 5;
    const E_GAME_NOT_IN_PROGRESS: u64 = 6;
    const E_INVALID_DIFFICULTY: u64 = 7;
    const E_INVALID_BET_TIER: u64 = 8;
    const E_INSUFFICIENT_BALANCE: u64 = 9;
    const E_GAME_FULL: u64 = 10;
    const E_CANNOT_JOIN_OWN_GAME: u64 = 11;
    const E_NOT_ADMIN: u64 = 12;
    const E_SOLO_GAME_NOT_FOUND: u64 = 13;
    const E_SOLO_GAME_ALREADY_FINISHED: u64 = 14;

    // Structs
    public struct MultiplayerGame<phantom T> has key, store {
        id: UID,
        game_id: u64,
        bet_amount: u64,
        player1: address,
        player2: address,
        player1_score: u64,
        player2_score: u64,
        winner: address,
        state: u8,
        created_at: u64,
        joined_at: u64,
        finished_at: u64,
        escrow: Balance<T>,
    }

    public struct GameLobby has key {
        id: UID,
        available_games: vector<u64>,
        next_game_id: u64,
        total_games_played: u64,
        total_volume: u64,
        admin: address,
    }

    public struct StatsRegistry has key {
        id: UID,
    }

    public struct PlayerStats has key, store {
        id: UID,
        address: address,
        games_played: u64,
        games_won: u64,
        total_wagered: u64,
        total_winnings: u64,
    }

    // Events
    public struct GameCreatedEvent has copy, drop {
        game_id: u64,
        creator: address,
        bet_amount: u64,
    }

    public struct GameJoinedEvent has copy, drop {
        game_id: u64,
        player: address,
        bet_amount: u64,
    }

    public struct GameFinishedEvent has copy, drop {
        game_id: u64,
        winner: address,
        prize: u64,
    }
    
    public struct GameForfeitedEvent has copy, drop {
        game_id: u64,
        forfeiter: address,
    }

    public struct GameRefundedEvent has copy, drop {
        game_id: u64,
        refunder: address,
    }
    
    public struct ContractDeployed has copy, drop {
        lobby_id: ID,
        registry_id: ID,
    }

    // ========== SOLO GAME STRUCTS ==========
    
    /// Single player game with HACK stake
    public struct SoloGame<phantom T> has key, store {
        id: UID,
        game_id: u64,
        player: address,
        difficulty: u8,        // 0=Easy, 1=Medium, 2=Hard, 3=Extreme
        stake_amount: u64,
        target_score: u64,
        final_score: u64,
        won: bool,
        state: u8,             // 0=waiting, 1=in_progress, 2=finished
        created_at: u64,
        finished_at: u64,
        escrow: Balance<T>,
    }

    /// Tracks all solo games
    public struct SoloGameLobby has key {
        id: UID,
        next_solo_game_id: u64,
        total_solo_games: u64,
        total_solo_volume: u64,
        admin: address,
    }

    // Solo Game Events
    public struct SoloGameCreatedEvent has copy, drop {
        game_id: u64,
        player: address,
        difficulty: u8,
        stake_amount: u64,
        target_score: u64,
    }

    public struct SoloGameCompletedEvent has copy, drop {
        game_id: u64,
        player: address,
        final_score: u64,
        won: bool,
        payout: u64,
    }


    // View helpers for tests/clients
    public fun get_available_games(lobby: &GameLobby): vector<u64> {
        lobby.available_games
    }

    public fun get_game_state<T>(lobby: &GameLobby, game_id: u64): u8 {
        let game: &MultiplayerGame<T> = df::borrow(&lobby.id, game_id);
        game.state
    }

    public fun get_lobby_stats(lobby: &GameLobby): (u64, u64) {
        (lobby.total_games_played, lobby.total_volume)
    }

    public fun get_player_stats(
        stats_registry: &StatsRegistry,
        player: address
    ): (u64, u64, u64, u64) {
        if (!df::exists_(&stats_registry.id, player)) {
            (0, 0, 0, 0)
        } else {
            let stats: &PlayerStats = df::borrow(&stats_registry.id, player);
            (stats.games_played, stats.games_won, stats.total_wagered, stats.total_winnings)
        }
    }

    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);

        let lobby = GameLobby {
            id: object::new(ctx),
            available_games: vector::empty<u64>(),
            next_game_id: 0,
            total_games_played: 0,
            total_volume: 0,
            admin,
        };

        let stats_registry = StatsRegistry {
            id: object::new(ctx),
        };

        let lobby_id = object::uid_to_inner(&lobby.id);
        let reg_id = object::uid_to_inner(&stats_registry.id);

        // Create solo game lobby
        let solo_lobby = SoloGameLobby {
            id: object::new(ctx),
            next_solo_game_id: 0,
            total_solo_games: 0,
            total_solo_volume: 0,
            admin,
        };

        transfer::share_object(lobby);
        transfer::share_object(stats_registry);
        transfer::share_object(solo_lobby);

        event::emit(ContractDeployed {
            lobby_id: lobby_id,
            registry_id: reg_id,
        });
    }

    /// Admin function to register a game that was created off-chain (backend-managed)
    /// This puts the game directly into IN_PROGRESS state for later settlement via submit_score
    /// NOTE: This creates a game with zero escrow - HACK transfers are handled separately by backend
    /// The admin is responsible for ensuring players have deposited funds before calling this
    public fun admin_register_game<T>(
        lobby: &mut GameLobby,
        game_id: u64,
        player1: address,
        player2: address,
        bet_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let admin = tx_context::sender(ctx);
        assert!(admin == lobby.admin, E_NOT_ADMIN);
        
        // Ensure this game_id doesn't already exist
        assert!(!df::exists_(&lobby.id, game_id), E_GAME_ALREADY_STARTED);
        
        // Update next_game_id if necessary
        if (game_id >= lobby.next_game_id) {
            lobby.next_game_id = game_id + 1;
        };
        
        // Create game directly in IN_PROGRESS state with empty escrow
        // The bet_amount is tracked for record-keeping but actual HACK is managed externally
        let game = MultiplayerGame<T> {
            id: object::new(ctx),
            game_id,
            bet_amount,
            player1,
            player2,
            player1_score: 0,
            player2_score: 0,
            winner: @0x0,
            state: STATE_IN_PROGRESS,
            created_at: clock::timestamp_ms(clock),
            joined_at: clock::timestamp_ms(clock),
            finished_at: 0,
            escrow: balance::zero<T>(), // Empty escrow - HACK handled by backend
        };
        
        df::add(&mut lobby.id, game_id, game);
        
        // Update lobby stats
        lobby.total_volume = lobby.total_volume + (bet_amount * 2);
        
        event::emit(GameJoinedEvent {
            game_id,
            player: player2,
            bet_amount,
        });
    }

    public fun create_game<T>(
        lobby: &mut GameLobby,
        bet_tier: u64,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let player_addr = tx_context::sender(ctx);

        assert!(bet_tier <= 3, E_INVALID_BET_TIER);

        let bet_amount = if (bet_tier == 0) {
            BET_TIER_1
        } else if (bet_tier == 1) {
            BET_TIER_2
        } else if (bet_tier == 2) {
            BET_TIER_3
        } else {
            BET_TIER_4
        };

        assert!(coin::value(&payment) >= bet_amount, E_INSUFFICIENT_BALANCE);

        let game_id = lobby.next_game_id;
        let game_id_event = game_id;
        lobby.next_game_id = lobby.next_game_id + 1;

        let game = MultiplayerGame<T> {
            id: object::new(ctx),
            game_id,
            bet_amount,
            player1: player_addr,
            player2: @0x0,
            player1_score: 0,
            player2_score: 0,
            winner: @0x0,
            state: STATE_WAITING,
            created_at: clock::timestamp_ms(clock),
            joined_at: 0,
            finished_at: 0,
            escrow: coin::into_balance(payment),
        };
        df::add(&mut lobby.id, game_id, game);

        vector::push_back(&mut lobby.available_games, game_id);

        event::emit(GameCreatedEvent {
            game_id: game_id_event,
            creator: player_addr,
            bet_amount: bet_amount,
        });
    }

    public fun join_game<T>(
        lobby: &mut GameLobby,
        game_id: u64,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let player_addr = tx_context::sender(ctx);
        let bet_amount;
        {
            assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);
            let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
            assert!(game.state == STATE_WAITING, E_GAME_ALREADY_STARTED);
            assert!(game.player2 == @0x0, E_GAME_FULL);
            assert!(game.player1 != player_addr, E_CANNOT_JOIN_OWN_GAME);
            
            assert!(coin::value(&payment) == game.bet_amount, E_INSUFFICIENT_BALANCE);

            bet_amount = game.bet_amount;
            let paid = coin::into_balance(payment);
            balance::join(&mut game.escrow, paid);

            game.player2 = player_addr;
            game.state = STATE_IN_PROGRESS;
            game.joined_at = clock::timestamp_ms(clock);

            lobby.total_volume = lobby.total_volume + (game.bet_amount * 2);
        };
        remove_available_game(lobby, game_id);

        event::emit(GameJoinedEvent {
            game_id: game_id,
            player: player_addr,
            bet_amount: bet_amount,
        });
    }

    public fun submit_score<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        player1_address: address,
        player2_address: address,
        player1_score: u64,
        player2_score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let admin = tx_context::sender(ctx);

        assert!(admin == lobby.admin, E_NOT_ADMIN);
        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);

        let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
        assert!(game.state == STATE_IN_PROGRESS, E_GAME_NOT_IN_PROGRESS);
        assert!(player1_address == game.player1 && player2_address == game.player2, E_NOT_YOUR_GAME);

        game.player1_score = player1_score;
        game.player2_score = player2_score;
        game.state = STATE_FINISHED;
        game.finished_at = clock::timestamp_ms(clock);

        initialize_player_stats(stats_registry, player1_address, ctx);
        initialize_player_stats(stats_registry, player2_address, ctx);

        lobby.total_games_played = lobby.total_games_played + 1;
        {
            let player1_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, player1_address);
            player1_stats.total_wagered = player1_stats.total_wagered + game.bet_amount;
            player1_stats.games_played = player1_stats.games_played + 1;
        };
        {
            let player2_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, player2_address);
            player2_stats.total_wagered = player2_stats.total_wagered + game.bet_amount;
            player2_stats.games_played = player2_stats.games_played + 1;
        };

        if (game.player1_score == game.player2_score) {
            handle_tie(lobby.admin, game, ctx);
            return
        };

        let (winner_addr, _) = if (game.player1_score > game.player2_score) {
            (game.player1, game.player2)
        } else {
            (game.player2, game.player1)
        };

        handle_win(lobby.admin, stats_registry, game, winner_addr, ctx);
    }

    public fun forfeit_game<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        forfeiter: address,
        clock: &Clock,
        ctx: &mut TxContext
    ){
        let admin = tx_context::sender(ctx);

        assert!(admin == lobby.admin, E_NOT_ADMIN);
        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);

        let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
        assert!(game.state == STATE_IN_PROGRESS, E_GAME_NOT_IN_PROGRESS);
        assert!(forfeiter == game.player1 || forfeiter == game.player2, E_NOT_YOUR_GAME);

        let player1_address = game.player1;
        let player2_address = game.player2;

        initialize_player_stats(stats_registry, player1_address, ctx);
        initialize_player_stats(stats_registry, player2_address, ctx);

        lobby.total_games_played = lobby.total_games_played + 1;

        let opponent = if (forfeiter == game.player1) {
            game.player2
        } else {
            game.player1
        };

        let (platform_coin, winner_coin, loser_coin) = calculate_payouts(&mut game.escrow, 2, game.bet_amount, ctx);
        let prize_amount = coin::value(&winner_coin);

        game.state = STATE_FINISHED;
        game.winner = opponent;
        game.finished_at = clock::timestamp_ms(clock);

        {
            let forfeiter_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, forfeiter);
            forfeiter_stats.games_played = forfeiter_stats.games_played + 1;
        };
        {
            let opponent_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, opponent);
            opponent_stats.games_played = opponent_stats.games_played + 1;
            opponent_stats.games_won = opponent_stats.games_won + 1;
            opponent_stats.total_winnings = opponent_stats.total_winnings + prize_amount;
        };

        // Transfers last
        coin::destroy_zero(loser_coin);
        if (coin::value(&platform_coin) > 0) {
            transfer::public_transfer(platform_coin, lobby.admin);
        } else {
            coin::destroy_zero(platform_coin);
        };
        transfer::public_transfer(winner_coin, opponent);

        event::emit(GameForfeitedEvent {
            game_id: game_id,
            forfeiter,
        });
    }

    /// NEW: Instant win when opponent loses all lives
    /// Called by backend when a player reaches 0 lives
    public fun instant_win<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        winner_address: address,
        winner_score: u64,
        loser_score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let admin = tx_context::sender(ctx);
        assert!(admin == lobby.admin, E_NOT_ADMIN);
        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);

        let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
        assert!(game.state == STATE_IN_PROGRESS, E_GAME_NOT_IN_PROGRESS);
        assert!(winner_address == game.player1 || winner_address == game.player2, E_NOT_YOUR_GAME);

        // Set scores
        if (winner_address == game.player1) {
            game.player1_score = winner_score;
            game.player2_score = loser_score;
        } else {
            game.player2_score = winner_score;
            game.player1_score = loser_score;
        };

        game.state = STATE_FINISHED;
        game.finished_at = clock::timestamp_ms(clock);
        game.winner = winner_address;

        // Initialize stats
        let loser_address = if (winner_address == game.player1) { game.player2 } else { game.player1 };
        initialize_player_stats(stats_registry, winner_address, ctx);
        initialize_player_stats(stats_registry, loser_address, ctx);

        // Update stats
        lobby.total_games_played = lobby.total_games_played + 1;
        {
            let winner_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, winner_address);
            winner_stats.games_played = winner_stats.games_played + 1;
            winner_stats.games_won = winner_stats.games_won + 1;
            winner_stats.total_wagered = winner_stats.total_wagered + game.bet_amount;
        };
        {
            let loser_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, loser_address);
            loser_stats.games_played = loser_stats.games_played + 1;
            loser_stats.total_wagered = loser_stats.total_wagered + game.bet_amount;
        };

        // Calculate payouts (2% platform fee)
        let (platform_coin, winner_coin, loser_coin) = calculate_payouts(&mut game.escrow, 1, game.bet_amount, ctx);
        let prize_amount = coin::value(&winner_coin);

        {
            let winner_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, winner_address);
            winner_stats.total_winnings = winner_stats.total_winnings + prize_amount;
        };

        // Transfers
        coin::destroy_zero(loser_coin);
        if (coin::value(&platform_coin) > 0) {
            transfer::public_transfer(platform_coin, lobby.admin);
        } else {
            coin::destroy_zero(platform_coin);
        };
        transfer::public_transfer(winner_coin, winner_address);

        event::emit(GameFinishedEvent {
            game_id: game.game_id,
            winner: winner_address,
            prize: prize_amount,
        });
    }

    public fun refund_game<T>(
        lobby: &mut GameLobby,
        game_id: u64,
        ctx: &mut TxContext
    ){
        let sender = tx_context::sender(ctx);

        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);
        let (coin, player1_addr) = {
            let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
            assert!(sender == lobby.admin || sender != game.player1, E_NOT_ADMIN);
            assert!(game.state == STATE_WAITING, E_GAME_ALREADY_STARTED);
            let refund = balance::withdraw_all(&mut game.escrow);
            (coin::from_balance(refund, ctx), game.player1)
        };

        remove_available_game(lobby, game_id);

        transfer::public_transfer(coin, player1_addr);
        event::emit(GameRefundedEvent { game_id, refunder: player1_addr });
    }

    // Remove game from available games vector (if it exists)
    fun remove_available_game(
        lobby: &mut GameLobby,
        game_id: u64
    ) {
        let (exists, index) = vector::index_of(&lobby.available_games, &game_id);
        if (exists) {
            vector::remove(&mut lobby.available_games, index);
        };
    }

    // Ensure player stats record exists; initialize with a starting wager if missing
    fun initialize_player_stats(
        stats_registry: &mut StatsRegistry,
        player_address: address,
        ctx: &mut TxContext
    ) {
        if (!df::exists_(&stats_registry.id, player_address)) {
            let stats = PlayerStats {
                id: object::new(ctx),
                address: player_address,
                games_played: 0,
                games_won: 0,
                total_wagered: 0,
                total_winnings: 0,
            };
            df::add(&mut stats_registry.id, player_address, stats);
        };
    }

    /// Calculate payout coins (platform, winner, loser) based on outcome.
    /// outcome: 0 = tie, 1 = normal win, 2 = forfeit win.
    /// Platform fee for win: 2% of total pot (2 * bet_amount).
    fun calculate_payouts<T>(
        escrow: &mut Balance<T>,
        outcome: u8,
        bet_amount: u64,
        ctx: &mut TxContext
    ): (Coin<T>, Coin<T>, Coin<T>) {
        let total = balance::value(escrow);

        let platform_fee = (total * 2) / 100; // 2% of total pot

        if (outcome == 0) {
            let platform_coin = coin::zero<T>(ctx);
            let p1_bal = balance::split(escrow, bet_amount);
            let p2_bal = balance::withdraw_all(escrow);
            (platform_coin, coin::from_balance(p1_bal, ctx), coin::from_balance(p2_bal, ctx))
        
        } else if (outcome == 1) {
            let platform_coin = if (platform_fee > 0) {
                let platform_bal = balance::split(escrow, platform_fee);
                coin::from_balance(platform_bal, ctx)
            } else {
                coin::zero<T>(ctx)
            };

            let win = balance::withdraw_all(escrow);
            (platform_coin, coin::from_balance(win, ctx), coin::zero<T>(ctx))

        } else {
            // Forfeit: 2% platform fee, winner gets 98%
            let platform_coin = if (platform_fee > 0) {
                let platform_bal = balance::split(escrow, platform_fee);
                coin::from_balance(platform_bal, ctx)
            } else {
                coin::zero<T>(ctx)
            };
            
            let winner_bal = balance::withdraw_all(escrow); // Winner gets 98%
            (
                platform_coin,
                coin::from_balance(winner_bal, ctx),
                coin::zero<T>(ctx)
            )
        }
    }

    fun handle_tie<T>(
        admin: address,
        game: &mut MultiplayerGame<T>,
        ctx: &mut TxContext
    ) {
        let (platform_coin, p1_coin, p2_coin) = calculate_payouts(&mut game.escrow, 0, game.bet_amount, ctx);

        game.winner = @0x0;
        let prize_amount = game.bet_amount;

        if (coin::value(&platform_coin) > 0) {
            transfer::public_transfer(platform_coin, admin);
        } else {
            coin::destroy_zero(platform_coin);
        };
        transfer::public_transfer(p1_coin, game.player1);
        transfer::public_transfer(p2_coin, game.player2);

        event::emit(GameFinishedEvent {
            game_id: game.game_id,
            winner: game.winner,
            prize: prize_amount,
        });
    }

    fun handle_win<T>(
        admin: address,
        stats_registry: &mut StatsRegistry,
        game: &mut MultiplayerGame<T>,
        winner_addr: address,
        ctx: &mut TxContext
    ) {
        game.winner = winner_addr;

        let (platform_coin, winner_coin, loser_coin) = calculate_payouts(&mut game.escrow, 1, game.bet_amount, ctx);
        let prize_amount = coin::value(&winner_coin);

        
        let winner_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, winner_addr);
        winner_stats.games_won = winner_stats.games_won + 1;
        winner_stats.total_winnings = winner_stats.total_winnings + prize_amount;
        

        coin::destroy_zero(loser_coin);
        if (coin::value(&platform_coin) > 0) {
            transfer::public_transfer(platform_coin, admin);
        } else {
            coin::destroy_zero(platform_coin);
        };
        transfer::public_transfer(winner_coin, winner_addr);

        event::emit(GameFinishedEvent {
            game_id: game.game_id,
            winner: game.winner,
            prize: prize_amount,
        });
    }

    // ========== SOLO GAME FUNCTIONS ==========

    /// Create a solo game - player stakes HACK to play
    /// difficulty: 0=Easy(0.5 HACK), 1=Medium(1 HACK), 2=Hard(2 HACK), 3=Extreme(5 HACK)
    public fun create_solo_game<T>(
        solo_lobby: &mut SoloGameLobby,
        difficulty: u8,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let player_addr = tx_context::sender(ctx);
        
        assert!(difficulty <= 3, E_INVALID_DIFFICULTY);
        
        // Get stake amount and target score based on difficulty
        let (stake_amount, target_score) = if (difficulty == 0) {
            (SOLO_EASY_STAKE, SOLO_EASY_TARGET)
        } else if (difficulty == 1) {
            (SOLO_MEDIUM_STAKE, SOLO_MEDIUM_TARGET)
        } else if (difficulty == 2) {
            (SOLO_HARD_STAKE, SOLO_HARD_TARGET)
        } else {
            (SOLO_EXTREME_STAKE, SOLO_EXTREME_TARGET)
        };
        
        // Verify payment matches stake
        assert!(coin::value(&payment) >= stake_amount, E_INSUFFICIENT_BALANCE);
        
        let game_id = solo_lobby.next_solo_game_id;
        solo_lobby.next_solo_game_id = solo_lobby.next_solo_game_id + 1;
        
        // Create solo game
        let game = SoloGame<T> {
            id: object::new(ctx),
            game_id,
            player: player_addr,
            difficulty,
            stake_amount,
            target_score,
            final_score: 0,
            won: false,
            state: STATE_IN_PROGRESS,
            created_at: clock::timestamp_ms(clock),
            finished_at: 0,
            escrow: coin::into_balance(payment),
        };
        
        // Store game in lobby
        df::add(&mut solo_lobby.id, game_id, game);
        
        // Update stats
        solo_lobby.total_solo_volume = solo_lobby.total_solo_volume + stake_amount;
        
        event::emit(SoloGameCreatedEvent {
            game_id,
            player: player_addr,
            difficulty,
            stake_amount,
            target_score,
        });
    }

    /// Admin completes a solo game - called by backend after game ends
    /// If player reached target score, they win 2x stake (minus platform fee)
    /// If player failed, they lose their stake
    public fun complete_solo_game<T>(
        solo_lobby: &mut SoloGameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        final_score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let admin = tx_context::sender(ctx);
        assert!(admin == solo_lobby.admin, E_NOT_ADMIN);
        assert!(df::exists_(&solo_lobby.id, game_id), E_SOLO_GAME_NOT_FOUND);
        
        let game: &mut SoloGame<T> = df::borrow_mut(&mut solo_lobby.id, game_id);
        assert!(game.state == STATE_IN_PROGRESS, E_SOLO_GAME_ALREADY_FINISHED);
        
        game.final_score = final_score;
        game.state = STATE_FINISHED;
        game.finished_at = clock::timestamp_ms(clock);
        
        // Check if player won (reached target score)
        let won = final_score >= game.target_score;
        game.won = won;
        
        let player_addr = game.player;
        let stake = game.stake_amount;
        
        // Initialize player stats if needed
        initialize_player_stats(stats_registry, player_addr, ctx);
        
        // Update player stats
        {
            let player_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, player_addr);
            player_stats.games_played = player_stats.games_played + 1;
            player_stats.total_wagered = player_stats.total_wagered + stake;
            
            if (won) {
                player_stats.games_won = player_stats.games_won + 1;
            };
        };
        
        let payout: u64;
        
        if (won) {
            // Winner gets 2x stake minus 2% platform fee
            // Platform keeps the 2% of winnings
            let total_payout = stake * 2;
            let platform_fee = total_payout * 2 / 100; // 2%
            payout = total_payout - platform_fee;
            
            // Transfer winnings to player
            let winnings_balance = balance::split(&mut game.escrow, stake); // Original stake
            let winnings_coin = coin::from_balance(winnings_balance, ctx);
            transfer::public_transfer(winnings_coin, player_addr);
            
            // Platform fee (remaining escrow)
            let fee_balance = balance::withdraw_all(&mut game.escrow);
            if (balance::value(&fee_balance) > 0) {
                let fee_coin = coin::from_balance(fee_balance, ctx);
                transfer::public_transfer(fee_coin, solo_lobby.admin);
            } else {
                balance::destroy_zero(fee_balance);
            };
            
            // Update stats
            {
                let player_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, player_addr);
                player_stats.total_winnings = player_stats.total_winnings + payout;
            };
        } else {
            // Loser: platform takes all stake
            payout = 0;
            let lost_balance = balance::withdraw_all(&mut game.escrow);
            let lost_coin = coin::from_balance(lost_balance, ctx);
            transfer::public_transfer(lost_coin, solo_lobby.admin);
        };
        
        solo_lobby.total_solo_games = solo_lobby.total_solo_games + 1;
        
        event::emit(SoloGameCompletedEvent {
            game_id,
            player: player_addr,
            final_score,
            won,
            payout,
        });
    }

    /// Get solo game info
    public fun get_solo_game_state<T>(solo_lobby: &SoloGameLobby, game_id: u64): (address, u8, u64, u64, u8) {
        let game: &SoloGame<T> = df::borrow(&solo_lobby.id, game_id);
        (game.player, game.difficulty, game.stake_amount, game.target_score, game.state)
    }

    /// Get solo lobby stats
    public fun get_solo_lobby_stats(solo_lobby: &SoloGameLobby): (u64, u64) {
        (solo_lobby.total_solo_games, solo_lobby.total_solo_volume)
    }

    #[test_only]
    public fun initialize(ctx: &mut TxContext){
        init(ctx);
    }
}