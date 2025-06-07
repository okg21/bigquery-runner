import type { Client } from "core";
import { createClient } from "core";
import type {
  DatasetReference,
  FieldMode,
  FieldReference,
  FieldType,
  ProjectID,
  ProjectReference,
  TableReference,
} from "shared";
import { getTableName } from "shared";
import type { Disposable, TreeItem } from "vscode";
import {
  env,
  ThemeColor,
  ThemeIcon,
  EventEmitter,
  TreeItemCollapsibleState,
  window,
  Uri,
} from "vscode";
import type { ConfigManager } from "./configManager";
import type { Logger } from "./logger";
import type { Previewer } from "./previewer";

export type Element =
  | ProjectElement
  | DatasetElement
  | TableElement
  | FieldElement;
export type ProjectElement = TreeItem & {
  contextValue: "project";
  id: string;
  label: string;
  ref: ProjectReference;
  collapsibleState: TreeItemCollapsibleState;
};
export type DatasetElement = TreeItem & {
  contextValue: "dataset";
  id: string;
  label: string;
  ref: DatasetReference;
  collapsibleState: TreeItemCollapsibleState;
};
export type TableElement = TreeItem & {
  contextValue: "table";
  id: string;
  label: string;
  ref: TableReference;
  collapsibleState: TreeItemCollapsibleState;
};

export type FieldElement = TreeItem & {
  contextValue: "field";
  id: string;
  label: string;
  ref: FieldReference;
  collapsibleState: TreeItemCollapsibleState;
};

