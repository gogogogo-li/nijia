import { useState, useCallback, useRef } from 'react';

export const useBladeTrail = () => {
  const [bladeTrail, setBladeTrail] = useState([]);
  const [isSlashing, setIsSlashing] = useState(false);
  const trailRef = useRef([]);

  const addTrailPoint = useCallback((x, y, timestamp = Date.now()) => {
    const point = { x, y, timestamp, alpha: 1.0 };
    
    trailRef.current.push(point);
    
    // Keep only the last 20 points for performance
    if (trailRef.current.length > 20) {
      trailRef.current.shift();
    }
    
    setBladeTrail([...trailRef.current]);
  }, []);

  const updateTrail = useCallback(() => {
    const now = Date.now();
    const maxAge = 200; // Trail fades over 200ms
    
    trailRef.current = trailRef.current
      .map(point => ({
        ...point,
        alpha: Math.max(0, 1 - (now - point.timestamp) / maxAge)
      }))
      .filter(point => point.alpha > 0);
    
    setBladeTrail([...trailRef.current]);
  }, []);

  const clearTrail = useCallback(() => {
    trailRef.current = [];
    setBladeTrail([]);
  }, []);

  const startSlashing = useCallback(() => {
    setIsSlashing(true);
    clearTrail();
  }, [clearTrail]);

  const stopSlashing = useCallback(() => {
    setIsSlashing(false);
    // Don't clear trail immediately, let it fade out
  }, []);

  const renderBladeTrail = useCallback((ctx) => {
    if (bladeTrail.length < 2) return;

    ctx.save();
    
    // Create gradient for the blade
    for (let i = 1; i < bladeTrail.length; i++) {
      const currentPoint = bladeTrail[i];
      const prevPoint = bladeTrail[i - 1];
      
      if (currentPoint.alpha <= 0) continue;
      
      // Calculate line width based on position in trail
      const progress = i / bladeTrail.length;
      const baseWidth = 4.6; // Increased by 15% (4 * 1.15 = 4.6) for more visible blade
      const width = baseWidth * (1 - progress * 0.5) * currentPoint.alpha;
      
      // Draw the blade segment
      ctx.beginPath();
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      
      // Create a glowing effect
      ctx.shadowColor = '#32b8c6';
      ctx.shadowBlur = 15 * currentPoint.alpha;
      ctx.strokeStyle = `rgba(50, 184, 198, ${currentPoint.alpha * 0.9})`;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      
      // Add inner bright line
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(135, 206, 235, ${currentPoint.alpha * 1.0})`;
      ctx.lineWidth = width * 0.4;
      ctx.stroke();
    }
    
    ctx.restore();
  }, [bladeTrail]);

  return {
    bladeTrail,
    isSlashing,
    addTrailPoint,
    updateTrail,
    clearTrail,
    startSlashing,
    stopSlashing,
    renderBladeTrail
  };
};