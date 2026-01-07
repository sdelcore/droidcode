/**
 * Generate DroidCode app icons
 *
 * Design: "C" icon with pixelated square style
 * - Background: #1A1918
 * - Outer frame: #656363 (C shape - no right bar)
 * - Inner square: #CFCECD (shifted left for balance)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Colors from the native droidcode design
const COLORS = {
  background: '#1A1918',
  outerFrame: '#656363',
  innerSquare: '#CFCECD',
};

// Original viewport was 108x108 with content at 30-78 range
// Scaling to target size preserving proportions
function generateIconSVG(size, includeBackground = true) {
  const scale = size / 108;

  // Coordinates from vector drawable, scaled
  const frameStart = Math.round(30 * scale);
  const frameEnd = Math.round(78 * scale);
  const frameThickness = Math.round(6 * scale);

  // Shift inner square left by ~4 units for visual balance with open C
  const innerShift = Math.round(4 * scale);
  const innerStart = Math.round(42 * scale) - innerShift;
  const innerEnd = Math.round(66 * scale) - innerShift;

  const backgroundRect = includeBackground
    ? `<rect width="${size}" height="${size}" fill="${COLORS.background}"/>`
    : '';

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${backgroundRect}

  <!-- Outer frame "C" shape (dark gray) -->
  <!-- Top bar -->
  <rect x="${frameStart}" y="${frameStart}" width="${frameEnd - frameStart}" height="${frameThickness}" fill="${COLORS.outerFrame}"/>

  <!-- Bottom bar -->
  <rect x="${frameStart}" y="${frameEnd - frameThickness}" width="${frameEnd - frameStart}" height="${frameThickness}" fill="${COLORS.outerFrame}"/>

  <!-- Left bar -->
  <rect x="${frameStart}" y="${frameStart}" width="${frameThickness}" height="${frameEnd - frameStart}" fill="${COLORS.outerFrame}"/>

  <!-- No right bar - creates "C" shape -->

  <!-- Inner square (light gray) - shifted left for balance -->
  <rect x="${innerStart}" y="${innerStart}" width="${innerEnd - innerStart}" height="${innerEnd - innerStart}" fill="${COLORS.innerSquare}"/>
</svg>`;
}

async function generateIcon(filename, size, includeBackground = true) {
  const outputPath = path.join(__dirname, '..', 'assets', 'images', filename);
  const svg = generateIconSVG(size, includeBackground);

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);

  console.log(`Generated: ${filename} (${size}x${size})`);
}

async function main() {
  console.log('Generating DroidCode icons...\n');

  // Ensure output directory exists
  const outputDir = path.join(__dirname, '..', 'assets', 'images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate main icon (with background)
  await generateIcon('icon.png', 1024, true);

  // Generate adaptive icon foreground (transparent background)
  await generateIcon('adaptive-icon.png', 1024, false);

  // Generate splash icon (with background)
  await generateIcon('splash-icon.png', 1024, true);

  // Generate favicon (with background, smaller)
  await generateIcon('favicon.png', 48, true);

  console.log('\nDone! Icons generated in assets/images/');
}

main().catch(console.error);
