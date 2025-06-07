/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from "vscode";
import type { DTSClient, RunHistoryDetails } from "./dtsClient";
import { RunHistoryPanel } from "./runHistoryPanel";
import type { ScheduleProvider, ScheduledQueryNode } from "./scheduleProvider";

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
    vscode.commands.registerCommand(
      "bigqueryExplorer.refreshScheduledQueries",
      () => {
        scheduleProvider.refresh();
      }
    )
  );

  // Command to open a scheduled query's SQL in a new editor
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bigqueryExplorer.openScheduledSQL",
      async (node: ScheduledQueryNode) => {
        if (!node || !node.config || !node.config.name) {
          void vscode.window.showErrorMessage("No scheduled query selected");
          return;
        }

        try {
          // Show loading indicator
          const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
          );
          statusBarItem.text = "$(loading~spin) Loading scheduled query SQL...";
          statusBarItem.show();

          try {
            // Get the full details of the scheduled query
            const config = await client.getConfig(node.config.name);

            // Extract the query from the config
            let query: string | undefined;

            if (config.params) {
              const params = config.params as Record<string, any>;

              // Try direct access to query property
              if (typeof params.query === "string") {
                query = params.query;
              }
              // Try accessing through params fields object
              else if (
                params.fields &&
                params.fields.query &&
                typeof params.fields.query.stringValue === "string"
              ) {
                query = params.fields.query.stringValue;
              }
              // Try query_statement which is sometimes used instead
              else if (typeof params.query_statement === "string") {
                query = params.query_statement;
              }
            }

            if (!query) {
              void vscode.window.showErrorMessage(
                `No SQL found for query "${
                  node.config.displayName || "Unnamed Query"
                }"`
              );
              return;
            }

            // Create a new untitled document with the SQL
            const document = await vscode.workspace.openTextDocument({
              language: "sql",
              content: query,
            });

            // Show the document
            await vscode.window.showTextDocument(document);
          } finally {
            // Hide loading indicator
            statusBarItem.dispose();
          }
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Error opening SQL: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  // Command to view run history for a scheduled query
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bigqueryExplorer.viewScheduledQueryHistory",
      async (node: ScheduledQueryNode) => {
        if (!node || !node.config || !node.config.name) {
          void vscode.window.showErrorMessage("No scheduled query selected");
          return;
        }

        try {
          // Show loading indicator
          const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
          );
          statusBarItem.text = "$(loading~spin) Loading run history...";
          statusBarItem.show();

          try {
            // Get the project ID from configuration
            const projectId = vscode.workspace
              .getConfiguration("bigqueryExplorer")
              .get<string>("projectId");

            if (!projectId) {
              void vscode.window.showErrorMessage(
                "No project ID configured. Please set bigqueryExplorer.projectId in settings."
              );
              return;
            }

            // Get run history for the query
            const runHistory = await client.getRunHistory(
              node.config.name,
              projectId
            );

            // Create refresh callback that clears cache and refetches data
            const refreshCallback = async (
              refreshNode: ScheduledQueryNode
            ): Promise<RunHistoryDetails[]> => {
              // Clear cache for this specific query
              if (refreshNode.config.name) {
                client.clearCache(refreshNode.config.name, projectId);

                // Fetch fresh data
                return await client.getRunHistory(
                  refreshNode.config.name,
                  projectId
                );
              } else {
                throw new Error("No config name available for refresh");
              }
            };

            // Show the run history panel with refresh capability
            RunHistoryPanel.createOrShow(
              context.extensionUri,
              node,
              runHistory,
              refreshCallback
            );
          } finally {
            // Hide loading indicator
            statusBarItem.dispose();
          }
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Error loading run history: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );
}
