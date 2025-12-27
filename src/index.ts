#!/usr/bin/env bun

/**
 * CLI entry point for realistic camera noise processor
 *
 * Usage:
 *   bun run src/index.ts [options]
 *
 * Options:
 *   --preset <name>     Use a preset config (subtle, normal, moderate, flat)
 *   --intensity <n>     Noise intensity (0.0 - 1.0)
 *   --variance <n>      Noise variance (0.0 - 1.0)
 *   --micro-contrast <n> Micro-contrast strength (0.0 - 1.0)
 *   --seed <n>          Random seed for reproducibility
 *   --input <dir>       Input directory (default: ./input)
 *   --output <dir>      Output directory (default: ./output)
 *   --help              Show help
 */

import { basename, join } from 'path';
import { processImageBatch } from './image-processor.js';
import { getImageFiles, ensureDirectory, getOutputPath, formatTime } from './file-utils.js';
import { createConfig, getPreset, validateConfig, presets, loadPresetMetadata } from './config.js';
import type { NoiseConfig } from './types.js';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  config: Partial<NoiseConfig>;
  inputDir: string;
  outputDir: string;
  showHelp: boolean;
  showPresetList: boolean;
} {
  const args = process.argv.slice(2);
  const config: Partial<NoiseConfig> = {};
  let inputDir = './input';
  let outputDir = './output';
  let showHelp = false;
  let showPresetList = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        showHelp = true;
        break;

      case '--preset-list':
        showPresetList = true;
        break;

      case '--preset':
      case '-p': {
        const presetName = args[++i] as keyof typeof presets;
        if (!presets[presetName]) {
          console.error(`Unknown preset: ${presetName}`);
          console.error(`Available presets: ${Object.keys(presets).join(', ')}`);
          process.exit(1);
        }
        Object.assign(config, getPreset(presetName));
        break;
      }

      case '--intensity':
      case '-i':
        config.intensity = parseFloat(args[++i]);
        break;

      case '--variance':
      case '-v':
        config.variance = parseFloat(args[++i]);
        break;

      case '--micro-contrast':
      case '-m':
        config.microContrast = parseFloat(args[++i]);
        break;

      case '--seed':
      case '-s':
        config.seed = parseInt(args[++i], 10);
        break;

      case '--no-luminance':
        config.luminanceDependent = false;
        break;

      case '--input':
        inputDir = args[++i];
        break;

      case '--output':
        outputDir = args[++i];
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return { config, inputDir, outputDir, showHelp, showPresetList };
}

/**
 * Show preset list with all available presets and their settings
 */
