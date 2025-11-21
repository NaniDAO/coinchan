import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Binary, Network, Vote, Coins as CoinsIcon } from "lucide-react";
import { ProposalList } from "./ProposalList";
import { VotingPower } from "./VotingPower";
import { DAOStats } from "./DAOStats";
import { JoinDAO } from "./JoinDAO";
import { CreateProposal } from "./CreateProposal";
import { useNavigate } from "@tanstack/react-router";

type ViewMode = "void" | "proposals" | "voting" | "stats" | "join" | "create";

// ===== CHAOS VOID SYSTEM =====

// Simplex Noise Generator
class NoiseGenerator {
    private static p: number[] = [];
    private static initialized = false;

    private static initialize() {
        if (this.initialized) return;
        const permutation = [
            151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7,
            225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6,
            148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35,
            11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171,
            168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231,
            83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245,
            40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76,
            132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
            164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5,
            202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16,
            58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
            154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253,
            19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246,
            97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
            81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199,
            106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
            138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78,
            66, 215, 61, 156, 180,
        ];
        this.p = new Array(512);
        for (let i = 0; i < 512; i++) {
            this.p[i] = permutation[i % 256];
        }
        this.initialized = true;
    }

    private static grad3(h: number, x: number, y: number, z: number): number {
        const g = [
            [1, 1, 0],
            [-1, 1, 0],
            [1, -1, 0],
            [-1, -1, 0],
            [1, 0, 1],
            [-1, 0, 1],
            [1, 0, -1],
            [-1, 0, -1],
            [0, 1, 1],
            [0, -1, 1],
            [0, 1, -1],
            [0, -1, -1],
        ];
        const gg = g[h % 12];
        return gg[0] * x + gg[1] * y + gg[2] * z;
    }

    static simplex(x: number, y: number, z: number): number {
        this.initialize();

        const F3 = 1.0 / 3.0;
        const G3 = 1.0 / 6.0;

        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const t = (i + j + k) * G3;

        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;

        let i1: number,
            j1: number,
            k1: number,
            i2: number,
            j2: number,
            k2: number;

        if (x0 >= y0) {
            if (y0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 1;
                k2 = 0;
            } else if (x0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            } else {
                i1 = 0;
                j1 = 0;
                k1 = 1;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            }
        } else {
            if (y0 < z0) {
                i1 = 0;
                j1 = 0;
                k1 = 1;
                i2 = 0;
                j2 = 1;
                k2 = 1;
            } else if (x0 < z0) {
                i1 = 0;
                j1 = 1;
                k1 = 0;
                i2 = 0;
                j2 = 1;
                k2 = 1;
            } else {
                i1 = 0;
                j1 = 1;
                k1 = 0;
                i2 = 1;
                j2 = 1;
                k2 = 0;
            }
        }

        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;

        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;

        const gi0 = this.p[ii + this.p[jj + this.p[kk]]] % 12;
        const gi1 = this.p[ii + i1 + this.p[jj + j1 + this.p[kk + k1]]] % 12;
        const gi2 = this.p[ii + i2 + this.p[jj + j2 + this.p[kk + k2]]] % 12;
        const gi3 = this.p[ii + 1 + this.p[jj + 1 + this.p[kk + 1]]] % 12;

        let n0: number, n1: number, n2: number, n3: number;

        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.grad3(gi0, x0, y0, z0);
        }

        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.grad3(gi1, x1, y1, z1);
        }

        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.grad3(gi2, x2, y2, z2);
        }

        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 < 0) n3 = 0.0;
        else {
            t3 *= t3;
            n3 = t3 * t3 * this.grad3(gi3, x3, y3, z3);
        }

        return 32.0 * (n0 + n1 + n2 + n3);
    }

    static fbm(
        x: number,
        y: number,
        z: number,
        octaves = 4,
        persistence = 0.5,
        lacunarity = 2.0,
    ): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            value +=
                this.simplex(x * frequency, y * frequency, z * frequency) *
                amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }
}

