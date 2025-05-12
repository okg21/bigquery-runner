#!/usr/bin/env node

/**
 * BigQuery Runner Extension - Authentication Check Tool
 * Checks if Google Cloud authentication is set up properly and guides through setup
 * 
 * Usage: node tools/auth-check.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkGcloudInstalled() {
  try {
    const output = execSync('gcloud --version', { stdio: 'pipe' }).toString();
    return output.includes('Google Cloud SDK');
  } catch (error) {
    return false;
  }
}

function checkApplicationDefaultCredentials() {
  // Check if GOOGLE_APPLICATION_CREDENTIALS is set
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(credPath)) {
      console.log('✅ GOOGLE_APPLICATION_CREDENTIALS environment variable is set and points to an existing file:');
      console.log(`   ${credPath}`);
      return true;
    } else {
      console.log('❌ GOOGLE_APPLICATION_CREDENTIALS points to a non-existent file:');
      console.log(`   ${credPath}`);
      return false;
    }
  }

  // Check for application default credentials
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const adcPath = path.join(homeDir, '.config', 'gcloud', 'application_default_credentials.json');
  
  if (fs.existsSync(adcPath)) {
    console.log('✅ Application Default Credentials found at:');
    console.log(`   ${adcPath}`);
    return true;
  } else {
    console.log('❌ No Application Default Credentials found');
    return false;
  }
}

function printAuthInstructions() {
  console.log('\n=== Google Cloud Authentication Instructions ===\n');
  
  if (checkGcloudInstalled()) {
    console.log('✅ Google Cloud SDK (gcloud) is installed');
    console.log('\nTo authenticate, run one of the following commands:\n');
    console.log('Option 1: Set up application-default credentials (recommended):');
    console.log('  gcloud auth application-default login\n');
    console.log('Option 2: Use a service account key file:');
    console.log('  1. Download a service account key JSON file from the Google Cloud Console');
    console.log('  2. Set the environment variable:');
    console.log('     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-key-file.json"');
  } else {
    console.log('❌ Google Cloud SDK (gcloud) is not installed');
    console.log('\nPlease install the Google Cloud SDK first:');
    console.log('  https://cloud.google.com/sdk/docs/install\n');
    console.log('Then authenticate using one of the methods described above.');
  }
  
  console.log('\nFor more information, visit:');
  console.log('  https://cloud.google.com/docs/authentication/getting-started');
}

// Main function
function main() {
  console.log('=== Google Cloud Authentication Check ===\n');
  
  const isAuthenticated = checkApplicationDefaultCredentials();
  
  if (!isAuthenticated) {
    printAuthInstructions();
    process.exit(1);
  }
  
  console.log('\n✅ You are authenticated and ready to use Google Cloud APIs');
}

if (require.main === module) {
  main();
}

module.exports = { checkApplicationDefaultCredentials }; 