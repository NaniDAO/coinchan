import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface CoinNaniProps {
  className?: string;
}

// Function to get greeting based on time
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return "おはよう！"; // Ohayou gozaimasu! - Good morning (5 AM to 10:59 AM)
  } else if (hour >= 11 && hour < 18) {
    return "こんにちは！"; // Konnichiwa! - Hello/Good afternoon (11 AM to 5:59 PM)
  } else {
    return "こんばんは！"; // Konbanwa! - Good evening (6 PM to 4:59 AM)
  }
};

export const CoinNani = ({ className }: CoinNaniProps) => {
  const [greeting, setGreeting] = useState("");
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    // Set greeting immediately
    setGreeting(getGreeting());

    // Trigger bubble animation after a short delay
    const timer = setTimeout(() => {
      setShowBubble(true);
    }, 500); // Delay to let the avatar appear first

    return () => clearTimeout(timer); // Clean up timer on unmount
  }, []); // Run once on mount

  return (
    // Use flex-col and items-center to stack bubble above avatar and center horizontally
    // justify-end to push content to the bottom if container has height
    <div
      className={cn(
        "relative flex flex-col items-center justify-end",
        className,
      )}
    >
      {/* Text Bubble */}
      {showBubble && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 20 }} // Start small, invisible, slightly lower
          animate={{ scale: 1, opacity: 1, y: 0 }} // Pop to full size, visible, original position
          transition={{ type: "spring", stiffness: 260, damping: 20 }} // Spring animation for pop effect
          className="bg-primary/60 text-primary-foreground p-3 rounded-lg shadow-md whitespace-nowrap text-sm z-10 mb-2 relative" // mb-2 adds space below bubble, relative for tail
        >
          {greeting}
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
