/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import { DTSClient } from '../../src/schedule/dtsClient';

// Mock the DataTransferServiceClient
jest.mock('@google-cloud/bigquery-data-transfer', () => {
  return {
    DataTransferServiceClient: jest.fn().mockImplementation(() => {
      return {
        listTransferConfigs: jest.fn(),
        getTransferConfig: jest.fn()
      };
    })
  };
});

describe('DTSClient', () => {
  let client: DTSClient;
  let listTransferConfigsStub: sinon.SinonStub;
  let getTransferConfigStub: sinon.SinonStub;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a new client instance
    client = new DTSClient();
    
    // Get internal client instance and stub its methods
    const internalClient = (client as any).client;
    listTransferConfigsStub = sinon.stub(internalClient, 'listTransferConfigs');
    getTransferConfigStub = sinon.stub(internalClient, 'getTransferConfig');
  });

  afterEach(() => {
    // Restore stubs
    sinon.restore();
  });

  describe('listConfigs', () => {
    it('should throw an error when project ID is missing', async () => {
      await expect(client.listConfigs('', 'us')).rejects.toThrow('Project ID and region are required');
    });

    it('should throw an error when region is missing', async () => {
      await expect(client.listConfigs('project-id', '')).rejects.toThrow('Project ID and region are required');
    });

    it('should return configs when valid parameters are provided', async () => {
      // Mock response data
      const mockConfigs = [
        { name: 'projects/test-project/locations/us/transferConfigs/123', displayName: 'Test Query 1' },
        { name: 'projects/test-project/locations/us/transferConfigs/456', displayName: 'Test Query 2' }
      ];
      
      // Set up stub to return mock data
      listTransferConfigsStub.resolves([mockConfigs]);
      
      // Call method
      const result = await client.listConfigs('test-project', 'us');
      
      // Verify the result
      expect(result).toEqual(mockConfigs);
      
      // Verify the stub was called with correct params
      expect(listTransferConfigsStub.calledOnce).toBe(true);
      expect(listTransferConfigsStub.firstCall.args[0]).toEqual({
        parent: 'projects/test-project/locations/us',
        dataSourceIds: ['scheduled_query']
      });
    });

    it('should throw an error when API call fails', async () => {
      // Set up stub to throw an error
      listTransferConfigsStub.rejects(new Error('API Error'));
      
      // Call method and expect error
      await expect(client.listConfigs('test-project', 'us')).rejects.toThrow('Failed to list scheduled queries: API Error');
    });
  });

  describe('getConfig', () => {
    it('should throw an error when name is missing', async () => {
      await expect(client.getConfig('')).rejects.toThrow('Transfer config name is required');
    });

    it('should return config when valid name is provided', async () => {
      // Mock response data
      const mockConfig = { 
        name: 'projects/test-project/locations/us/transferConfigs/123', 
        displayName: 'Test Query' 
      };
      
      // Set up stub to return mock data
      getTransferConfigStub.resolves([mockConfig]);
      
      // Call method
      const result = await client.getConfig('projects/test-project/locations/us/transferConfigs/123');
      
      // Verify the result
      expect(result).toEqual(mockConfig);
      
      // Verify the stub was called with correct params
      expect(getTransferConfigStub.calledOnce).toBe(true);
      expect(getTransferConfigStub.firstCall.args[0]).toEqual({
        name: 'projects/test-project/locations/us/transferConfigs/123'
      });
    });

    it('should throw an error when API call fails', async () => {
      // Set up stub to throw an error
      getTransferConfigStub.rejects(new Error('API Error'));
      
      // Call method and expect error
      await expect(client.getConfig('projects/test-project/locations/us/transferConfigs/123'))
        .rejects.toThrow('Failed to get transfer config: API Error');
    });
  });
}); 