// Energy Wave Class
class EnergyWave {
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    speed: number;
    intensity: number;
    color: { r: number; g: number; b: number };
    thickness: number;
    distortion: number;

    constructor() {
        this.x = 0;
        this.y = 0;
        this.radius = 0;
        this.maxRadius = 0;
        this.speed = 0;
        this.intensity = 0;
        this.color = { r: 0, g: 0, b: 0 };
        this.thickness = 0;
        this.distortion = 0;
        this.reset();
    }

    reset(width?: number, height?: number) {
        this.x = Math.random() * (width || 1920);
        this.y = Math.random() * (height || 1080);
        this.radius = 0;
        this.maxRadius = 200 + Math.random() * 400;
        this.speed = 8 + Math.random() * 12;
        this.intensity = 0.3 + Math.random() * 0.7;
        this.color = {
            r: Math.random() > 0.5 ? 255 : 0,
            g: Math.random() > 0.5 ? 255 : 0,
            b: Math.random() > 0.5 ? 255 : 100,
        };
        this.thickness = 2 + Math.random() * 8;
        this.distortion = Math.random() * 0.5;
    }

    update(width?: number, height?: number) {
        this.radius += this.speed;
        if (this.radius > this.maxRadius) {
            this.reset(width, height);
        }
    }

    render(ctx: CanvasRenderingContext2D, time: number) {
        const segments = 24; // Reduced from 32 for performance (still smooth)
        ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.intensity * (1 - this.radius / this.maxRadius)})`;
        ctx.lineWidth =
            this.thickness * (1 - (this.radius / this.maxRadius) * 0.5);
        ctx.beginPath();

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const distort =
                NoiseGenerator.simplex(
                    Math.cos(angle) * this.distortion,
                    Math.sin(angle) * this.distortion,
                    time * 0.01,
                ) * 50;
            const r = this.radius + distort;
            const x = this.x + Math.cos(angle) * r;
            const y = this.y + Math.sin(angle) * r;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.closePath();
        ctx.stroke();
    }
}

// Glitch Zone Class
class GlitchZone {
    x: number;
    y: number;
    width: number;
    height: number;
    lifetime: number;
    maxLifetime: number;
    intensity: number;
    type: number;

    constructor() {
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.lifetime = 0;
        this.maxLifetime = 0;
        this.intensity = 0;
        this.type = 0;
        this.reset();
    }

    reset(canvasWidth?: number, canvasHeight?: number) {
        this.x = Math.random() * (canvasWidth || 1920);
        this.y = Math.random() * (canvasHeight || 1080);
        this.width = 50 + Math.random() * 200;
        this.height = 20 + Math.random() * 100;
        this.lifetime = 0;
        this.maxLifetime = 5 + Math.random() * 15;
        this.intensity = Math.random();
        this.type = Math.floor(Math.random() * 3);
    }

    update() {
        this.lifetime++;
        if (this.lifetime > this.maxLifetime) {
            this.reset();
        }
        this.x += (Math.random() - 0.5) * 30;
        this.y += (Math.random() - 0.5) * 30;
    }

    render(ctx: CanvasRenderingContext2D) {
        const alpha = this.intensity * (1 - this.lifetime / this.maxLifetime);

        if (this.type === 0) {
            // RGB shift
            ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.5})`;
            ctx.fillRect(this.x - 2, this.y, this.width, this.height);
            ctx.fillStyle = `rgba(0, 255, 0, ${alpha * 0.5})`;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = `rgba(0, 0, 255, ${alpha * 0.5})`;
            ctx.fillRect(this.x + 2, this.y, this.width, this.height);
        } else if (this.type === 1) {
            // Data corruption
            for (let i = 0; i < 10; i++) {
                const barY = this.y + Math.random() * this.height;
                ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, ${alpha})`;
                ctx.fillRect(this.x, barY, this.width, 2);
            }
        } else {
            // Pixel sort
            const gradient = ctx.createLinearGradient(
                this.x,
                this.y,
                this.x + this.width,
                this.y,
            );
            gradient.addColorStop(0, `rgba(0, 255, 255, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(255, 0, 255, ${alpha})`);
            gradient.addColorStop(1, `rgba(255, 255, 0, ${alpha})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

// Void Particle Class
class VoidParticle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    size: number;
    trail: Array<{ x: number; y: number }>;
    maxTrailLength: number;
    color: { h: number; s: number; l: number };

    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.size = 0;
        this.trail = [];
        this.maxTrailLength = 0;
        this.color = { h: 0, s: 0, l: 0 };
        this.reset();
    }

    reset(width?: number, height?: number) {
        this.x = Math.random() * (width || 1920);
        this.y = Math.random() * (height || 1080);
        this.z = Math.random() * 1000;
        this.vx = (Math.random() - 0.5) * 20;
        this.vy = (Math.random() - 0.5) * 20;
        this.vz = -10 - Math.random() * 20;
        this.size = Math.random() * 3;
        this.trail = [];
        this.maxTrailLength = 5 + Math.floor(Math.random() * 10);
        this.color = {
            h: Math.random() * 360,
            s: 50 + Math.random() * 50,
            l: 50 + Math.random() * 50,
        };
    }

    update(
        width: number,
        height: number,
        time: number,
        chaosField: Array<any>,
        getNearbyPointsFn?: (x: number, y: number) => Array<any>,
    ) {
        // Apply turbulence
        let turbulenceX = 0;
        let turbulenceY = 0;

        // Use spatial lookup if available for performance
        const pointsToCheck = getNearbyPointsFn
            ? getNearbyPointsFn(this.x, this.y)
            : chaosField;

        for (let i = 0; i < pointsToCheck.length; i++) {
            const point = pointsToCheck[i];
            const dx = this.x - point.x;
            const dy = this.y - point.y;
            const distSq = dx * dx + dy * dy;

            // Use squared distance to avoid expensive sqrt
            if (distSq < 10000 && distSq > 0) {
                // 100^2 = 10000
                const dist = Math.sqrt(distSq); // Only calculate sqrt when needed
                const force = (100 - dist) / 100;
                turbulenceX += (dx / dist) * force * point.vx;
                turbulenceY += (dy / dist) * force * point.vy;
            }
        }

        this.vx += turbulenceX * 0.3;
        this.vy += turbulenceY * 0.3;

        // Spiral motion
        const angle = time * 0.03 + this.z * 0.001;
        this.vx += Math.cos(angle) * 1.5;
        this.vy += Math.sin(angle) * 1.5;

        // Update position
        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;

        // Damping
        this.vx *= 0.95;
        this.vy *= 0.95;

        // Update trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }

        // Reset if out of bounds
        if (
            this.z <= 0 ||
            this.x < -100 ||
            this.x > width + 100 ||
            this.y < -100 ||
            this.y > height + 100
        ) {
            this.reset(width, height);
            this.z = 1000;
        }
    }

    render(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const perspective = 500 / (500 + this.z);
        const screenX = (this.x - width / 2) * perspective + width / 2;
        const screenY = (this.y - height / 2) * perspective + height / 2;
        const size = this.size * perspective;

        // Draw trail
        if (this.trail.length > 1) {
            ctx.beginPath();
            this.trail.forEach((point, index) => {
                const trailPerspective =
                    500 / (500 + this.z + (this.trail.length - index) * 10);
                const trailX =
                    (point.x - width / 2) * trailPerspective + width / 2;
                const trailY =
                    (point.y - height / 2) * trailPerspective + height / 2;

                if (index === 0) {
                    ctx.moveTo(trailX, trailY);
                } else {
                    ctx.lineTo(trailX, trailY);
                }
            });

            const gradient = ctx.createLinearGradient(
                this.trail[0].x,
                this.trail[0].y,
                screenX,
                screenY,
            );
            gradient.addColorStop(
                0,
                `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, 0)`,
            );
            gradient.addColorStop(
                1,
                `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective})`,
            );

            ctx.strokeStyle = gradient;
            ctx.lineWidth = size * 0.5;
            ctx.stroke();
        }

        // Draw particle
        ctx.fillStyle = `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective})`;
        ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);

        // Add glow
        const glowSize = size * 4;
        const glow = ctx.createRadialGradient(
            screenX,
            screenY,
            0,
            screenX,
            screenY,
            glowSize,
        );
        glow.addColorStop(
            0,
            `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective * 0.5})`,
        );
        glow.addColorStop(
            1,
            `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, 0)`,
        );
        ctx.fillStyle = glow;
        ctx.fillRect(
            screenX - glowSize,
            screenY - glowSize,
            glowSize * 2,
            glowSize * 2,
        );
    }
}

