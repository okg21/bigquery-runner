/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { registerScheduleCommands } from '../../src/schedule/commands';
import type { DTSClient } from '../../src/schedule/dtsClient';
import type { ScheduleProvider, ScheduledQueryNode } from '../../src/schedule/scheduleProvider';

describe('Schedule Commands', () => {
  let mockContext: vscode.ExtensionContext;
  let mockClient: DTSClient;
  let mockProvider: ScheduleProvider;
  let registerCommandStub: sinon.SinonStub;
  let refreshStub: sinon.SinonStub;
  let getConfigStub: sinon.SinonStub;
  let createStatusBarItemStub: sinon.SinonStub;
  let showTextDocumentStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let mockStatusBarItem: vscode.StatusBarItem;

  beforeEach(() => {
    // Mock extension context
    mockContext = {
      subscriptions: []
    } as unknown as vscode.ExtensionContext;

    // Mock DTSClient
    mockClient = {} as DTSClient;
    getConfigStub = sinon.stub();
    mockClient.getConfig = getConfigStub;

    // Mock ScheduleProvider
    mockProvider = {} as ScheduleProvider;
    refreshStub = sinon.stub();
    mockProvider.refresh = refreshStub;

    // Mock StatusBarItem
    mockStatusBarItem = {
      text: '',
      show: sinon.stub(),
      dispose: sinon.stub()
    } as unknown as vscode.StatusBarItem;

    // Mock VS Code commands
    registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
    createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem);
    openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
    showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('registerScheduleCommands', () => {
    it('should register refresh command', () => {
      registerScheduleCommands(mockContext, mockClient, mockProvider);
      
      expect(registerCommandStub.calledWith('bigqueryRunner.refreshScheduledQueries')).toBe(true);
      
      // Get the refresh callback
      const args = registerCommandStub.args.find(args => 
        args[0] === 'bigqueryRunner.refreshScheduledQueries'
      );
      
      if (!args) {
        fail('Refresh command not registered');
        return;
      }
      
      const refreshCallback = args[1];
      
      // Call the refresh callback
      refreshCallback();
      
      expect(refreshStub.calledOnce).toBe(true);
    });

    it('should register openScheduledSQL command', () => {
      registerScheduleCommands(mockContext, mockClient, mockProvider);
      
      expect(registerCommandStub.calledWith('bigqueryRunner.openScheduledSQL')).toBe(true);
    });

    it('should add commands to context subscriptions', () => {
      registerCommandStub.returns('command-disposable');
      
      registerScheduleCommands(mockContext, mockClient, mockProvider);
      
      expect(mockContext.subscriptions.length).toBe(2);
      expect(mockContext.subscriptions).toContain('command-disposable');
    });
  });

  describe('openScheduledSQL command', () => {
    let openScheduledSQLCallback: (node: ScheduledQueryNode) => Promise<void>;

    beforeEach(() => {
      registerScheduleCommands(mockContext, mockClient, mockProvider);
      
      // Get the openScheduledSQL callback
      const args = registerCommandStub.args.find(args => 
        args[0] === 'bigqueryRunner.openScheduledSQL'
      );
      
      if (!args) {
        fail('openScheduledSQL command not registered');
        return;
      }
      
      openScheduledSQLCallback = args[1];
    });

    it('should show error when node is not provided', async () => {
      await openScheduledSQLCallback(undefined as unknown as ScheduledQueryNode);
      
      expect(showErrorMessageStub.calledWith('No scheduled query selected')).toBe(true);
      expect(getConfigStub.called).toBe(false);
    });

    it('should fetch query SQL and open document', async () => {
      // Mock query config and node
      const mockNode = {
        config: {
          name: 'projects/test-project/locations/us/transferConfigs/123',
          displayName: 'Test Query'
        }
      } as ScheduledQueryNode;
      
      const mockConfig = {
        params: {
          query: 'SELECT * FROM `my-project.dataset.table`'
        }
      };
      
      getConfigStub.resolves(mockConfig);
      openTextDocumentStub.resolves({} as vscode.TextDocument);
      
      await openScheduledSQLCallback(mockNode);
      
      expect(getConfigStub.calledWith(mockNode.config.name)).toBe(true);
      expect(openTextDocumentStub.calledWith({
        language: 'sql',
        content: 'SELECT * FROM `my-project.dataset.table`'
      })).toBe(true);
      expect(showTextDocumentStub.called).toBe(true);
      expect((mockStatusBarItem.dispose as sinon.SinonStub).called).toBe(true);
    });

    it('should show error when no SQL is found', async () => {
      // Mock query config and node
      const mockNode = {
        config: {
          name: 'projects/test-project/locations/us/transferConfigs/123',
          displayName: 'Test Query'
        }
      } as ScheduledQueryNode;
      
      const mockConfig = {
        params: {}
      };
      
      getConfigStub.resolves(mockConfig);
      
      await openScheduledSQLCallback(mockNode);
      
      expect(showErrorMessageStub.calledWith('No SQL found for query "Test Query"')).toBe(true);
      expect(openTextDocumentStub.called).toBe(false);
    });

    it('should handle errors when fetching config', async () => {
      // Mock query config and node
      const mockNode = {
        config: {
          name: 'projects/test-project/locations/us/transferConfigs/123',
          displayName: 'Test Query'
        }
      } as ScheduledQueryNode;
      
      getConfigStub.rejects(new Error('API Error'));
      
      await openScheduledSQLCallback(mockNode);
      
      expect(showErrorMessageStub.calledWith('Error opening SQL: API Error')).toBe(true);
    });
  });
}); 