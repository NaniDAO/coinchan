import React, { useState } from 'react';
import { AnimatedLogo } from './ui/animated-logo';

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

  // Map sizes to AnimatedLogo size variants
  const sizeMap = {
    small: 'sm' as const,
    medium: 'default' as const,
    large: 'lg' as const,
    landing: 'xl' as const
  };

  return (
    <AnimatedLogo
      size={sizeMap[size]}
      animated={isLoadingState}
      onClick={handleClick}
      className={className}
    />
  );
};


export default ZammLogo;