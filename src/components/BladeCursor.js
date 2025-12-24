import React, { useState, useEffect, useRef } from 'react';

/**
 * BladeCursor Component
 * 
 * @component
 * @description Custom cursor component that displays an ice blade following mouse/touch movements
 * Rotates based on movement direction for a dynamic slashing effect
 * Supports both desktop (mouse) and mobile (touch) devices
 */
const BladeCursor = () => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [rotation, setRotation] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [velocity, setVelocity] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const lastPositionRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(Date.now());
  const movingTimeoutRef = useRef(null);

  useEffect(() => {
    const updateCursor = (newX, newY) => {
      const currentTime = Date.now();
      const timeDelta = currentTime - lastMoveTimeRef.current;

      // Calculate angle based on movement direction
      const deltaX = newX - lastPositionRef.current.x;
      const deltaY = newY - lastPositionRef.current.y;

      if (deltaX !== 0 || deltaY !== 0) {
        // Calculate velocity for scaling effect
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const speed = timeDelta > 0 ? distance / timeDelta : 0;
        setVelocity(Math.min(speed * 2, 3)); // Cap velocity for scaling

        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        setRotation(angle + 45); // Offset by 45 degrees to align blade tip with movement
        lastPositionRef.current = { x: newX, y: newY };
        setIsMoving(true);
        setIsVisible(true);

        clearTimeout(movingTimeoutRef.current);
        movingTimeoutRef.current = setTimeout(() => {
          setIsMoving(false);
          setVelocity(0);
        }, 100);
      }

      setPosition({ x: newX, y: newY });
      lastMoveTimeRef.current = currentTime;
    };

    const handleMouseMove = (e) => {
      updateCursor(e.clientX, e.clientY);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        updateCursor(touch.clientX, touch.clientY);
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        lastPositionRef.current = { x: touch.clientX, y: touch.clientY };
        setPosition({ x: touch.clientX, y: touch.clientY });
        setIsVisible(true);
      }
    };

    const handleTouchEnd = () => {
      // Hide cursor when touch ends on mobile
      setIsVisible(false);
      setIsMoving(false);
      setVelocity(0);
    };

    // Add both mouse and touch listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      clearTimeout(movingTimeoutRef.current);
    };
  }, []);

  return (
    <div
      className="blade-cursor"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '80px',
        height: '80px',
        pointerEvents: 'none',
        zIndex: 10000,
        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${1 + velocity * 0.15})`,
        transition: 'transform 0.08s ease-out',
        filter: isMoving
          ? `drop-shadow(0 0 ${15 + velocity * 5}px rgba(70, 125, 255, 0.9)) drop-shadow(0 0 ${30 + velocity * 10}px rgba(70, 125, 255, 0.6))`
          : 'drop-shadow(0 0 8px rgba(70, 125, 255, 0.6))',
        opacity: isVisible ? 0.95 : 0,
      }}
    >
      <img
        src="/ice.png"
        alt="ice blade cursor"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: isMoving ? 'brightness(1.2)' : 'brightness(1)',
          transition: 'filter 0.1s ease',
        }}
      />

      {/* Motion blur trail effect when moving fast */}
      {isMoving && velocity > 1 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
            opacity: Math.min(velocity * 0.3, 0.6),
            filter: 'blur(4px)',
          }}
        >
          <img
            src="/ice.png"
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default BladeCursor;
