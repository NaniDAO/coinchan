import React, { useEffect, useRef } from "react";

interface Pixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

const CoinchanLoader: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const targetHeight = 64;
    const pixelScale = 4;
    const pixelsPerFrame = 8;

    const img = new Image();
    img.src = '/eth_logo_8bit_trans.png';

    img.onload = () => {
      // Build reduced palette buffer
      const scale = targetHeight / img.height;
      const targetW = Math.round(img.width * scale);

      const off = document.createElement('canvas');
      off.width = targetW;
      off.height = targetHeight;
      const offCtx = off.getContext('2d');
      if (!offCtx) return;
      
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(img, 0, 0, targetW, targetHeight);

      // Pull out non-transparent pixels
      const { data } = offCtx.getImageData(0, 0, targetW, targetHeight);
      const pixels: Pixel[] = [];
      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetW; x++) {
          const i = (y * targetW + x) * 4;
          const a = data[i + 3];
          if (a > 0) {
            pixels.push({
              x, y,
              r: data[i],
              g: data[i + 1],
              b: data[i + 2],
              a
            });
          }
        }
      }

      // Shuffle for random pop-in
      for (let i = pixels.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pixels[i], pixels[j]] = [pixels[j], pixels[i]];
      }

      // Prepare display canvas
      canvas.width = targetW * pixelScale;
      canvas.height = targetHeight * pixelScale;

      // Animate
      function drawBatch() {
        if (!ctx) return;
        for (let i = 0; i < pixelsPerFrame && pixels.length; i++) {
          const p = pixels.pop()!;
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.a / 255})`;
          ctx.fillRect(
            p.x * pixelScale,
            p.y * pixelScale,
            pixelScale,
            pixelScale
          );
        }
        if (pixels.length) {
          requestAnimationFrame(drawBatch);
        }
      }
      requestAnimationFrame(drawBatch);
    };
  }, []);

  return (
    <div className="flex justify-center items-center p-4">
      <canvas 
        ref={canvasRef}
        className="w-64 h-64"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default CoinchanLoader;
