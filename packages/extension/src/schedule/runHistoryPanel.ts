/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from "vscode";
import type { RunHistoryDetails } from "./dtsClient";
import type { ScheduledQueryNode } from "./scheduleProvider";

/**
 * WebView panel for displaying run history of a scheduled query
 * Shows status indicators and a bar chart for visualizing query performance
 */
export class RunHistoryPanel {
  public static readonly viewType = "bigqueryExplorer.runHistory";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private static _currentPanel: RunHistoryPanel | undefined;
  private _currentNode: ScheduledQueryNode | undefined;
  private _refreshCallback:
    | ((node: ScheduledQueryNode) => Promise<RunHistoryDetails[]>)
    | undefined;

  /**
   * Factory method to create or show the run history panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    node: ScheduledQueryNode,
    runHistory: RunHistoryDetails[],
    refreshCallback?: (node: ScheduledQueryNode) => Promise<RunHistoryDetails[]>
  ): RunHistoryPanel {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (RunHistoryPanel._currentPanel) {
      RunHistoryPanel._currentPanel._panel.reveal(columnToShowIn);
      RunHistoryPanel._currentPanel.update(node, runHistory, refreshCallback);
      return RunHistoryPanel._currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      RunHistoryPanel.viewType,
      `Run History: ${node.config.displayName || "Unnamed Query"}`,
      columnToShowIn || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "media"),
        ],
      }
    );

    RunHistoryPanel._currentPanel = new RunHistoryPanel(panel, extensionUri);
    RunHistoryPanel._currentPanel.update(node, runHistory, refreshCallback);

    return RunHistoryPanel._currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set up event listeners
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "openQuery":
            if (message.sql) {
              await this._openSqlInEditor(message.sql);
            }
            break;
          case "openJobDetails":
            if (message.jobId) {
              await this._openJobDetails(message.jobId);
            }
            break;
          case "refreshData":
            await this._handleRefresh();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Updates the panel content with run history
   */
  public update(
    node: ScheduledQueryNode,
    runHistory: RunHistoryDetails[],
    refreshCallback?: (node: ScheduledQueryNode) => Promise<RunHistoryDetails[]>
  ): void {
    this._currentNode = node;
    this._refreshCallback = refreshCallback;
    this._panel.title = `Run History: ${
      node.config.displayName || "Unnamed Query"
    }`;
    this._panel.webview.html = this._getWebviewContent(node, runHistory);
  }

