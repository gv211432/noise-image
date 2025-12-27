# Technical Documentation: Camera Noise Simulation

## How Camera Sensor Noise Actually Works

### Physical Origins of Noise

Real digital camera sensors produce noise from three primary sources:

#### 1. Shot Noise (Photon Noise)
- **Cause**: Quantum nature of light - photons arrive randomly
- **Characteristics**:
  - Follows **Poisson distribution**
  - Proportional to √signal (more light = more absolute noise, but better SNR)
  - Dominant in well-lit areas
- **Our Implementation**: Luminance-dependent scaling with power curve

#### 2. Read Noise
- **Cause**: Electronics reading charge from sensor
- **Characteristics**:
  - Signal-independent (constant across all brightness)
  - Follows **Gaussian distribution**
  - More visible in shadows where signal is weak
- **Our Implementation**: Base Gaussian noise layer

#### 3. Dark Current Noise
- **Cause**: Thermal electrons (heat) in sensor
- **Characteristics**:
  - Temperature-dependent
  - Increases with exposure time
  - Also Poisson-distributed
- **Our Implementation**: Included in spatial variance component

### Why Real Cameras Have Per-Channel Noise Differences

Bayer sensors (used in 99% of cameras) have:

```
G R G R    50% Green pixels
B G B G    25% Red pixels
G R G R    25% Blue pixels
B G B G
```

**Result**:
- **Green**: Most data points → lowest noise (best averaging)
- **Blue**: Shortest wavelength → lowest quantum efficiency → most noise
- **Red**: Middle ground

Our multipliers (G: 0.85×, R: 1.0×, B: 1.25×) reflect this reality.

## Mathematical Foundation

### Box-Muller Transform

Converts uniform random numbers to Gaussian distribution:

```typescript
u1, u2 ~ Uniform(0, 1)  // Two independent uniform random variables

// Polar form of Box-Muller:
z0 = √(-2 ln(u1)) × cos(2π u2)  // Gaussian(0, 1)
z1 = √(-2 ln(u1)) × sin(2π u2)  // Independent Gaussian(0, 1)

// Scale to desired mean and standard deviation:
result = mean + z0 × stdDev
```

**Why this matters**:
- Photoshop's "Add Noise" uses uniform random → looks artificial
- Real sensor noise is Gaussian → our tool is physically accurate

### Luminance-Dependent Noise Model

```typescript
luminance_normalized = pixel_brightness / 255  // [0, 1]

// Shot noise: σ ∝ √signal
// Simplified model using power curve:
noise_scale = 1 + (1 - luminance_normalized)^1.5

// Result:
// luminance = 0   (black):  scale = 2.0  (2× noise)
// luminance = 0.5 (mid):    scale = 1.35 (1.35× noise)
// luminance = 1   (white):  scale = 1.0  (1× noise)
```

This creates the characteristic "noisy shadows, clean highlights" of real photos.

### Spatial Variance (Non-Uniform Noise Field)

```typescript
for each pixel:
  base_noise = Gaussian(0, intensity)

  // Add position-dependent variance
  variance_multiplier = Gaussian(1, variance)

  final_noise = base_noise × variance_multiplier
```

Creates "hot pixels" and regional noise variations like real sensors.

## Image Processing Pipeline Details

### Step-by-Step Breakdown

#### 1. Load Image
```typescript
const image = sharp(inputPath);
const metadata = await image.metadata();
const { data } = await image.raw().toBuffer();
```

Sharp loads image into raw RGB buffer:
```
[R₀, G₀, B₀, R₁, G₁, B₁, R₂, G₂, B₂, ...]
 ↑   ↑   ↑
Pixel 0    Pixel 1
```

#### 2. Generate Noise Maps
```typescript
// Base noise (affects all channels)
baseNoise[i] = Gaussian(0, intensity) × Gaussian(1, variance)

// Per-channel noise (RGB differences)
rNoise[i] = Gaussian(0, intensity × 1.0 × 0.3)
gNoise[i] = Gaussian(0, intensity × 0.85 × 0.3)
bNoise[i] = Gaussian(0, intensity × 1.25 × 0.3)
```

#### 3. Apply to Each Pixel
```typescript
for (pixel in image):
  r, g, b = pixel.rgb

  // Calculate luminance (rec709 coefficients)
  luminance = 0.2126×r + 0.7152×g + 0.0722×b

  // Get noise scaling
  if (luminanceDependent):
    scale = getLuminanceNoiseScale(luminance)
  else:
    scale = 1.0

  // Apply combined noise
  noise_r = (baseNoise[i] × scale + rNoise[i]) × 255
  noise_g = (baseNoise[i] × scale + gNoise[i]) × 255
  noise_b = (baseNoise[i] × scale + bNoise[i]) × 255

  // Clamp to valid range
  pixel.r = clamp(r + noise_r, 0, 255)
  pixel.g = clamp(g + noise_g, 0, 255)
  pixel.b = clamp(b + noise_b, 0, 255)
```

#### 4. Micro-Contrast (Optional)
```typescript
// Linear contrast adjustment
multiplier = 1 + (microContrast × 0.1)  // e.g., 1.02 for 20% setting
offset = -(128 × (multiplier - 1))      // Keep middle gray at 128

new_value = old_value × multiplier + offset
```