// Main Chaos Void System Component
const ChaosVoidSystem = () => {
    const noiseCanvasRef = useRef<HTMLCanvasElement>(null);
    const energyCanvasRef = useRef<HTMLCanvasElement>(null);
    const glitchCanvasRef = useRef<HTMLCanvasElement>(null);
    const particleCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const noiseCanvas = noiseCanvasRef.current;
        const energyCanvas = energyCanvasRef.current;
        const glitchCanvas = glitchCanvasRef.current;
        const particleCanvas = particleCanvasRef.current;

        if (!noiseCanvas || !energyCanvas || !glitchCanvas || !particleCanvas)
            return;

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

            [noiseCanvas, energyCanvas, glitchCanvas, particleCanvas].forEach(
                (canvas) => {
                    canvas.width = width;
                    canvas.height = height;
                },
            );

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

                    const noise1 = NoiseGenerator.fbm(
                        x * 0.005,
                        y * 0.005,
                        time * 0.008,
                        6,
                        0.6,
                        2.5,
                    );
                    const noise2 = NoiseGenerator.simplex(
                        x * 0.02,
                        y * 0.02,
                        time * 0.02,
                    );
                    const noise3 =
                        Math.sin(x * 0.1 + time * 0.05) *
                        Math.cos(y * 0.1 - time * 0.05);

                    let intensity =
                        Math.abs(noise1) * 0.4 +
                        Math.abs(noise2) * 0.3 +
                        Math.abs(noise3) * 0.3;

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
                            intensity +=
                                Math.sin(
                                    point.phase + time * point.frequency * 2,
                                ) *
                                point.intensity *
                                (1 - dist / 50) *
                                0.8;
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
                    const cx =
                        (point1.x + point2.x) / 2 + Math.sin(time * 0.05) * 20;
                    const cy =
                        (point1.y + point2.y) / 2 + Math.cos(time * 0.05) * 20;
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
                const imageData = glitchCtx.getImageData(
                    0,
                    corruptY,
                    width,
                    corruptHeight,
                );
                glitchCtx.putImageData(
                    imageData,
                    Math.random() * 20 - 10,
                    corruptY,
                );
            }

            // Layer 4: Void particles
            particleCtx.fillStyle = "rgba(0, 0, 0, 0.15)";
            particleCtx.fillRect(0, 0, width, height);

            voidParticles.forEach((particle) => {
                particle.update(
                    width,
                    height,
                    time,
                    chaosField,
                    getNearbyPoints,
                );
                particle.render(particleCtx, width, height);
            });

            // Update chaos field
            chaosField.forEach((point) => {
                point.vx += (Math.random() - 0.5) * 0.5;
                point.vy += (Math.random() - 0.5) * 0.5;
                point.vx *= 0.95;
                point.vy *= 0.95;
                point.phase += point.frequency * 3;
                point.intensity =
                    0.5 + Math.sin(time * 0.005 + point.phase) * 0.5;
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
            <canvas
                ref={noiseCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ mixBlendMode: "normal" }}
            />
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
            <canvas
                ref={particleCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ mixBlendMode: "screen" }}
            />

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

