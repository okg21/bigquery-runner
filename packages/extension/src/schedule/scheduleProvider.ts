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
 * Search result node that flattens the hierarchy for search results
 */
export class SearchResultNode extends vscode.TreeItem {
  constructor(
    public readonly config: TransferConfig,
    public readonly region: string,
    public readonly projectId: string
  ) {
    super(
      config.displayName || "Unnamed Query",
      vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = config.name || "";
    this.description = `${config.schedule || "No schedule"} • ${region}`;
    this.contextValue = "scheduledQuery";

    // Different icons based on state with search highlight
    const state = config.state;
    if (state === "SUCCEEDED") {
      this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("charts.green"));
    } else if (state === "FAILED") {
      this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red"));
    } else if (state === "PENDING") {
      this.iconPath = new vscode.ThemeIcon("clock", new vscode.ThemeColor("charts.yellow"));
    } else {
      this.iconPath = new vscode.ThemeIcon("database-view", new vscode.ThemeColor("charts.blue"));
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
 * Fuzzy matching function for search
 */
function fuzzyMatch(search: string, target: string): boolean {
  if (!search || !target) {return false;}
  
  const searchLower = search.toLowerCase();
  const targetLower = target.toLowerCase();
  
  // Exact match
  if (targetLower.includes(searchLower)) {return true;}
  
  // Fuzzy match - check if all characters in search appear in order in target
  let searchIndex = 0;
  for (let i = 0; i < targetLower.length && searchIndex < searchLower.length; i++) {
    if (targetLower[i] === searchLower[searchIndex]) {
      searchIndex++;
    }
  }
  
  return searchIndex === searchLower.length;
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

  // Search functionality
  private searchFilter = "";

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
    this.searchFilter = ""; // Clear search filter to return to hierarchical view
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Sets the search filter and refreshes the view
   */
  setSearchFilter(filter: string): void {
    this.searchFilter = filter;
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Gets the current search filter
   */
  getSearchFilter(): string {
    return this.searchFilter;
  }

  /**
   * Clears the search filter
   */
  clearSearch(): void {
    this.searchFilter = "";
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
      // If search filter is active and no element, return filtered results
      if (this.searchFilter && !element) {
        console.log("ScheduleProvider: Returning search results for:", this.searchFilter);
        
        const searchResults: SearchResultNode[] = [];
        const searchLower = this.searchFilter.toLowerCase();
        
        // Search through all cached configs
        for (const [region, configs] of this.configsByRegion.entries()) {
          for (const config of configs) {
            const displayName = config.displayName || "Unnamed Query";
            const schedule = config.schedule || "";
            const name = config.name || "";
            
            // Check if the search matches display name, schedule, or name
            if (
              fuzzyMatch(this.searchFilter, displayName) ||
              fuzzyMatch(this.searchFilter, schedule) ||
              fuzzyMatch(this.searchFilter, name)
            ) {
              searchResults.push(new SearchResultNode(config, region, this.projectId));
            }
          }
        }
        
        // If no cached results, try to load data from all regions
        if (searchResults.length === 0 && this.configsByRegion.size === 0) {
          console.log("ScheduleProvider: Loading data for search...");
          
          // Load data from all regions
          const loadingPromises = this.regions.map(async (region) => {
            if (!this.configsByRegion.has(region)) {
              try {
                const configs = await this.client.listConfigs(
                  this.projectId!,
                  region,
                  (message: string, currentPage: number) => {
                    console.log(`Loading ${region} page ${currentPage}: ${message}`);
                  }
                );
                this.configsByRegion.set(region, configs);
              } catch (error) {
                console.error(`Error loading ${region}:`, error);
              }
            }
          });
          
          await Promise.all(loadingPromises);
          
          // Re-run search after loading
          for (const [region, configs] of this.configsByRegion.entries()) {
            for (const config of configs) {
              const displayName = config.displayName || "Unnamed Query";
              const schedule = config.schedule || "";
              const name = config.name || "";
              
              if (
                fuzzyMatch(this.searchFilter, displayName) ||
                fuzzyMatch(this.searchFilter, schedule) ||
                fuzzyMatch(this.searchFilter, name)
              ) {
                searchResults.push(new SearchResultNode(config, region, this.projectId));
              }
            }
          }
        }
        
        if (searchResults.length === 0) {
          return [new vscode.TreeItem(`No results found for "${this.searchFilter}"`)];
        }
        
        // Sort results by relevance (exact matches first, then fuzzy)
        searchResults.sort((a, b) => {
          const aExact = (a.config.displayName || "").toLowerCase().includes(searchLower);
          const bExact = (b.config.displayName || "").toLowerCase().includes(searchLower);
          
          if (aExact && !bExact) {return -1;}
          if (!aExact && bExact) {return 1;}
          
          // Sort by display name
          return (a.config.displayName || "").localeCompare(b.config.displayName || "");
        });
        
        return searchResults;
      }
      
      // If no element, return regions (normal view)
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
            // Fetch configs for this region with progress indication
            console.log(
              `ScheduleProvider: Fetching configs for ${this.projectId}/${region}`
            );
            
            const configs = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Loading scheduled queries for ${region}`,
                cancellable: false,
              },
              async (progress) => {
                return await this.client.listConfigs(
                  this.projectId!,
                  region,
                  (message: string, currentPage: number) => {
                    progress.report({
                      message: `Page ${currentPage}: ${message}`,
                      increment: currentPage > 1 ? 10 : 0, // Increment by 10% per page (rough estimate)
                    });
                  }
                );
              }
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
