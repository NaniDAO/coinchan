import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface MarketCountdownProps {
  closingTime: number; // Unix timestamp in seconds
  resolved: boolean;
}

export const MarketCountdown: React.FC<MarketCountdownProps> = ({ closingTime, resolved }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Math.floor(Date.now() / 1000);
      const difference = closingTime - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      }

      const days = Math.floor(difference / 86400);
      const hours = Math.floor((difference % 86400) / 3600);
      const minutes = Math.floor((difference % 3600) / 60);
      const seconds = Math.floor(difference % 60);

      return { days, hours, minutes, seconds, total: difference };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [closingTime]);

  if (resolved || !timeLeft) return null;

  // Show countdown only if closing within 24 hours
  const showCountdown = timeLeft.total > 0 && timeLeft.total <= 86400;

  if (!showCountdown) return null;

  const isUrgent = timeLeft.total <= 3600; // Less than 1 hour
  const isCritical = timeLeft.total <= 600; // Less than 10 minutes

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono font-bold
        ${isCritical ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 animate-pulse" : ""}
        ${isUrgent && !isCritical ? "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300" : ""}
        ${!isUrgent ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300" : ""}
      `}
    >
      <Clock className="h-3 w-3" />
      <span>
        {timeLeft.hours > 0 && (
          <>
            {timeLeft.hours}h {timeLeft.minutes}m
          </>
        )}
        {timeLeft.hours === 0 && timeLeft.minutes > 0 && (
          <>
            {timeLeft.minutes}m {timeLeft.seconds}s
          </>
        )}
        {timeLeft.hours === 0 && timeLeft.minutes === 0 && <>{timeLeft.seconds}s</>}
      </span>
    </div>
  );
};
