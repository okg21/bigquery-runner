#!/usr/bin/env node

/**
 * BigQuery Runner Extension - Scheduled Queries Prototype Tool
 * Lists scheduled queries for a given project and region
 * 
 * Usage: node tools/listSched.js <projectId> <region>
 * Example: node tools/listSched.js my-project us
 */

const { DataTransferServiceClient } = require('@google-cloud/bigquery-data-transfer');
const { checkApplicationDefaultCredentials } = require('./auth-check');

/**
 * Format a date object or timestamp to ISO string safely
 * @param {Date|Object|string} dateValue - The date value to format
 * @returns {string} Formatted date string or N/A
 */
function formatDate(dateValue) {
  if (!dateValue) {
    return 'N/A';
  }
  
  try {
    // Handle different date formats that might be returned by the API
    if (typeof dateValue === 'string') {
      return new Date(dateValue).toISOString();
    } else if (dateValue instanceof Date) {
      return dateValue.toISOString();
    } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      return dateValue.toDate().toISOString();
    } else if (dateValue.seconds && dateValue.nanos) {
      // Handle Timestamp proto format
      const milliseconds = dateValue.seconds * 1000 + dateValue.nanos / 1000000;
      return new Date(milliseconds).toISOString();
    } else {
      // Try to convert to string
      return String(dateValue);
    }
  } catch (error) {
    return String(dateValue);
  }
}

async function listScheduledQueries(projectId, region) {
  if (!projectId || !region) {
    console.error('Error: Missing required arguments');
    console.error('Usage: node listSched.js <projectId> <region>');
    console.error('Example: node listSched.js my-project us');
    process.exit(1);
  }

  try {
    // Initialize the client
    const client = new DataTransferServiceClient();
    
    // Build the parent path for the request
    const parent = `projects/${projectId}/locations/${region}`;
    
    console.log(`Fetching scheduled queries for ${parent}...`);
    
    // List transfer configs, filtering for scheduled queries
    const [configs] = await client.listTransferConfigs({
      parent,
      dataSourceIds: ['scheduled_query']
    });
    
    // Display results
    if (configs.length === 0) {
      console.log('No scheduled queries found.');
    } else {
      console.log(`Found ${configs.length} scheduled queries:`);
      configs.forEach((config, i) => {
        console.log(`\n[${i + 1}] ${config.displayName}`);
        console.log(`  Name: ${config.name}`);
        console.log(`  Schedule: ${config.schedule}`);
        console.log(`  State: ${config.state}`);
        console.log(`  Last update time: ${formatDate(config.updateTime)}`);
      });
    }
    
    return configs;
  } catch (error) {
    console.error('Error listing scheduled queries:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  const projectId = process.argv[2];
  const region = process.argv[3];
  
  // Check authentication before running the query
  const isAuthenticated = checkApplicationDefaultCredentials();
  if (!isAuthenticated) {
    console.error('\nAuthentication required before running BigQuery API calls.');
    process.exit(1);
  }
  
  console.log('\nAuthentication successful. Proceeding with query...\n');
  
  listScheduledQueries(projectId, region).catch(error => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
  });
}

// Export for module usage
module.exports = { listScheduledQueries }; 