  /**
   * Handle refresh request from webview
   */
  private async _handleRefresh(): Promise<void> {
    if (!this._currentNode || !this._refreshCallback) {
      void vscode.window.showWarningMessage("Cannot refresh: missing context");
      return;
    }

    try {
      // Show loading state
      this._panel.webview.html = this._getLoadingContent();

      // Fetch fresh data
      const freshRunHistory = await this._refreshCallback(this._currentNode);

      // Update with fresh data
      this.update(this._currentNode, freshRunHistory, this._refreshCallback);

      void vscode.window.showInformationMessage(
        "Run history refreshed successfully"
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to refresh run history: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Restore previous content if refresh failed
      if (this._currentNode) {
        this._panel.webview.html = this._getWebviewContent(
          this._currentNode,
          []
        );
      }
    }
  }

  /**
   * Generate loading content while refreshing
   */
  private _getLoadingContent(): string {
    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Loading...</title>
          <style>
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .loading-container {
              text-align: center;
              padding: 40px;
            }
            .loading-spinner {
              font-size: 2em;
              animation: spin 1s linear infinite;
              margin-bottom: 16px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="loading-container">
            <div class="loading-spinner">⟳</div>
            <p>Refreshing run history...</p>
          </div>
        </body>
      </html>`;
  }

  /**
   * Clean up resources when the panel is closed
   */
  public dispose(): void {
    RunHistoryPanel._currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Opens SQL in a new editor
   */
  private async _openSqlInEditor(sql: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument({
        content: sql,
        language: "sql",
      });

      await vscode.window.showTextDocument(document);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to open SQL: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Opens job details in a new editor
   */
  private async _openJobDetails(jobId: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument({
        content: `Job ID: ${jobId}`,
        language: "plaintext",
      });

      await vscode.window.showTextDocument(document);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to open job details: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Generate status indicators HTML
   */
  private _generateStatusIndicators(runs: RunHistoryDetails[]): string {
    return runs
      .map((run) => {
        const statusClass = this._getStatusClass(run.state);
        const tooltip = `${run.state}: ${new Date(
          run.startTime
        ).toLocaleString()}`;
        return `<div class="status-indicator ${statusClass}" title="${tooltip}"></div>`;
      })
      .join("");
  }

  /**
   * Get CSS class for status
   */
  private _getStatusClass(state: string): string {
    switch (state.toUpperCase()) {
      case "SUCCEEDED":
        return "success";
      case "FAILED":
        return "error";
      case "RUNNING":
        return "running";
      case "CANCELLED":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * Generate details table HTML with improved date handling
   */
  private _generateDetailsTable(runs: RunHistoryDetails[]): string {
    let tableHtml = `
      <div class="table-container">
        <table class="run-history-table">
          <thead>
            <tr>
              <th>Execution Time</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Bytes Processed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    runs.forEach((run) => {
      const formattedTime = this._formatDisplayTime(run.startTime);
      const duration = this._calculateDuration(run);
      const bytesProcessed = this._formatBytes(run);
      const statusClass = this._getStatusClass(run.state);
      const relativeTiming = this._getRelativeTime(run.startTime);

      tableHtml += `
        <tr class="run-row ${run.state.toLowerCase()}">
          <td class="time-cell">
            <div class="time-primary">${formattedTime}</div>
            <div class="time-secondary">${relativeTiming}</div>
          </td>
          <td class="status-cell">
            <span class="status-badge ${statusClass}">
              <span class="status-icon"></span>
              ${run.state}
            </span>
          </td>
          <td class="duration-cell">${duration}</td>
          <td class="bytes-cell">${bytesProcessed}</td>
          <td class="actions-cell">
            ${
              run.query
                ? `<button class="action-btn view-sql" data-sql="${this._escapeHtml(
                    run.query
                  )}" title="View SQL Query">
              <span class="btn-icon">📄</span> SQL
            </button>`
                : ""
            }
          </td>
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>
      </div>
    `;
    return tableHtml;
  }

  /**
   * Format time for display in table with validation
   */
  private _formatDisplayTime(timeString: string): string {
    if (!timeString || timeString === "N/A" || timeString === "Invalid Date") {
      return "Unknown";
    }

    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }

      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (error) {
      return "Invalid Date";
    }
  }

  /**
   * Get relative time display (e.g., "2 hours ago")
   */
  private _getRelativeTime(timeString: string): string {
    if (!timeString || timeString === "N/A" || timeString === "Invalid Date") {
      return "";
    }

    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return "";
      }

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();

      if (diffMs < 60000) {
        // Less than 1 minute
        return "Just now";
      } else if (diffMs < 3600000) {
        // Less than 1 hour
        const minutes = Math.floor(diffMs / 60000);
        return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
      } else if (diffMs < 86400000) {
        // Less than 1 day
        const hours = Math.floor(diffMs / 3600000);
        return `${hours} hour${hours > 1 ? "s" : ""} ago`;
      } else if (diffMs < 2592000000) {
        // Less than 30 days
        const days = Math.floor(diffMs / 86400000);
        return `${days} day${days > 1 ? "s" : ""} ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch (error) {
      return "";
    }
  }

  /**
   * Calculate run duration in readable format with better date validation
   */
  private _calculateDuration(run: RunHistoryDetails): string {
    try {
      // Try BigQuery job statistics first (most accurate)
      if (
        run.bigQueryJob?.statistics?.startTime &&
        run.bigQueryJob?.statistics?.endTime
      ) {
        const startTime = new Date(run.bigQueryJob.statistics.startTime);
        const endTime = new Date(run.bigQueryJob.statistics.endTime);

        // Validate dates
        if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          const durationMs = endTime.getTime() - startTime.getTime();
          return this._formatDuration(durationMs);
        }
      }

      // Fallback to run times
      if (
        run.startTime &&
        run.endTime &&
        run.startTime !== "N/A" &&
        run.endTime !== "N/A" &&
        run.startTime !== "Invalid Date" &&
        run.endTime !== "Invalid Date"
      ) {
        const startTime = new Date(run.startTime);
        const endTime = new Date(run.endTime);

        // Validate dates
        if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          const durationMs = endTime.getTime() - startTime.getTime();
          return this._formatDuration(durationMs);
        }
      }
    } catch (error) {
      console.warn("Error calculating duration:", error);
    }

    return "N/A";
  }

  /**
   * Format duration in human-readable way for debugging
   * @param durationMs - Duration in milliseconds
   * @returns Formatted duration string
   */
  private _formatDuration(durationMs: number): string {
    if (durationMs < 0) {
      return "N/A";
    }

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(2)}s`;
    } else if (durationMs < 3600000) {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Format bytes in human-readable form
   */
  private _formatBytes(run: RunHistoryDetails): string {
    if (!run.bigQueryJob?.statistics?.totalBytesProcessed) {
      return "N/A";
    }

    const bytes = parseInt(run.bigQueryJob.statistics.totalBytesProcessed);
    if (isNaN(bytes)) {
      return "N/A";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get run durations for chart with improved date validation and debugging
   */
  private _getRunDurations(runs: RunHistoryDetails[]): number[] {
    console.log("=== Processing Chart Durations ===");
    console.log(`Processing durations for ${runs.length} runs`);

    const durations = runs.map((run, index) => {
      console.log(`\n--- Run ${index} (${run.runId}) ---`);
      console.log(`State: ${run.state}`);
      console.log(`Transfer times: ${run.startTime} → ${run.endTime}`);
      console.log(`BigQuery job:`, run.bigQueryJob ? "Present" : "Missing");

      if (run.bigQueryJob?.statistics) {
        console.log(`BigQuery statistics:`, {
          startTime: run.bigQueryJob.statistics.startTime,
          endTime: run.bigQueryJob.statistics.endTime,
          startTimeType: typeof run.bigQueryJob.statistics.startTime,
          endTimeType: typeof run.bigQueryJob.statistics.endTime,
        });
      }

      let duration = 0;
      let source = "none";

      try {
        // Method 1: Try BigQuery job statistics (most accurate)
        if (
          run.bigQueryJob?.statistics?.startTime &&
          run.bigQueryJob?.statistics?.endTime
        ) {
          console.log(`Attempting BigQuery timestamp parsing...`);
          const startTime = new Date(run.bigQueryJob.statistics.startTime);
          const endTime = new Date(run.bigQueryJob.statistics.endTime);

          console.log(`Parsed dates:`, {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            startValid: !isNaN(startTime.getTime()),
            endValid: !isNaN(endTime.getTime()),
          });

          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
            duration = endTime.getTime() - startTime.getTime();
            source = "bigquery-stats";
            console.log(
              `✅ BigQuery duration: ${duration}ms (${this._formatDuration(
                duration
              )})`
            );

            if (duration > 0) {
              return duration;
            }
          }
        }

        // Method 2: Fallback to transfer run times
        if (
          run.startTime &&
          run.endTime &&
          run.startTime !== "N/A" &&
          run.endTime !== "N/A" &&
          run.startTime !== "Invalid Date" &&
          run.endTime !== "Invalid Date"
        ) {
          console.log(`Attempting transfer run timestamp parsing...`);
          const startTime = new Date(run.startTime);
          const endTime = new Date(run.endTime);

          console.log(`Transfer parsed dates:`, {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            startValid: !isNaN(startTime.getTime()),
            endValid: !isNaN(endTime.getTime()),
          });

          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
            duration = endTime.getTime() - startTime.getTime();
            source = "transfer-run";
            console.log(
              `✅ Transfer duration: ${duration}ms (${this._formatDuration(
                duration
              )})`
            );

            if (duration > 0) {
              return duration;
            }
          }
        }

        // Method 3: Try to extract from the calculated duration string
        const calculatedDuration = this._calculateDuration(run);
        if (calculatedDuration !== "N/A") {
          console.log(
            `Attempting duration string parsing: "${calculatedDuration}"`
          );
          const durationMs = this._parseDurationToMs(calculatedDuration);
          if (durationMs > 0) {
            duration = durationMs;
            source = "parsed-string";
            console.log(`✅ Parsed string duration: ${duration}ms`);
            return duration;
          }
        }
      } catch (error) {
        console.warn(
          `❌ Error calculating duration for run ${run.runId}:`,
          error
        );
      }

      // If we get here, no valid duration was found
      console.log(
        `❌ No valid duration found (source: ${source}, value: ${duration})`
      );
      return 0;
    });

    console.log("\n=== Final Chart Durations ===");
    console.log("Chart durations:", durations);
    console.log(
      `Valid durations: ${durations.filter((d) => d > 0).length}/${
        durations.length
      }`
    );

    // Validate that we have at least some non-zero durations
    const validDurations = durations.filter((d) => d > 0);
    if (validDurations.length === 0) {
      console.warn(
        "⚠️  All durations are zero! This will result in an empty chart."
      );
      console.warn(
        "Raw run data sample:",
        runs.slice(0, 2).map((run) => ({
          runId: run.runId,
          state: run.state,
          startTime: run.startTime,
          endTime: run.endTime,
          bigQueryJob: run.bigQueryJob
            ? {
                statistics: run.bigQueryJob.statistics,
              }
            : null,
        }))
      );
    }

    return durations;
  }

  /**
   * Parse a formatted duration string back to milliseconds
   * @param durationStr - Duration string like "1.23s", "2m 30s", etc.
   * @returns Duration in milliseconds or 0 if cannot parse
   */
  private _parseDurationToMs(durationStr: string): number {
    if (!durationStr || durationStr === "N/A") {
      return 0;
    }

    try {
      // Handle milliseconds
      if (durationStr.endsWith("ms")) {
        return parseInt(durationStr.replace("ms", ""), 10) || 0;
      }

      // Handle seconds
      if (durationStr.endsWith("s") && !durationStr.includes("m")) {
        return Math.round(parseFloat(durationStr.replace("s", "")) * 1000) || 0;
      }

      // Handle minutes and seconds (e.g., "2m 30s")
      const minutesMatch = durationStr.match(/(\d+)m/);
      const secondsMatch = durationStr.match(/(\d+)s/);

      let totalMs = 0;
      if (minutesMatch && minutesMatch[1]) {
        totalMs += parseInt(minutesMatch[1], 10) * 60 * 1000;
      }
      if (secondsMatch && secondsMatch[1]) {
        totalMs += parseInt(secondsMatch[1], 10) * 1000;
      }

      // Handle hours (e.g., "1h 30m")
      const hoursMatch = durationStr.match(/(\d+)h/);
      if (hoursMatch && hoursMatch[1]) {
        totalMs += parseInt(hoursMatch[1], 10) * 60 * 60 * 1000;
      }

      return totalMs;
    } catch (error) {
      console.warn("Error parsing duration string:", durationStr, error);
      return 0;
    }
  }

  /**
   * Get run labels for chart with improved date validation
   */
  private _getRunLabels(runs: RunHistoryDetails[]): string[] {
    return runs.map((run, index) => {
      if (
        run.startTime &&
        run.startTime !== "N/A" &&
        run.startTime !== "Invalid Date"
      ) {
        try {
          const date = new Date(run.startTime);
          if (!isNaN(date.getTime())) {
            // Format as MM/DD HH:MM for better chart readability
            const month = (date.getMonth() + 1).toString().padStart(2, "0");
            const day = date.getDate().toString().padStart(2, "0");
            const hours = date.getHours().toString().padStart(2, "0");
            const minutes = date.getMinutes().toString().padStart(2, "0");
            return `${month}/${day} ${hours}:${minutes}`;
          }
        } catch (error) {
          console.warn("Error formatting chart label:", error);
        }
      }
      return `Run ${runs.length - index}`;
    });
  }

  /**
   * Get chart colors based on run status
   */
  private _getRunColors(runs: RunHistoryDetails[]): string[] {
    return runs.map((run) => {
      switch (run.state.toUpperCase()) {
        case "SUCCEEDED":
          return "rgba(65, 171, 93, 0.8)";
        case "FAILED":
          return "rgba(239, 59, 44, 0.8)";
        case "CANCELLED":
          return "rgba(247, 150, 70, 0.8)";
        default:
          return "rgba(153, 153, 153, 0.8)";
      }
    });
  }

  /**
   * Escape HTML special characters
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Generates the WebView HTML content
   */
  private _getWebviewContent(
    node: ScheduledQueryNode,
    runHistory: RunHistoryDetails[]
  ): string {
    // Reverse the array to show most recent runs first
    const runs = [...runHistory].reverse();

    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Run History</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
            :root {
              --success-color: #28a745;
              --success-bg: rgba(40, 167, 69, 0.1);
              --error-color: #dc3545;
              --error-bg: rgba(220, 53, 69, 0.1);
              --warning-color: #fd7e14;
              --warning-bg: rgba(253, 126, 20, 0.1);
              --pending-color: #6c757d;
              --pending-bg: rgba(108, 117, 125, 0.1);
              --primary-color: #007bff;
              --border-color: var(--vscode-panel-border);
              --border-radius: 8px;
              --shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
              padding: 24px;
              line-height: 1.5;
              margin: 0;
            }
            
            h1, h2 {
              color: var(--vscode-editor-foreground);
              font-weight: 600;
              margin: 0 0 16px 0;
            }
            
            h1 {
              font-size: 1.5em;
              display: flex;
              align-items: center;
              gap: 12px;
              border-bottom: 2px solid var(--border-color);
              padding-bottom: 12px;
              margin-bottom: 24px;
            }
            
            h2 {
              font-size: 1.2em;
              margin-top: 32px;
              margin-bottom: 16px;
            }
            
            .container {
              max-width: 1200px;
              margin: 0 auto;
            }
            
            .summary {
              background: var(--vscode-editor-lineHighlightBackground);
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius);
              padding: 16px;
              margin-bottom: 24px;
            }
            
            .summary p {
              margin: 0;
              font-weight: 500;
            }
            
            .status-indicators {
              display: flex;
              gap: 8px;
              margin: 16px 0;
              flex-wrap: wrap;
            }
            
            .status-indicator {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              border: 2px solid transparent;
              transition: transform 0.2s ease;
            }
            
            .status-indicator:hover {
              transform: scale(1.2);
            }
            
            .table-container {
              background: var(--vscode-editor-background);
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius);
              overflow: hidden;
              box-shadow: var(--shadow);
            }
            
            .run-history-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
            }
            
