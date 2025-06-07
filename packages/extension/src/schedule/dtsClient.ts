/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import { BigQuery } from "@google-cloud/bigquery";
import type { protos } from "@google-cloud/bigquery-data-transfer";
import { DataTransferServiceClient } from "@google-cloud/bigquery-data-transfer";

type TransferConfig =
  protos.google.cloud.bigquery.datatransfer.v1.ITransferConfig;
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
 * Cache entry for run history data
 */
interface CacheEntry {
  data: RunHistoryDetails[];
  timestamp: number;
  expiry: number;
}

/**
 * Client for interacting with BigQuery Data Transfer Service
 * Provides functionality to list and interact with scheduled queries
 */
export class DTSClient {
  private client: DataTransferServiceClient;
  private bigQueryClients: Map<string, BigQuery> = new Map();
  private runHistoryCache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor() {
    this.client = new DataTransferServiceClient();
  }

  /**
   * Get or create a BigQuery client for a project
   */
  private getBigQueryClient(projectId: string): BigQuery {
    if (!this.bigQueryClients.has(projectId)) {
      this.bigQueryClients.set(projectId, new BigQuery({ projectId }));
    }
    return this.bigQueryClients.get(projectId)!;
  }

  /**
   * Generate cache key for run history
   */
  private getCacheKey(
    configName: string,
    projectId: string,
    maxResults: number
  ): string {
    return `${configName}:${projectId}:${maxResults}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() < entry.expiry;
  }

  /**
   * Get cached run history if available and valid
   */
  private getCachedRunHistory(
    configName: string,
    projectId: string,
    maxResults: number
  ): RunHistoryDetails[] | null {
    const cacheKey = this.getCacheKey(configName, projectId, maxResults);
    const entry = this.runHistoryCache.get(cacheKey);

    if (entry && this.isCacheValid(entry)) {
      console.log("Returning cached run history for", cacheKey);
      return entry.data;
    }

    return null;
  }

  /**
   * Cache run history data
   */
  private setCachedRunHistory(
    configName: string,
    projectId: string,
    maxResults: number,
    data: RunHistoryDetails[]
  ): void {
    const cacheKey = this.getCacheKey(configName, projectId, maxResults);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + this.CACHE_TTL,
    };

    this.runHistoryCache.set(cacheKey, entry);
    console.log("Cached run history for", cacheKey);
  }

  /**
   * Clear cache for specific config or all cache
   */
  public clearCache(configName?: string, projectId?: string): void {
    if (configName && projectId) {
      // Clear cache for specific config
      const prefix = `${configName}:${projectId}:`;
      for (const key of this.runHistoryCache.keys()) {
        if (key.startsWith(prefix)) {
          this.runHistoryCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.runHistoryCache.clear();
    }
    console.log("Cache cleared");
  }

  /**
   * Lists scheduled query configurations for a specific project and region
   *
   * @param projectId - The GCP project ID
   * @param region - The region (e.g., 'us', 'eu')
   * @returns Promise resolving to an array of transfer configurations
   */
  async listConfigs(
    projectId: string,
    region: string
  ): Promise<TransferConfig[]> {
    if (!projectId || !region) {
      throw new Error("Project ID and region are required");
    }

    try {
      const parent = `projects/${projectId}/locations/${region}`;

      // Use the correct request format with DataSourceIds field
      const request = {
        parent,
        dataSourceIds: ["scheduled_query"],
      };

      const [configs] = await this.client.listTransferConfigs(request);

      return configs;
    } catch (error) {
      throw new Error(
        `Failed to list scheduled queries: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
      throw new Error("Transfer config name is required");
    }

