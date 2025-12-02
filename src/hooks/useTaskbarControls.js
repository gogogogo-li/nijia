import { useEffect, useCallback } from 'react';

export const useTaskbarControls = (gameState, onTogglePause) => {
  const handleKeyPress = useCallback((event) => {
    // Only respond to keyboard events when game is running
    if (gameState.screen !== 'game' || !gameState.isGameRunning) return;
    
    // Space bar or 'P' key to toggle pause
    if (event.code === 'Space' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, onTogglePause]);

  const handleVisibilityChange = useCallback(() => {
    // Auto-pause when tab becomes hidden, but don't auto-resume
    if (document.hidden && gameState.screen === 'game' && gameState.isGameRunning && !gameState.isPaused) {
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, onTogglePause]);

  const handleWindowBlur = useCallback(() => {
    // Auto-pause when window loses focus
    if (gameState.screen === 'game' && gameState.isGameRunning && !gameState.isPaused) {
      onTogglePause();
    }
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, onTogglePause]);

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