import { useState, useCallback } from 'react';

export const usePointPopups = () => {
  const [popups, setPopups] = useState([]);

  const addPopup = useCallback((x, y, points, type = 'token', combo = null) => {
    const newPopup = {
      id: Date.now() + Math.random(),
      x: x,
      y: y,
      points: points,
      type: type, // 'token', 'bomb', or 'combo'
      combo: combo, // combo count for combo popups
      timestamp: Date.now()
    };

    setPopups(prev => [...prev, newPopup]);
  }, []);

  const removePopup = useCallback((id) => {
    setPopups(prev => prev.filter(popup => popup.id !== id));
  }, []);

  const clearAllPopups = useCallback(() => {
    setPopups([]);
  }, []);

  return {
    popups,
    addPopup,
    removePopup,
    clearAllPopups
  };
};