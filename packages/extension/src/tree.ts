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
  
  // Enhanced cache for better performance
  const searchCache = new Map<string, {
    datasets: DatasetElement[];
    tables: TableElement[];
    fields: Map<string, FieldReference[]>; // tableKey -> fields
    lastUpdate: number;
    isFullyLoaded: boolean; // Track if all data is loaded
  }>();

  // Performance optimization: Cache for frequently accessed data
  const metadataCache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
  }>();

  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes for metadata cache
  const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for search cache

  // Helper function to get cached data
  const getCachedData = (key: string) => {
    const cached = metadataCache.get(key);
    if (cached && Date.now() < cached.timestamp + cached.ttl) {
      return cached.data;
    }
    return null;
  };

  // Helper function to set cached data
  const setCachedData = (key: string, data: any, ttl = CACHE_TTL) => {
    metadataCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  };

  const removeListener = configManager.onChange(() => {
    clients.clear();
    searchCache.clear();
    metadataCache.clear();
    searchFilter = null;
    emitter.fire(null);
  });

  // Optimized fuzzy matching function
  const fuzzyMatch = (searchTerm: string, text: string): boolean => {
    const search = searchTerm.toLowerCase().trim();
    const target = text.toLowerCase();
    
    if (!search) {return true;}
    
    // Exact match - highest priority
    if (target === search) {return true;}
    
    // Starts with - second priority
    if (target.startsWith(search)) {return true;}
    
    // Contains - third priority
    if (target.includes(search)) {return true;}
    
    // Token-based matching for better performance
    const searchTokens = search.split(/[\s_\-.]/);
    const targetTokens = target.split(/[\s_\-.]/);
    
    return searchTokens.every(searchToken => 
      targetTokens.some(targetToken => 
        targetToken.includes(searchToken)
      )
    );
  };

  // Check if table has matching columns - optimized
  const tableHasMatchingColumns = (tableKey: string, projectId: string): boolean => {
    if (!searchFilter) {return false;}
    
    const cache = searchCache.get(projectId);
    const fields = cache?.fields.get(tableKey);
    
    if (!fields) {return false;}
    
    // Use a more efficient search for large field lists
    const searchLower = searchFilter.toLowerCase();
    return fields.some(field => field.name.toLowerCase().includes(searchLower));
  };

  // Parallel resource caching with batching
  const cacheProjectResources = async (projectId: string) => {
    const client = clients.get(projectId);
    if (!client) {return;}

    const cacheKey = `project_${projectId}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
      searchCache.set(projectId, {
        ...cached,
        lastUpdate: Date.now(),
      });
      return;
    }

    try {
      // Parallel API calls for better performance
      const [datasets, { dataset: datasetIcon, table: tableIcon }] = await Promise.all([
        client.getDatasets(),
        Promise.resolve(icons()),
      ]);

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

      // Batch table fetching in parallel chunks for better performance
      const BATCH_SIZE = 5; // Process 5 datasets in parallel
      const tableElements: TableElement[] = [];
      const fieldsMap = new Map<string, FieldReference[]>();

      for (let i = 0; i < datasets.length; i += BATCH_SIZE) {
        const batch = datasets.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (datasetRef) => {
          try {
            const tables = await client.getTables(datasetRef);
            
            // Parallel field fetching for each table in this dataset
            const tablePromises = tables.map(async (tableRef) => {
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

              // Cache fields for this table in parallel
              try {
                const fields = await client.getFields(tableRef);
                const tableKey = `${tableRef.datasetId}.${tableRef.tableId}`;
                fieldsMap.set(tableKey, fields);
              } catch (error) {
                console.warn(`Failed to cache fields for table ${tableRef.tableId}:`, error);
              }

              return tableElement;
            });

            const datasetTables = await Promise.all(tablePromises);
            tableElements.push(...datasetTables);
          } catch (error) {
            console.warn(`Failed to cache tables for dataset ${datasetRef.datasetId}:`, error);
          }
        });

        await Promise.all(batchPromises);
      }

      const cacheData = {
        datasets: datasetElements,
        tables: tableElements,
        fields: fieldsMap,
        lastUpdate: Date.now(),
        isFullyLoaded: true,
      };

      searchCache.set(projectId, cacheData);
      setCachedData(cacheKey, cacheData, SEARCH_CACHE_TTL);

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

        // Optimized search results with better performance
        if (searchFilter && !element) {
          const results: Element[] = [];
          const searchLower = searchFilter.toLowerCase();
          const MAX_RESULTS = 100; // Increased limit for better UX
          
          // Pre-compute search terms for better performance
          const searchTokens = searchLower.split(/[\s_\-.]/);
          
          for (const [projectId, cache] of searchCache.entries()) {
            if (!cache.isFullyLoaded) {
              continue; // Skip incomplete caches
            }
            
            // Optimized dataset matching
            for (const dataset of cache.datasets) {
              if (results.length >= MAX_RESULTS) {break;}
              if (fuzzyMatch(searchFilter, dataset.label)) {
                results.push(dataset);
              }
            }
            
            // Optimized table matching with parallel column checking
            for (const table of cache.tables) {
              if (results.length >= MAX_RESULTS) {break;}
              
              const tableMatches = fuzzyMatch(searchFilter, table.label);
              const tableKey = `${table.ref.datasetId}.${table.ref.tableId}`;
              const hasMatchingColumns = tableHasMatchingColumns(tableKey, projectId);
              
              if (tableMatches || hasMatchingColumns) {
                // Create optimized result table
                const resultTable = hasMatchingColumns ? {
                  ...table,
                  collapsibleState: TreeItemCollapsibleState.Expanded,
                  description: `${table.description || ''} (has matching fields)`.trim(),
                } : table;
                
                results.push(resultTable);
              }
            }
          }
          
          // Optimized sorting with relevance scoring
          results.sort((a, b) => {
            const aLabel = a.label.toLowerCase();
            const bLabel = b.label.toLowerCase();
            
            // Exact matches first
            const aExact = aLabel === searchLower;
            const bExact = bLabel === searchLower;
            if (aExact && !bExact) {return -1;}
            if (!aExact && bExact) {return 1;}
            
            // Starts with matches second
            const aStarts = aLabel.startsWith(searchLower);
            const bStarts = bLabel.startsWith(searchLower);
            if (aStarts && !bStarts) {return -1;}
            if (!aStarts && bStarts) {return 1;}
            
            // Default alphabetical
            return aLabel.localeCompare(bLabel);
          });
          
          return results.slice(0, MAX_RESULTS);
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
      metadataCache.clear();
      searchFilter = null;
      
      // Optimized rebuild cache for search functionality
      if (clients.size > 0) {
        // Use Promise.allSettled for better error handling
        const cachePromises = Array.from(clients.keys()).map(async (projectId) => {
          try {
            await cacheProjectResources(projectId);
          } catch (error) {
            console.warn(`Failed to cache resources for ${projectId}:`, error);
          }
        });
        
        await Promise.allSettled(cachePromises);
      }
      
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
      const { projectId, datasetId, tableId } = element.ref;
      const tableFullName = `${projectId}.${datasetId}.${tableId}`;
      await env.clipboard.writeText(tableFullName);
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
      await env.clipboard.writeText(element.ref.name);
    },

    async searchResources() {
      // Debounced search input to prevent excessive API calls
      let searchTimeout: NodeJS.Timeout | undefined;
      
      const result = await window.showInputBox({
        prompt: "Search BigQuery resources (datasets, tables, columns)",
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
        // Clear any existing timeout
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        
        // Update search filter
        searchFilter = result.trim() || null;
        
        // Debounced tree refresh
        searchTimeout = setTimeout(() => {
          emitter.fire(null);
          
          if (searchFilter) {
            // Background cache warming for better performance
            const warmCaches = async () => {
              for (const projectId of clients.keys()) {
                const cache = searchCache.get(projectId);
                if (!cache || !cache.isFullyLoaded || 
                    Date.now() - cache.lastUpdate > SEARCH_CACHE_TTL) {
                  try {
                    await cacheProjectResources(projectId);
                  } catch (error) {
                    console.warn(`Failed to warm cache for ${projectId}:`, error);
                  }
                }
              }
            };
            
            // Count and show results with async cache warming
            let resultCount = 0;
            for (const cache of searchCache.values()) {
              if (!cache.isFullyLoaded) {continue;}
              
              resultCount += cache.datasets.filter(d => fuzzyMatch(searchFilter!, d.label)).length;
              resultCount += cache.tables.filter(t => {
                const tableMatches = fuzzyMatch(searchFilter!, t.label);
                const tableKey = `${t.ref.datasetId}.${t.ref.tableId}`;
                const hasMatchingColumns = tableHasMatchingColumns(tableKey, t.ref.projectId);
                return tableMatches || hasMatchingColumns;
              }).length;
            }
            
            void window.showInformationMessage(
              `Found ${resultCount} matches for "${searchFilter}". ${resultCount > 0 ? 'Tables with matching columns are expanded.' : ''}`
            );
            
            // Warm caches in background
            warmCaches().catch(error => 
              console.warn('Background cache warming failed:', error)
            );
          } else {
            void window.showInformationMessage("Search cleared. Showing all resources.");
          }
        }, 150); // 150ms debounce
      }
    },

    // Cleanup
    dispose() {
      removeListener.dispose();
      clients.clear();
      searchCache.clear();
      metadataCache.clear();
      emitter.dispose();
      tree.dispose();
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
