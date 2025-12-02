import { useState, useCallback } from 'react';

export const useMissedTokenNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  const addMissedNotification = useCallback(() => {
    const newNotification = {
      id: Date.now() + Math.random(),
      timestamp: Date.now()
    };

    setNotifications(prev => [...prev, newNotification]);
  }, []);

  const removeMissedNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAllMissedNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addMissedNotification,
    removeMissedNotification,
    clearAllMissedNotifications
  };
};