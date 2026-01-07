#!/usr/bin/env node

/**
 * Generate OG image PNG from HTML template
 *
 * Requirements:
 * - Node.js 18+
 * - puppeteer or playwright
 *
 * Usage:
 *   node scripts/generate-og-image.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const publicDir = join(projectRoot, 'public');
const htmlPath = join(publicDir, 'og-image-generator.html');
const outputPath = join(publicDir, 'og-image.png');

async function generateWithPuppeteer() {
  try {
    const puppeteer = await import('puppeteer');
    console.log('Using Puppeteer...');

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Screenshot only the OG container (not the instructions)
    const element = await page.$('.og-container');
    await element.screenshot({
      path: outputPath,
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 1200,
        height: 630
      }
    });

    await browser.close();

    console.log(`✓ OG image generated: ${outputPath}`);
    console.log('  Size: 1200×630px');
    console.log('  Format: PNG');
    return true;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      return false;
    }
    throw error;
  }
}

async function generateWithPlaywright() {
  try {
    const { chromium } = await import('playwright');
    console.log('Using Playwright...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 }
    });

    const page = await context.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    // Wait for fonts
    await page.evaluate(() => document.fonts.ready);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Screenshot the exact area
    await page.locator('.og-container').screenshot({
      path: outputPath,
      type: 'png'
    });

    await browser.close();

    console.log(`✓ OG image generated: ${outputPath}`);
    console.log('  Size: 1200×630px');
    console.log('  Format: PNG');
    return true;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      return false;
    }
    throw error;
  }
}

async function main() {
  console.log('ZAMM OG Image Generator\n');

  // Check if HTML template exists
  if (!existsSync(htmlPath)) {
    console.error(`✗ Template not found: ${htmlPath}`);
    console.error('  Run this script from the project root directory.');
    process.exit(1);
  }

  // Try Puppeteer first, then Playwright
  const puppeteerSuccess = await generateWithPuppeteer();
  if (puppeteerSuccess) return;

  const playwrightSuccess = await generateWithPlaywright();
  if (playwrightSuccess) return;

  // Neither library is installed
  console.error('✗ No screenshot library found.');
  console.error('\nInstall one of these:');
  console.error('  pnpm add -D puppeteer');
  console.error('  pnpm add -D playwright && pnpx playwright install chromium');
  console.error('\nOr generate manually:');
  console.error(`  1. Open: file://${htmlPath}`);
  console.error('  2. Take a screenshot of the top 1200×630px area');
  console.error(`  3. Save as: ${outputPath}`);
  process.exit(1);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
