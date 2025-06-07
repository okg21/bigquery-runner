/**
 * Copyright 2023
 * SPDX-License-Identifier: Apache-2.0
 */

import type { protos } from "@google-cloud/bigquery-data-transfer";
import * as vscode from "vscode";
import type { DTSClient } from "./dtsClient";

type TransferConfig =
  protos.google.cloud.bigquery.datatransfer.v1.ITransferConfig;

/**
 * Tree node representing a region (parent node)
 */
export class RegionNode extends vscode.TreeItem {
  constructor(
    public readonly region: string,
    public readonly projectId: string
  ) {
    super(region, vscode.TreeItemCollapsibleState.Collapsed);
    this.tooltip = `Region: ${region}`;
    this.description = `(${projectId})`;
    this.contextValue = "region";
    this.iconPath = new vscode.ThemeIcon("globe");
  }
}

/**
 * Tree node representing a scheduled query (child node)
 */
export class ScheduledQueryNode extends vscode.TreeItem {
  constructor(public readonly config: TransferConfig) {
    super(
      config.displayName || "Unnamed Query",
      vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = config.name || "";
    this.description = config.schedule || "";
    this.contextValue = "scheduledQuery";

    // Different icons based on state
    const state = config.state;
    if (state === "SUCCEEDED") {
      this.iconPath = new vscode.ThemeIcon("check");
    } else if (state === "FAILED") {
      this.iconPath = new vscode.ThemeIcon("error");
    } else if (state === "PENDING") {
      this.iconPath = new vscode.ThemeIcon("clock");
    } else {
      this.iconPath = new vscode.ThemeIcon("database-view");
    }

    // Add a command to open the scheduled query
    this.command = {
      command: "bigqueryExplorer.openScheduledSQL",
      title: "",
      arguments: [this],
    };
  }
}

/**
 * TreeDataProvider that displays scheduled queries grouped by region
 */
export class ScheduleProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();

  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null
  > = this._onDidChangeTreeData.event;

  // Cache of regions and configurations
  private regions: string[] = ["us", "eu"]; // Default regions
  private configsByRegion: Map<string, TransferConfig[]> = new Map();

  constructor(private client: DTSClient, private projectId?: string) {}

  /**
   * Sets the project ID and refreshes the view
   */
  setProjectId(projectId: string): void {
    console.log("ScheduleProvider: Setting project ID to", projectId);
    this.projectId = projectId;
    this.refresh();
  }

  /**
   * Refreshes the view
   */
  refresh(): void {
    console.log("ScheduleProvider: Refreshing scheduled queries view");
    this.configsByRegion.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Gets the TreeItem representation of an element
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of a given element
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // If no project ID, show message
    if (!this.projectId) {
      console.log("ScheduleProvider: No project ID available");
      return [new vscode.TreeItem("No project selected")];
    }

    try {
      // If no element, return regions
      if (!element) {
        console.log(
          "ScheduleProvider: Displaying regions for project",
          this.projectId
        );
        return this.regions.map(
          (region) => new RegionNode(region, this.projectId!)
        );
      }

      // If element is a region, fetch and return scheduled queries
      if (element instanceof RegionNode) {
        const region = element.region;
        console.log(
          `ScheduleProvider: Getting scheduled queries for region ${region} in project ${this.projectId}`
        );

        // Check if we already have configs for this region
        if (!this.configsByRegion.has(region)) {
          try {
            // Fetch configs for this region
            console.log(
              `ScheduleProvider: Fetching configs for ${this.projectId}/${region}`
            );
            const configs = await this.client.listConfigs(
              this.projectId!,
              region
            );
            console.log(
              `ScheduleProvider: Found ${configs.length} scheduled queries`
            );

            // Log each config briefly
            configs.forEach((config, index) => {
              console.log(
                `ScheduleProvider: Config ${index + 1}: ${
                  config.displayName
                } (${config.name})`
              );
            });

            this.configsByRegion.set(region, configs);
          } catch (error) {
            console.error(
              "ScheduleProvider: Error fetching scheduled queries:",
              error
            );
            void vscode.window.showErrorMessage(
              `Error fetching scheduled queries: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            return [new vscode.TreeItem("Error fetching scheduled queries")];
          }
        }

        // Get configs for this region
        const configs = this.configsByRegion.get(region) || [];

        if (configs.length === 0) {
          console.log(
            `ScheduleProvider: No scheduled queries found for ${this.projectId}/${region}`
          );
          return [new vscode.TreeItem("No scheduled queries found")];
        }

        return configs.map((config) => new ScheduledQueryNode(config));
      }

      return [];
    } catch (error) {
      console.error("ScheduleProvider: Error in getChildren:", error);
      void vscode.window.showErrorMessage(
        `Error in ScheduleProvider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [
        new vscode.TreeItem(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        ),
      ];
    }
  }
}
