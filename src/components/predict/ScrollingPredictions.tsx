import React from "react";

const predictions = [
  "ETH will reach $10k by 2026",
  "Bitcoin dominance drops below 40%",
  "AI surpasses human intelligence by 2030",
  "First Mars colony established by 2035",
  "Global carbon emissions peak in 2025",
  "Quantum supremacy achieved by 2027",
  "Universal basic income in 10+ countries",
  "Self-driving cars majority by 2030",
  "Fusion energy commercially viable",
  "Web3 users exceed 1 billion",
  "VR/AR mainstream adoption by 2028",
  "Life expectancy reaches 100 years",
  "Cryptocurrency market cap $10T+",
  "Renewable energy 80% of grid by 2040",
  "AGI developed before 2035",
  "Zero hunger goal achieved by 2030",
  "First trillionaire emerges by 2030",
  "Global population peaks at 10B",
  "CBDC in 100+ countries by 2028",
  "Ocean cleanup 50% complete by 2035",
];

const ScrollingRow: React.FC<{ predictions: string[]; speed: number; delay: number }> = ({
  predictions,
  speed,
  delay,
}) => {
  return (
    <div
      className="flex whitespace-nowrap overflow-hidden"
      style={{
        animationDelay: `${delay}s`,
      }}
    >
      <div
        className="flex animate-scroll hover:animate-scroll-slow"
        style={{
          animation: `scroll ${speed}s linear infinite`,
          animationDelay: `${delay}s`,
        }}
      >
        {[...predictions, ...predictions, ...predictions].map((text, idx) => (
          <div
            key={idx}
            className="px-6 text-lg md:text-xl lg:text-2xl font-black tracking-tight"
            style={{ fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif" }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ScrollingPredictions: React.FC = () => {
  // Split predictions into 4 rows
  const row1 = predictions.slice(0, 5);
  const row2 = predictions.slice(5, 10);
  const row3 = predictions.slice(10, 15);
  const row4 = predictions.slice(15, 20);

  return (
    <div className="w-full h-full min-h-[200px] bg-white dark:bg-white overflow-hidden flex flex-col justify-evenly group relative">
      <style>
        {`
          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-33.333%);
            }
          }

          .animate-scroll {
            animation: scroll linear infinite;
          }

          .group:hover .animate-scroll {
            animation-play-state: paused;
          }
        `}
      </style>

      <ScrollingRow predictions={row1} speed={25} delay={0} />
      <ScrollingRow predictions={row2} speed={30} delay={0.5} />
      <ScrollingRow predictions={row3} speed={28} delay={1} />
      <ScrollingRow predictions={row4} speed={32} delay={1.5} />

      {/* Gradient overlays for smooth edge effect */}
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent pointer-events-none" />
    </div>
  );
};
