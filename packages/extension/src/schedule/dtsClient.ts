/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import { BigQuery } from '@google-cloud/bigquery';
import type { protos } from '@google-cloud/bigquery-data-transfer';
import { DataTransferServiceClient  } from '@google-cloud/bigquery-data-transfer';

type TransferConfig = protos.google.cloud.bigquery.datatransfer.v1.ITransferConfig;
type TransferRun = protos.google.cloud.bigquery.datatransfer.v1.ITransferRun;
type TransferState = protos.google.cloud.bigquery.datatransfer.v1.TransferState;

/**
 * Run details including BigQuery job information
 */
export interface RunHistoryDetails {
  name: string;
  runId: string;
  state: string;
  startTime: string;
  endTime: string;
  updateTime: string;
  bigQueryJob?: {
    jobId: string;
    statistics?: {
      totalBytesProcessed?: string;
      totalBytesBilled?: string;
      startTime?: string;
      endTime?: string;
    };
    status?: {
      state: string;
      errorResult?: {
        message: string;
      };
    };
  };
  query?: string;
  destinationTable?: string;
}

/**
 * Client for interacting with BigQuery Data Transfer Service
 * Provides functionality to list and interact with scheduled queries
 */
export class DTSClient {
  private client: DataTransferServiceClient;

  constructor() {
    this.client = new DataTransferServiceClient();
  }

  /**
   * Lists scheduled query configurations for a specific project and region
   * 
   * @param projectId - The GCP project ID
   * @param region - The region (e.g., 'us', 'eu')
   * @returns Promise resolving to an array of transfer configurations
   */
  async listConfigs(projectId: string, region: string): Promise<TransferConfig[]> {
    if (!projectId || !region) {
      throw new Error('Project ID and region are required');
    }

    try {
      const parent = `projects/${projectId}/locations/${region}`;
      
      // Use the correct request format with DataSourceIds field
      const request = {
        parent,
        dataSourceIds: ['scheduled_query']
      };
      
      const [configs] = await this.client.listTransferConfigs(request);
      
      return configs;
    } catch (error) {
      throw new Error(`Failed to list scheduled queries: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Gets transfer configuration by name
   * 
   * @param name - The fully qualified name of the transfer config
   * @returns Promise resolving to the transfer configuration
   */
  async getConfig(name: string): Promise<TransferConfig> {
    if (!name) {
      throw new Error('Transfer config name is required');
    }
    
    try {
      const request = { name };
      
      const [config] = await this.client.getTransferConfig(request);
      
      return config;
    } catch (error) {
      throw new Error(`Failed to get transfer config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Lists transfer runs for a specific transfer configuration
   * 
   * @param configName - The fully qualified name of the transfer config
   * @param maxResults - Maximum number of results to fetch (default: 5)
   * @returns Promise resolving to an array of transfer runs
   */
  async listTransferRuns(configName: string, maxResults = 5): Promise<TransferRun[]> {
    if (!configName) {
      throw new Error('Transfer config name is required');
    }

    try {
      const request = {
        parent: configName,
        pageSize: maxResults
      };
      
      const [runs] = await this.client.listTransferRuns(request);
      
      return runs;
    } catch (error) {
      throw new Error(`Failed to list transfer runs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract run ID from the full run name
   * @param runName - Full run name
   * @returns The last part of the run name
   */
  private extractRunId(runName: string | null | undefined): string {
    if (!runName) {return '';}
    const parts = runName.split('/');
    return parts.length > 0 ? parts[parts.length - 1] : '';
  }

  /**
   * Format a date value to ISO string
   * @param dateValue - Date value to format
   * @returns Formatted date string or N/A
   */
  private formatDate(dateValue: any): string {
    if (!dateValue) {
      return 'N/A';
    }
    
    try {
      // Handle Timestamp proto format
      if (dateValue.seconds && dateValue.nanos) {
        const milliseconds = Number(dateValue.seconds) * 1000 + Number(dateValue.nanos) / 1000000;
        return new Date(milliseconds).toISOString();
      } else if (typeof dateValue.toJSON === 'function') {
        // Handle objects with toJSON method
        return dateValue.toJSON();
      } else if (typeof dateValue === 'string') {
        return new Date(dateValue).toISOString();
      } else {
        // Try to convert to string
        return String(dateValue);
      }
    } catch (error) {
      return String(dateValue);
    }
  }

  /**
   * Find BigQuery job details for a scheduled query run
   * 
   * @param projectId - The GCP project ID
   * @param runId - The run ID extracted from the transfer run name
   * @returns Promise resolving to BigQuery job details or null if not found
   */
  private async findBigQueryJobDetails(projectId: string, runId: string): Promise<any | null> {
    try {
      const bigquery = new BigQuery({ projectId });
      const jobId = `scheduled_query_${runId}`;
      
      const [job] = await bigquery.job(jobId).get();
      const [metadata] = await job.getMetadata();
      
      return {
        jobId: job.id,
        status: metadata.status,
        statistics: metadata.statistics,
        configuration: metadata.configuration
      };
    } catch (error) {
      // Job not found or other error occurred
      return null;
    }
  }

  /**
   * Convert TransferState enum to string
   * @param state - The transfer state
   * @returns String representation of the state
   */
  private stateToString(state: TransferState | string | null | undefined): string {
    if (typeof state === 'string') {
      return state;
    }
    if (state === undefined || state === null) {
      return 'UNKNOWN';
    }
    
    // Map enum values to strings
    const stateMap: Record<number, string> = {
      1: 'PENDING',
      2: 'RUNNING',
      3: 'SUCCEEDED',
      4: 'FAILED',
      5: 'CANCELLED'
    };
    
    return stateMap[state as number] || 'UNKNOWN';
  }

  /**
   * Gets detailed run history for a specific transfer configuration
   * including BigQuery job details when available
   * 
   * @param configName - The fully qualified name of the transfer config
   * @param projectId - The GCP project ID
   * @param maxResults - Maximum number of runs to fetch (default: 5)
   * @returns Promise resolving to run details with job statistics
   */
  async getRunHistory(configName: string, projectId: string, maxResults = 5): Promise<RunHistoryDetails[]> {
    if (!configName || !projectId) {
      throw new Error('Transfer config name and project ID are required');
    }

    try {
      // Get the transfer runs
      const runs = await this.listTransferRuns(configName, maxResults);
      
      if (runs.length === 0) {
        return [];
      }

      // For each run, get the corresponding BigQuery job details
      const runDetails: RunHistoryDetails[] = [];
      
      for (const run of runs) {
        const runId = this.extractRunId(run.name ?? '');
        let queryText = '';
        let destinationTable = '';
        
        // Try to extract query from run params
        if (run.params && run.params.fields && run.params.fields.query && run.params.fields.query.stringValue) {
          queryText = run.params.fields.query.stringValue;
        }
        
        // Try to extract destination table from params
        if (run.params && run.params.fields && run.params.fields.destination_table_name_template && 
            run.params.fields.destination_table_name_template.stringValue) {
          destinationTable = run.params.fields.destination_table_name_template.stringValue;
        }
        
        // Try to get the corresponding BigQuery job
        const jobDetails = await this.findBigQueryJobDetails(projectId, runId);
        
        runDetails.push({
          name: run.name ?? '',
          runId,
          state: this.stateToString(run.state),
          startTime: this.formatDate(run.runTime),
          endTime: this.formatDate(run.endTime),
          updateTime: this.formatDate(run.updateTime),
          bigQueryJob: jobDetails,
          query: queryText,
          destinationTable
        });
      }
      
      return runDetails;
    } catch (error) {
      throw new Error(`Failed to get run history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 