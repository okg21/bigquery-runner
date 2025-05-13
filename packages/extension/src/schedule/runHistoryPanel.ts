/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import type { RunHistoryDetails } from './dtsClient';
import type { ScheduledQueryNode } from './scheduleProvider';

/**
 * WebView panel for displaying run history of a scheduled query
 * Shows status indicators and a bar chart for visualizing query performance
 */
export class RunHistoryPanel {
  public static readonly viewType = 'bigqueryExplorer.runHistory';
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  
  private static _currentPanel: RunHistoryPanel | undefined;
  
  /**
   * Factory method to create or show the run history panel
   */
  public static createOrShow(extensionUri: vscode.Uri, node: ScheduledQueryNode, runHistory: RunHistoryDetails[]): RunHistoryPanel {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (RunHistoryPanel._currentPanel) {
      RunHistoryPanel._currentPanel._panel.reveal(columnToShowIn);
      RunHistoryPanel._currentPanel.update(node, runHistory);
      return RunHistoryPanel._currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      RunHistoryPanel.viewType,
      `Run History: ${node.config.displayName || 'Unnamed Query'}`,
      columnToShowIn || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out'),
          vscode.Uri.joinPath(extensionUri, 'media')
        ]
      }
    );

    RunHistoryPanel._currentPanel = new RunHistoryPanel(panel, extensionUri);
    RunHistoryPanel._currentPanel.update(node, runHistory);
    
    return RunHistoryPanel._currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set up event listeners
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    
    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openQuery':
            if (message.sql) {
              void this._openSqlInEditor(message.sql);
            }
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
  public update(node: ScheduledQueryNode, runHistory: RunHistoryDetails[]): void {
    this._panel.title = `Run History: ${node.config.displayName || 'Unnamed Query'}`;
    this._panel.webview.html = this._getWebviewContent(node, runHistory);
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
        language: 'sql'
      });
      
      await vscode.window.showTextDocument(document);
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to open SQL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate status indicators HTML
   */
  private _generateStatusIndicators(runs: RunHistoryDetails[]): string {
    return runs.map(run => {
      const statusClass = this._getStatusClass(run.state);
      const tooltip = `${run.state}: ${new Date(run.startTime).toLocaleString()}`;
      return `<div class="status-indicator ${statusClass}" title="${tooltip}"></div>`;
    }).join('');
  }

  /**
   * Get CSS class for status
   */
  private _getStatusClass(state: string): string {
    switch (state.toUpperCase()) {
      case 'SUCCEEDED':
        return 'success';
      case 'FAILED':
        return 'error';
      case 'RUNNING':
        return 'running';
      case 'CANCELLED':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  /**
   * Generate details table HTML
   */
  private _generateDetailsTable(runs: RunHistoryDetails[]): string {
    let tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Bytes Processed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    runs.forEach(run => {
      const startTime = new Date(run.startTime).toLocaleString();
      const duration = this._calculateDuration(run);
      const bytesProcessed = this._formatBytes(run);
      const statusClass = this._getStatusClass(run.state);

      tableHtml += `
        <tr>
          <td>${startTime}</td>
          <td><span class="status-badge ${statusClass}">${run.state}</span></td>
          <td>${duration}</td>
          <td>${bytesProcessed}</td>
          <td>
            ${run.query ? `<button class="view-sql" data-sql="${this._escapeHtml(run.query)}">View SQL</button>` : ''}
          </td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table>`;
    return tableHtml;
  }

  /**
   * Calculate run duration in readable format
   */
  private _calculateDuration(run: RunHistoryDetails): string {
    if (run.bigQueryJob?.statistics?.startTime && run.bigQueryJob?.statistics?.endTime) {
      const startTime = new Date(run.bigQueryJob.statistics.startTime).getTime();
      const endTime = new Date(run.bigQueryJob.statistics.endTime).getTime();
      const durationMs = endTime - startTime;
      
      if (durationMs < 1000) {
        return `${durationMs}ms`;
      } else {
        return `${(durationMs / 1000).toFixed(2)}s`;
      }
    } else if (run.startTime && run.endTime && run.startTime !== 'N/A' && run.endTime !== 'N/A') {
      const startTime = new Date(run.startTime).getTime();
      const endTime = new Date(run.endTime).getTime();
      const durationMs = endTime - startTime;
      
      if (durationMs < 1000) {
        return `${durationMs}ms`;
      } else {
        return `${(durationMs / 1000).toFixed(2)}s`;
      }
    }
    
    return 'N/A';
  }

  /**
   * Format bytes in human-readable form
   */
  private _formatBytes(run: RunHistoryDetails): string {
    if (!run.bigQueryJob?.statistics?.totalBytesProcessed) {
      return 'N/A';
    }

    const bytes = parseInt(run.bigQueryJob.statistics.totalBytesProcessed);
    if (isNaN(bytes)) {
      return 'N/A';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get run durations for chart
   */
  private _getRunDurations(runs: RunHistoryDetails[]): number[] {
    return runs.map(run => {
      if (run.bigQueryJob?.statistics?.startTime && run.bigQueryJob?.statistics?.endTime) {
        const startTime = new Date(run.bigQueryJob.statistics.startTime).getTime();
        const endTime = new Date(run.bigQueryJob.statistics.endTime).getTime();
        return endTime - startTime;
      } else if (run.startTime && run.endTime && run.startTime !== 'N/A' && run.endTime !== 'N/A') {
        const startTime = new Date(run.startTime).getTime();
        const endTime = new Date(run.endTime).getTime();
        return endTime - startTime;
      }
      return 0;
    });
  }

  /**
   * Get run labels for chart
   */
  private _getRunLabels(runs: RunHistoryDetails[]): string[] {
    return runs.map((run, index) => {
      if (run.startTime && run.startTime !== 'N/A') {
        // Format as HH:MM
        const date = new Date(run.startTime);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      return `Run ${runs.length - index}`;
    });
  }

  /**
   * Get chart colors based on run status
   */
  private _getRunColors(runs: RunHistoryDetails[]): string[] {
    return runs.map(run => {
      switch (run.state.toUpperCase()) {
        case 'SUCCEEDED':
          return 'rgba(65, 171, 93, 0.8)';
        case 'FAILED':
          return 'rgba(239, 59, 44, 0.8)';
        case 'CANCELLED':
          return 'rgba(247, 150, 70, 0.8)';
        default:
          return 'rgba(153, 153, 153, 0.8)';
      }
    });
  }

  /**
   * Escape HTML special characters
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generates the WebView HTML content
   */
  private _getWebviewContent(node: ScheduledQueryNode, runHistory: RunHistoryDetails[]): string {
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
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
              padding: 20px;
            }
            h1, h2 {
              color: var(--vscode-editor-foreground);
              font-weight: normal;
            }
            .container {
              display: flex;
              flex-direction: column;
              gap: 20px;
            }
            .summary {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 10px;
            }
            .status-indicators {
              display: flex;
              gap: 6px;
              margin: 10px 0;
            }
            .status-indicator {
              width: 20px;
              height: 20px;
              border-radius: 50%;
            }
            .status-badge {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 4px;
              color: white;
              font-size: 12px;
            }
            .success {
              background-color: #41ab5d;
            }
            .error {
              background-color: #ef3b2c;
            }
            .running {
              background-color: #74c476;
              animation: pulse 2s infinite;
            }
            .pending {
              background-color: #969696;
            }
            .cancelled {
              background-color: #f7966a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }
            th, td {
              text-align: left;
              padding: 8px;
              border-bottom: 1px solid var(--vscode-panel-border);
            }
            th {
              background-color: var(--vscode-editor-lineHighlightBackground);
              font-weight: bold;
            }
            .chart-container {
              height: 250px;
              margin-top: 20px;
            }
            button {
              background-color: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: none;
              padding: 4px 8px;
              cursor: pointer;
              border-radius: 3px;
            }
            button:hover {
              background-color: var(--vscode-button-hoverBackground);
            }
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 1; }
              100% { opacity: 0.6; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${node.config.displayName || 'Unnamed Query'}</h1>
            <div class="summary">
              <p><strong>Schedule:</strong> ${node.config.schedule || 'N/A'}</p>
            </div>
            
            <h2>Status History</h2>
            <div class="status-indicators">
              ${this._generateStatusIndicators(runs)}
            </div>
            
            <h2>Run Details</h2>
            ${runs.length > 0 ? this._generateDetailsTable(runs) : '<p>No run history available.</p>'}
            
            <h2>Performance</h2>
            <div class="chart-container">
              <canvas id="performanceChart"></canvas>
            </div>
          </div>
          
          <script>
            (function() {
              // Set up chart
              const ctx = document.getElementById('performanceChart');
              new Chart(ctx, {
                type: 'bar',
                data: {
                  labels: ${JSON.stringify(this._getRunLabels(runs))},
                  datasets: [{
                    label: 'Execution Time (ms)',
                    data: ${JSON.stringify(this._getRunDurations(runs))},
                    backgroundColor: ${JSON.stringify(this._getRunColors(runs))}
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const ms = context.raw;
                          if (ms < 1000) {
                            return \`\${ms} ms\`;
                          } else {
                            return \`\${(ms / 1000).toFixed(2)} seconds\`;
                          }
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          if (value < 1000) {
                            return \`\${value} ms\`;
                          } else {
                            return \`\${(value / 1000).toFixed(1)} s\`;
                          }
                        }
                      }
                    }
                  }
                }
              });
              
              // Handle SQL view buttons
              document.querySelectorAll('.view-sql').forEach(button => {
                button.addEventListener('click', () => {
                  const sql = button.getAttribute('data-sql');
                  vscode.postMessage({
                    command: 'openQuery',
                    sql: sql
                  });
                });
              });
              
              // Get VS Code API
              const vscode = acquireVsCodeApi();
            })();
          </script>
        </body>
      </html>`;
  }
} 