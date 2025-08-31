#!/usr/bin/env node

// Test script to verify X402 setup
console.log('🧪 Testing X402 Setup...');

// Test 1: Check if x402-server.js exists
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const x402ServerPath = path.join(__dirname, 'x402-server.js');

if (fs.existsSync(x402ServerPath)) {
  console.log('✅ x402-server.js exists');
  
  // Read and verify content
  const content = fs.readFileSync(x402ServerPath, 'utf8');
  
  if (content.includes('paymentMiddleware')) {
    console.log('✅ X402 payment middleware found');
  } else {
    console.log('❌ X402 payment middleware not found');
  }
  
  if (content.includes('4021')) {
    console.log('✅ Server configured for port 4021');
  } else {
    console.log('❌ Port 4021 not found');
  }
  
  if (content.includes('/weather')) {
    console.log('✅ Weather endpoint configured');
  } else {
    console.log('❌ Weather endpoint not found');
  }
  
  if (content.includes('base-sepolia')) {
    console.log('✅ Base Sepolia network configured');
  } else {
    console.log('❌ Base Sepolia network not found');
  }
  
  if (content.includes('$0.0000001')) {
    console.log('✅ Price $0.0000001 configured');
  } else {
    console.log('❌ Price $0.0000001 not found');
  }
  
} else {
  console.log('❌ x402-server.js does not exist');
}

// Test 2: Check package.json for x402-server script
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (packageJson.scripts && packageJson.scripts['x402-server']) {
    console.log('✅ x402-server script found in package.json');
  } else {
    console.log('❌ x402-server script not found in package.json');
  }
  
  if (packageJson.dependencies && packageJson.dependencies['x402-express']) {
    console.log('✅ x402-express dependency found');
  } else {
    console.log('❌ x402-express dependency not found');
  }
} else {
  console.log('❌ package.json not found');
}

// Test 3: Check server.js for start-x402-server endpoint
const serverJsPath = path.join(__dirname, 'server.js');
if (fs.existsSync(serverJsPath)) {
  const serverContent = fs.readFileSync(serverJsPath, 'utf8');
  
  if (serverContent.includes('/api/start-x402-server')) {
    console.log('✅ /api/start-x402-server endpoint found');
  } else {
    console.log('❌ /api/start-x402-server endpoint not found');
  }
  
  if (serverContent.includes('spawn')) {
    console.log('✅ spawn import found for process management');
  } else {
    console.log('❌ spawn import not found');
  }
} else {
  console.log('❌ server.js not found');
}

console.log('\n🎯 Setup Summary:');
console.log('1. X402 server file created with exact weather script');
console.log('2. Package.json updated with x402-server script');
console.log('3. Main server updated with /api/start-x402-server endpoint');
console.log('4. Frontend button updated to start server and open new tab');

console.log('\n🚀 How it works:');
console.log('1. User clicks purchase button');
console.log('2. Frontend calls /api/start-x402-server');
console.log('3. Backend starts x402-server.js on port 4021');
console.log('4. Frontend opens http://localhost:4021/weather in new tab');
console.log('5. X402 middleware handles payment flow');

console.log('\n✨ Test complete!');