    try {
      const request = { name };

      const [config] = await this.client.getTransferConfig(request);

      return config;
    } catch (error) {
      throw new Error(
        `Failed to get transfer config: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Lists transfer runs for a specific transfer configuration
   *
   * @param configName - The fully qualified name of the transfer config
   * @param maxResults - Maximum number of results to fetch (default: 5)
   * @returns Promise resolving to an array of transfer runs
   */
  async listTransferRuns(
    configName: string,
    maxResults = 5
  ): Promise<TransferRun[]> {
    if (!configName) {
      throw new Error("Transfer config name is required");
    }

    try {
      const request = {
        parent: configName,
        pageSize: maxResults,
      };

      const [runs] = await this.client.listTransferRuns(request);

      return runs;
    } catch (error) {
      throw new Error(
        `Failed to list transfer runs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Extract run ID from the full run name
   * @param runName - Full run name
   * @returns The last part of the run name
   */
  private extractRunId(runName: string | null | undefined): string {
    if (!runName) {
      return "";
    }
    const parts = runName.split("/");
    return parts.length > 0 ? parts[parts.length - 1]! : "";
  }

  /**
   * Format a date value to ISO string with robust handling of various formats
   * @param dateValue - Date value to format
   * @returns Formatted date string or N/A
   */
  private formatDate(dateValue: any): string {
    if (!dateValue) {
      return "N/A";
    }

    try {
      let date: Date | null = null;

      // Handle Timestamp proto format (Google Cloud format)
      if (dateValue.seconds !== undefined || dateValue.nanos !== undefined) {
        const seconds = Number(dateValue.seconds || 0);
        const nanos = Number(dateValue.nanos || 0);
        const milliseconds = seconds * 1000 + nanos / 1000000;
        date = new Date(milliseconds);
      }
      // Handle objects with toDate method (Firestore/Google timestamp)
      else if (typeof dateValue.toDate === "function") {
        date = dateValue.toDate();
      }
      // Handle objects with toJSON method
      else if (typeof dateValue.toJSON === "function") {
        const jsonValue = dateValue.toJSON();
        date = new Date(jsonValue);
      }
      // Handle string values
      else if (typeof dateValue === "string") {
        // Handle empty or whitespace-only strings
        if (!dateValue || !dateValue.trim()) {
          return "N/A";
        }
        date = new Date(dateValue);
      }
      // Handle Date objects
      else if (dateValue instanceof Date) {
        date = dateValue;
      }
      // Handle numeric timestamps
      else if (typeof dateValue === "number") {
        // Check if it's likely a Unix timestamp (seconds) vs milliseconds
        const timestamp = dateValue > 1e10 ? dateValue : dateValue * 1000;
        date = new Date(timestamp);
      }
      // Handle object with specific timestamp properties
      else if (typeof dateValue === "object") {
        // Try to extract timestamp from common object patterns
        if (dateValue.value) {
          return this.formatDate(dateValue.value);
        }
        if (dateValue.timestamp) {
          return this.formatDate(dateValue.timestamp);
        }
        if (dateValue._seconds !== undefined) {
          const milliseconds =
            dateValue._seconds * 1000 + (dateValue._nanoseconds || 0) / 1000000;
          date = new Date(milliseconds);
        }
      }

      // Validate the resulting date
      if (date && !isNaN(date.getTime())) {
        // Additional validation - check if year is reasonable (not before 2000 or too far in future)
        const year = date.getFullYear();
        if (year >= 2000 && year <= 2100) {
          return date.toISOString();
        }
      }

      // If we get here, we couldn't parse the date properly
      console.warn(`Could not parse date value:`, dateValue);
      return "Invalid Date";
    } catch (error) {
      console.warn(`Error formatting date:`, error, "Value:", dateValue);
      return "Invalid Date";
    }
  }

  /**
   * Convert a Google Cloud timestamp or other timestamp format to ISO string
   * @param timestamp - The timestamp in various formats
   * @returns Formatted ISO string or null if invalid
   */
  private convertTimestamp(timestamp: any): string | null {
    if (!timestamp) {
      return null;
    }

    try {
      // Handle Google Cloud timestamp format: {seconds: number, nanos: number}
      if (typeof timestamp === "object" && timestamp.seconds !== undefined) {
        const milliseconds =
          timestamp.seconds * 1000 + (timestamp.nanos || 0) / 1000000;
        const date = new Date(milliseconds);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }

      // Use existing formatDate method for other formats
      const formatted = this.formatDate(timestamp);
      return formatted === "Invalid Date" ? null : formatted;
    } catch (error) {
      console.warn("Error converting timestamp:", error, "Value:", timestamp);
      return null;
    }
  }

  /**
   * Find BigQuery job details for a scheduled query run
   *
   * @param projectId - The GCP project ID
   * @param runId - The run ID extracted from the transfer run name
   * @returns Promise resolving to BigQuery job details or null if not found
   */
  private async findBigQueryJobDetails(
    projectId: string,
    runId: string
  ): Promise<any | null> {
    try {
      const bigquery = this.getBigQueryClient(projectId);
      const jobId = `scheduled_query_${runId}`;

      const [job] = await bigquery.job(jobId).get();
      const [metadata] = await job.getMetadata();

      // Process statistics to ensure timestamps are in the correct format
      let processedStatistics: any = {};
      if (metadata.statistics) {
        processedStatistics = {
          ...metadata.statistics,
          // Convert timestamp fields to ISO strings
          startTime: this.convertTimestamp(metadata.statistics.startTime),
          endTime: this.convertTimestamp(metadata.statistics.endTime),
          creationTime: this.convertTimestamp(metadata.statistics.creationTime),
        };

        // Remove null timestamps
        Object.keys(processedStatistics).forEach((key) => {
          if (processedStatistics[key] === null) {
            delete processedStatistics[key];
          }
        });
      }

      return {
        jobId: job.id,
        status: metadata.status,
        statistics: processedStatistics,
        configuration: metadata.configuration,
      };
    } catch (error) {
      // Job not found or other error occurred
      console.debug(
        `BigQuery job not found for runId ${runId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Convert TransferState enum to string
   * @param state - The transfer state
   * @returns String representation of the state
   */
  private stateToString(
    state: TransferState | string | null | undefined
  ): string {
    if (typeof state === "string") {
      return state;
    }
    if (state === undefined || state === null) {
      return "UNKNOWN";
    }

    // Map enum values to strings
    const stateMap: Record<number, string> = {
      1: "PENDING",
      2: "RUNNING",
      3: "SUCCEEDED",
      4: "FAILED",
      5: "CANCELLED",
    };

    return stateMap[state as number] || "UNKNOWN";
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
  async getRunHistory(
    configName: string,
    projectId: string,
    maxResults = 5
  ): Promise<RunHistoryDetails[]> {
    if (!configName || !projectId) {
      throw new Error("Transfer config name and project ID are required");
    }

    try {
      // Check cache first
      const cachedRunHistory = this.getCachedRunHistory(
        configName,
        projectId,
        maxResults
      );
      if (cachedRunHistory) {
        return cachedRunHistory;
      }

      console.log("Fetching run history for", configName);

      // Get the transfer runs
      const runs = await this.listTransferRuns(configName, maxResults);

      if (runs.length === 0) {
        console.log("No transfer runs found");
        return [];
      }

      console.log(
        `Found ${runs.length} transfer runs, fetching BigQuery job details...`
      );

      // Process runs and prepare base data
      const runData = runs.map((run) => {
        const runId = this.extractRunId(run.name ?? "");
        let queryText = "";
        let destinationTable = "";

        // Try to extract query from run params
        if (
          run.params &&
          run.params.fields &&
          run.params.fields.query &&
          run.params.fields.query.stringValue
        ) {
          queryText = run.params.fields.query.stringValue;
        }

        // Try to extract destination table from params
        if (
          run.params &&
          run.params.fields &&
          run.params.fields.destination_table_name_template &&
          run.params.fields.destination_table_name_template.stringValue
        ) {
          destinationTable =
            run.params.fields.destination_table_name_template.stringValue;
        }

        return {
          run,
          runId,
          queryText,
          destinationTable,
        };
      });

      // Fetch BigQuery job details concurrently for better performance
      const jobDetailsPromises = runData.map(async ({ runId }) => {
        try {
          return await this.findBigQueryJobDetails(projectId, runId);
        } catch (error) {
          console.warn(
            `Failed to fetch BigQuery job for runId ${runId}:`,
            error
          );
          return null;
        }
      });

      // Wait for all BigQuery job details to complete
      const jobDetailsResults = await Promise.allSettled(jobDetailsPromises);

      // Combine the data
      const runDetails: RunHistoryDetails[] = runData.map((data, index) => {
        const { run, runId, queryText, destinationTable } = data;

        // Get job details from the concurrent results
        let jobDetails = null;
        const jobResult = jobDetailsResults[index];
        if (jobResult && jobResult.status === "fulfilled") {
          jobDetails = jobResult.value;
        } else if (jobResult && jobResult.status === "rejected") {
          console.warn(
            `Failed to get job details for runId ${runId}:`,
            jobResult.reason
          );
        }

        return {
          name: run.name ?? "",
          runId,
          state: this.stateToString(run.state),
          startTime: this.formatDate(run.runTime),
          endTime: this.formatDate(run.endTime),
          updateTime: this.formatDate(run.updateTime),
          bigQueryJob: jobDetails,
          query: queryText,
          destinationTable,
        };
      });

      console.log(`Successfully processed ${runDetails.length} run records`);

      // Cache the result
      this.setCachedRunHistory(configName, projectId, maxResults, runDetails);

      return runDetails;
    } catch (error) {
      console.error("Error in getRunHistory:", error);
      throw new Error(
        `Failed to get run history: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
