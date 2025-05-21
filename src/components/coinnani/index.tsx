import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface CoinNaniProps {
  className?: string;
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

export const CoinNani = ({ className }: CoinNaniProps) => {
  const { t, i18n } = useTranslation();
  const [greetingKey, setGreetingKey] = useState("");
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    // Set greeting key immediately
    setGreetingKey(getGreetingKey());

    // Trigger bubble animation after a short delay
    const showTimer = setTimeout(() => {
      setShowBubble(true);
    }, 500); // Delay to let the avatar appear first
    
    // Hide bubble after 3 seconds
    const hideTimer = setTimeout(() => {
      setShowBubble(false);
    }, 3500); // 500ms delay + 3000ms display time

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    }; // Clean up timers on unmount
  }, []); // Run once on mount
  
  // Update greeting when language changes
  useEffect(() => {
    // Re-render greeting when language changes
    setGreetingKey(getGreetingKey());
  }, [i18n.language]);

  return (
    // Use flex-col and items-center to stack bubble above avatar and center horizontally
    // justify-end to push content to the bottom if container has height
    <div className={cn("relative flex flex-col items-center justify-end", className)}>
      {/* Text Bubble */}
      {showBubble && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 20 }} // Start small, invisible, slightly lower
          animate={{ scale: 1, opacity: 1, y: 0 }} // Pop to full size, visible, original position
          transition={{ type: "spring", stiffness: 260, damping: 20 }} // Spring animation for pop effect
          className="bg-primary/60 text-primary-foreground p-3 rounded-lg shadow-md whitespace-nowrap text-sm z-10 mb-2 relative" // mb-2 adds space below bubble, relative for tail
        >
          {t(greetingKey)}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-[10px] border-transparent border-t-primary/60"></div>
        </motion.div>
      )}

      <motion.div
        whileHover={{ scale: 1.2, rotate: [0, -66, 66, 0] }}
        transition={{ repeat: Infinity, repeatType: "mirror", delay: 0.1 }}
      >
        <Avatar className="h-10 w-10 z-0">
          <AvatarImage src="/coinchan.png" alt="Coin Nani Avatar" />
          <AvatarFallback>CN</AvatarFallback> {/* Fallback text */}
        </Avatar>
      </motion.div>
    </div>
  );
};
