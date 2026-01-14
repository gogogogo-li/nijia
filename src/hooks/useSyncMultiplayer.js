/**
 * Synchronized Multiplayer Game Hook
 * Handles shared-environment gameplay where all players see same items
 * First to slash gets the points - race to 400!
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import multiplayerService from '../services/multiplayerService';
import { FRUIT_TYPES, BOMB_CONFIG, MULTIPLAYER_CONFIG } from '../config/gameConfig';

export const useSyncMultiplayer = (roomId, walletAddress, canvasRef) => {
    const [syncItems, setSyncItems] = useState([]);
    const [myScore, setMyScore] = useState(0);
    const [myLives, setMyLives] = useState(MULTIPLAYER_CONFIG.livesEnabled ? 3 : 999);
    const [players, setPlayers] = useState([]);
    const [milestoneReached, setMilestoneReached] = useState(null);
    const [gameEnded, setGameEnded] = useState(false);
    const [winner, setWinner] = useState(null);
    const [announcement, setAnnouncement] = useState(null);

    const syncActive = useRef(false);
    const spawnIntervalRef = useRef(null);

    // Convert server item to display format
    const convertToDisplayItem = useCallback((serverItem) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const fruit = serverItem.fruit || FRUIT_TYPES[0];
        const isBomb = serverItem.type === 'bomb';

        return {
            id: serverItem.id,
            x: serverItem.spawnX * canvas.width,
            y: canvas.height + 50,
            vx: (Math.random() - 0.5) * 4,
            vy: -(12 + serverItem.velocity * 6),
            radius: 35 * (fruit.size || 1),
            hitBox: 50 * (fruit.size || 1),
            type: {
                name: fruit.name,
                symbol: fruit.emoji,
                color: fruit.color,
                isGood: !isBomb,
                points: fruit.points || 10
            },
            token: {
                name: fruit.name,
                color: fruit.color,
                ringColor: fruit.color
            },
            gravity: 0.35,
            slashed: false,
            slashedBy: null,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.15,
            scale: 1
        };
    }, [canvasRef]);

    // Handle incoming spawn batch from server
    const handleSyncSpawn = useCallback((data) => {
        if (!syncActive.current) return;

        console.log('🍎 Received sync spawn:', data.pattern, data.items?.length);

        if (data.announcement) {
            setAnnouncement(data.announcement);
            setTimeout(() => setAnnouncement(null), 2000);
        }

        const newItems = data.items?.map(convertToDisplayItem).filter(Boolean) || [];
        setSyncItems(prev => [...prev, ...newItems]);
    }, [convertToDisplayItem]);

    // Handle item slashed by any player
    const handleSyncSlashed = useCallback((data) => {
        const { itemId, slashedBy, points, isBomb, fruit } = data;

        // Update item state
        setSyncItems(prev => prev.map(item =>
            item.id === itemId
                ? { ...item, slashed: true, slashedBy }
                : item
        ));

        // If I slashed it, update my score
        const isMe = slashedBy.toLowerCase() === walletAddress.toLowerCase();
        if (isMe) {
            if (isBomb) {
                setMyLives(prev => Math.max(0, prev - 1));
            } else {
                setMyScore(prev => prev + points);
            }
        }

        // Update players leaderboard
        setPlayers(prev => prev.map(p =>
            p.address.toLowerCase() === slashedBy.toLowerCase()
                ? { ...p, score: p.score + points }
                : p
        ));
    }, [walletAddress]);

    // Handle milestone announcements
    const handleSyncMilestone = useCallback((data) => {
        const { playerAddress, milestone, message } = data;
        setMilestoneReached({ player: playerAddress, milestone, message });
        setAnnouncement(message);
        setTimeout(() => {
            setAnnouncement(null);
            setMilestoneReached(null);
        }, 3000);
    }, []);

    // Handle game end
    const handleGameEnd = useCallback((data) => {
        setGameEnded(true);
        setWinner(data.winner);
        syncActive.current = false;
    }, []);

    // Attempt to slash an item
    const attemptSlash = useCallback(async (itemId) => {
        if (!syncActive.current || !roomId) return { success: false };

        const result = await multiplayerService.attemptSlash(roomId, itemId);
        return result;
    }, [roomId]);

    // Start sync mode
    const startSync = useCallback(() => {
        if (!roomId) return;

        console.log('🔄 Starting sync mode for room:', roomId);
        syncActive.current = true;

        // Join room channel
        multiplayerService.joinRoomChannel(roomId);

        // Setup listeners
        multiplayerService.setupRoomListeners({
            onSyncSpawn: handleSyncSpawn,
            onSyncSlashed: handleSyncSlashed,
            onSyncMilestone: handleSyncMilestone,
            onSyncBomb: (data) => {
                if (data.playerAddress.toLowerCase() === walletAddress.toLowerCase()) {
                    setMyLives(data.livesRemaining);
                }
            },
            onGameEnd: handleGameEnd,
            onScoreUpdate: (data) => {
                setPlayers(prev => prev.map(p =>
                    p.address.toLowerCase() === data.playerAddress.toLowerCase()
                        ? { ...p, score: data.score, lives: data.lives }
                        : p
                ));
            }
        });

        // Request spawn batches periodically
        spawnIntervalRef.current = setInterval(() => {
            if (syncActive.current) {
                multiplayerService.requestSpawnBatch(roomId);
            }
        }, MULTIPLAYER_CONFIG.syncSpawnInterval || 800);

    }, [roomId, walletAddress, handleSyncSpawn, handleSyncSlashed, handleSyncMilestone, handleGameEnd]);

    // Stop sync mode
    const stopSync = useCallback(() => {
        console.log('🛑 Stopping sync mode');
        syncActive.current = false;

        if (spawnIntervalRef.current) {
            clearInterval(spawnIntervalRef.current);
        }

        if (roomId) {
            multiplayerService.leaveRoomChannel(roomId);
        }

        multiplayerService.clearRoomListeners();
    }, [roomId]);

    // Update items physics
    const updateSyncItems = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setSyncItems(prev => {
            return prev.map(item => {
                if (item.slashed) return item;

                // Apply physics
                const newVy = item.vy + item.gravity;
                const newY = item.y + newVy;
                const newX = item.x + item.vx;
                const newRotation = item.rotation + item.rotationSpeed;

                return {
                    ...item,
                    x: newX,
                    y: newY,
                    vy: newVy,
                    rotation: newRotation
                };
            }).filter(item => {
                // Remove items that fell off screen
                return item.y < canvas.height + 100 || item.slashed;
            });
        });
    }, [canvasRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSync();
        };
    }, [stopSync]);

    return {
        syncItems,
        myScore,
        myLives,
        players,
        announcement,
        milestoneReached,
        gameEnded,
        winner,
        startSync,
        stopSync,
        attemptSlash,
        updateSyncItems,
        isActive: syncActive.current
    };
};

export default useSyncMultiplayer;
