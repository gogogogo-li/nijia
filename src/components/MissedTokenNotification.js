import React, { useEffect, useState } from 'react';
import './MissedTokenNotification.css';

const MissedTokenNotification = ({ notifications, onRemoveNotification }) => {
  return (
    <div className="missed-token-notification-container">
      {notifications.map((notification) => (
        <MissedNotificationItem 
          key={notification.id} 
          notification={notification} 
          onRemove={onRemoveNotification}
        />
      ))}
    </div>
  );
};

const MissedNotificationItem = ({ notification, onRemove }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Start fade out animation after a short delay
    const fadeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 300);

    // Remove notification after animation completes
    const removeTimer = setTimeout(() => {
      onRemove(notification.id);
    }, 1500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [notification.id, onRemove]);

  return (
    <div 
      className={`missed-token-notification ${isVisible ? 'show' : 'fade'}`}
    >
      <div className="missed-icon">⚡</div>
      <div className="missed-text">Token Missed!</div>
      <div className="missed-penalty">-20 Health</div>
    </div>
  );
};

export default MissedTokenNotification;