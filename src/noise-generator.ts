/**
 * Noise generation utilities that mimic real camera sensor behavior
 *
 * Real camera sensor noise characteristics:
 * 1. Stochastic (random) nature - follows Gaussian/Poisson distributions
 * 2. Luminance-dependent - more noise in shadows (shot noise)
 * 3. Non-uniform - varies across sensor area (read noise patterns)
 * 4. Multi-channel - affects RGB channels differently
 * 5. Low amplitude - typically 0.3-2% of signal strength
 */

import type { NoiseConfig } from './types.js';

/**
 * Pseudo-random number generator with optional seeding
 * Using a simple but effective LCG (Linear Congruential Generator)
 */
class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Date.now();
  }

  /**
   * Generate next random number [0, 1)
   */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /**
   * Box-Muller transform to generate Gaussian-distributed random numbers
   * Real sensor noise follows Gaussian distribution
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

/**
 * Generate a noise map that mimics camera sensor noise patterns
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param config - Noise configuration parameters
 * @returns Buffer containing noise values (one channel, float values)
 */
export function generateSensorNoiseMap(
  width: number,
  height: number,
  config: NoiseConfig
): Buffer {
  const rng = new SeededRandom(config.seed);
  const pixelCount = width * height;

  // Allocate buffer for single-channel float data
  // Each pixel gets one noise value that will be applied to all RGB channels
  // (with slight per-channel variation added later)
  const noiseData = new Float32Array(pixelCount);

  // Generate base noise field with local variance
  // This mimics how real sensors have non-uniform noise characteristics
  for (let i = 0; i < pixelCount; i++) {
    // Base Gaussian noise (mean=0, controlled by intensity)
    const baseNoise = rng.gaussian(0, config.intensity);

    // Add spatial variance - different areas have different noise levels
    // This breaks up uniform AI-smoothness more naturally
    const varianceMultiplier = config.variance > 0
      ? 1 + rng.gaussian(0, config.variance)
      : 1;

    noiseData[i] = baseNoise * varianceMultiplier;
  }

  return Buffer.from(noiseData.buffer);
}

/**
 * Generate per-channel noise variations
 * Real sensors have different noise characteristics per color channel
 * (typically more noise in blue channel due to lower quantum efficiency)
 *
 * @param width - Image width
 * @param height - Image height
 * @param config - Noise configuration
 * @returns Object with RGB channel noise buffers
 */
export function generateChannelNoise(
  width: number,
  height: number,
  config: NoiseConfig
): { r: Buffer; g: Buffer; b: Buffer } {
  const rng = new SeededRandom(config.seed ? config.seed + 1 : undefined);
  const pixelCount = width * height;

  // Real cameras: blue channel typically has 1.2-1.5x more noise than green
  // Green has least noise (most abundant on Bayer sensor)
  const channelMultipliers = {
    r: 1.0,
    g: 0.85,  // Green channel is cleanest
    b: 1.25   // Blue channel is noisiest
  };

  const createChannelBuffer = (multiplier: number): Buffer => {
    const data = new Float32Array(pixelCount);
    const channelIntensity = config.intensity * multiplier * 0.3; // Scale down for per-channel

    for (let i = 0; i < pixelCount; i++) {
      data[i] = rng.gaussian(0, channelIntensity);
    }

    return Buffer.from(data.buffer);
  };

  return {
    r: createChannelBuffer(channelMultipliers.r),
    g: createChannelBuffer(channelMultipliers.g),
    b: createChannelBuffer(channelMultipliers.b)
  };
}

/**
 * Calculate noise scaling based on pixel luminance
 * Mimics shot noise behavior where darker areas get more noise
 *
 * @param luminance - Pixel luminance value [0-255]
 * @returns Noise multiplier [0.5 - 2.0]
 */
export function getLuminanceNoiseScale(luminance: number): number {
  // Normalize to [0, 1]
  const norm = luminance / 255;

  // Inverse relationship: darker = more noise
  // Typical real sensor: 2x more noise in shadows than highlights
  // Using a power curve to make it subtle
  const scale = 1 + (1 - norm) ** 1.5;

  return Math.max(0.5, Math.min(2.0, scale));
}

/**
 * Convert noise value to 8-bit integer offset
 * Clamps to prevent overflow/underflow
 *
 * @param noise - Raw noise value (typically -0.05 to +0.05)
 * @returns Integer offset to add to pixel value [-12, +12]
 */
export function noiseToPixelOffset(noise: number): number {
  // Scale noise to pixel value change
  // Multiply by 255 to convert [0,1] float range to [0,255] byte range
  // Then clamp to reasonable bounds to prevent extreme values
  const offset = noise * 255;
  return Math.max(-12, Math.min(12, Math.round(offset)));
}
