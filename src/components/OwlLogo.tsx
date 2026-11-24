import React from 'react';

interface OwlLogoProps {
  className?: string;
}

export const OwlLogo: React.FC<OwlLogoProps> = ({ className = 'w-8 h-8' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    fill="none"
    className={className}
    aria-label="BEW Logo"
  >
    <rect width="512" height="512" rx="112" fill="#0B0F17" />
    <rect x="16" y="16" width="480" height="480" rx="100" stroke="#1E293B" strokeWidth="8" />
    <polygon points="122,126 196,158 150,214" fill="#334155" />
    <polygon points="390,126 316,158 362,214" fill="#334155" />
    <polygon
      points="196,158 256,136 316,158 362,214 342,356 256,422 170,356 150,214"
      fill="#1E293B"
      stroke="#475569"
      strokeWidth="6"
      strokeLinejoin="round"
    />
    <polyline
      points="150,214 256,246 362,214"
      stroke="#F59E0B"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polygon points="180,238 224,250 214,274 184,264" fill="#F59E0B" />
    <polygon points="332,238 288,250 298,274 328,264" fill="#F59E0B" />
    <circle cx="204" cy="256" r="6" fill="#0B0F17" />
    <circle cx="308" cy="256" r="6" fill="#0B0F17" />
    <circle cx="199" cy="251" r="3" fill="#38BDF8" />
    <circle cx="303" cy="251" r="3" fill="#38BDF8" />
    <polygon points="244,254 268,254 256,294" fill="#F59E0B" />
  </svg>
);