            .run-history-table th {
              background: var(--vscode-editor-lineHighlightBackground);
              color: var(--vscode-editor-foreground);
              font-weight: 600;
              padding: 16px 12px;
              text-align: left;
              border-bottom: 2px solid var(--border-color);
              position: sticky;
              top: 0;
              z-index: 10;
            }
            
            .run-row {
              border-bottom: 1px solid var(--border-color);
              transition: background-color 0.2s ease;
            }
            
            .run-row:hover {
              background-color: var(--vscode-list-hoverBackground);
            }
            
            .run-row td {
              padding: 12px;
              vertical-align: top;
            }
            
            .time-cell {
              min-width: 140px;
            }
            
            .time-primary {
              font-weight: 500;
              color: var(--vscode-editor-foreground);
              margin-bottom: 2px;
            }
            
            .time-secondary {
              font-size: 12px;
              color: var(--vscode-descriptionForeground);
              font-style: italic;
            }
            
            .status-cell {
              min-width: 120px;
            }
            
            .status-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .status-icon {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              display: inline-block;
            }
            
            .success {
              background-color: var(--success-bg);
              color: var(--success-color);
              border: 1px solid var(--success-color);
            }
            
            .success .status-icon {
              background-color: var(--success-color);
            }
            
            .error {
              background-color: var(--error-bg);
              color: var(--error-color);
              border: 1px solid var(--error-color);
            }
            
