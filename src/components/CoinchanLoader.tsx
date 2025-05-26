import React from "react";
import { motion } from "framer-motion";

const CoinchanLoader: React.FC = () => {
  return (
    <div className="flex justify-center items-center p-4">
      <motion.img
        src="/coinchan-logo.png"
        alt="Coinchan Loading"
        className="w-32 h-32 lg:w-52 lg:h-52"
        animate={{ scale: [0.8, 1.2, 0.8] }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
};

export default CoinchanLoader;
