import React, { useState } from 'react';

interface ZammLogoProps {
  size?: 'small' | 'medium' | 'large' | 'landing';
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export const ZammLogo: React.FC<ZammLogoProps> = ({ 
  size = 'medium', 
  isLoading = false, 
  onClick,
  className = '' 
}) => {
  const [isLoadingState, setIsLoadingState] = useState(isLoading);

  const handleClick = () => {
    if (onClick) {
      // Trigger loading animation
      setIsLoadingState(true);
      setTimeout(() => setIsLoadingState(false), 3200); // 3.2s animation
      onClick();
    }
  };

  const dimensions = {
    small: { width: 40, height: 48 },
    medium: { width: 80, height: 96 },
    large: { width: 120, height: 144 },
    landing: { width: 200, height: 240 }
  };

  const { width, height } = dimensions[size];
  const viewBox = size === 'landing' ? "0 0 200 240" : "0 0 200 240";

  const StaticLogo = () => (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={`static-logo ${isLoadingState ? 'hidden' : ''}`}
    >
      {/* Top left facet */}
      <polygon
        points="100,20 55,120 100,85"
        fill="#FF6B9D"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Top right facet */}
      <polygon
        points="100,20 100,85 145,120"
        fill="#00D4FF"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Middle left facet */}
      <polygon
        points="55,120 100,85 100,120"
        fill="#FFE066"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Middle right facet */}
      <polygon
        points="100,85 145,120 100,120"
        fill="#66D9A6"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Bottom left facet */}
      <polygon
        points="55,120 100,120 100,200"
        fill="#FF9F40"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Bottom right facet */}
      <polygon
        points="100,120 145,120 100,200"
        fill="#B967DB"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Center vertical line */}
      <line
        x1="100"
        y1="20"
        x2="100"
        y2="200"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Top internal lines */}
      <line
        x1="100"
        y1="85"
        x2="55"
        y2="120"
        stroke="#000000"
        strokeWidth="2"
      />
      <line
        x1="100"
        y1="85"
        x2="145"
        y2="120"
        stroke="#000000"
        strokeWidth="2"
      />
      {/* Middle horizontal line */}
      <line
        x1="55"
        y1="120"
        x2="145"
        y2="120"
        stroke="#000000"
        strokeWidth="2"
      />
    </svg>
  );

  const LoadingDiamond = () => (
    <svg
      width={width}
      height={height}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={`loading-diamond ${isLoadingState ? 'active' : ''}`}
    >
      {/* 16 frames of rotation animation */}
      {Array.from({ length: 16 }, (_, i) => (
        <g key={i} opacity="0">
          <animate
            attributeName="opacity"
            values={`0;${i === 0 ? '1' : '0'};${'0;'.repeat(14)}0`}
            dur="3.2s"
            repeatCount="indefinite"
            begin={`${(i * 0.2)}s`}
          />
          <RotatedDiamond rotation={i * 22.5} />
        </g>
      ))}
    </svg>
  );

  return (
    <div 
      className={`svg-logo ${className} ${size === 'landing' ? 'landing-logo' : ''}`}
      onClick={handleClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <StaticLogo />
      <LoadingDiamond />
    </div>
  );
};

// Helper component for rotated diamond frames
const RotatedDiamond: React.FC<{ rotation: number }> = ({ rotation }) => {
  // This would contain the geometric transformations for each frame
  // For simplicity, using the base diamond shape with slight variations
  const basePoints = {
    top: { x: 200, y: 80 },
    left: { x: 155 - (rotation / 10), y: 160 },
    right: { x: 245 + (rotation / 10), y: 160 },
    center: { x: 200, y: 135 + Math.sin(rotation * Math.PI / 180) * 5 },
    bottom: { x: 200, y: 240 }
  };

  return (
    <>
      <polygon
        points={`${basePoints.top.x},${basePoints.top.y} ${basePoints.left.x},${basePoints.left.y} ${basePoints.center.x},${basePoints.center.y}`}
        fill="#FF6B9D"
        stroke="#000000"
        strokeWidth="2"
      />
      <polygon
        points={`${basePoints.top.x},${basePoints.top.y} ${basePoints.center.x},${basePoints.center.y} ${basePoints.right.x},${basePoints.right.y}`}
        fill="#00D4FF"
        stroke="#000000"
        strokeWidth="2"
      />
      <polygon
        points={`${basePoints.left.x},${basePoints.left.y} ${basePoints.center.x},${basePoints.center.y} ${basePoints.center.x},160`}
        fill="#FFE066"
        stroke="#000000"
        strokeWidth="2"
      />
      <polygon
        points={`${basePoints.center.x},${basePoints.center.y} ${basePoints.right.x},${basePoints.right.y} ${basePoints.center.x},160`}
        fill="#66D9A6"
        stroke="#000000"
        strokeWidth="2"
      />
      <polygon
        points={`${basePoints.left.x},${basePoints.left.y} ${basePoints.center.x},160 ${basePoints.bottom.x},${basePoints.bottom.y}`}
        fill="#FF9F40"
        stroke="#000000"
        strokeWidth="2"
      />
      <polygon
        points={`${basePoints.center.x},160 ${basePoints.right.x},${basePoints.right.y} ${basePoints.bottom.x},${basePoints.bottom.y}`}
        fill="#B967DB"
        stroke="#000000"
        strokeWidth="2"
      />
      <line
        x1={basePoints.top.x}
        y1={basePoints.top.y}
        x2={basePoints.bottom.x}
        y2={basePoints.bottom.y}
        stroke="#000000"
        strokeWidth="2"
      />
      <line
        x1={basePoints.left.x}
        y1={basePoints.left.y}
        x2={basePoints.right.x}
        y2={basePoints.right.y}
        stroke="#000000"
        strokeWidth="2"
      />
    </>
  );
};

export default ZammLogo;