            .error .status-icon {
              background-color: var(--error-color);
            }
            
            .running {
              background-color: var(--primary-color);
              color: white;
              animation: pulse 2s infinite;
            }
            
            .running .status-icon {
              background-color: white;
              animation: pulse 2s infinite;
            }
            
            .pending, .cancelled {
              background-color: var(--pending-bg);
              color: var(--pending-color);
              border: 1px solid var(--pending-color);
            }
            
            .pending .status-icon, .cancelled .status-icon {
              background-color: var(--pending-color);
            }
            
            .duration-cell, .bytes-cell {
              font-family: var(--vscode-editor-font-family), 'Courier New', monospace;
              font-size: 13px;
              color: var(--vscode-editor-foreground);
            }
            
            .actions-cell {
              min-width: 120px;
            }
            
            .action-btn {
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: 1px solid var(--vscode-button-background);
              padding: 6px 12px;
              margin: 0 4px 4px 0;
              cursor: pointer;
              border-radius: 4px;
              font-size: 12px;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              transition: all 0.2s ease;
              text-decoration: none;
            }
            
            .action-btn:hover {
              background: var(--vscode-button-hoverBackground);
              transform: translateY(-1px);
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            
            .btn-icon {
              font-size: 14px;
            }
            
            .chart-container {
              background: var(--vscode-editor-background);
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius);
              padding: 20px;
              margin-top: 24px;
              box-shadow: var(--shadow);
              max-width: 100%;
              overflow: hidden;
            }
            
