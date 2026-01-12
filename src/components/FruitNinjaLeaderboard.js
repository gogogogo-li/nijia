import React, { useState, useEffect, useCallback } from 'react';
import onechainService from '../services/onechainService';
import BladeCursor from './BladeCursor';
import './FruitNinjaLeaderboard.css';

const FruitNinjaLeaderboard = ({ onClose, walletAddress }) => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('all-time');
    const [mode, setMode] = useState('all');
    const [playerStats, setPlayerStats] = useState(null);
    const [playerRank, setPlayerRank] = useState(null);

    const loadLeaderboard = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await onechainService.getLeaderboard({ period, mode, limit: 100 });
            setLeaderboard(data);

            // Find player's rank if wallet is connected
            if (walletAddress) {
                const rank = data.findIndex(
                    (entry) => entry.wallet_address?.toLowerCase() === walletAddress.toLowerCase()
                );
                setPlayerRank(rank >= 0 ? rank + 1 : null);
            }
        } catch (err) {
            setError('Failed to load leaderboard');
            console.error('Leaderboard error:', err);
        }

        setLoading(false);
    }, [period, mode, walletAddress]);

    const loadPlayerStats = useCallback(async () => {
        if (!walletAddress) return;

        try {
            const stats = await onechainService.getPlayerLeaderboardStats(walletAddress, { period, mode });
            setPlayerStats(stats);
        } catch (err) {
            console.error('Failed to load player stats:', err);
        }
    }, [walletAddress, period, mode]);

    useEffect(() => {
        loadLeaderboard();
        loadPlayerStats();
    }, [loadLeaderboard, loadPlayerStats]);

    const formatAddress = (address) => {
        if (!address) return 'Unknown';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getRankDisplay = (rank) => {
        switch (rank) {
            case 1:
                return <span className="rank-medal gold">🥇</span>;
            case 2:
                return <span className="rank-medal silver">🥈</span>;
            case 3:
                return <span className="rank-medal bronze">🥉</span>;
            default:
                return <span className="rank-number">{rank}</span>;
        }
    };

    const periodTabs = [
        { id: 'daily', label: 'Daily', icon: '☀️' },
        { id: 'weekly', label: 'Weekly', icon: '📅' },
        { id: 'all-time', label: 'All Time', icon: '🏆' }
    ];

    const modeTabs = [
        { id: 'all', label: 'All Modes' },
        { id: 'multiplayer', label: 'Multiplayer' },
        { id: 'solo', label: 'Solo Stakes' }
    ];

    return (
        <div className="fn-leaderboard-overlay">
            {/* Blade Cursor - Only shows inside leaderboard */}
            <BladeCursor />
            <div className="fn-leaderboard-container">
                {/* Header */}
                <div className="fn-leaderboard-header">
                    <button className="fn-close-btn" onClick={onClose}>
                        ✕
                    </button>
                    <div className="fn-header-content">
                        <h1 className="fn-title">
                            <span className="fn-title-icon">🏆</span>
                            Leaderboard
                        </h1>
                        <p className="fn-subtitle">Top ninja warriors worldwide</p>
                    </div>
                </div>

                {/* Period Tabs */}
                <div className="fn-tabs-container">
                    <div className="fn-period-tabs">
                        {periodTabs.map((tab) => (
                            <button
                                key={tab.id}
                                className={`fn-tab ${period === tab.id ? 'active' : ''}`}
                                onClick={() => setPeriod(tab.id)}
                            >
                                <span className="fn-tab-icon">{tab.icon}</span>
                                <span className="fn-tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Mode Filter */}
                    <div className="fn-mode-filter">
                        <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                            className="fn-mode-select"
                        >
                            {modeTabs.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Player Stats Bar */}
                {walletAddress && playerStats && (
                    <div className="fn-player-stats-bar">
                        <div className="fn-stat-item">
                            <span className="fn-stat-label">Your Rank</span>
                            <span className="fn-stat-value highlight">
                                {playerRank ? `#${playerRank}` : '-'}
                            </span>
                        </div>
                        <div className="fn-stat-item">
                            <span className="fn-stat-label">High Score</span>
                            <span className="fn-stat-value">{playerStats.high_score?.toLocaleString() || 0}</span>
                        </div>
                        <div className="fn-stat-item">
                            <span className="fn-stat-label">Games</span>
                            <span className="fn-stat-value">{playerStats.total_games || 0}</span>
                        </div>
                        <div className="fn-stat-item">
                            <span className="fn-stat-label">Win Rate</span>
                            <span className="fn-stat-value">{playerStats.win_rate || 0}%</span>
                        </div>
                    </div>
                )}

                {/* Leaderboard Content */}
                <div className="fn-leaderboard-content">
                    {loading ? (
                        <div className="fn-loading">
                            <div className="fn-spinner"></div>
                            <p>Loading rankings...</p>
                        </div>
                    ) : error ? (
                        <div className="fn-error">
                            <p>{error}</p>
                            <button onClick={loadLeaderboard} className="fn-retry-btn">
                                Try Again
                            </button>
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <div className="fn-empty">
                            <span className="fn-empty-icon">🍃</span>
                            <p>No scores yet for this period</p>
                            <p className="fn-empty-sub">Be the first to make the cut!</p>
                        </div>
                    ) : (
                        <div className="fn-table-wrapper">
                            <table className="fn-table">
                                <thead>
                                    <tr>
                                        <th className="fn-th-rank">Rank</th>
                                        <th className="fn-th-player">Player</th>
                                        <th className="fn-th-score">High Score</th>
                                        <th className="fn-th-games">Games</th>
                                        <th className="fn-th-wins">Wins</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, index) => {
                                        const isCurrentPlayer =
                                            walletAddress &&
                                            entry.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
                                        const rank = entry.rank || index + 1;

                                        return (
                                            <tr
                                                key={entry.wallet_address || index}
                                                className={`fn-row ${isCurrentPlayer ? 'current-player' : ''} ${rank <= 3 ? `top-${rank}` : ''
                                                    }`}
                                            >
                                                <td className="fn-td-rank">{getRankDisplay(rank)}</td>
                                                <td className="fn-td-player">
                                                    <div className="fn-player-info">
                                                        <span className="fn-player-address">
                                                            {formatAddress(entry.wallet_address)}
                                                        </span>
                                                        {isCurrentPlayer && <span className="fn-you-badge">YOU</span>}
                                                    </div>
                                                </td>
                                                <td className="fn-td-score">
                                                    <span className="fn-score-value">
                                                        {entry.high_score?.toLocaleString() || 0}
                                                    </span>
                                                </td>
                                                <td className="fn-td-games">{entry.games_played || 0}</td>
                                                <td className="fn-td-wins">{entry.wins || 0}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="fn-leaderboard-footer">
                    <button onClick={loadLeaderboard} className="fn-refresh-btn" disabled={loading}>
                        <span className="fn-refresh-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FruitNinjaLeaderboard;