function showPresetListMessage(): void {
  try {
    const metadata = loadPresetMetadata();

    console.log(`
Realistic Camera Noise Processor - Available Presets
=====================================================
`);

    for (const [key, preset] of Object.entries(metadata.presets)) {
      console.log(`${preset.name} (${key})`);
      console.log(`  ${preset.description}`);
      console.log(`  Settings:`);
      console.log(`    Intensity:       ${preset.settings.intensity.toFixed(4)}`);
      console.log(`    Variance:        ${preset.settings.variance.toFixed(4)}`);
      console.log(`    Micro-contrast:  ${preset.settings.microContrast.toFixed(4)}`);
      console.log(`    Luminance-dependent: ${preset.settings.luminanceDependent ? 'Yes' : 'No'}`);
      console.log('');
    }

    console.log('Usage:');
    console.log('  bun run src/index.ts --preset <name>');
    console.log('\nExample:');
    console.log('  bun run src/index.ts --preset real');
  } catch (error) {
    console.error(`❌ Failed to load presets: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Show help message
 */
function showHelpMessage(): void {
  console.log(`
Realistic Camera Noise Processor
=================================

Adds subtle, realistic camera sensor noise to AI-generated images.

Usage:
  bun run src/index.ts [options]

Options:
  --preset, -p <name>       Use a preset configuration
                            Options: subtle, normal, moderate, flat, real
                            Default: normal

  --preset-list             List all available presets with detailed settings

  --intensity, -i <n>       Noise intensity (0.0 - 1.0)
                            Higher = more visible noise
                            Default: 0.008

  --variance, -v <n>        Spatial noise variance (0.0 - 1.0)
                            Higher = more varied noise pattern
                            Default: 0.25

  --micro-contrast, -m <n>  Micro-contrast strength (0.0 - 1.0)
                            Helps combat "plastic skin" look
                            Default: 0.2

  --seed, -s <number>       Random seed for reproducibility
                            Default: random (uses timestamp)

  --no-luminance            Disable luminance-dependent noise
                            (uniform noise across all brightness levels)

  --input <dir>             Input directory path
                            Default: ./input

  --output <dir>            Output directory path
                            Default: ./output

  --help, -h                Show this help message

Presets:
  subtle     - Barely perceptible, high-end camera quality
  normal     - Typical DSLR at ISO 400-800 (recommended)
  moderate   - Higher ISO or consumer camera
  flat       - Uniform noise, minimal variation
  real       - Realistic camera noise with custom balanced settings

Examples:
  # List all available presets with settings
  bun run src/index.ts --preset-list

  # Process with default (normal) settings
  bun run src/index.ts

  # Use subtle preset
  bun run src/index.ts --preset subtle

  # Custom settings
  bun run src/index.ts --intensity 0.012 --variance 0.3

  # Reproducible results with seed
  bun run src/index.ts --seed 12345

  # Custom input/output directories
  bun run src/index.ts --input ./photos --output ./processed
`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const { config: configOverrides, inputDir, outputDir, showHelp, showPresetList } = parseArgs();

  if (showHelp) {
    showHelpMessage();
    process.exit(0);
  }

  if (showPresetList) {
    showPresetListMessage();
    process.exit(0);
  }

  console.log('🎬 Realistic Camera Noise Processor\n');

  // Create and validate configuration
  const config = createConfig(configOverrides);

  try {
    validateConfig(config);
  } catch (error) {
    console.error(`❌ Invalid configuration: ${(error as Error).message}`);
    process.exit(1);
  }

  // Display current configuration
  console.log('Configuration:');
  console.log(`  Intensity:       ${config.intensity.toFixed(4)}`);
  console.log(`  Variance:        ${config.variance.toFixed(2)}`);
  console.log(`  Micro-contrast:  ${config.microContrast.toFixed(2)}`);
  console.log(`  Luminance-dependent: ${config.luminanceDependent ? 'Yes' : 'No'}`);
  console.log(`  Seed:            ${config.seed ?? 'Random'}\n`);

  // Ensure output directory exists
  try {
    await ensureDirectory(outputDir);
  } catch (error) {
    console.error(`❌ Failed to create output directory: ${(error as Error).message}`);
    process.exit(1);
  }

  // Get input images
  let imageFiles: string[];
  try {
    imageFiles = await getImageFiles(inputDir);
  } catch (error) {
    console.error(`❌ Failed to read input directory: ${(error as Error).message}`);
    process.exit(1);
  }

  if (imageFiles.length === 0) {
    console.log(`⚠️  No images found in ${inputDir}`);
    console.log('Supported formats: .jpg, .jpeg, .png, .webp, .tiff, .avif, .heic');
    process.exit(0);
  }

  console.log(`📁 Found ${imageFiles.length} image(s) in ${inputDir}\n`);

  // Prepare input/output paths
  const inputPaths = imageFiles;
  const outputPaths = imageFiles.map(path => getOutputPath(path, outputDir));

  // Process images
  const startTime = performance.now();

  try {
    await processImageBatch(
      inputPaths,
      outputPaths,
      config,
      (current, total, result) => {
        const percentage = ((current / total) * 100).toFixed(0);
        console.log(
          `✓ [${current}/${total}] ${basename(result.inputPath)} ` +
          `(${result.width}×${result.height}) - ${formatTime(result.processingTimeMs)}`
        );
      }
    );
  } catch (error) {
    console.error(`\n❌ Processing failed: ${(error as Error).message}`);
    process.exit(1);
  }

  const totalTime = performance.now() - startTime;

  console.log(`\n✨ Complete! Processed ${imageFiles.length} image(s) in ${formatTime(totalTime)}`);
  console.log(`📂 Output saved to: ${outputDir}`);
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
