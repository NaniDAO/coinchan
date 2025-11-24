import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DataNodeProps {
    label: string;
    icon: React.ElementType;
    corner: string;
    delay: number;
    onClick: () => void;
    onHoverChange?: (isHovered: boolean) => void;
}

export const DataNode = ({
    label,
    icon: Icon,
    corner,
    delay,
    onClick,
    onHoverChange,
}: DataNodeProps) => {
    const [isHovered, setIsHovered] = useState(false);

    const handleHoverStart = () => {
        setIsHovered(true);
        onHoverChange?.(true);
    };

    const handleHoverEnd = () => {
        setIsHovered(false);
        onHoverChange?.(false);
    };

    // Calculate position based on corner
    const getPositionStyles = (corner: string): React.CSSProperties => {
        const spacing = 80; // pixels from edge
        switch (corner) {
            case "top":
                return {
                    top: spacing,
                    left: "50%",
                    transform: "translateX(-50%)",
                };
            case "left":
                return {
                    left: spacing,
                    top: "50%",
                    transform: "translateY(-50%)",
                };
            case "right":
                return {
                    right: spacing,
                    top: "50%",
                    transform: "translateY(-50%)",
                };
            case "bottom-left":
                return { bottom: spacing, left: spacing };
            case "bottom-right":
                return { bottom: spacing, right: spacing };
            default:
                return {
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                };
        }
    };

    // Get color based on corner - VIBRANT primary colors
    const getColor = (corner: string) => {
        const colors = {
            top: {
                primary: "#FF0000",
                shadow: "0 0 60px #FF0000, 0 0 100px #FF0000",
            }, // Pure Red
            left: {
                primary: "#FF00FF",
                shadow: "0 0 60px #FF00FF, 0 0 100px #FF00FF",
            }, // Pure Magenta
            right: {
                primary: "#00FFFF",
                shadow: "0 0 60px #00FFFF, 0 0 100px #00FFFF",
            }, // Pure Cyan
            "bottom-left": {
                primary: "#FFFF00",
                shadow: "0 0 60px #FFFF00, 0 0 100px #FFFF00",
            }, // Pure Yellow
            "bottom-right": {
                primary: "#0000FF",
                shadow: "0 0 60px #0000FF, 0 0 100px #0000FF",
            }, // Pure Blue
        };
        return colors[corner as keyof typeof colors] || colors.top;
    };

    const color = getColor(corner);

    return (
        <motion.button
            className="fixed group z-20 rounded-lg"
            style={getPositionStyles(corner)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
        >
            <div className="relative">
                {/* Color burst glow */}

                {/* Hex Border */}
                <motion.div
                    className="w-24 h-24 border-2 flex flex-col items-center justify-center gap-1 bg-white/80 backdrop-blur-sm clip-hexagon relative overflow-hidden"
                    animate={{
                        borderColor: isHovered
                            ? color.primary
                            : "rgba(255,255,255,0.3)",
                    }}
                    transition={{ duration: 0.2 }}
                >
                    <Icon
                        className="w-10 h-10 transition-colors relative z-10"
                        style={{
                            color: isHovered ? color.primary : "black",
                        }}
                    />

                    {/* Label with color pop - now inside the box */}
                    <motion.div
                        className="font-mono text-xs tracking-wider relative z-10 text-center px-1"
                        animate={{
                            color: isHovered
                                ? color.primary
                                : "rgba(0,0,0,0.8)",
                            textShadow: isHovered
                                ? `0 0 10px ${color.primary}`
                                : "none",
                        }}
                        transition={{ duration: 0.2 }}
                    >
                        {label}
                    </motion.div>

                    {/* Animated scan line */}
                    <AnimatePresence>
                        {isHovered && (
                            <motion.div
                                className="absolute w-full h-px"
                                style={{ backgroundColor: color.primary }}
                                initial={{ top: 0, opacity: 0 }}
                                animate={{ top: "100%", opacity: [0, 1, 0] }}
                                transition={{
                                    duration: 1,
                                    repeat: Number.POSITIVE_INFINITY,
                                }}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Pulsing Ring with color */}
                <motion.div
                    className="absolute inset-0 border-2 clip-hexagon pointer-events-none"
                    animate={{
                        opacity: isHovered ? [0.5, 0] : 0,
                        scale: isHovered ? [1, 1.3] : 1,
                        borderColor: color.primary,
                    }}
                    transition={{
                        duration: 1,
                        repeat: isHovered ? Number.POSITIVE_INFINITY : 0,
                    }}
                />
            </div>
        </motion.button>
    );
};
