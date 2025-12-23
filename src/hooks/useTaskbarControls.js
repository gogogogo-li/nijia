import { useEffect, useCallback } from 'react';

export const useTaskbarControls = (gameState, onTogglePause, multiplayerGameId = null) => {
  const handleKeyPress = useCallback((event) => {
    // Only respond to keyboard events when game is running
    if (gameState.screen !== 'game' || !gameState.isGameRunning) return;

    // DISABLE pause in multiplayer mode
    if (multiplayerGameId) return;

    // Space bar or 'P' key to toggle pause
    if (event.code === 'Space' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, onTogglePause, multiplayerGameId]);

  const handleVisibilityChange = useCallback(() => {
    // DISABLE auto-pause in multiplayer mode
    if (multiplayerGameId) return;

    // Auto-pause when tab becomes hidden, but don't auto-resume
    if (document.hidden && gameState.screen === 'game' && gameState.isGameRunning && !gameState.isPaused) {
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, onTogglePause, multiplayerGameId]);

  const handleWindowBlur = useCallback(() => {
    // DISABLE auto-pause in multiplayer mode
    if (multiplayerGameId) return;

    // Auto-pause when window loses focus
    if (gameState.screen === 'game' && gameState.isGameRunning && !gameState.isPaused) {
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, onTogglePause, multiplayerGameId]);

  useEffect(() => {
    // Add keyboard event listeners
    document.addEventListener('keydown', handleKeyPress);

    // Add visibility and focus event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [handleKeyPress, handleVisibilityChange, handleWindowBlur]);

  // Return keyboard shortcuts info for display
  return {
    shortcuts: [
      { key: 'Space', action: 'Toggle Pause' },
      { key: 'P', action: 'Toggle Pause' }
    ]
  };
};