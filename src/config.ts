/**
 * Default configuration presets for realistic camera noise
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { NoiseConfig } from './types.js';

/**
 * Preset data structure from JSON
 */
interface PresetData {
  name: string;
  description: string;
  settings: NoiseConfig;
}

interface PresetsFile {
  presets: Record<string, PresetData>;
}

/**
 * Load presets from preset.json file
 */
function loadPresets(): Record<string, NoiseConfig> {
  try {
    const presetPath = join(process.cwd(), 'preset.json');
    const fileContent = readFileSync(presetPath, 'utf-8');
    const data: PresetsFile = JSON.parse(fileContent);

    // Convert preset data to NoiseConfig objects
    const loadedPresets: Record<string, NoiseConfig> = {};
    for (const [key, preset] of Object.entries(data.presets)) {
      loadedPresets[key] = preset.settings;
    }

    return loadedPresets;
  } catch (error) {
    console.error('Warning: Could not load preset.json, using default presets');
    // Fallback to hardcoded presets
    return {
      subtle: {
        intensity: 0.004,
        variance: 0.15,
        luminanceDependent: true,
        microContrast: 0.15
      } as NoiseConfig,
      normal: {
        intensity: 0.008,
        variance: 0.25,
        luminanceDependent: true,
        microContrast: 0.2
      } as NoiseConfig,
      moderate: {
        intensity: 0.015,
        variance: 0.35,
        luminanceDependent: true,
        microContrast: 0.25
      } as NoiseConfig,
      flat: {
        intensity: 0.006,
        variance: 0.05,
        luminanceDependent: false,
        microContrast: 0.1
      } as NoiseConfig
    };
  }
}

/**
 * Load preset metadata for display
 */
export function loadPresetMetadata(): PresetsFile {
  try {
    const presetPath = join(process.cwd(), 'preset.json');
    const fileContent = readFileSync(presetPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error('Could not load preset.json');
  }
}

/**
 * Preset configurations mimicking different camera scenarios
 */
export const presets = loadPresets();

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
