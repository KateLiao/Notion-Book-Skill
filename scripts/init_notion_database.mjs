#!/usr/bin/env node
import {
  CONFIG_PATH,
  CANONICAL_PROPERTIES,
  loadConfig,
  loadEnv,
  loadNotionToken,
  mapProperties,
  mergeSetupConfig,
  notionRequest,
  readingPropertiesSchema,
  richTextPlain,
  saveConfig,
  text,
  titleText,
} from "./notion_book_completer.mjs";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    parentPageId: null,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--parent-page-id") args.parentPageId = argv[++i];
    else if (value === "--dry-run") args.dryRun = true;
    else if (value === "--force") args.force = true;
    else throw new Error(`未知参数：${value}`);
  }
  return args;
}

function pageBlocks() {
  return [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [text("读书不要贪多,而是要多加思索,这样的读书使我获益不少——卢梭")],
        icon: { type: "emoji", emoji: "📚" },
        color: "default",
      },
    },
    {
      object: "block",
      type: "heading_1",
      heading_1: { rich_text: [text("➡️在读")] },
    },
  ];
}

function columnBlocks() {
  return [
    {
      object: "block",
      type: "column_list",
      column_list: {
        children: [
          {
            object: "block",
            type: "column",
            column: {
              children: [
                {
                  object: "block",
                  type: "heading_1",
                  heading_1: { rich_text: [text("🌟完成阅读")] },
                },
              ],
            },
          },
          {
            object: "block",
            type: "column",
            column: {
              children: [
                {
                  object: "block",
                  type: "heading_1",
                  heading_1: { rich_text: [text("📎To Read List")] },
                },
              ],
            },
          },
        ],
      },
    },
  ];
}

async function appendBlocks(token, blockId, children) {
  return notionRequest(token, "PATCH", `/blocks/${blockId}/children`, { children });
}

async function children(token, blockId) {
  const result = await notionRequest(token, "GET", `/blocks/${blockId}/children?page_size=100`);
  return result.results || [];
}

function viewPropertyConfiguration(ids, visibleKeys) {
  return Object.entries(ids).map(([key, propertyId]) => ({
    property_id: propertyId,
    visible: visibleKeys.includes(key),
  }));
}

async function createView(token, body) {
  return notionRequest(token, "POST", "/views", body);
}

function filterByStatus(statusPropertyId, status) {
  return { property: statusPropertyId, select: { equals: status } };
}

async function createDatabaseAndViews(token, pageId) {
  const database = await notionRequest(token, "POST", "/databases", {
    parent: { type: "page_id", page_id: pageId },
    title: titleText("书籍总览"),
    is_inline: true,
    initial_data_source: {
      title: titleText("书籍总览"),
      properties: readingPropertiesSchema(),
    },
  });

  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error("Notion 没有返回 data_source_id，无法继续创建视图。");
  }

  const dataSource = await notionRequest(token, "GET", `/data_sources/${dataSourceId}`);
  const mapped = mapProperties(dataSource.properties || {});
  if (mapped.issues.length > 0) {
    throw new Error(`新建数据库字段校验失败：${mapped.issues.join(" ")}`);
  }

  const ids = mapped.propertyIds;
  const statusFilter = (status) => filterByStatus(ids.status, status);
  const databaseId = database.id;

  const views = {};
  views.readingTable = await createView(token, {
    database_id: databaseId,
    data_source_id: dataSourceId,
    name: "Reading",
    type: "table",
    filter: statusFilter("Reading"),
    configuration: {
      type: "table",
      properties: viewPropertyConfiguration(ids, ["title", "author", "tags", "cover", "progress"]),
    },
  });
  views.readingGallery = await createView(token, {
    database_id: databaseId,
    data_source_id: dataSourceId,
    name: "Reading Gallery",
    type: "gallery",
    filter: statusFilter("Reading"),
    sorts: [{ property: ids.progress, direction: "ascending" }],
    configuration: {
      type: "gallery",
      properties: viewPropertyConfiguration(ids, ["title", "progress"]),
      cover: { type: "property", property_id: ids.cover },
      cover_aspect: "contain",
    },
  });

  await appendBlocks(token, pageId, columnBlocks());
  const pageChildren = await children(token, pageId);
  const columnList = pageChildren.find((block) => block.type === "column_list");
  const columns = columnList ? await children(token, columnList.id) : [];
  const finishedColumn = columns[0]?.id;
  const toReadColumn = columns[1]?.id;

  views.finishedTable = await createView(token, {
    data_source_id: dataSourceId,
    name: "Finished",
    type: "table",
    create_database: { parent: { type: "block_id", block_id: finishedColumn || pageId } },
    filter: statusFilter("Finished"),
    sorts: [{ property: ids.finishedDate, direction: "descending" }],
    configuration: {
      type: "table",
      properties: viewPropertyConfiguration(ids, ["title", "score", "finishedDate", "summary", "author", "tags", "cover", "doubanLink"]),
    },
  });
  const finishedLinkedDatabaseId = views.finishedTable.parent?.database_id || databaseId;
  views.finishedGallery = await createView(token, {
    data_source_id: dataSourceId,
    name: "Finished Gallery",
    type: "gallery",
    database_id: finishedLinkedDatabaseId,
    filter: statusFilter("Finished"),
    sorts: [{ property: ids.finishedDate, direction: "descending" }],
    configuration: {
      type: "gallery",
      cover: { type: "property", property_id: ids.cover },
      cover_aspect: "contain",
    },
  });
  views.toReadTable = await createView(token, {
    data_source_id: dataSourceId,
    name: "To Read List",
    type: "table",
    create_database: { parent: { type: "block_id", block_id: toReadColumn || pageId } },
    filter: statusFilter("To read list"),
    configuration: {
      type: "table",
      properties: viewPropertyConfiguration(ids, ["title", "tags", "doubanLink", "progress"]),
    },
  });

  return {
    database,
    dataSource,
    propertyMap: mapped.propertyMap,
    propertyIds: mapped.propertyIds,
    views,
  };
}

