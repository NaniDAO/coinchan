// ===== CHAOS VOID ANIMATION CLASSES =====

// Simplex Noise Generator
export class NoiseGenerator {
  private static p: number[] = [];
  private static initialized = false;

  private static initialize() {
    if (this.initialized) return;
    const permutation = [
      151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240,
      21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88,
      237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83,
      111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216,
      80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186,
      3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58,
      17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
      129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193,
      238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
      184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128,
      195, 78, 66, 215, 61, 156, 180,
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

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;

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

  static fbm(x: number, y: number, z: number, octaves = 4, persistence = 0.5, lacunarity = 2.0): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.simplex(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }
}

// Energy Wave Class
export class EnergyWave {
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
    ctx.lineWidth = this.thickness * (1 - (this.radius / this.maxRadius) * 0.5);
    ctx.beginPath();

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const distort =
        NoiseGenerator.simplex(Math.cos(angle) * this.distortion, Math.sin(angle) * this.distortion, time * 0.01) * 50;
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
export class GlitchZone {
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
      const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y);
      gradient.addColorStop(0, `rgba(0, 255, 255, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(255, 0, 255, ${alpha})`);
      gradient.addColorStop(1, `rgba(255, 255, 0, ${alpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

// Void Particle Class
export class VoidParticle {
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
    chaosField: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
    }>,
    getNearbyPointsFn?: (
      x: number,
      y: number,
    ) => Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
    }>,
  ) {
    // Apply turbulence
    let turbulenceX = 0;
    let turbulenceY = 0;

    // Use spatial lookup if available for performance
    const pointsToCheck = getNearbyPointsFn ? getNearbyPointsFn(this.x, this.y) : chaosField;

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
    if (this.z <= 0 || this.x < -100 || this.x > width + 100 || this.y < -100 || this.y > height + 100) {
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
        const trailPerspective = 500 / (500 + this.z + (this.trail.length - index) * 10);
        const trailX = (point.x - width / 2) * trailPerspective + width / 2;
        const trailY = (point.y - height / 2) * trailPerspective + height / 2;

        if (index === 0) {
          ctx.moveTo(trailX, trailY);
        } else {
          ctx.lineTo(trailX, trailY);
        }
      });

      const gradient = ctx.createLinearGradient(this.trail[0].x, this.trail[0].y, screenX, screenY);
      gradient.addColorStop(0, `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, 0)`);
      gradient.addColorStop(1, `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective})`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = size * 0.5;
      ctx.stroke();
    }

    // Draw particle
    ctx.fillStyle = `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective})`;
    ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);

    // Add glow
    const glowSize = size * 4;
    const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowSize);
    glow.addColorStop(0, `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, ${perspective * 0.5})`);
    glow.addColorStop(1, `hsla(${this.color.h}, ${this.color.s}%, ${this.color.l}%, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(screenX - glowSize, screenY - glowSize, glowSize * 2, glowSize * 2);
  }
}
