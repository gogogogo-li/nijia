module ninja_addr::multiplayer_game {
    use one::object::{Self, UID, ID};
    use one::tx_context::{Self, TxContext};
    use one::transfer;
    use one::coin::{Self, Coin};
    use one::balance::{Self, Balance};
    use one::event;
    use one::clock::{Self, Clock};
    use one::dynamic_field as df;
    use std::vector;

    // Bet tiers (in MIST, 1 OCT = 1,000,000,000 MIST)
    const BET_TIER_1: u64 = 100000000;    // 0.1 OCT
    const BET_TIER_2: u64 = 500000000;    // 0.5 OCT
    const BET_TIER_3: u64 = 1000000000;   // 1 OCT
    const BET_TIER_4: u64 = 5000000000;   // 5 OCT

    // Game states
    const STATE_WAITING: u8 = 0;
    const STATE_IN_PROGRESS: u8 = 1;
    const STATE_FINISHED: u8 = 2;

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_GAME_NOT_FOUND: u64 = 3;
    const E_GAME_ALREADY_STARTED: u64 = 4;
    const E_NOT_YOUR_GAME: u64 = 5;
    const E_GAME_NOT_IN_PROGRESS: u64 = 6;
    const E_ALREADY_SUBMITTED: u64 = 7;
    const E_INVALID_BET_TIER: u64 = 8;
    const E_INSUFFICIENT_BALANCE: u64 = 9;
    const E_GAME_FULL: u64 = 10;
    const E_CANNOT_JOIN_OWN_GAME: u64 = 11;
    const E_NOT_ADMIN: u64 = 12;

    // Structs
    public struct MultiplayerGame<phantom T> has key, store {
        id: UID,
        game_id: u64,
        bet_amount: u64,
        player1: address,
        player2: address,
        player1_score: u64,
        player2_score: u64,
        player1_finished: bool,
        player2_finished: bool,
        winner: address,
        state: u8,
        created_at: u64,
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
        games_played: u64,
        games_won: u64,
        total_wagered: u64,
        total_winnings: u64,
        current_game_id: u64,
    }

    // Events
    public struct GameCreatedEvent has copy, drop {
        game_id: u64,
        creator: address,
        bet_amount: u64,
        game_lobby: ID,
    }

    public struct GameJoinedEvent has copy, drop {
        game_id: u64,
        player: address,
        bet_amount: u64,
        game_lobby: ID,
    }

    public struct GameFinishedEvent has copy, drop {
        game_id: u64,
        winner: address,
        prize: u64,
        game_lobby: ID,
    }

    // Initialize the game lobby
    public fun initialize(ctx: &mut TxContext) {
        
    }

    // Create a new multiplayer game
    public fun create_game<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        bet_tier: u64,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let player_addr = tx_context::sender(ctx);

        // Validate bet tier
        assert!(bet_tier <= 3, E_INVALID_BET_TIER);

        // Calculate bet amount based on tier
        let bet_amount = if (bet_tier == 0) {
            BET_TIER_1
        } else if (bet_tier == 1) {
            BET_TIER_2
        } else if (bet_tier == 2) {
            BET_TIER_3
        } else {
            BET_TIER_4
        };

        // Check payment amount
        assert!(coin::value(&payment) >= bet_amount, E_INSUFFICIENT_BALANCE);

        // Create new game
        let game_id = lobby.next_game_id;
        lobby.next_game_id = lobby.next_game_id + 1;

        let game = MultiplayerGame<T> {
            id: object::new(ctx),
            game_id,
            bet_amount,
            player1: player_addr,
            player2: @0x0,
            player1_score: 0,
            player2_score: 0,
            player1_finished: false,
            player2_finished: false,
            winner: @0x0,
            state: STATE_WAITING,
            created_at: clock::timestamp_ms(clock),
            finished_at: 0,
            escrow: coin::into_balance(payment),
        };

        // Store game as dynamic field
        df::add(&mut lobby.id, game_id, game);

        // Add to available games
        vector::push_back(&mut lobby.available_games, game_id);

        let lobby_id = lobby.id.uid_to_inner();

        // Emit event
        event::emit(GameCreatedEvent {
            game_id: game.game_id,
            creator: player_addr,
            bet_amount: game.bet_amount,
            game_lobby: lobby_id,
        });
    }

    // Join an existing game
    public fun join_game<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let player_addr = tx_context::sender(ctx);

        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);

        let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
        assert!(game.state == STATE_WAITING, E_GAME_ALREADY_STARTED);
        assert!(game.player2 == @0x0, E_GAME_FULL);
        assert!(game.player1 != player_addr, E_CANNOT_JOIN_OWN_GAME);
        
        // Check payment amount
        assert!(coin::value(&payment) == game.bet_amount, E_INSUFFICIENT_BALANCE);

        // Deposit bet to escrow
        let paid = coin::into_balance(payment);
        balance::join(&mut game.escrow, paid);

        // Update game
        game.player2 = player_addr;
        game.state = STATE_IN_PROGRESS;

        lobby.total_volume = lobby.total_volume + (game.bet_amount * 2);

        // Initialize or update player stats
        if (!df::exists_(&stats_registry.id, player_addr)) {
            let stats = PlayerStats {
                id: object::new(ctx),
                games_played: 0,
                games_won: 0,
                total_wagered: game.bet_amount,
                total_winnings: 0,
                current_game_id: game_id,
            };
            df::add(&mut stats_registry.id, player_addr, stats);
        } else {
            let player_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, player_addr);
            player_stats.total_wagered = player_stats.total_wagered + game.bet_amount;
            player_stats.current_game_id = game_id;
        };

        let lobby_id = lobby.id.uid_to_inner();
        // Emit event
        event::emit(GameJoinedEvent {
            game_id: game.game_id,
            player: player_addr,
            bet_amount: game.bet_amount,
            game_lobby: lobby_id
        });
    }

    // Submit final score
    public fun submit_score<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        final_score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        
    }

    // Helper function to finish a game and distribute prizes
    fun finish_game<T>(
        lobby: &mut GameLobby,
        stats_registry: &mut StatsRegistry,
        game_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        
    }


    // View functions

    // public fun get_available_games(lobby: &GameLobby): vector<u64> {
    //     0
    // }

    // public fun get_player_stats(stats_registry: &StatsRegistry, player_addr: address): (u64, u64, u64, u64, u64) {
    //     (0,0,0,0)
    // }

}