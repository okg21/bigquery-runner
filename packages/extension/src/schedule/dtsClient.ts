/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import type { protos } from '@google-cloud/bigquery-data-transfer';
import { DataTransferServiceClient  } from '@google-cloud/bigquery-data-transfer';

type TransferConfig = protos.google.cloud.bigquery.datatransfer.v1.ITransferConfig;

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
      const [config] = await this.client.getTransferConfig({ name });
      return config;
    } catch (error) {
      throw new Error(`Failed to get transfer config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 