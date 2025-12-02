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
        let lobby_id = lobby.id.uid_to_inner();

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
            finished_at: 0,
            escrow: coin::into_balance(payment),
        };
        // Store game as dynamic field
        df::add(&mut lobby.id, game_id, game);

        // Add to available games
        vector::push_back(&mut lobby.available_games, game_id);


        // Emit event
        event::emit(GameCreatedEvent {
            game_id: game_id_event,
            creator: player_addr,
            bet_amount: bet_amount,
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
        let lobby_id = lobby.id.uid_to_inner();

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
        player1_address: address,
        player2_address: address,
        player1_score: u64,
        player2_score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let admin = tx_context::sender(ctx);
        let lobby_id = lobby.id.uid_to_inner();

        assert!(admin == lobby.admin, E_NOT_ADMIN);
        assert!(game_id < lobby.next_game_id, E_GAME_NOT_FOUND);

        let game: &mut MultiplayerGame<T> = df::borrow_mut(&mut lobby.id, game_id);
        assert!(game.state == STATE_IN_PROGRESS, E_GAME_NOT_IN_PROGRESS);
        assert!(player1_address == game.player1 || player2_address == game.player2, E_NOT_YOUR_GAME);

        // Record score
        game.player1_score = player1_score;
        game.player2_score = player2_score;

         // Initialize or update player stats
        let mut player1_stats;
        let mut player2_stats;
        if (!df::exists_(&stats_registry.id, player1_address)) {
            let stats = PlayerStats {
                id: object::new(ctx),
                address: player1_address,
                games_played: 0,
                games_won: 0,
                total_wagered: game.bet_amount,
                total_winnings: 0,
            };
            df::add(&mut stats_registry.id, player1_address, stats);
        };
        if (!df::exists_(&stats_registry.id, player2_address)) {
            let stats = PlayerStats {
                id: object::new(ctx),
                address: player2_address,
                games_played: 0,
                games_won: 0,
                total_wagered: game.bet_amount,
                total_winnings: 0,
            };
            df::add(&mut stats_registry.id, player2_address, stats);
        };

        lobby.total_games_played = lobby.total_games_played + 1;
        // Update wagered amounts (borrow one at a time to avoid conflicting mutable borrows)
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
            // Tie - refund both players
            let refund1 = balance::split(&mut game.escrow, game.bet_amount);
            let refund1_coin = coin::from_balance(refund1, ctx);
            transfer::public_transfer(refund1_coin, game.player1);

            let refund2 = balance::withdraw_all(&mut game.escrow);
            let refund2_coin = coin::from_balance(refund2, ctx);
            transfer::public_transfer(refund2_coin, game.player2);

            return
        };

        // Determine winner and loser addresses
        let (winner_addr, loser_addr) = if (game.player1_score > game.player2_score) {
            (game.player1, game.player2)
        } else {
            (game.player2, game.player1)
        };

        game.winner = winner_addr;
        let prize = game.bet_amount * 2;

        // Transfer prize to winner
        let prize_balance = balance::withdraw_all(&mut game.escrow);
        let prize_coin = coin::from_balance(prize_balance, ctx);
        transfer::public_transfer(prize_coin, winner_addr);

        // Update winner stats
        {
            let winner_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, winner_addr);
            winner_stats.games_played = winner_stats.games_played + 1;
            winner_stats.games_won = winner_stats.games_won + 1;
            winner_stats.total_winnings = winner_stats.total_winnings + prize;
        };

        // Update loser stats
        {
            let loser_stats: &mut PlayerStats = df::borrow_mut(&mut stats_registry.id, loser_addr);
            loser_stats.games_played = loser_stats.games_played + 1;
        };

        // Emit event
        if (game.winner != @0x0) {
            event::emit(GameFinishedEvent {
                game_id: game.game_id,
                winner: game.winner,
                prize: game.bet_amount * 2,
                game_lobby: lobby_id
            });
        };
    }
}