export async function initializeReadingWorkspace(token, parentPageId) {
  const page = await notionRequest(token, "POST", "/pages", {
    parent: { type: "page_id", page_id: parentPageId },
    icon: { type: "emoji", emoji: "📚" },
    properties: {
      title: { title: titleText("Reading") },
    },
    children: pageBlocks(),
  });

  const created = await createDatabaseAndViews(token, page.id);
  return {
    page,
    ...created,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const token = loadNotionToken();
  const parentPageId = args.parentPageId || env.NOTION_READING_PARENT_PAGE_ID;

  if (args.dryRun) {
    console.log("dry-run：将创建 Reading 页面、书籍总览 data source、Reading/Finished/To Read List 视图，但现在不会写入 Notion。");
    console.log(`父页面 ID：${parentPageId || "(未提供；真实运行时必须提供)"}`);
    console.log(`字段：${Object.values(CANONICAL_PROPERTIES).join(", ")}`);
    return;
  }

  if (!token) {
    console.error("未找到 NOTION_TOKEN。请先在 .env 中填写 Notion integration token。");
    process.exit(1);
  }
  if (!parentPageId) {
    console.error("未找到父页面 ID。请设置 NOTION_READING_PARENT_PAGE_ID，或传入 --parent-page-id。");
    process.exit(1);
  }

  const config = loadConfig();
  if ((config.databaseId || config.dataSourceId) && !args.force) {
    console.error("本地配置已经存在数据库信息。如需重新初始化，请加 --force。");
    process.exit(1);
  }

  const result = await initializeReadingWorkspace(token, parentPageId);
  const viewIds = Object.fromEntries(Object.entries(result.views).map(([name, view]) => [name, view.id]));
  const nextConfig = mergeSetupConfig(config, {
    parentPageId,
    readingPageId: result.page.id,
    readingPageUrl: result.page.url,
    databaseId: result.database.id,
    dataSourceId: result.dataSource.id,
    dataSourceName: result.dataSource.name || richTextPlain(result.dataSource.title || []) || "书籍总览",
    propertyMap: result.propertyMap,
    propertyIds: result.propertyIds,
    views: viewIds,
  });
  saveConfig(nextConfig, CONFIG_PATH);

  console.log("初始化完成。");
  console.log(`Reading 页面：${result.page.url}`);
  console.log(`数据库 ID：${result.database.id}`);
  console.log(`Data source ID：${result.dataSource.id}`);
  console.log(`配置已保存到 ${CONFIG_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`初始化失败：${error.message}`);
    process.exit(1);
  });
}