// ===== END CHAOS VOID SYSTEM =====

export const CyberspaceDAO = () => {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<ViewMode>("void");
    const [isEntering, setIsEntering] = useState(true);

    useEffect(() => {
        // Entry animation
        const timer = setTimeout(() => setIsEntering(false), 2000);
        return () => clearTimeout(timer);
    }, []);

    const handleExit = () => {
        navigate({ to: "/" });
    };

    return (
        <div
            className="fixed h-screen w-screen inset-0 z-[9999] bg-black text-white overflow-hidden relative"
            style={{
                filter: "contrast(1.4) brightness(1.2) saturate(1.5)",
            }}
        >
            {/* CHAOS VOID SYSTEM - Multi-layer Canvas */}
            {/*<ChaosVoidSystem />*/}

            {/* Entry Animation with Warning */}
            <AnimatePresence>
                {isEntering && (
                    <motion.div
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1, delay: 1 }}
                    >
                        <motion.div
                            className="text-center max-w-2xl px-8"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.2 }}
                            transition={{ duration: 0.8 }}
                        >
                            {/* Epilepsy Warning */}
                            <motion.div
                                className="mb-6 p-4 border border-red-500/50 bg-red-500/10"
                                animate={{
                                    borderColor: [
                                        "rgba(239, 68, 68, 0.5)",
                                        "rgba(239, 68, 68, 1)",
                                        "rgba(239, 68, 68, 0.5)",
                                    ],
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Number.POSITIVE_INFINITY,
                                }}
                            >
                                <div className="font-mono text-red-400 text-xs mb-1">
                                    ⚠ WARNING
                                </div>
                                <div className="font-mono text-red-300 text-sm">
                                    PHOTOSENSITIVE SEIZURE WARNING
                                </div>
                            </motion.div>

                            <Binary className="w-20 h-20 mx-auto mb-4 text-white animate-pulse" />
                            <motion.div
                                className="font-mono text-2xl tracking-wider text-white"
                                animate={{
                                    x: [0, -2, 2, -2, 0],
                                    textShadow: [
                                        "0 0 0px #fff",
                                        "-2px 0 10px #ff0000, 2px 0 10px #00ffff",
                                        "0 0 0px #fff",
                                    ],
                                }}
                                transition={{
                                    duration: 0.3,
                                    repeat: Number.POSITIVE_INFINITY,
                                    repeatDelay: 2,
                                }}
                            >
                                ENTERING ZORG CYBERSPACE
                            </motion.div>
                            <div className="font-mono text-sm text-gray-400 mt-2">
                                [ INITIALIZING NEURAL INTERFACE ]
                            </div>
                            <div className="font-mono text-xs text-green-400 mt-4 animate-pulse">
                                &gt;&gt; CONNECTION ESTABLISHED
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Exit Button */}
            <motion.button
                onClick={handleExit}
                className="fixed top-6 right-6 z-50 p-3 border border-white/20 hover:border-white/60 bg-black/40 backdrop-blur-sm transition-all group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                <X className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
            </motion.button>

            {/* Main Content */}
            <div className="relative z-10 h-full flex items-center justify-center p-8">
                {viewMode === "void" ? (
                    <VoidView onSelectMode={setViewMode} />
                ) : (
                    <ContentView
                        mode={viewMode}
                        onBack={() => setViewMode("void")}
                    />
                )}
            </div>

            {/* Status Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-4">
                        <span className="text-green-400">◉ ONLINE</span>
                        <span className="text-gray-400">
                            NETWORK: ETHEREUM MAINNET
                        </span>
                    </div>
                    <div className="text-gray-400">
                        ZORG DAO v1.0 • {new Date().toISOString().split("T")[0]}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Void View - The main navigation hub
const VoidView = ({
    onSelectMode,
}: {
    onSelectMode: (mode: ViewMode) => void;
}) => {
    // Position nodes in corners and edges of the viewport
    const nodes = [
        { id: "proposals", label: "PROPOSALS", icon: Network, corner: "top" },
        { id: "voting", label: "VOTING POWER", icon: Vote, corner: "left" },
        { id: "stats", label: "STATISTICS", icon: Binary, corner: "right" },
        {
            id: "join",
            label: "JOIN DAO",
            icon: CoinsIcon,
            corner: "bottom-left",
        },
        {
            id: "create",
            label: "CREATE",
            icon: Network,
            corner: "bottom-right",
        },
    ];

    return (
        <>
            {/* Central Core - Absolutely positioned */}
            <motion.div
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
            >
                <div className="w-32 h-32 border-2 bg-white border-white/40 rounded-full flex items-center justify-center relative">
                    <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-ping" />
                    {/* <Binary className="w-12 h-12 text-white" />*/}
                    <div className="flex flex-col font-mono text-4xl text-black">
                        <span className="tracking-widest">ZO</span>
                        <span className="tracking-widest">RG</span>
                    </div>
                </div>
            </motion.div>

            {/* Data Nodes in Corners */}
            {nodes.map((node, i) => (
                <DataNode
                    key={node.id}
                    {...node}
                    delay={0.7 + i * 0.1}
                    onClick={() => onSelectMode(node.id as ViewMode)}
                />
            ))}

            {/* Connection Lines from center to corners */}
            <svg className="fixed inset-0 w-full h-full pointer-events-none z-5">
                <motion.line
                    x1="50%"
                    y1="50%"
                    x2="50%"
                    y2="15%"
                    stroke="white"
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 1 }}
                />
                <motion.line
                    x1="50%"
                    y1="50%"
                    x2="10%"
                    y2="50%"
                    stroke="white"
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 1.1 }}
                />
                <motion.line
                    x1="50%"
                    y1="50%"
                    x2="90%"
                    y2="50%"
                    stroke="white"
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 1.2 }}
                />
                <motion.line
                    x1="50%"
                    y1="50%"
                    x2="10%"
                    y2="81%"
                    stroke="white"
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 1.3 }}
                />
                <motion.line
                    x1="50%"
                    y1="50%"
                    x2="90%"
                    y2="81%"
                    stroke="white"
                    strokeWidth="1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 1.4 }}
                />
            </svg>
        </>
    );
};

