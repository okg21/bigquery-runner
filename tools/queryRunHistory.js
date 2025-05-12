#!/usr/bin/env node

/**
 * BigQuery Runner Extension - Scheduled Query Run History Prototype Tool
 * Lists run history details for a scheduled query
 * 
 * Usage: node tools/queryRunHistory.js <projectId> <region> <transferConfigName> [maxResults]
 * Example: node tools/queryRunHistory.js my-project us projects/my-project/locations/us/transferConfigs/123456789 10
 */

const { BigQuery } = require('@google-cloud/bigquery');
const { DataTransferServiceClient } = require('@google-cloud/bigquery-data-transfer');
const { checkApplicationDefaultCredentials } = require('./auth-check');
const { listScheduledQueries } = require('./listSched');

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
    } else if (dateValue.seconds && dateValue.nanos) {
      // Handle Timestamp proto format
      const milliseconds = Number(dateValue.seconds) * 1000 + Number(dateValue.nanos) / 1000000;
      return new Date(milliseconds).toISOString();
    } else if (dateValue.toJSON) {
      // Handle objects with toJSON method
      return dateValue.toJSON();
    } else {
      // Try to convert to string
      return String(dateValue);
    }
  } catch (error) {
    console.log(`Error formatting date: ${error.message}`);
    return String(dateValue);
  }
}

/**
 * Extract run ID from the full run name
 * @param {string} runName - Full run name
 * @returns {string} The last part of the run name
 */
