#!/usr/bin/env node

/**
 * Script to generate an animated GIF favicon from the zammzamm.mp4 video
 * 
 * Prerequisites:
 * - ffmpeg installed on the system
 * 
 * Usage:
 * node scripts/generate-favicon-gif.js
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputVideo = path.join(__dirname, '../public/zammzamm.mp4');
const outputGif = path.join(__dirname, '../public/zammzamm.gif');

// Check if input video exists
if (!fs.existsSync(inputVideo)) {
  console.error('Error: zammzamm.mp4 not found in public directory');
  process.exit(1);
}

// FFmpeg command to generate GIF
// - Scale to 64x64 for favicon
// - Use a good palette for better quality
// - Loop infinitely
// - Optimize file size
const command = `ffmpeg -i "${inputVideo}" \
  -vf "fps=10,scale=64:64:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 \
  "${outputGif}"`;

console.log('Generating animated favicon GIF from zammzamm.mp4...');
console.log('Command:', command);

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('Error generating GIF:', error.message);
    console.error('Make sure ffmpeg is installed: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)');
    return;
  }

  if (stderr) {
    console.log('FFmpeg output:', stderr);
  }

  console.log('✅ Successfully generated zammzamm.gif');
  
  // Check file size
  const stats = fs.statSync(outputGif);
  const fileSizeInKB = stats.size / 1024;
  console.log(`📦 File size: ${fileSizeInKB.toFixed(2)} KB`);
  
  if (fileSizeInKB > 100) {
    console.warn('⚠️  Warning: GIF is larger than 100KB. Consider optimizing further.');
  }
});