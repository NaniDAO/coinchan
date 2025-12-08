import { useEffect, useRef } from "react";
import { NoiseGenerator, EnergyWave, GlitchZone, VoidParticle } from "./ChaosVoidClasses";

export const ChaosVoidSystem = () => {
  const noiseCanvasRef = useRef<HTMLCanvasElement>(null);
  const energyCanvasRef = useRef<HTMLCanvasElement>(null);
  const glitchCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const noiseCanvas = noiseCanvasRef.current;
    const energyCanvas = energyCanvasRef.current;
    const glitchCanvas = glitchCanvasRef.current;
    const particleCanvas = particleCanvasRef.current;

    if (!noiseCanvas || !energyCanvas || !glitchCanvas || !particleCanvas) return;

    // Use willReadFrequently for canvases that frequently use getImageData/putImageData
    const noiseCtx = noiseCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const energyCtx = energyCanvas.getContext("2d");
    const glitchCtx = glitchCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const particleCtx = particleCanvas.getContext("2d");

    if (!noiseCtx || !energyCtx || !glitchCtx || !particleCtx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let time = 0;
    let animationId: number;
    let lastFrameTime = 0;
    const targetFrameTime = 1000 / 60; // 60fps cap

    const chaosField: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      intensity: number;
      frequency: number;
      phase: number;
    }> = [];

    const energyWaves: EnergyWave[] = [];
    const glitchZones: GlitchZone[] = [];
    const voidParticles: VoidParticle[] = [];

    // Spatial grid for fast chaos field lookups
    const GRID_CELL_SIZE = 50;
    let spatialGrid: Map<string, typeof chaosField> = new Map();

    const getSpatialKey = (x: number, y: number) => {
      const gridX = Math.floor(x / GRID_CELL_SIZE);
      const gridY = Math.floor(y / GRID_CELL_SIZE);
      return `${gridX},${gridY}`;
    };

    const getNearbyPoints = (x: number, y: number) => {
      const points: typeof chaosField = [];
      const gridX = Math.floor(x / GRID_CELL_SIZE);
      const gridY = Math.floor(y / GRID_CELL_SIZE);

      // Check 3x3 grid around point
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${gridX + dx},${gridY + dy}`;
          const cell = spatialGrid.get(key);
          if (cell) points.push(...cell);
        }
      }
      return points;
    };

    // Initialize
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      [noiseCanvas, energyCanvas, glitchCanvas, particleCanvas].forEach((canvas) => {
        canvas.width = width;
        canvas.height = height;
      });

      // Initialize chaos field
      chaosField.length = 0;
      spatialGrid.clear();
      const gridSize = 20;
      for (let x = 0; x < width; x += gridSize) {
        for (let y = 0; y < height; y += gridSize) {
          const point = {
            x,
            y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            intensity: Math.random(),
            frequency: Math.random() * 0.1,
            phase: Math.random() * Math.PI * 2,
          };
          chaosField.push(point);

          // Add to spatial grid
          const key = getSpatialKey(x, y);
          if (!spatialGrid.has(key)) {
            spatialGrid.set(key, []);
          }
          spatialGrid.get(key)!.push(point);
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);

    // Initialize systems - slightly reduced for performance (visually imperceptible)
    for (let i = 0; i < 15; i++) {
      energyWaves.push(new EnergyWave());
    }
    for (let i = 0; i < 20; i++) {
      glitchZones.push(new GlitchZone());
    }
    for (let i = 0; i < 100; i++) {
      voidParticles.push(new VoidParticle());
    }

    // Main render loop
    const render = (currentTime: number = 0) => {
      // Throttle to 60fps for performance
      const deltaTime = currentTime - lastFrameTime;
      if (deltaTime < targetFrameTime) {
        animationId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = currentTime - (deltaTime % targetFrameTime);

      time += 3; // HYPERSPEED

      // Layer 1: Noise field
      const imageData = noiseCtx.createImageData(width, height);
      const data = imageData.data;

      for (let x = 0; x < width; x += 3) {
        for (let y = 0; y < height; y += 3) {
          const index = (y * width + x) * 4;

          const noise1 = NoiseGenerator.fbm(x * 0.005, y * 0.005, time * 0.008, 6, 0.6, 2.5);
          const noise2 = NoiseGenerator.simplex(x * 0.02, y * 0.02, time * 0.02);
          const noise3 = Math.sin(x * 0.1 + time * 0.05) * Math.cos(y * 0.1 - time * 0.05);

          let intensity = Math.abs(noise1) * 0.4 + Math.abs(noise2) * 0.3 + Math.abs(noise3) * 0.3;

          // Chaos field influence - OPTIMIZED: use spatial grid
          const nearbyPoints = getNearbyPoints(x, y);
          for (let i = 0; i < nearbyPoints.length; i++) {
            const point = nearbyPoints[i];
            const dx = x - point.x;
            const dy = y - point.y;
            const distSq = dx * dx + dy * dy;

            // Use squared distance for faster comparison
            if (distSq < 2500) {
              // 50^2 = 2500
              const dist = Math.sqrt(distSq);
              intensity += Math.sin(point.phase + time * point.frequency * 2) * point.intensity * (1 - dist / 50) * 0.8;
            }
          }

          intensity = Math.pow(intensity, 0.7);

          if (intensity > 0.8) {
            data[index] = 255;
            data[index + 1] = 255;
            data[index + 2] = 255;
            data[index + 3] = 255;
          } else if (intensity > 0.6) {
            data[index] = intensity * 50;
            data[index + 1] = intensity * 255;
            data[index + 2] = intensity * 255;
            data[index + 3] = intensity * 255;
          } else if (intensity > 0.4) {
            data[index] = intensity * 255;
            data[index + 1] = intensity * 50;
            data[index + 2] = intensity * 255;
            data[index + 3] = intensity * 200;
          } else if (intensity > 0.2) {
            data[index] = 0;
            data[index + 1] = intensity * 50;
            data[index + 2] = intensity * 200;
            data[index + 3] = intensity * 150;
          } else {
            const spark = Math.random() > 0.999;
            if (spark) {
              data[index] = 255;
              data[index + 1] = 255;
              data[index + 2] = 255;
              data[index + 3] = 255;
            } else {
              data[index] = 0;
              data[index + 1] = 0;
              data[index + 2] = 0;
              data[index + 3] = 255;
            }
          }

          // Copy to adjacent pixels
          for (let dx = 0; dx < 3 && x + dx < width; dx++) {
            for (let dy = 0; dy < 3 && y + dy < height; dy++) {
              if (dx === 0 && dy === 0) continue;
              const copyIndex = ((y + dy) * width + (x + dx)) * 4;
              data[copyIndex] = data[index];
              data[copyIndex + 1] = data[index + 1];
              data[copyIndex + 2] = data[index + 2];
              data[copyIndex + 3] = data[index + 3];
            }
          }
        }
      }

      noiseCtx.putImageData(imageData, 0, 0);

      // Layer 2: Energy waves
      energyCtx.clearRect(0, 0, width, height);
      energyWaves.forEach((wave) => {
        wave.update(width, height);
        wave.render(energyCtx, time);
      });

      // Energy field lines
      energyCtx.strokeStyle = "rgba(0, 255, 255, 0.1)";
      energyCtx.lineWidth = 0.5;
      for (let i = 0; i < chaosField.length - 1; i += 2) {
        const point1 = chaosField[i];
        const point2 = chaosField[i + 1];
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const distSq = dx * dx + dy * dy;

        // Use squared distance for faster comparison
        if (distSq < 2500) {
          // 50^2 = 2500
          energyCtx.beginPath();
          energyCtx.moveTo(point1.x, point1.y);
          const cx = (point1.x + point2.x) / 2 + Math.sin(time * 0.05) * 20;
          const cy = (point1.y + point2.y) / 2 + Math.cos(time * 0.05) * 20;
          energyCtx.quadraticCurveTo(cx, cy, point2.x, point2.y);
          energyCtx.stroke();
        }
      }

      // Layer 3: Glitch zones
      glitchCtx.clearRect(0, 0, width, height);
      glitchZones.forEach((zone) => {
        zone.update();
        zone.render(glitchCtx);
      });

      // Data corruption
      if (Math.random() > 0.92) {
        const corruptY = Math.random() * height;
        const corruptHeight = 1 + Math.random() * 20;
        const imageData = glitchCtx.getImageData(0, corruptY, width, corruptHeight);
        glitchCtx.putImageData(imageData, Math.random() * 20 - 10, corruptY);
      }

      // Layer 4: Void particles
      particleCtx.fillStyle = "rgba(0, 0, 0, 0.15)";
      particleCtx.fillRect(0, 0, width, height);

      voidParticles.forEach((particle) => {
        particle.update(width, height, time, chaosField, getNearbyPoints);
        particle.render(particleCtx, width, height);
      });

      // Update chaos field
      chaosField.forEach((point) => {
        point.vx += (Math.random() - 0.5) * 0.5;
        point.vy += (Math.random() - 0.5) * 0.5;
        point.vx *= 0.95;
        point.vy *= 0.95;
        point.phase += point.frequency * 3;
        point.intensity = 0.5 + Math.sin(time * 0.005 + point.phase) * 0.5;
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    // Glitch events
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.4) {
        for (let i = 0; i < 8; i++) {
          glitchZones.push(new GlitchZone());
        }
        setTimeout(() => {
          glitchZones.splice(-8, 8);
        }, 100);
      }
    }, 500);

    // Chaos bursts
    const burstInterval = setInterval(() => {
      if (Math.random() > 0.5) {
        const burstX = Math.random() * width;
        const burstY = Math.random() * height;
        for (let i = 0; i < 5; i++) {
          const wave = new EnergyWave();
          wave.x = burstX;
          wave.y = burstY;
          wave.maxRadius = 800;
          wave.speed = 20;
          wave.intensity = 1;
          energyWaves.push(wave);
        }
        setTimeout(() => {
          energyWaves.splice(-5, 5);
        }, 800);
      }
    }, 1000);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      clearInterval(glitchInterval);
      clearInterval(burstInterval);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={noiseCanvasRef} className="absolute inset-0 w-full h-full" style={{ mixBlendMode: "normal" }} />
      <canvas
        ref={energyCanvasRef}
        className="absolute inset-0 w-full h-full opacity-90"
        style={{ mixBlendMode: "screen" }}
      />
      <canvas
        ref={glitchCanvasRef}
        className="absolute inset-0 w-full h-full opacity-80"
        style={{ mixBlendMode: "difference" }}
      />
      <canvas ref={particleCanvasRef} className="absolute inset-0 w-full h-full" style={{ mixBlendMode: "screen" }} />

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(0deg, transparent 0%, rgba(255, 0, 255, 0.03) 3%, transparent 3.5%, transparent 7%, rgba(0, 255, 255, 0.02) 7.5%, transparent 8%)",
          backgroundSize: "100% 8px",
          animation: "scanlines 2s linear infinite",
        }}
      />
      <style>{`
                @keyframes scanlines {
                    0% { background-position: 0 0; }
                    100% { background-position: 0 10px; }
                }
            `}</style>
    </div>
  );
};
