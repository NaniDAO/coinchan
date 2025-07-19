#!/usr/bin/env node

/**
 * Build script to fetch Trust Wallet token list and create a minimal artifact
 * Fetches from Trust Wallet's GitHub repository and validates against Uniswap schema
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trust Wallet token list URL
const TRUST_WALLET_URL = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/tokenlist.json';

// Uniswap Token List schema (simplified for validation)
const TOKEN_LIST_SCHEMA = {
  required: ['name', 'version', 'tokens'],
  tokenRequired: ['chainId', 'address', 'symbol', 'name', 'decimals']
};

// Output paths
const BUILD_DIR = path.join(__dirname, '..', 'build');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_FILE = path.join(BUILD_DIR, 'trust-eth-erc20.tokens.json');
const PUBLIC_FILE = path.join(PUBLIC_DIR, 'trust-eth-erc20.tokens.json');
const COMPRESSED_FILE = path.join(BUILD_DIR, 'trust-eth-erc20.tokens.json.gz');

/**
 * Fetch data from URL
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Validate address and convert to checksum format
 */
function toChecksumAddress(address) {
  if (!address || typeof address !== 'string') return null;
  
  // Remove 0x prefix if present
  const cleanAddress = address.replace(/^0x/i, '');
  
  // Validate hex format and length
  if (!/^[0-9a-fA-F]{40}$/.test(cleanAddress)) return null;
  
  // Simple checksum implementation (EIP-55)
  const hash = crypto.createHash('sha3-256').update(cleanAddress.toLowerCase()).digest('hex');
  let checksumAddress = '0x';
  
  for (let i = 0; i < cleanAddress.length; i++) {
    const char = cleanAddress[i];
    if (parseInt(hash[i], 16) >= 8) {
      checksumAddress += char.toUpperCase();
    } else {
      checksumAddress += char.toLowerCase();
    }
  }
  
  return checksumAddress;
}

/**
 * Validate token against schema
 */
function validateToken(token) {
  // Check required fields - but skip chainId since it's optional in Trust Wallet data
  const requiredFields = TOKEN_LIST_SCHEMA.tokenRequired.filter(field => field !== 'chainId');
  for (const field of requiredFields) {
    if (!(field in token)) {
      return false;
    }
  }
  
  // Validate chainId (must be 1 for Ethereum mainnet, default to 1 if missing)
  const chainId = token.chainId ?? 1; // Default to mainnet if missing
  if (chainId !== 1) return false;
  
  // Validate decimals (must be number between 0-255)
  if (typeof token.decimals !== 'number' || token.decimals < 0 || token.decimals > 255) {
    return false;
  }
  
  // Validate address format
  const checksumAddress = toChecksumAddress(token.address);
  if (!checksumAddress) return false;
  
  // Validate symbol and name
  if (!token.symbol || !token.name || typeof token.symbol !== 'string' || typeof token.name !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Process token list
 */
function processTokenList(rawData) {
  let tokenList;
  
  try {
    tokenList = JSON.parse(rawData);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
  
  // Validate top-level schema
  for (const field of TOKEN_LIST_SCHEMA.required) {
    if (!(field in tokenList)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  if (!Array.isArray(tokenList.tokens)) {
    throw new Error('tokens must be an array');
  }
  
  console.log(`Processing ${tokenList.tokens.length} tokens...`);
  
  // Note: Trust Wallet's token list has inconsistent data - many tokens missing chainId field
  // We'll assume chainId = 1 (Ethereum mainnet) for missing chainId fields
  
  // Filter and process tokens
  const processed = new Map(); // Use Map to deduplicate by address
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  
  for (const token of tokenList.tokens) {
    // Skip non-ERC20 tokens (if type field exists)
    if (token.type && token.type !== 'ERC20') {
      continue;
    }
    
    if (!validateToken(token)) {
      invalidCount++;
      continue;
    }
    
    const checksumAddress = toChecksumAddress(token.address);
    
    // Check for duplicates
    if (processed.has(checksumAddress)) {
      duplicateCount++;
      continue;
    }
    
    // Create minimal token object
    const minimalToken = {
      address: checksumAddress,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoURI: token.logoURI || null
    };
    
    processed.set(checksumAddress, minimalToken);
    validCount++;
  }
  
  console.log(`✓ Valid tokens: ${validCount}`);
  console.log(`✗ Invalid tokens: ${invalidCount}`);
  console.log(`⚠ Duplicate tokens: ${duplicateCount}`);
  
  // Convert Map to array and sort by symbol
  const tokens = Array.from(processed.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  return {
    generated: new Date().toISOString(),
    source: 'Trust Wallet',
    chainId: 1,
    count: tokens.length,
    tokens
  };
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔄 Fetching Trust Wallet token list...');
    const rawData = await fetchUrl(TRUST_WALLET_URL);
    
    console.log('📋 Processing token list...');
    const processedData = processTokenList(rawData);
    
    // Ensure directories exist
    if (!fs.existsSync(BUILD_DIR)) {
      fs.mkdirSync(BUILD_DIR, { recursive: true });
    }
    if (!fs.existsSync(PUBLIC_DIR)) {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }
    
    // Write uncompressed files
    console.log('💾 Writing token list...');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedData, null, 2));
    fs.writeFileSync(PUBLIC_FILE, JSON.stringify(processedData, null, 2));
    
    // Write compressed file
    console.log('🗜️  Compressing token list...');
    const compressed = zlib.gzipSync(JSON.stringify(processedData));
    fs.writeFileSync(COMPRESSED_FILE, compressed);
    
    console.log('✅ Token list build complete!');
    console.log(`📄 Output: ${OUTPUT_FILE}`);
    console.log(`📄 Public: ${PUBLIC_FILE}`);
    console.log(`📦 Compressed: ${COMPRESSED_FILE}`);
    console.log(`🎯 Processed ${processedData.count} tokens`);
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, processTokenList, validateToken, toChecksumAddress };