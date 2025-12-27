/**
 * Core image processing pipeline using Sharp
 * Applies realistic camera sensor noise while preserving image quality
 */

import sharp from 'sharp';
import type { NoiseConfig, ProcessingResult } from './types.js';
import {
  generateSensorNoiseMap,
  generateChannelNoise,
  getLuminanceNoiseScale
} from './noise-generator.js';

/**
 * Apply realistic camera sensor noise to an image
 *
 * Processing pipeline:
 * 1. Load image and extract metadata
 * 2. Generate noise patterns (sensor noise + per-channel variation)
 * 3. Apply luminance-dependent noise if enabled
 * 4. Add subtle micro-contrast to break up AI smoothness
 * 5. Preserve EXIF and color profile
 *
 * @param inputPath - Path to source image
 * @param outputPath - Path to save processed image
 * @param config - Noise configuration
 * @returns Processing metadata
 */
export async function processImage(
  inputPath: string,
  outputPath: string,
  config: NoiseConfig
): Promise<ProcessingResult> {
  const startTime = performance.now();

  // Load image and get metadata
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Invalid image dimensions for ${inputPath}`);
  }

  const { width, height } = metadata;

  // Get raw pixel data (RGB, 8-bit per channel)
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Apply noise to pixel data
  const noisyData = await applyNoise(data, width, height, config);

  // Create output image with processed data
  let outputImage = sharp(noisyData, {
    raw: {
      width,
      height,
      channels: info.channels
    }
  });

  // Apply subtle micro-contrast if enabled
  // This adds local contrast variations to combat "plastic skin" look
  if (config.microContrast > 0) {
    // Very subtle contrast increase (1.0 = no change, 1.1 = slight increase)
    const contrastMultiplier = 1 + (config.microContrast * 0.1);
    outputImage = outputImage.linear(contrastMultiplier, -(128 * (contrastMultiplier - 1)));
  }

  // Preserve color profile if present
  if (metadata.icc) {
    outputImage = outputImage.withMetadata({
      icc: metadata.icc
    });
  } else {
    // Keep EXIF even without ICC profile
    outputImage = outputImage.withMetadata();
  }

  // Determine output format from input or default to original
  const format = metadata.format || 'jpeg';

  // Save with quality settings appropriate for the format
  if (format === 'jpeg' || format === 'jpg') {
    outputImage = outputImage.jpeg({
      quality: 95, // High quality to preserve details after noise addition
      chromaSubsampling: '4:4:4' // No chroma subsampling for best quality
    });
  } else if (format === 'png') {
    outputImage = outputImage.png({
      compressionLevel: 6, // Balanced compression
      adaptiveFiltering: true
    });
  } else if (format === 'webp') {
    outputImage = outputImage.webp({
      quality: 95,
      lossless: false
    });
  }

  await outputImage.toFile(outputPath);

  const endTime = performance.now();

  return {
    inputPath,
    outputPath,
    width,
    height,
    format,
    processingTimeMs: endTime - startTime
  };
}

/**
 * Apply noise to raw pixel data
 *
 * @param pixelData - Raw RGB pixel buffer
 * @param width - Image width
 * @param height - Image height
 * @param config - Noise configuration
 * @returns Modified pixel buffer with noise applied
 */
async function applyNoise(
  pixelData: Buffer,
  width: number,
  height: number,
  config: NoiseConfig
): Promise<Buffer> {
  // Create copy to avoid modifying original
  const output = Buffer.from(pixelData);

  // Generate base sensor noise map (grayscale pattern)
  const noiseMap = generateSensorNoiseMap(width, height, config);

  // Generate per-channel noise variations
  const channelNoise = generateChannelNoise(width, height, config);

  // Convert noise buffers to typed arrays for faster access
  const noiseFloat = new Float32Array(
    noiseMap.buffer,
    noiseMap.byteOffset,
    noiseMap.byteLength / 4
  );

  const rNoiseFloat = new Float32Array(
    channelNoise.r.buffer,
    channelNoise.r.byteOffset,
    channelNoise.r.byteLength / 4
  );

  const gNoiseFloat = new Float32Array(
    channelNoise.g.buffer,
    channelNoise.g.byteOffset,
    channelNoise.g.byteLength / 4
  );

  const bNoiseFloat = new Float32Array(
    channelNoise.b.buffer,
    channelNoise.b.byteOffset,
    channelNoise.b.byteLength / 4
  );

  // Process each pixel
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const pixelIndex = i * 3; // RGB = 3 bytes per pixel

    // Get current RGB values
    const r = output[pixelIndex];
    const g = output[pixelIndex + 1];
    const b = output[pixelIndex + 2];

    // Calculate luminance for this pixel (using standard rec709 coefficients)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Get base noise value for this pixel
    let baseNoise = noiseFloat[i];

    // Apply luminance-dependent scaling if enabled
    // Real sensors produce more noise in darker areas (shot noise)
    if (config.luminanceDependent) {
      const luminanceScale = getLuminanceNoiseScale(luminance);
      baseNoise *= luminanceScale;
    }

    // Apply noise to each channel
    // Combine base noise (affects all channels) with per-channel variation
    const rNoise = (baseNoise + rNoiseFloat[i]) * 255;
    const gNoise = (baseNoise + gNoiseFloat[i]) * 255;
    const bNoise = (baseNoise + bNoiseFloat[i]) * 255;

    // Add noise and clamp to valid range [0, 255]
    output[pixelIndex] = clamp(r + rNoise, 0, 255);
    output[pixelIndex + 1] = clamp(g + gNoise, 0, 255);
    output[pixelIndex + 2] = clamp(b + bNoise, 0, 255);
  }

  return output;
}

/**
 * Clamp value to range [min, max]
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Batch process multiple images
 *
 * @param inputPaths - Array of input image paths
 * @param outputPaths - Array of output image paths (must match length of inputPaths)
 * @param config - Noise configuration
 * @param onProgress - Optional callback for progress updates
 * @returns Array of processing results
 */
export async function processImageBatch(
  inputPaths: string[],
  outputPaths: string[],
  config: NoiseConfig,
  onProgress?: (current: number, total: number, result: ProcessingResult) => void
): Promise<ProcessingResult[]> {
  if (inputPaths.length !== outputPaths.length) {
    throw new Error('Input and output path arrays must have same length');
  }

  const results: ProcessingResult[] = [];

  for (let i = 0; i < inputPaths.length; i++) {
    const result = await processImage(inputPaths[i], outputPaths[i], config);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, inputPaths.length, result);
    }
  }

  return results;
}
