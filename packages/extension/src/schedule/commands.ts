/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import type { DTSClient } from './dtsClient';
import type { ScheduleProvider, ScheduledQueryNode } from './scheduleProvider';

/**
 * Registers commands related to scheduled queries
 */
export function registerScheduleCommands(
  context: vscode.ExtensionContext,
  client: DTSClient,
  scheduleProvider: ScheduleProvider
): void {
  // Command to refresh the scheduled queries view
  context.subscriptions.push(
    vscode.commands.registerCommand('bigqueryRunner.refreshScheduledQueries', () => {
      scheduleProvider.refresh();
    })
  );

  // Command to open a scheduled query's SQL in a new editor
  context.subscriptions.push(
    vscode.commands.registerCommand('bigqueryRunner.openScheduledSQL', async (node: ScheduledQueryNode) => {
      if (!node || !node.config || !node.config.name) {
        void vscode.window.showErrorMessage('No scheduled query selected');
        return;
      }

      try {
        // Show loading indicator
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = '$(loading~spin) Loading scheduled query SQL...';
        statusBarItem.show();

        try {
          // Get the full details of the scheduled query
          const config = await client.getConfig(node.config.name);
          
          // Check if the query parameter exists and access it safely
          const params = config.params as Record<string, unknown> | undefined;
          const query = params?.query as string | undefined;
          
          if (!params || !query) {
            void vscode.window.showErrorMessage(`No SQL found for query "${node.config.displayName || 'Unnamed Query'}"`);
            return;
          }

          // Create a new untitled document with the SQL
          const document = await vscode.workspace.openTextDocument({
            language: 'sql',
            content: query
          });

          // Show the document
          await vscode.window.showTextDocument(document);

        } finally {
          // Hide loading indicator
          statusBarItem.dispose();
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`Error opening SQL: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
} 