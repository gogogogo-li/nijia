/// OneNinja Game NFT Module
/// Mint achievement and welcome NFTs for players
module ninja_addr::game_nft {
    use one::object::{Self, UID, ID};
    use one::tx_context::{Self, TxContext};
    use one::event;
    use one::url::{Self, Url};
    use one::transfer;
    use one::clock::{Self, Clock};
    use std::string::{Self, String};
    
    // ======== Error Codes ========
    const E_INVALID_NFT_TYPE: u64 = 1;

    // ======== NFT Types ========
    const NFT_TYPE_WELCOME: u8 = 0;
    const NFT_TYPE_ACHIEVEMENT: u8 = 1;
    const NFT_TYPE_WINNER: u8 = 2;

    // ======== Structs ========
    
    /// Game NFT - represents an achievement or collectible from OneNinja
    public struct GameNFT has key, store {
        id: UID,
        /// NFT name (e.g., "OneNinja Welcome Badge" or "Gold Tier Achievement")
        name: String,
        /// Description of the NFT
        description: String,
        /// URL to the NFT image (IPFS, Arweave, or CDN)
        image_url: Url,
        /// NFT type: 0=welcome, 1=achievement, 2=winner
        nft_type: u8,
        /// Tier name (e.g., "Bronze", "Silver", "Gold")
        tier: String,
        /// Score achieved when earning this NFT
        score: u64,
        /// Timestamp when NFT was minted
        minted_at: u64,
    }

    // ======== Events ========
    
    public struct NFTMinted has copy, drop {
        nft_id: ID,
        owner: address,
        nft_type: u8,
        tier: String,
        score: u64,
    }

    // ======== Public Entry Functions ========

    /// Mint a welcome NFT for new players
    public entry fun mint_welcome_nft(
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let nft = GameNFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: string::utf8(description),
            image_url: url::new_unsafe_from_bytes(image_url),
            nft_type: NFT_TYPE_WELCOME,
            tier: string::utf8(b"Welcome"),
            score: 0,
            minted_at: clock::timestamp_ms(clock),
        };
        
        let nft_id = object::uid_to_inner(&nft.id);
        let owner = tx_context::sender(ctx);
        
        event::emit(NFTMinted {
            nft_id,
            owner,
            nft_type: NFT_TYPE_WELCOME,
            tier: string::utf8(b"Welcome"),
            score: 0,
        });
        
        transfer::transfer(nft, owner);
    }

    /// Mint an achievement NFT for reaching a tier
    public entry fun mint_achievement_nft(
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        tier: vector<u8>,
        score: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let nft = GameNFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: string::utf8(description),
            image_url: url::new_unsafe_from_bytes(image_url),
            nft_type: NFT_TYPE_ACHIEVEMENT,
            tier: string::utf8(tier),
            score,
            minted_at: clock::timestamp_ms(clock),
        };
        
        let nft_id = object::uid_to_inner(&nft.id);
        let owner = tx_context::sender(ctx);
        
        event::emit(NFTMinted {
            nft_id,
            owner,
            nft_type: NFT_TYPE_ACHIEVEMENT,
            tier: string::utf8(tier),
            score,
        });
        
        transfer::transfer(nft, owner);
    }

    /// Mint a winner NFT for multiplayer victories
    public entry fun mint_winner_nft(
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        winner_score: u64,
        loser_score: u64,
        prize_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let description_with_stats = string::utf8(description);
        
        let nft = GameNFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: description_with_stats,
            image_url: url::new_unsafe_from_bytes(image_url),
            nft_type: NFT_TYPE_WINNER,
            tier: string::utf8(b"Winner"),
            score: winner_score,
            minted_at: clock::timestamp_ms(clock),
        };
        
        let nft_id = object::uid_to_inner(&nft.id);
        let owner = tx_context::sender(ctx);
        
        event::emit(NFTMinted {
            nft_id,
            owner,
            nft_type: NFT_TYPE_WINNER,
            tier: string::utf8(b"Winner"),
            score: winner_score,
        });
        
        transfer::transfer(nft, owner);
    }

    // ======== View Functions ========
    
    public fun get_nft_name(nft: &GameNFT): &String {
        &nft.name
    }
    
    public fun get_nft_type(nft: &GameNFT): u8 {
        nft.nft_type
    }
    
    public fun get_nft_tier(nft: &GameNFT): &String {
        &nft.tier
    }
    
    public fun get_nft_score(nft: &GameNFT): u64 {
        nft.score
    }
}
