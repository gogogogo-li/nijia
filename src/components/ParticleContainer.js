import React from 'react';

const ParticleContainer = ({ particles }) => {
  return (
    <div className="particle-container">
      {particles.map(particle => (
        particle.isToken ? (
          // Render token emoji particles
          <div
            key={particle.id}
            className="particle token-particle"
            style={{
              left: `${particle.x}px`,
              top: `${particle.y}px`,
              opacity: particle.life,
              fontSize: `${particle.size}px`,
              position: 'absolute',
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
              filter: `drop-shadow(0 0 2px rgba(255, 215, 0, ${particle.life * 0.5}))`
            }}
          >
            {particle.emoji}
          </div>
        ) : (
          // Fallback for old particle system
          <div
            key={particle.id}
            className="particle"
            style={{
              left: `${particle.x}px`,
              top: `${particle.y}px`,
              backgroundColor: particle.color,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.life
            }}
          />
        )
      ))}
    </div>
  );
};

export default ParticleContainer;