// Data Node - Interactive navigation point with color bursts
const DataNode = ({
    label,
    icon: Icon,
    corner,
    delay,
    onClick,
}: {
    label: string;
    icon: React.ElementType;
    corner: string;
    delay: number;
    onClick: () => void;
}) => {
    const [isHovered, setIsHovered] = useState(false);

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
            className="fixed group z-20"
            style={getPositionStyles(corner)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
        >
            <div className="relative">
                {/* Color burst glow */}
                <AnimatePresence>
                    {isHovered && (
                        <motion.div
                            className="absolute inset-0 clip-hexagon"
                            initial={{ opacity: 0, scale: 1 }}
                            animate={{ opacity: 0.6, scale: 1.5 }}
                            exit={{ opacity: 0, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            style={{
                                background: `radial-gradient(circle, ${color.primary}40 0%, transparent 70%)`,
                                filter: "blur(20px)",
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* Hex Border */}
                <motion.div
                    className="w-24 h-24 border-2 flex items-center justify-center bg-white/80 backdrop-blur-sm clip-hexagon relative overflow-hidden"
                    animate={{
                        borderColor: isHovered
                            ? color.primary
                            : "rgba(255,255,255,0.3)",
                        boxShadow: isHovered ? color.shadow : "none",
                    }}
                    transition={{ duration: 0.2 }}
                >
                    <Icon
                        className="w-10 h-10 transition-colors relative z-10"
                        style={{
                            color: isHovered ? color.primary : "black",
                        }}
                    />

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

                {/* Label with color pop */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <motion.div
                        className="font-mono text-lg tracking-wider"
                        animate={{
                            color: isHovered
                                ? color.primary
                                : "rgba(255,255,255,0.6)",
                            textShadow: isHovered
                                ? `0 0 10px ${color.primary}`
                                : "none",
                        }}
                        transition={{ duration: 0.2 }}
                    >
                        {label}
                    </motion.div>
                </div>
            </div>
        </motion.button>
    );
};

// Content View - Displays selected content
const ContentView = ({
    mode,
    onBack,
}: {
    mode: ViewMode;
    onBack: () => void;
}) => {
    const getContent = () => {
        switch (mode) {
            case "proposals":
                return { title: "PROPOSALS", Component: ProposalList };
            case "voting":
                return { title: "VOTING POWER", Component: VotingPower };
            case "stats":
                return { title: "STATISTICS", Component: DAOStats };
            case "join":
                return { title: "JOIN DAO", Component: JoinDAO };
            case "create":
                return { title: "CREATE PROPOSAL", Component: CreateProposal };
            default:
                return null;
        }
    };

    const content = getContent();
    if (!content) return null;

    const { title, Component } = content;

    return (
        <motion.div
            className="w-full max-w-5xl h-full flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            {/* Header - Fixed */}
            <div className="flex items-center gap-4 mb-6 flex-shrink-0">
                <motion.button
                    onClick={onBack}
                    className="px-4 py-2 border border-white/30 hover:border-white/60 bg-black/40 backdrop-blur-sm font-mono text-sm transition-all"
                    whileHover={{ x: -4 }}
                >
                    ← RETURN
                </motion.button>
                <div className="font-mono text-2xl tracking-wider text-white/90">
                    {title}
                </div>
            </div>

            {/* Content Panel - Scrollable */}
            <div
                className="border border-white/20 bg-black/60 backdrop-blur-md p-8 cyberspace-content overflow-y-auto flex-1 max-h-[calc(100vh-200px)]"
                style={{
                    scrollBehavior: "smooth",
                    boxShadow: "0 0 30px rgba(255, 255, 255, 0.05)",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                        "0 0 40px rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                        "0 0 30px rgba(255, 255, 255, 0.05)";
                }}
            >
                <Component />
            </div>

            <style>{`
        /* Hexagon clip path for navigation nodes */
        .clip-hexagon {
          clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);
        }

        /* Cyberspace Theme Overrides */
        .cyberspace-content * {
          color: white !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }

        .cyberspace-content .border-border,
        .cyberspace-content .bg-card,
        .cyberspace-content .bg-muted,
        .cyberspace-content .bg-background {
          background-color: rgba(0, 0, 0, 0.4) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
        }

        .cyberspace-content input,
        .cyberspace-content textarea {
          background-color: rgba(0, 0, 0, 0.6) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
          color: white !important;
        }

        .cyberspace-content input::placeholder,
        .cyberspace-content textarea::placeholder {
          color: rgba(255, 255, 255, 0.3) !important;
        }

        .cyberspace-content button {
          background-color: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          color: white !important;
          transition: all 0.2s !important;
        }

        .cyberspace-content button:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.2) !important;
          border-color: rgba(255, 255, 255, 0.6) !important;
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.2) !important;
        }

        .cyberspace-content button:disabled {
          opacity: 0.3 !important;
          cursor: not-allowed !important;
        }

        .cyberspace-content .text-muted-foreground {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        .cyberspace-content .text-green-400,
        .cyberspace-content .bg-green-500 {
          color: #00ff00 !important;
        }

        .cyberspace-content .text-red-400,
        .cyberspace-content .bg-red-500 {
          color: #ff0000 !important;
        }

        .cyberspace-content .bg-green-500 {
          background-color: #00ff00 !important;
        }

        .cyberspace-content .bg-red-500 {
          background-color: #ff0000 !important;
        }

        .cyberspace-content .text-blue-400 {
          color: #00ccff !important;
        }

        .cyberspace-content .text-yellow-400 {
          color: #ffff00 !important;
        }

        .cyberspace-content .bg-yellow-500\\/10 {
          background-color: rgba(255, 255, 0, 0.1) !important;
        }

        .cyberspace-content .border-yellow-500\\/20 {
          border-color: rgba(255, 255, 0, 0.2) !important;
        }

        /* Loading animation */
        .cyberspace-content .animate-pulse {
          animation: cyber-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
        }

        @keyframes cyber-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Scrollbar styling */
        .cyberspace-content ::-webkit-scrollbar {
          width: 8px;
        }

        .cyberspace-content ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        .cyberspace-content ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }

        .cyberspace-content ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
        </motion.div>
    );
};