            .chart-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 16px;
            }
            
            .chart-title {
              font-size: 1.1em;
              font-weight: 600;
              color: var(--vscode-editor-foreground);
            }
            
            .chart-info {
              font-size: 12px;
              color: var(--vscode-descriptionForeground);
            }
            
            .no-data {
              text-align: center;
              padding: 40px 20px;
              color: var(--vscode-descriptionForeground);
              font-style: italic;
            }
            
            .empty-state {
              text-align: center;
              padding: 60px 20px;
              color: var(--vscode-descriptionForeground);
            }
            
            .empty-state-icon {
              font-size: 48px;
              margin-bottom: 16px;
              opacity: 0.5;
            }
            
            .loading-indicator {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              font-style: italic;
              color: var(--vscode-descriptionForeground);
            }
            
            .refresh-btn {
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: 1px solid var(--vscode-button-background);
              padding: 8px 16px;
              cursor: pointer;
              border-radius: 4px;
              font-size: 14px;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              transition: all 0.2s ease;
              margin-bottom: 16px;
            }
            
            .refresh-btn:hover {
              background: var(--vscode-button-hoverBackground);
            }
            
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 1; }
              100% { opacity: 0.6; }
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
              body {
                padding: 16px;
              }
              
              .run-history-table {
                font-size: 13px;
              }
              
              .run-history-table th,
              .run-history-table td {
                padding: 8px 6px;
              }
              
              .status-indicators {
                gap: 6px;
              }
              
              .status-indicator {
                width: 20px;
                height: 20px;
              }
              
              .chart-container {
                padding: 15px;
                margin-top: 16px;
              }
              
              #performanceChart {
                height: 150px !important;
                max-height: 150px !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>
              📊 Run History: ${node.config.displayName || "Unnamed Query"}
            </h1>
            
            <div class="summary">
              <p><strong>Schedule:</strong> ${node.config.schedule || "N/A"}</p>
              <button class="refresh-btn" onclick="refreshData()">
                🔄 Refresh Data
              </button>
            </div>
            
            <h2>📈 Status History</h2>
            <div class="status-indicators">
              ${this._generateStatusIndicators(runs)}
            </div>
            
            <h2>📋 Run Details</h2>
            ${
              runs.length > 0
                ? this._generateDetailsTable(runs)
                : `
              <div class="empty-state">
                <div class="empty-state-icon">🚫</div>
                <p>No run history available for this scheduled query.</p>
                <p>Runs will appear here once the scheduled query has been executed.</p>
              </div>
            `
            }
            
            <h2>⚡ Performance Overview</h2>
            <div class="chart-container">
              <div class="chart-header">
                <div class="chart-title">Execution Time Trends</div>
                <div class="chart-info">Duration of recent query executions</div>
              </div>
              ${
                runs.length > 0
                  ? '<canvas id="performanceChart" style="height: 200px; max-height: 200px;"></canvas>'
                  : `
                <div class="no-data">
                  📊 Chart will display once execution data is available
                </div>
              `
              }
            </div>
          </div>
          
          <script>
            (function() {
              // Get VS Code API
              const vscode = acquireVsCodeApi();
              
              // Function to refresh data
              window.refreshData = function() {
                vscode.postMessage({
                  command: 'refreshData'
                });
              };
              
              // Set up chart if we have data
              const chartCanvas = document.getElementById('performanceChart');
              if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                const labels = ${JSON.stringify(this._getRunLabels(runs))};
                const durations = ${JSON.stringify(
                  this._getRunDurations(runs)
                )};
                const colors = ${JSON.stringify(this._getRunColors(runs))};
                
                // Debug: Log the durations to console to help troubleshoot zero values
                console.log('Chart durations:', durations);
                console.log('Chart labels:', labels);
                console.log('Chart colors:', colors);
                
                // Check if we have valid data
                const hasValidData = durations.some(d => d > 0);
                if (!hasValidData) {
                  console.warn('No valid duration data found. All values are zero.');
                }
                
                const chartConfig = {
                  type: 'bar',
                  data: {
                    labels: labels,
                    datasets: [{
                      label: 'Execution Time',
                      data: durations,
                      backgroundColor: colors,
                      borderColor: colors.map(color => color.replace('0.8', '1')),
                      borderWidth: 1,
                      borderRadius: 4,
                      borderSkipped: false,
                    }]
                  },
                  options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                      intersect: false,
                      mode: 'index'
                    },
                    layout: {
                      padding: {
                        top: 10,
                        bottom: 10
                      }
                    },
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        borderWidth: 1,
                        cornerRadius: 6,
                        displayColors: true,
                        callbacks: {
                          title: function(context) {
                            return 'Execution at ' + context[0].label;
                          },
                          label: function(context) {
                            const ms = context.raw;
                            if (ms === 0) {
                              return 'Duration: No data available';
                            } else if (ms < 1000) {
                              return \`Duration: \${ms} ms\`;
                            } else if (ms < 60000) {
                              return \`Duration: \${(ms / 1000).toFixed(2)} seconds\`;
                            } else if (ms < 3600000) {
                              const minutes = Math.floor(ms / 60000);
                              const seconds = Math.floor((ms % 60000) / 1000);
                              return \`Duration: \${minutes}m \${seconds}s\`;
                            } else {
                              const hours = Math.floor(ms / 3600000);
                              const minutes = Math.floor((ms % 3600000) / 60000);
                              return \`Duration: \${hours}h \${minutes}m\`;
                            }
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        ticks: {
                          color: 'var(--vscode-editor-foreground)',
                          maxRotation: 45,
                          font: {
                            size: 11
                          }
                        },
                        grid: {
                          color: 'var(--vscode-panel-border)',
                          drawBorder: false
                        }
                      },
                      y: {
                        beginAtZero: true,
                        ticks: {
                          color: 'var(--vscode-editor-foreground)',
                          font: {
                            size: 11
                          },
                          callback: function(value) {
                            if (value === 0) {
                              return '0';
                            } else if (value < 1000) {
                              return \`\${value} ms\`;
                            } else if (value < 60000) {
                              return \`\${(value / 1000).toFixed(1)} s\`;
                            } else if (value < 3600000) {
                              return \`\${(value / 60000).toFixed(1)} m\`;
                            } else {
                              return \`\${(value / 3600000).toFixed(1)} h\`;
                            }
                          }
                        },
                        grid: {
                          color: 'var(--vscode-panel-border)',
                          drawBorder: false
                        }
                      }
                    }
                  }
                };
                
                // Create the chart
                new Chart(ctx, chartConfig);
              }
              
              // Handle SQL view buttons
              document.querySelectorAll('.view-sql').forEach(button => {
                button.addEventListener('click', (e) => {
                  e.preventDefault();
                  const sql = button.getAttribute('data-sql');
                  if (sql) {
                    vscode.postMessage({
                      command: 'openQuery',
                      sql: sql
                    });
                  }
                });
              });
              
              // Add tooltips to status indicators
              document.querySelectorAll('.status-indicator').forEach((indicator, index) => {
                const runData = ${JSON.stringify(
                  runs.map((r) => ({ state: r.state, startTime: r.startTime }))
                )};
                if (runData[index]) {
                  const run = runData[index];
                  indicator.title = \`\${run.state} - \${new Date(run.startTime).toLocaleString()}\`;
                }
              });
              
            })();
          </script>
        </body>
      </html>`;
  }
}
