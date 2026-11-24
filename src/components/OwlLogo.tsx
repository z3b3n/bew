import React from 'react';

interface OwlLogoProps {
  className?: string;
}

export const OwlLogo: React.FC<OwlLogoProps> = ({ className = 'w-8 h-8' }) => (
  <img
    src="/icons/icon-192.png"
    alt="BEW Escudo"
    className={`${className} bg-white object-contain rounded-xl p-0.5`}
  />
);
