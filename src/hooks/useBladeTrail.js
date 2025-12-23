import { useCallback, useRef } from 'react';

export const useBladeTrail = () => {
  const isSlashingRef = useRef(false);
  const trailRef = useRef([]);
  const animationTimeRef = useRef(0);

  const addTrailPoint = useCallback((x, y, timestamp = Date.now()) => {
    const point = { x, y, timestamp, alpha: 1.0 };
    
    trailRef.current.push(point);
    
    // Keep only the last 12 points for better performance
    if (trailRef.current.length > 12) {
      trailRef.current.shift();
    }
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
    
    animationTimeRef.current = now;
  }, []);

  const clearTrail = useCallback(() => {
    trailRef.current = [];
  }, []);

  const startSlashing = useCallback(() => {
    isSlashingRef.current = true;
    clearTrail();
  }, [clearTrail]);

  const stopSlashing = useCallback(() => {
    isSlashingRef.current = false;
  }, []);

  const renderBladeTrail = useCallback((ctx) => {
    const trail = trailRef.current;
    if (trail.length < 2) return;

    const now = animationTimeRef.current;
    
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Single-pass rendering with path batching for better performance
    const baseWidth = 7;
    
    // Render outer glow layer
    ctx.shadowColor = '#467DFF';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    for (let i = 1; i < trail.length; i++) {
      const point = trail[i];
      const prevPoint = trail[i - 1];
      if (point.alpha <= 0) continue;
      
      const progress = i / trail.length;
      const width = baseWidth * (1 - progress * 0.4) * point.alpha;
      
      if (i === 1) {
        ctx.moveTo(prevPoint.x, prevPoint.y);
      }
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = `rgba(70, 125, 255, ${point.alpha * 0.3})`;
      ctx.lineWidth = width * 2.5;
    }
    ctx.stroke();
    
    // Render mid-layer
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 1; i < trail.length; i++) {
      const point = trail[i];
      const prevPoint = trail[i - 1];
      if (point.alpha <= 0) continue;
      
      const progress = i / trail.length;
      const width = baseWidth * (1 - progress * 0.4) * point.alpha;
      
      if (i === 1) {
        ctx.moveTo(prevPoint.x, prevPoint.y);
      }
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = `rgba(135, 206, 250, ${point.alpha * 0.6})`;
      ctx.lineWidth = width * 1.2;
    }
    ctx.stroke();
    
    // Render core
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (let i = 1; i < trail.length; i++) {
      const point = trail[i];
      const prevPoint = trail[i - 1];
      if (point.alpha <= 0) continue;
      
      const progress = i / trail.length;
      const width = baseWidth * (1 - progress * 0.4) * point.alpha;
      
      if (i === 1) {
        ctx.moveTo(prevPoint.x, prevPoint.y);
      }
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = `rgba(240, 248, 255, ${point.alpha * 0.95})`;
      ctx.lineWidth = width * 0.4;
    }
    ctx.stroke();
    
    // Simplified particle effects - only at trail end for performance
    if (trail.length > 0) {
      const lastPoint = trail[trail.length - 1];
      if (lastPoint.alpha > 0.5) {
        const rotation = now * 0.0005;
        
        ctx.save();
        ctx.translate(lastPoint.x, lastPoint.y);
        
        // Simple ice sparkles
        const numSparkles = 6;
        for (let s = 0; s < numSparkles; s++) {
          const angle = (s / numSparkles) * Math.PI * 2 + rotation;
          const distance = 8;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const size = 2 * lastPoint.alpha;
          
          ctx.fillStyle = `rgba(240, 248, 255, ${lastPoint.alpha * 0.8})`;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
        }
        
        ctx.restore();
      }
    }
    
    ctx.restore();
  }, []);

  return {
    bladeTrail: trailRef.current,
    isSlashing: isSlashingRef.current,
    addTrailPoint,
    updateTrail,
    clearTrail,
    startSlashing,
    stopSlashing,
    renderBladeTrail
  };
};