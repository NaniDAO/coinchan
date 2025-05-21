import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface CoinNaniProps {
  className?: string;
}

interface LastShownData {
  timestamp: number; // Unix timestamp in ms
  period: string; // The greeting key that was shown
}

// Function to get greeting based on time and language
const getGreetingKey = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return "coinNani.morning"; // Morning (5 AM to 10:59 AM)
  } else if (hour >= 11 && hour < 18) {
    return "coinNani.afternoon"; // Afternoon (11 AM to 5:59 PM)
  } else {
    return "coinNani.evening"; // Evening (6 PM to 4:59 AM)
  }
};

const LOCAL_STORAGE_KEY = "coinNaniLastShown";
const MIN_HIDE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
const SHOW_DURATION_MS = 30 * 1000; // 30 seconds
const INITIAL_DELAY_MS = 500; // Delay before showing bubble

export const CoinNani = ({ className }: CoinNaniProps) => {
  const { t, i18n } = useTranslation();
  const [greetingKey, setGreetingKey] = useState("");
  const [shouldRenderComponent, setShouldRenderComponent] = useState<
    boolean | undefined
  >(undefined);

  // Refs for timer IDs, to ensure cleanup
  const showTimer = useRef<number>();
  const hideTimer = useRef<number>();

  useEffect(() => {
    const currentPeriod = getGreetingKey();
    setGreetingKey(currentPeriod);

    if (typeof window === "undefined" || !window.localStorage) {
      setShouldRenderComponent(false);
      return;
    }

    // Retrieve last shown data
    let lastShownData: LastShownData | null = null;
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (storedData) {
      try {
        lastShownData = JSON.parse(storedData);
      } catch (e) {
        console.error("Failed to parse CoinNani localStorage data:", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }

    const now = Date.now();
    const lastShownTime = lastShownData?.timestamp || 0;
    const lastShownPeriod = lastShownData?.period;

    // Determine if we should show this session
    const shouldShowThisSession =
      !lastShownData ||
      currentPeriod !== lastShownPeriod ||
      now - lastShownTime > MIN_HIDE_DURATION_MS;

    setShouldRenderComponent(shouldShowThisSession);

    if (shouldShowThisSession) {
      // Schedule bubble show
      showTimer.current = window.setTimeout(() => {
        setShouldRenderComponent(true);
        // Mark as shown immediately
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({ timestamp: Date.now(), period: currentPeriod }),
        );
        // Schedule bubble hide
        hideTimer.current = window.setTimeout(() => {
          setShouldRenderComponent(false);
        }, SHOW_DURATION_MS);
      }, INITIAL_DELAY_MS);
    }

    return () => {
      // Cleanup both timers
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Update greeting on language change
  useEffect(() => {
    setGreetingKey(getGreetingKey());
  }, [i18n.language]);

  // If still initializing or should not render at all
  if (!shouldRenderComponent) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-end",
        className,
      )}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="bg-primary/60 text-primary-foreground p-3 rounded-lg shadow-md whitespace-nowrap text-sm z-10 mb-2 relative"
      >
        {t(greetingKey)}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-[10px] border-transparent border-t-primary/60" />
      </motion.div>

      <motion.div
        whileHover={{ scale: 1.2, rotate: [0, -66, 66, 0] }}
        transition={{ repeat: Infinity, repeatType: "mirror", delay: 0.1 }}
      >
        <Avatar className="h-10 w-10 z-0">
          <AvatarImage src="/coinchan.png" alt="Coin Nani Avatar" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
      </motion.div>
    </div>
  );
};
