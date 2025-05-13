<!-- DO NOT EDIT
This file is generated from gen-src/README.md.ejs. -->
# BigQuery Explorer

Fork of [minodisk/bigquery-runner](https://github.com/minodisk/bigquery-runner) with these changes:
- Added Scheduled Queries feature to view and track the history of scheduled queries
- Renamed from BigQuery Runner to BigQuery Explorer (To publish to the marketplace)

I started this project because my daily workflow involves scheduled queries a lot and most BigQuery extensions did not cover the
features I needed. There is a lot of LLM-written code in this repository. I hope that does not turn around and bite me. Let me know if you
find any bugs or have any suggestions.

![Screen Recording 2025-05-14 at 00 49 13](https://github.com/user-attachments/assets/5cda7467-10e3-4aab-a7fc-72233cfc4917)

Future Ideas:
- Fix the issue with date handling in the scheduled query history.
- Improve the scheduled query history UI.
- Having the dry run feature constantly running and showing the results in the bottom left.

For all other features, see the original [minodisk/bigquery-runner](https://github.com/minodisk/bigquery-runner) repository.

![Preview](https://user-images.githubusercontent.com/514164/180352233-ed635538-f064-4389-814a-c3ec306aa832.gif)

## Authentication

This extension requires authentication to the Google Cloud API. You can get started by authenticating in one of the following two ways.

### Gcloud Credential ([Recommended](https://cloud.google.com/iam/docs/best-practices-service-accounts#development))

<!-- 1. [Install the gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Run `BigQuery Explorer: Login` in the VSCode command palette.
1. Set `bigqueryExplorer.projectId` in `setting.json`.

or -->

1. [Install the gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Run [`gcloud auth application-default login`](https://cloud.google.com/sdk/gcloud/reference/auth/application-default) in your terminal.
1. Set `bigqueryExplorer.projectId` in `setting.json`.

- Don't set `bigqueryExplorer.keyFilename` in `setting.json`.
- Don't set `GOOGLE_APPLICATION_CREDENTIALS` as an environment variable.

### Service Account Key

1. [Create a service account and its key](https://cloud.google.com/docs/authentication/getting-started).
    - Give the service account the necessary roles. Such as [`roles/bigquery.user`](https://cloud.google.com/bigquery/docs/access-control#bigquery.user) for example.
1. Tell the key path to this extension in one of the following two ways:
    - Set the path to the key `bigqueryExplorer.keyFilename` in `settings.json`.
    - [Set the path to the key as the environment variable `GOOGLE_APPLICATION_CREDENTIALS`](https://cloud.google.com/docs/authentication/getting-started#setting_the_environment_variable).

## Usage

1. Open a query file with `.bqsql` extension.
1. Open the command palette.
1. Run `BigQuery Explorer: Run`.

### Query parameters

If query has one or more named parameters, the extension will ask you for the values of that parameter. The values must be given in JSON format, e.g. quotation marks should be used for simple values such as `"20231224"`. See below for more complex examples.

Once set, the parameters are saved for future use and should be reset if necessary using the [bigqueryExplorer.clearParams](#bigquery-explorer-clear-parameters) command.

![Parameters usage](https://user-images.githubusercontent.com/514164/178248203-a24126dc-4ade-4e6f-93ae-200702edfa51.gif)

## Commands

### BigQuery Explorer: Login

|ID|
|---|
|bigqueryExplorer.login|

Login with `gcloud auth application-default login`.

### BigQuery Explorer: Logout

|ID|
|---|
|bigqueryExplorer.logout|

Logout with `gcloud auth application-default revoke`.

### BigQuery Explorer: Run

|ID|
|---|
|bigqueryExplorer.run|

Run the query in BigQuery and display the results. If text is selected, it will run the selected text as a query. If no text is selected, the entire file will be executed as a query.

### BigQuery Explorer: Dry Run

|ID|
|---|
|bigqueryExplorer.dryRun|

Dry-run the query in BigQuery and display the result. If there is an error in the query, the wrong token of the query will be marked.

### BigQuery Explorer: Previous Page

|ID|
|---|
|bigqueryExplorer.prevPage|

Fetch and display the results of the previous page.

### BigQuery Explorer: Next Page

|ID|
|---|
|bigqueryExplorer.nextPage|

Fetch and display the results of the next page.

### BigQuery Explorer: Focus on Left Tab

|ID|
|---|
|bigqueryExplorer.focusOnLeftTab|

Focus on the left tab in the viewer.

### BigQuery Explorer: Focus on Right Tab

|ID|
|---|
|bigqueryExplorer.focusOnRightTab|

Focus on the right tab in the viewer.

### BigQuery Explorer: Focus on Rows Tab

|ID|
|---|
|bigqueryExplorer.focusOnRowsTab|

Focus on the rows tab in the viewer.

### BigQuery Explorer: Focus on Table Tab

|ID|
|---|
|bigqueryExplorer.focusOnTableTab|

Focus on the table tab in the viewer.

### BigQuery Explorer: Focus on Schema Tab

|ID|
|---|
|bigqueryExplorer.focusOnSchemaTab|

Focus on the schema tab in the viewer.

### BigQuery Explorer: Focus on Routine Tab

|ID|
|---|
|bigqueryExplorer.focusOnRoutineTab|

Focus on the routine tab in the viewer.

### BigQuery Explorer: Focus on Job Tab

|ID|
|---|
|bigqueryExplorer.focusOnJobTab|

Focus on the job tab in the viewer.

### BigQuery Explorer: Download as JSON Lines

|ID|
|---|
|bigqueryExplorer.downloadAsJSONL|

Run the query in BigQuery and save the results to a file in JSON Lines format

### BigQuery Explorer: Download as JSON

|ID|
|---|
|bigqueryExplorer.downloadAsJSON|

Run the query in BigQuery and save the results to a file in JSON format

### BigQuery Explorer: Download as CSV

|ID|
|---|
|bigqueryExplorer.downloadAsCSV|

Run the query in BigQuery and save the results to a file in CSV format

### BigQuery Explorer: Download as Markdown

|ID|
|---|
|bigqueryExplorer.downloadAsMarkdown|

Run the query in BigQuery and save the results to a file in Markdown format

### BigQuery Explorer: Download as Plain Text

|ID|
|---|
|bigqueryExplorer.downloadAsText|

Run the query in BigQuery and save the results to a file in plain text

### BigQuery Explorer: Refresh Resources

|ID|
|---|
|bigqueryExplorer.refreshResources|

Refresh the BigQuery Explorer's Resources

### BigQuery Explorer: Copy Table ID

|ID|
|---|
|bigqueryExplorer.copyTableId|

Copy the selected table ID to the clipboard

### BigQuery Explorer: Preview Table in VS Code

|ID|
|---|
|bigqueryExplorer.previewTableInVSCode|

Preview the selected table in VS Code

### BigQuery Explorer: Preview Table on Remote

|ID|
|---|
|bigqueryExplorer.previewTableOnRemote|

Preview the selected table in Google Cloud Console

### BigQuery Explorer: Copy Field Name

|ID|
|---|
|bigqueryExplorer.copyFieldName|

Copy the selected field name to the clipboard

### BigQuery Explorer: Clear Parameters

|ID|
|---|
|bigqueryExplorer.clearParams|

Clear the stored parameters for active text editor.

### BigQuery Explorer: Clear All Parameters

|ID|
|---|
|bigqueryExplorer.clearAllParams|

Clear all stored parameters.

### BigQuery Explorer: Refresh Scheduled Queries

|ID|
|---|
|bigqueryExplorer.refreshScheduledQueries|

Refresh the BigQuery Explorer's Scheduled Queries view

### BigQuery Explorer: Open Scheduled Query SQL

|ID|
|---|
|bigqueryExplorer.openScheduledSQL|

Open the SQL of a scheduled query in a new editor

### BigQuery Explorer: View Run History

|ID|
|---|
|bigqueryExplorer.viewScheduledQueryHistory|

View the run history of a scheduled query with performance details

## Configuration

The extension can be customized by modifying your `settings.json` file. The available configuration options, and their defaults, are below.

### `bigqueryExplorer.keyFilename`

|Type|Default|
|---|---|
|string &#x7C; null|null|

The path to the JSON file for the service account. If a relative path is specified, it is taken as a path relative to the root folder opened in VSCode. If not specified, the path specified by `GOOGLE_APPLICATION_CREDENTIALS` will be used.

### `bigqueryExplorer.projectId`

|Type|Default|
|---|---|
|string &#x7C; null|null|

Project ID for Google Cloud Platform. If not specified, the value of `project_id` in the JSON file of the service account will be used.

### `bigqueryExplorer.location`

|Type|Default|
|---|---|
|string &#x7C; null|null|

The geographic location of all datasets and jobs referenced and created through this extension. See details at https://cloud.google.com/bigquery/docs/locations#specifying_your_location.

### `bigqueryExplorer.useLegacySql`

|Type|Default|
|---|---|
|boolean|false|

Flag whether to use legacy SQL. If `false`, use standard SQL.

### `bigqueryExplorer.maximumBytesBilled`

|Type|Default|
|---|---|
|string &#x7C; null|null|

Limits the bytes billed for this query. Queries with bytes billed above this limit will fail (without incurring a charge). Can be set in units, for example `200GB`. If unspecified, the project default is used.

### `bigqueryExplorer.extensions`

|Type|Default|
|---|---|
|array|[".bqsql",".bqddl",".bqdml"]|

List of file extensions for which the query is to be validated when the file is modified.

### `bigqueryExplorer.languageIds`

|Type|Default|
|---|---|
|array|["bigquery","sql-bigquery"]|

List of [language identifiers](https://code.visualstudio.com/docs/languages/identifiers) of the files whose queries are to be validated when the files are modified.

### `bigqueryExplorer.icon`

|Type|Default|
|---|---|
|boolean|true|

Display GUI button to run on the editor title menu bar.

### `bigqueryExplorer.defaultDataset.datasetId`

|Type|Default|
|---|---|
|string &#x7C; null|null|

Specifies the default datasetId to assume for any unqualified table names in the query. If not set, all table names in the query string must be qualified in the format 'datasetId.tableId'.

### `bigqueryExplorer.defaultDataset.projectId`

|Type|Default|
|---|---|
|string &#x7C; null|null|

Specifies the default projectId to assume for any unqualified table names in the query. If `defaultDataset.datasetId` is not set, setting this value has no effect.

### `bigqueryExplorer.downloader.csv.delimiter`

|Type|Default|
|---|---|
|string|","|

The delimiter for CSV. For example, if set to `\t`, the output will be formatted as TSV.

### `bigqueryExplorer.downloader.csv.header`

|Type|Default|
|---|---|
|boolean|false|

The flag whether to add column names to CSV.

### `bigqueryExplorer.downloader.rowsPerPage`

|Type|Default|
|---|---|
|number &#x7C; null|10000|

Maximum number of rows to retrieve per page for downloading. If a number is specified, attempts to fetch that number of rows; if null is specified, attempts to fetch all results. If the amount of data per row is large, the specified number of rows will not always be fetched.

### `bigqueryExplorer.tree.projectIds`

|Type|Default|
|---|---|
|array|[]|

Array of projects for the datasets to be displayed in the tree view. If empty, only datasets in a project that have been authenticated will be displayed in the tree view.

### `bigqueryExplorer.viewer.column`

|Type|Default|
|---|---|
|string &#x7C; number|"+1"|

A string such as '+N', '-N' can be set to specify a position relative to the column where the query file is opened. Then, if you set a number greater than 1, the viewer will appear in the specified number of columns from the left. A number of -1 means the viewer will appear in the same column as the query file, and a number of -2 means the viewer will appear in the column farthest to the right.

### `bigqueryExplorer.previewer.rowsPerPage`

|Type|Default|
|---|---|
|number &#x7C; null|100|

Maximum number of rows to retrieve per page for preview. If a number is specified, attempts to fetch that number of rows; if null is specified, attempts to fetch all results. If the amount of data per row is large, the specified number of rows will not always be fetched.

### `bigqueryExplorer.statusBarItem.align`

|Type|Default|Enum|
|---|---|---|
|string &#x7C; null|null|"left" &#x7C; "right" &#x7C; null|

The alignment of the status bar item.

### `bigqueryExplorer.statusBarItem.priority`

|Type|Default|
|---|---|
|number &#x7C; null|null|

The priority of status bar item. Higher value means the item should be shown more to the left.

### `bigqueryExplorer.validation.enabled`

|Type|Default|
|---|---|
|boolean|true|

Validate the query whenever the file set in `languageIds` or `extensions` is modified.

### `bigqueryExplorer.validation.debounceInterval`

|Type|Default|
|---|---|
|number|600|

Debounce interval in milliseconds to validate the query when the file is modified.

### `bigqueryExplorer.viewer.rowsPerPage`

|Type|Default|
|---|---|
|number &#x7C; null|100|

Maximum number of rows to retrieve per page for display in the viewer. If a number is specified, attempts to fetch that number of rows; if null is specified, attempts to fetch all results. If the amount of data per row is large, the specified number of rows will not always be fetched. You can use the `bigqueryExplorer.prevPage` or `bigqueryExplorer.nextPage` command to perform paging.


## Additional Settings

### Keyboard shortcuts

`keybindings.json`:

```json:keybindings.json
[
  {
    "key": "cmd+enter",
    "command": "bigqueryExplorer.run",
    "when": "resourceLangId in bigqueryExplorer.languageIds || resourceExtname in bigqueryExplorer.extensions"
  },
  {
    "key": "space h",
    "command": "bigqueryExplorer.prevPage",
    "when": "resourceLangId in bigqueryExplorer.languageIds || resourceExtname in bigqueryExplorer.extensions && vim.mode == 'Normal' || vim.mode == 'Visual' || vim.mode == 'VisualBlock' || vim.mode == 'VisualLine'"
  },
  {
    "key": "space l",
    "command": "bigqueryExplorer.nextPage",
    "when": "resourceLangId in bigqueryExplorer.languageIds || resourceExtname in bigqueryExplorer.extensions && vim.mode == 'Normal' || vim.mode == 'Visual' || vim.mode == 'VisualBlock' || vim.mode == 'VisualLine'"
  }
]
```

### Syntax highlighting `.bqsql` files as SQL

`settings.json`:

```json:settings.json
{
  "files.associations": {
    "*.bqsql": "sql"
  }
}
```

## License

Apache 2.0. This extension is forked from [google/vscode-bigquery](https://github.com/google/vscode-bigquery) via [minodisk/bigquery-runner](https://github.com/minodisk/bigquery-runner).
