/**
 * Configuration for noise generation and image processing
 */
export interface NoiseConfig {
  /**
   * Base noise intensity (0.0 - 1.0)
   * Typical camera sensor noise is very subtle: 0.003 - 0.015
   * Higher values = more visible noise
   */
  intensity: number;

  /**
   * Variance in noise strength across the image (0.0 - 1.0)
   * Mimics how real sensors have non-uniform noise patterns
   * Higher values = more randomized local noise strength
   */
  variance: number;

  /**
   * Whether to apply luminance-dependent noise
   * Real sensors produce more noise in shadows (low luminance areas)
   */
  luminanceDependent: boolean;

  /**
   * Strength of micro-contrast enhancement (0.0 - 1.0)
   * Adds subtle local contrast variations to break up "plastic" smoothness
   * Keep very low (0.1 - 0.3) for natural results
   */
  microContrast: number;

  /**
   * Random seed for reproducible results (optional)
   * If undefined, uses current timestamp for true randomness
   */
  seed?: number;

  /**
   * Smoothing strength applied after all filters (0.0 - 1.0)
   * Optional post-processing blur to soften the final image
   * 0.0 = no smoothing, 1.0 = maximum smoothing
   */
  smoothing?: number;
}

/**
 * Metadata about processed image
 */
export interface ProcessingResult {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  format: string;
  processingTimeMs: number;
}
