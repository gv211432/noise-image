/**
 * Default configuration presets for realistic camera noise
 */

import type { NoiseConfig } from './types.js';

/**
 * Preset configurations mimicking different camera scenarios
 */
export const presets = {
  /**
   * Very subtle noise - ideal for high-end cameras in good lighting
   * Barely perceptible but breaks up AI smoothness
   */
  subtle: {
    intensity: 0.004,
    variance: 0.15,
    luminanceDependent: true,
    microContrast: 0.15
  } as NoiseConfig,

  /**
   * Normal noise - typical DSLR/mirrorless at ISO 400-800
   * Visible on close inspection but natural-looking
   */
  normal: {
    intensity: 0.008,
    variance: 0.25,
    luminanceDependent: true,
    microContrast: 0.2
  } as NoiseConfig,

  /**
   * Moderate noise - higher ISO (1600-3200) or lower-end sensor
   * Clearly visible but still pleasing and organic
   */
  moderate: {
    intensity: 0.015,
    variance: 0.35,
    luminanceDependent: true,
    microContrast: 0.25
  } as NoiseConfig,

  /**
   * Flat/uniform - minimal variance, even distribution
   * For when you want consistent noise across image
   */
  flat: {
    intensity: 0.006,
    variance: 0.05,
    luminanceDependent: false,
    microContrast: 0.1
  } as NoiseConfig
} as const;

/**
 * Default configuration - balanced for most use cases
 * Recommended starting point for AI-generated images
 */
export const defaultConfig: NoiseConfig = {
  ...presets.normal,
  seed: undefined // Randomized by default
};

/**
 * Create custom config by merging with defaults
 *
 * @param overrides - Partial config to override defaults
 * @returns Complete NoiseConfig
 */
export function createConfig(overrides: Partial<NoiseConfig> = {}): NoiseConfig {
  return {
    ...defaultConfig,
    ...overrides
  };
}

/**
 * Get preset by name
 *
 * @param name - Preset name
 * @returns NoiseConfig for the preset
 */
export function getPreset(name: keyof typeof presets): NoiseConfig {
  return { ...presets[name] };
}

/**
 * Validate configuration values
 *
 * @param config - Configuration to validate
 * @throws Error if config values are out of acceptable range
 */
export function validateConfig(config: NoiseConfig): void {
  if (config.intensity < 0 || config.intensity > 1) {
    throw new Error('intensity must be between 0 and 1');
  }

  if (config.variance < 0 || config.variance > 1) {
    throw new Error('variance must be between 0 and 1');
  }

  if (config.microContrast < 0 || config.microContrast > 1) {
    throw new Error('microContrast must be between 0 and 1');
  }

  if (config.seed !== undefined && (config.seed < 0 || !Number.isInteger(config.seed))) {
    throw new Error('seed must be a positive integer or undefined');
  }
}
