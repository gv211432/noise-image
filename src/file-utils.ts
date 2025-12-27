/**
 * File system utilities for batch image processing
 */

import { readdir, mkdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';

/**
 * Supported image formats
 */
const SUPPORTED_FORMATS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',
  '.tif',
  '.avif',
  '.heic',
  '.heif'
]);

/**
 * Check if file has supported image extension
 *
 * @param filename - File name to check
 * @returns True if file is a supported image format
 */
export function isSupportedImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return SUPPORTED_FORMATS.has(ext);
}

/**
 * Get all image files from a directory
 *
 * @param dirPath - Directory path to scan
 * @returns Array of absolute paths to image files
 */
export async function getImageFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);

    const imageFiles = entries
      .filter(isSupportedImageFile)
      .map(filename => join(dirPath, filename));

    return imageFiles;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    throw error;
  }
}

/**
 * Ensure directory exists, create if it doesn't
 *
 * @param dirPath - Directory path
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${dirPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Directory doesn't exist, create it
      await mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

/**
 * Generate output path for processed image
 *
 * @param inputPath - Input file path
 * @param outputDir - Output directory
 * @param suffix - Optional suffix to add to filename (default: none)
 * @returns Output file path
 */
export function getOutputPath(
  inputPath: string,
  outputDir: string,
  suffix: string = ''
): string {
  const filename = basename(inputPath);
  const ext = extname(filename);
  const nameWithoutExt = basename(filename, ext);

  const outputFilename = suffix
    ? `${nameWithoutExt}${suffix}${ext}`
    : filename;

  return join(outputDir, outputFilename);
}

/**
 * Format file size in human-readable format
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format processing time in human-readable format
 *
 * @param ms - Time in milliseconds
 * @returns Formatted string (e.g., "1.23s" or "456ms")
 */
export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