This adds subtle local contrast without global changes.

#### 5. Save with Metadata
```typescript
sharp(processedBuffer)
  .withMetadata({ icc: originalICC })  // Preserve color profile
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(output)
```

## Calibration Rationale

### Why These Intensity Values?

Real camera noise measurement:

| ISO | Noise Level (σ as % of max) |
|-----|----------------------------|
| 100 | 0.3% - 0.5% |
| 400 | 0.8% - 1.2% |
| 800 | 1.5% - 2.0% |
| 1600 | 2.5% - 3.5% |
| 3200 | 4.0% - 6.0% |

Our presets:

| Preset | Intensity | Equivalent ISO |
|--------|-----------|---------------|
| subtle | 0.004 (0.4%) | ISO 100-200 |
| normal | 0.008 (0.8%) | ISO 400-800 |
| moderate | 0.015 (1.5%) | ISO 1600-2500 |

### Why Multiply by 255 When Applying?

Our noise is generated in [0, 1] float space:
```
intensity = 0.008  // 0.8% of max signal
noise_value = Gaussian(0, 0.008)  // Typically -0.024 to +0.024

// Convert to pixel value change:
pixel_offset = noise_value × 255  // -6 to +6 pixel values
```

For an 8-bit image (0-255), changing a pixel by ±6 is ~2% variation - imperceptible but effective.

## Performance Optimization

### Memory Layout

```typescript
// BAD: Array of objects (poor cache locality)
pixels = [
  { r: 255, g: 128, b: 64 },
  { r: 200, g: 100, b: 50 },
  ...
]

// GOOD: Flat typed array (cache-friendly)
pixels = Uint8Array[255, 128, 64, 200, 100, 50, ...]
                     ↑    ↑    ↑
                     R    G    B of pixel 0
```

### Why Float32Array for Noise?

```typescript
// Noise values are fractional
noise = [-0.008, +0.012, -0.003, ...]

// Using Uint8Array would require scaling:
// scaled = (noise + 1) × 127  // Loses precision
// noise = (scaled / 127) - 1

// Float32Array preserves precision:
noise_float = new Float32Array(pixelCount)  // Direct fractional values
```

### Batch Processing Trade-offs

**Sequential vs. Parallel**:
```typescript
// We chose sequential:
for (image in batch):
  await processImage(image)

// Why not parallel?
// await Promise.all(batch.map(processImage))
```

**Reason**: Each 4K image uses ~50MB RAM during processing. Processing 10 in parallel = 500MB. Sequential keeps memory constant.

## Comparison to Other Approaches

### vs. Photoshop "Add Noise"

| Feature | Our Tool | Photoshop |
|---------|----------|-----------|
| Distribution | Gaussian (Box-Muller) | Uniform or approximate |
| Luminance | Accurate shot noise model | Optional, uniform multiplier |
| Per-channel | RGB differ (Bayer model) | Monochrome or equal RGB |
| Batch | CLI automation | Manual/action scripts |
| Reproducibility | Seeded random | Non-deterministic |

### vs. Lightroom Grain

| Feature | Our Tool | Lightroom |
|---------|----------|-----------|
| Purpose | Sensor noise simulation | Film grain aesthetic |
| Amplitude | 0.5-2% (realistic) | 5-20% (artistic) |
| Pattern | Stochastic, non-uniform | Often tiled or structured |
| Science | Physics-based | Artist-designed |

## Future Enhancements

### 1. Full Poisson Noise Model

Current: Gaussian approximation
Better: True Poisson sampling

```typescript
// For each pixel:
expectedPhotons = luminance × scaleFactor
actualPhotons = poissonRandom(expectedPhotons)  // Discrete
noise = actualPhotons - expectedPhotons
```

**Challenge**: Poisson random generation is slower than Gaussian.

### 2. Color Noise (Chrominance)

Current: Only luminance noise
Enhancement: Add color channel errors

```typescript
// Convert RGB → YCbCr
// Add noise to Cb, Cr channels
// Convert back to RGB
```

### 3. Frequency-Dependent Noise

Current: Spatial domain only
Enhancement: Add noise in frequency domain

```typescript
// High frequencies (edges) → less noise
// Low frequencies (gradients) → more noise
```

**Why**: Real sensors have frequency response curves.

### 4. Camera Profiles

Measure real cameras and create presets:

```typescript
profiles = {
  'canon-5d-mk4': { intensity: 0.007, rMult: 0.98, bMult: 1.3 },
  'sony-a7r-iv': { intensity: 0.006, rMult: 1.02, bMult: 1.2 },
  ...
}
```

## References

- [Photon Shot Noise Theory](https://en.wikipedia.org/wiki/Shot_noise)
- [Digital Camera Sensor Noise](https://www.clarkvision.com/articles/digital.signal.to.noise/)
- Box-Muller Transform: Numerical Recipes (Press et al.)
- Bayer Filter: US Patent 3,971,065

---

**For questions or deep dives, see [README.md](README.md) for practical usage.**