export const createTree = ({
  logger,
  configManager,
  previewer,
}: {
  logger: Logger;
  configManager: ConfigManager;
  previewer: Previewer;
}): Disposable & {
  refreshResources(): Promise<void>;
  deleteSelectedResources(): Promise<void>;
  copyTableId(element: TableElement): Promise<void>;
  previewTableInVSCode(element: TableElement): Promise<void>;
  previewTableOnRemote(element: TableElement): Promise<void>;
  copyFieldName(element: FieldElement): Promise<void>;
  searchResources(): Promise<void>;
} => {
  const clients = new Map<ProjectID, Client>();
  const emitter = new EventEmitter<null>();
  
  // Search state
  let searchFilter: string | null = null;
  
  // Cache for search performance
  const searchCache = new Map<string, {
    datasets: DatasetElement[];
    tables: TableElement[];
    fields: Map<string, FieldReference[]>; // tableKey -> fields
    lastUpdate: number;
  }>();

  const removeListener = configManager.onChange(() => {
    clients.clear();
    searchCache.clear();
    searchFilter = null;
    emitter.fire(null);
  });

  // Simple fuzzy matching function
  const fuzzyMatch = (searchTerm: string, text: string): boolean => {
    const search = searchTerm.toLowerCase().trim();
    const target = text.toLowerCase();
    
    if (!search) {return true;}
    
    // Exact match
    if (target === search) {return true;}
    
    // Starts with
    if (target.startsWith(search)) {return true;}
    
    // Contains
    if (target.includes(search)) {return true;}
    
    // Split by common separators and check parts
    const parts = target.split(/[_\-.]/);
    return parts.some(part => 
      part === search || 
      part.startsWith(search) || 
      part.includes(search)
    );
  };

  // Check if table has matching columns
  const tableHasMatchingColumns = (tableKey: string, projectId: string): boolean => {
    if (!searchFilter) {return false;}
    
    const cache = searchCache.get(projectId);
    const fields = cache?.fields.get(tableKey);
    
    return !!fields?.some(field => fuzzyMatch(searchFilter!, field.name));
  };

  // Cache resources for faster search
  const cacheProjectResources = async (projectId: string) => {
    const client = clients.get(projectId);
    if (!client) {return;}

    try {
      const datasets = await client.getDatasets();
      const { dataset: datasetIcon, table: tableIcon } = icons();

      // Create dataset elements
      const datasetElements: DatasetElement[] = datasets.map((ref) => {
        const id = `${ref.projectId}:${ref.datasetId}`;
        return {
          contextValue: "dataset" as const,
          id,
          tooltip: id,
          iconPath: datasetIcon(),
          label: ref.datasetId,
          ref,
          collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
      });

      // Cache tables and fields
      const tableElements: TableElement[] = [];
      const fieldsMap = new Map<string, FieldReference[]>();

      for (const datasetRef of datasets) {
        try {
          const tables = await client.getTables(datasetRef);
          
          for (const tableRef of tables) {
            const tableId = `${tableRef.projectId}:${tableRef.datasetId}.${tableRef.tableId}`;
            const tableElement: TableElement = {
              contextValue: "table" as const,
              id: tableId,
              tooltip: tableId,
              iconPath: tableIcon(),
              label: tableRef.tableId,
              ref: tableRef,
              collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
            tableElements.push(tableElement);

            // Cache fields for this table
            try {
              const fields = await client.getFields(tableRef);
              const tableKey = `${tableRef.datasetId}.${tableRef.tableId}`;
              fieldsMap.set(tableKey, fields);
            } catch (error) {
              console.warn(`Failed to cache fields for table ${tableRef.tableId}:`, error);
            }
          }
        } catch (error) {
          console.warn(`Failed to cache tables for dataset ${datasetRef.datasetId}:`, error);
        }
      }

      searchCache.set(projectId, {
        datasets: datasetElements,
        tables: tableElements,
        fields: fieldsMap,
        lastUpdate: Date.now(),
      });

    } catch (error) {
      console.error(`Failed to cache resources for project ${projectId}:`, error);
    }
  };

  const tree = window.createTreeView<Element>("bigqueryExplorer.resources", {
    treeDataProvider: {
      onDidChangeTreeData: emitter.event,

      async getChildren(element?: Element): Promise<Array<Element>> {
        const config = configManager.get();

        if (clients.size === 0) {
          const clientResult = await createClient({
            keyFilename: config.keyFilename,
            projectId: config.projectId,
            location: config.location,
          });
          if (!clientResult.success) {
            logger.error(clientResult);
            return [];
          }
          const defaultClient = clientResult.value;
          const defaultProjectId = await defaultClient.getProjectId();
          clients.set(defaultProjectId, defaultClient);

          const projectIdsSet = new Set(config.tree.projectIds);
          projectIdsSet.delete(defaultProjectId);
          await Promise.all(
            Array.from(projectIdsSet).map(async (projectId) => {
              const clientResult = await createClient({
                keyFilename: config.keyFilename,
                projectId,
              });
              if (!clientResult.success) {
                logger.error(clientResult);
                return;
              }
              clients.set(projectId, clientResult.value);
            })
          );

          // Pre-cache resources for search when clients are initialized
          await Promise.all(
            Array.from(clients.keys()).map(projectId => cacheProjectResources(projectId))
          );
        }

        const {
          dataset: datasetIcon,
          table: tableIcon,
          field: fieldIcon,
        } = icons();

        // If we have a search filter, return search results
        if (searchFilter && !element) {
          const results: Element[] = [];
          
          for (const [projectId, cache] of searchCache.entries()) {
            // Add matching datasets
            for (const dataset of cache.datasets) {
              if (fuzzyMatch(searchFilter, dataset.label)) {
                results.push(dataset);
              }
            }
            
            // Add matching tables and tables with matching columns
            for (const table of cache.tables) {
              const tableMatches = fuzzyMatch(searchFilter, table.label);
              const tableKey = `${table.ref.datasetId}.${table.ref.tableId}`;
              const hasMatchingColumns = tableHasMatchingColumns(tableKey, projectId);
              
              if (tableMatches || hasMatchingColumns) {
                // If table has matching columns, expand it
                const resultTable = hasMatchingColumns ? {
                  ...table,
                  collapsibleState: TreeItemCollapsibleState.Expanded
                } : table;
                
                results.push(resultTable);
              }
            }
          }
          
          // Sort results by relevance (exact matches first)
          results.sort((a, b) => {
            const searchLower = searchFilter!.toLowerCase();
            const aExact = a.label.toLowerCase() === searchLower;
            const bExact = b.label.toLowerCase() === searchLower;
            if (aExact && !bExact) {return -1;}
            if (!aExact && bExact) {return 1;}
            return a.label.localeCompare(b.label);
          });
          
          return results.slice(0, 50); // Limit results
        }

        if (!element) {
          return Array.from(clients.keys()).map((projectId) => {
            const id = `${projectId}`;
            const elem: ProjectElement = {
              contextValue: "project",
              id,
              tooltip: id,
              label: projectId,
              ref: { projectId },
              collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
            return elem;
          });
        }

        if (element.contextValue === "project") {
          const client = clients.get(element.ref.projectId);
          if (!client) {
            return [];
          }
          const datasets = await client.getDatasets();
          return datasets.map((ref) => {
            const id = `${ref.projectId}:${ref.datasetId}`;
            const elem: DatasetElement = {
              contextValue: "dataset",
              id,
              tooltip: id,
              iconPath: datasetIcon(),
              label: ref.datasetId,
              ref,
              collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
            return elem;
          });
        }

        if (element.contextValue === "dataset") {
          const client = clients.get(element.ref.projectId);
          if (!client) {
            return [];
          }
          const tables = await client.getTables(element.ref);
          return tables.map((ref) => {
            const id = `${ref.projectId}:${ref.datasetId}.${ref.tableId}`;
            const elem: TableElement = {
              contextValue: "table",
              id,
              tooltip: id,
              iconPath: tableIcon(),
              label: ref.tableId,
              ref,
              collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
            return elem;
          });
        }

        if (element.contextValue === "table") {
          const client = clients.get(element.ref.projectId);
          if (!client) {
            return [];
          }
          const fields = await client.getFields(element.ref);
          return fields.map((ref) => {
            const id = `${ref.projectId}:${ref.datasetId}.${ref.tableId}::${ref.fieldId}`;
            const isMatchingField = searchFilter && fuzzyMatch(searchFilter, ref.name);
            
            const elem: FieldElement = {
              contextValue: "field",
              id,
              tooltip: id,
              label: ref.name,
              description: ref.type,
              iconPath: isMatchingField ? 
                new ThemeIcon("search", new ThemeColor("charts.yellow")) : 
                fieldIcon(ref),
              ref,
              collapsibleState: ref.fields
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.None,
            };
            return elem;
          });
        }

        if (element.contextValue === "field" && element.ref.fields) {
          return element.ref.fields.map((ref) => {
            const id = `${ref.projectId}:${ref.datasetId}.${ref.tableId}::${ref.fieldId}`;
            const elem: FieldElement = {
              contextValue: "field",
              id,
              tooltip: id,
              label: ref.name,
              description: ref.type,
              iconPath: fieldIcon(ref),
              ref,
              collapsibleState: ref.fields
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.None,
            };
            return elem;
          });
        }

        return [];
      },

      async getTreeItem(element: Element): Promise<TreeItem> {
        return element;
      },
    },
  });

  return {
    async refreshResources() {
      searchCache.clear();
      searchFilter = null;
      emitter.fire(null);
    },

    async deleteSelectedResources() {
      await Promise.all([
        ...tree.selection
          .filter(
            (elem): elem is DatasetElement => elem.contextValue === "dataset"
          )
          .map(async ({ ref }) => {
            const client = clients.get(ref.projectId);
            if (!client) {
              return;
            }
            await client.deleteDataset(ref.datasetId);
          }),
        ...tree.selection
          .filter((elem): elem is TableElement => elem.contextValue === "table")
          .map(async ({ ref }) => {
            const client = clients.get(ref.projectId);
            if (!client) {
              return;
            }
            await client.deleteTable(ref);
          }),
      ]);
      await this.refreshResources();
    },

    async copyTableId(element: TableElement) {
      await env.clipboard.writeText(getTableName(element.ref));
    },

    async previewTableInVSCode(element: TableElement) {
      await previewer.preview(element.ref);
    },

    async previewTableOnRemote(element: TableElement) {
      const { projectId, datasetId, tableId } = element.ref;
      await env.openExternal(
        Uri.parse(
          `https://console.cloud.google.com/bigquery?p=${projectId}&d=${datasetId}&t=${tableId}&page=table`
        )
      );
    },

    async copyFieldName(element: FieldElement) {
      await env.clipboard.writeText(element.ref.fieldId);
    },

    async searchResources() {
      const result = await window.showInputBox({
        prompt: "Search BigQuery resources",
        placeHolder: "Search",
        value: searchFilter || "",
        validateInput: (value) => {
          if (!value) {return null;} // Allow empty to clear search
          if (value.length < 2) {
            return "Search term must be at least 2 characters";
          }
          return null;
        },
      });

      if (result !== undefined) {
        // Update search filter
        searchFilter = result.trim() || null;
        
        // Refresh the tree to apply the filter
        emitter.fire(null);
        
        if (searchFilter) {
          // Count and show results
          let resultCount = 0;
          for (const cache of searchCache.values()) {
            resultCount += cache.datasets.filter(d => fuzzyMatch(searchFilter!, d.label)).length;
            resultCount += cache.tables.filter(t => {
              const tableMatches = fuzzyMatch(searchFilter!, t.label);
              const tableKey = `${t.ref.datasetId}.${t.ref.tableId}`;
              const hasMatchingColumns = tableHasMatchingColumns(tableKey, t.ref.projectId);
              return tableMatches || hasMatchingColumns;
            }).length;
          }
          
          void window.showInformationMessage(
            `Found ${resultCount} matches for "${searchFilter}". Tables with matching columns are expanded.`
          );
        } else {
          void window.showInformationMessage("Search cleared. Showing all resources.");
        }
      }
    },

    dispose() {
      clients.clear();
      emitter.dispose();
      tree.dispose();
      removeListener.dispose();
    },
  };
};

const icons = () => {
  const color = new ThemeColor("foreground");
  const database = new ThemeIcon("database", color);
  const split = new ThemeIcon("split-horizontal", color);
  const array = new ThemeIcon("symbol-array", color);
  const struct = new ThemeIcon("symbol-struct", color);
  const string = new ThemeIcon("symbol-string", color);
  const number = new ThemeIcon("symbol-number", color);
  const boolean = new ThemeIcon("symbol-boolean", color);
  const calendar = new ThemeIcon("calendar", color);
  const watch = new ThemeIcon("watch", color);
  const clock = new ThemeIcon("clock", color);
  const compass = new ThemeIcon("compass", color);
  const json = new ThemeIcon("json", color);
  const undef = new ThemeIcon("symbol-value", color);
  const types: Map<FieldType, ThemeIcon> = new Map([
    ["RECORD", struct],
    ["STRUCT", struct],
    ["STRING", string],
    ["BYTES", string],
    ["INTEGER", number],
    ["INT64", number],
    ["FLOAT", number],
    ["FLOAT64", number],
    ["NUMERIC", number],
    ["BIGNUMERIC", number],
    ["BOOLEAN", boolean],
    ["BOOL", boolean],
    ["TIMESTAMP", calendar],
    ["DATETIME", calendar],
    ["DATE", calendar],
    ["TIME", watch],
    ["INTERVAL", clock],
    ["GEOGRAPHY", compass],
    ["JSON", json],
  ]);
  return {
    dataset() {
      return database;
    },
    table() {
      return split;
    },
    field({ type, mode }: { type?: FieldType; mode?: FieldMode }): ThemeIcon {
      if (mode === "REPEATED") {
        return array;
      }
      if (!type) {
        return undef;
      }
      return types.get(type) ?? undef;
    },
  };
};
