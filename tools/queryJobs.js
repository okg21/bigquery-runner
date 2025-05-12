#!/usr/bin/env node

/**
 * BigQuery Runner Extension - BigQuery Job History Tool
 * Lists recent BigQuery jobs to correlate with scheduled query runs
 * 
 * Usage: node tools/queryJobs.js <projectId> [maxResults]
 * Example: node tools/queryJobs.js my-project 10
 */

const { BigQuery } = require('@google-cloud/bigquery');
const { checkApplicationDefaultCredentials } = require('./auth-check');

/**
 * Format date in readable form
 * @param {string|number} timestamp - Timestamp value 
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
  if (!timestamp) {
    return 'N/A';
  }
  
  try {
    const date = new Date(Number(timestamp));
    return date.toISOString();
  } catch (error) {
    return String(timestamp);
  }
}

/**
 * List recent BigQuery jobs
 * @param {string} projectId - Google Cloud project ID
 * @param {number} maxResults - Maximum number of results to return (default: 10)
 */
async function listRecentJobs(projectId, maxResults = 10) {
  if (!projectId) {
    console.error('Error: Missing project ID');
    console.error('Usage: node queryJobs.js <projectId> [maxResults]');
    process.exit(1);
  }

  try {
    const bigquery = new BigQuery({ projectId });
    
    // Get recent jobs for the project
    const [jobs] = await bigquery.getJobs({ 
      maxResults: Number(maxResults),
      stateFilter: 'done',
      allUsers: true
    });
    
    if (jobs.length === 0) {
      console.log('No recent jobs found.');
      return;
    }
    
    console.log(`Found ${jobs.length} recent jobs in project ${projectId}:\n`);
    
    jobs.forEach(job => {
      const metadata = job.metadata;
      const stats = metadata.statistics || {};
      
      console.log(`Job ID: ${job.id}`);
      console.log(`  Created: ${formatDate(stats.creationTime)}`);
      console.log(`  Started: ${formatDate(stats.startTime)}`);
      console.log(`  Ended: ${formatDate(stats.endTime)}`);
      console.log(`  Status: ${metadata.status ? metadata.status.state : 'Unknown'}`);
      
      // Print detailed stats
      if (stats.totalBytesProcessed) {
        console.log(`  Bytes processed: ${stats.totalBytesProcessed}`);
      }
      if (stats.totalBytesBilled) {
        console.log(`  Bytes billed: ${stats.totalBytesBilled}`);
      }
      if (stats.startTime && stats.endTime) {
        const duration = Number(stats.endTime) - Number(stats.startTime);
        console.log(`  Duration: ${duration} ms`);
      }
      
      // Print query information if available
      if (metadata.configuration && metadata.configuration.query) {
        const query = metadata.configuration.query.query || '';
        console.log(`  Query: ${query.length > 100 ? query.substring(0, 100) + '...' : query}`);
        
        // Print destination table if available
        if (metadata.configuration.query.destinationTable) {
          const table = metadata.configuration.query.destinationTable;
          console.log(`  Destination: ${table.projectId}.${table.datasetId}.${table.tableId}`);
        }
        
        // Print job labels if available
        if (metadata.labels) {
          console.log('  Labels:');
          Object.entries(metadata.labels).forEach(([key, value]) => {
            console.log(`    ${key}: ${value}`);
          });
        }
      }
      
      console.log('-'.repeat(80));
    });
  } catch (error) {
    console.error(`Error listing jobs: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  const projectId = process.argv[2];
  const maxResults = process.argv[3] || 10;
  
  // Check authentication before running
  const isAuthenticated = checkApplicationDefaultCredentials();
  if (!isAuthenticated) {
    console.error('\nAuthentication required before running BigQuery API calls.');
    process.exit(1);
  }
  
  console.log('\nAuthentication successful. Proceeding...\n');
  
  listRecentJobs(projectId, maxResults).catch(error => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
  });
}

// Export for module usage
module.exports = { listRecentJobs }; 