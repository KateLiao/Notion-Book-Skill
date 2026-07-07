# Notion API Quirks

Use this reference when setup, views, covers, or schema validation behaves unexpectedly.

## API Version

Use `Notion-Version: 2026-03-11`.

In this API version, searchable reading storage is a `data_source`. Older database IDs are still accepted as compatibility inputs, but new code should prefer `dataSourceId`.

## Search Object Filter

`/v1/search` accepts `page` and `data_source`. Do not use the old `database` object filter with `2026-03-11`.

## Formula Field Creation

Creating a database with a formula property in `initial_data_source` can fail. The initialization script creates non-formula fields first, then patches `阅读进度` after the data source/database exists.

If setup reports a missing `阅读进度` field, rerun setup or add the formula manually through Notion. Do not delete or recreate a user's existing database just to repair this one property.

## View Creation

Create views with `/v1/views`.

- For a view on an existing database: pass `database_id` and `data_source_id`.
- For a new linked database view: pass `data_source_id` and `create_database`.
- Use property IDs from the target data source. Never copy property IDs from another workspace.
- If view creation fails, keep the database and page setup, report the failed view in Chinese, and let the user retry.

## Covers

Notion has two visible cover mechanisms:

- page-level `cover`
- `书籍封面` files property

When the user asks to repair a cover, update both only if the user wants the page cover too. The default public skill behavior remains conservative: do not overwrite user-entered covers.

Douban image CDN URLs may fail outside a browser. Verify all external cover URLs with a normal fetch before writing them.

