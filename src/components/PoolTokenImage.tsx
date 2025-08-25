import { formatImageURL } from "@/hooks/metadata";
import { memo, useState } from "react";

interface PoolTokenImageProps {
  imageUrl0: string | null;
  imageUrl1: string | null;
}

export const PoolTokenImage = memo(
  ({ imageUrl0, imageUrl1 }: PoolTokenImageProps) => {
    const [error0, setError0] = useState(false);
    const [error1, setError1] = useState(false);

    return (
      <div className="relative w-8 h-8 rounded-full overflow-hidden flex border border-border">
        {/* Left Half */}
        {imageUrl0 && !error0 ? (
          <img
            src={formatImageURL(imageUrl0)}
            alt="Token 0"
            className="w-1/2 h-full object-cover border-r-2 border-border"
            onError={() => setError0(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-1/2 h-full flex items-center justify-center bg-gray-700 text-white text-[10px]">
            T0
          </div>
        )}

        {/* Right Half */}
        {imageUrl1 && !error1 ? (
          <img
            src={formatImageURL(imageUrl1)}
            alt="Token 1"
            className="w-1/2 h-full object-cover"
            onError={() => setError1(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-1/2 h-full flex items-center justify-center bg-gray-700 text-white text-[10px]">
            T1
          </div>
        )}
      </div>
    );
  },
);