function extractRunId(runName) {
  if (!runName) {return '';}
  const parts = runName.split('/');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/**
 * Get BigQuery job details based on job ID
 * @param {string} projectId - Google Cloud project ID
 * @param {string} jobId - BigQuery job ID
 * @returns {Promise<Object>} Job details with stats
 */
async function getBigQueryJobDetails(projectId, jobId) {
  try {
    const bigquery = new BigQuery({
      projectId
    });
    
    // Get the job details
    const [job] = await bigquery.job(jobId).get();
    const [metadata] = await job.getMetadata();
    
    return {
      jobId: job.id,
      status: metadata.status,
      statistics: metadata.statistics,
      configuration: metadata.configuration
    };
  } catch (error) {
    console.log(`Failed to get job details for ${jobId}: ${error.message}`);
    return null;
  }
}

/**
 * Look for a BigQuery job that corresponds to a scheduled query run
 * @param {string} projectId - Google Cloud project ID
 * @param {string} runId - Run ID from transfer run
 * @returns {Promise<Object>} Job details or null if not found
 */
async function findCorrespondingBigQueryJob(projectId, runId) {
  try {
    const bigquery = new BigQuery({ projectId });
    const jobId = `scheduled_query_${runId}`;
    
    // Try to get job by the expected job ID pattern
    return await getBigQueryJobDetails(projectId, jobId);
  } catch (error) {
    // Job not found with the expected pattern
    return null;
  }
}

/**
 * Extract query ID from run params if available
 * @param {Object} run - Transfer run object 
 * @returns {string|null} Query ID or null
 */
function extractQueryId(run) {
  if (!run.params) {return null;}
  
  // The query_id might be directly in params or in an inner structure
  if (run.params.query_id) {
    return run.params.query_id;
  } else if (run.params.fields && run.params.fields.query_id) {
    return run.params.fields.query_id.stringValue;
  }

  // Look through all fields for a jobId pattern
  const paramsStr = JSON.stringify(run.params);
  const jobIdMatch = paramsStr.match(/"([a-z0-9_]+:[A-Za-z0-9-]+)"/);
  if (jobIdMatch && jobIdMatch[1]) {
    return jobIdMatch[1];
  }

  return null;
}

/**
 * Get run history for a scheduled query
 * @param {string} projectId - Google Cloud project ID 
 * @param {string} region - Region (e.g., 'us', 'eu')
 * @param {string} transferConfigName - Full name of the transfer config
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Array>} Array of run details
 */
async function getRunHistory(projectId, region, transferConfigName, maxResults = 10) {
  if (!transferConfigName) {
    console.error('Error: Missing transfer config name');
    console.error('Usage: node queryRunHistory.js <projectId> <region> <transferConfigName>');
    process.exit(1);
  }

  try {
    // Initialize the client
    const client = new DataTransferServiceClient();
    
    // List transfer runs for the specified config
    const [runs] = await client.listTransferRuns({
      parent: transferConfigName,
      states: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
      pageSize: maxResults
    });
    
    // Display results
    if (runs.length === 0) {
      console.log('No run history found for this scheduled query.');
      return [];
    } 
    
    console.log(`Found ${runs.length} runs for this scheduled query:`);
    
    const runDetails = [];

    // For each run, get additional details from BigQuery
    for (const run of runs) {
      console.log(`\n[Run] ${run.name}`);
      console.log(`  State: ${run.state}`);
      console.log(`  Start Time: ${formatDate(run.runTime)}`);
      console.log(`  End Time: ${formatDate(run.endTime)}`);
      console.log(`  Update Time: ${formatDate(run.updateTime)}`);
      
      // Extract run ID from the name to build the expected job ID
      const runId = extractRunId(run.name);
      
      // Try to get corresponding BigQuery job using the run ID
      const jobDetails = await findCorrespondingBigQueryJob(projectId, runId);
      
      if (jobDetails) {
        console.log(`  BigQuery Job ID: ${jobDetails.jobId}`);
        
        if (jobDetails.statistics) {
          const stats = jobDetails.statistics;
          console.log(`  Bytes Processed: ${stats.totalBytesProcessed || 'N/A'}`);
          console.log(`  Bytes Billed: ${stats.totalBytesBilled || 'N/A'}`);
          
          // Calculate elapsed time
          if (stats.endTime && stats.startTime) {
            const startTime = new Date(stats.startTime).getTime();
            const endTime = new Date(stats.endTime).getTime();
            const elapsedMs = endTime - startTime;
            console.log(`  Elapsed Time: ${elapsedMs} ms`);
          }

          // Add any error details
          if (jobDetails.status && jobDetails.status.errorResult) {
            console.log(`  Error: ${jobDetails.status.errorResult.message}`);
          }
        }
        
        // Get query from configuration if available
        if (jobDetails.configuration && jobDetails.configuration.query) {
          console.log(`  Query: ${jobDetails.configuration.query.query.substring(0, 100)}...`);
          
          // Get destination table if available
          if (jobDetails.configuration.query.destinationTable) {
            const table = jobDetails.configuration.query.destinationTable;
            console.log(`  Destination: ${table.projectId}.${table.datasetId}.${table.tableId}`);
          }
        }
        
        // Store the details for potential extension integration
        runDetails.push({
          name: run.name,
          runId,
          state: run.state,
          startTime: formatDate(run.runTime),
          endTime: formatDate(run.endTime),
          bigQueryJob: jobDetails
        });
      } else {
        console.log(`  No BigQuery job found for run ID: ${runId}`);
        
        // Try to get SQL from params
        let query = '';
        if (run.params && run.params.fields && run.params.fields.query && run.params.fields.query.stringValue) {
          query = run.params.fields.query.stringValue;
          console.log(`  Query from params: ${query.substring(0, 100)}...`);
        }
        
        // Log destination table from params if available
        if (run.params && run.params.fields && run.params.fields.destination_table_name_template) {
          const tableName = run.params.fields.destination_table_name_template.stringValue;
          console.log(`  Destination table: ${tableName}`);
        }
        
        runDetails.push({
          name: run.name,
          runId,
          state: run.state,
          startTime: formatDate(run.runTime),
          endTime: formatDate(run.endTime),
          query
        });
      }
    }
    
    return runDetails;
  } catch (error) {
    console.error('Error getting run history:', error);
    process.exit(1);
  }
}

/**
 * List all scheduled queries and prompt for selection
 */
async function listAndPromptForSelection(projectId, region) {
  // List all scheduled queries
  const queries = await listScheduledQueries(projectId, region);
  
  // If running in interactive mode, could prompt for selection
  console.log('\nTo see run history for a specific query, use:');
  console.log(`node queryRunHistory.js ${projectId} ${region} <transferConfigName> [maxResults]`);
  
  // For demo purposes, just returning all names
  return queries.map(q => q.name);
}

// Execute if run directly
if (require.main === module) {
  const projectId = process.argv[2];
  const region = process.argv[3];
  const configName = process.argv[4];
  const maxResults = process.argv[5] || 10;
  
  if (!projectId || !region) {
    console.error('Error: Missing required arguments');
    console.error('Usage: node queryRunHistory.js <projectId> <region> [transferConfigName] [maxResults]');
    console.error('Example: node queryRunHistory.js my-project us projects/my-project/locations/us/transferConfigs/123456789 10');
    process.exit(1);
  }

  // Check authentication before running
  const isAuthenticated = checkApplicationDefaultCredentials();
  if (!isAuthenticated) {
    console.error('\nAuthentication required before running BigQuery API calls.');
    process.exit(1);
  }
  
  console.log('\nAuthentication successful. Proceeding...\n');
  
  // If configName is provided, get run history for that config
  if (configName) {
    getRunHistory(projectId, region, configName, maxResults).catch(error => {
      console.error('Unhandled promise rejection:', error);
      process.exit(1);
    });
  } else {
    // Otherwise, list all configs and show how to use the tool
    listAndPromptForSelection(projectId, region).catch(error => {
      console.error('Unhandled promise rejection:', error);
      process.exit(1);
    });
  }
}

// Export for module usage
module.exports = { getRunHistory }; 