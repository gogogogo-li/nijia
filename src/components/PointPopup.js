import React, { useEffect, useState } from 'react';
import './PointPopup.css';

const PointPopup = ({ popups, onRemovePopup }) => {
  return (
    <div className="point-popup-container">
      {popups.map((popup) => (
        <PopupItem 
          key={popup.id} 
          popup={popup} 
          onRemove={onRemovePopup}
        />
      ))}
    </div>
  );
};

const PopupItem = ({ popup, onRemove }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Start fade out animation after a short delay
    const fadeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 200);

    // Remove popup after animation completes
    const removeTimer = setTimeout(() => {
      onRemove(popup.id);
    }, 1200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [popup.id, onRemove]);

  return (
    <div 
      className={`point-popup ${isVisible ? 'show' : 'fade'} ${popup.type === 'bomb' ? 'bomb-popup' : popup.type === 'combo' ? 'combo-popup' : 'token-popup'}`}
      style={{
        left: popup.x,
        top: popup.y,
      }}
    >
      {popup.type === 'combo' ? (
        <div className="combo-popup">
          <div className="combo-text">X{popup.combo}</div>
          <div className="combo-bonus">+{popup.points}</div>
        </div>
      ) : (
        <div className="point-value">
          {popup.type === 'bomb' ? '-1 Life' : `+${popup.points}`}
        </div>
      )}
    </div>
  );
};

export default PointPopup;