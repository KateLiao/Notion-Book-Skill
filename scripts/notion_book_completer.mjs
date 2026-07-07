import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NOTION_VERSION = "2026-03-11";
export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
export const CONFIG_PATH = path.join(SKILL_DIR, "notion-book-completer.config.json");

export const CANONICAL_PROPERTIES = {
  title: "Name",
  status: "Status",
  author: "Author",
  tags: "Tags",
  summary: "Summary",
  doubanLink: "豆瓣Link",
  cover: "书籍封面",
  totalPages: "总页数",
  readPages: "已读页数",
  progress: "阅读进度",
  score: "Score /5",
  finishedDate: "完成阅读的日期",
};

export const STATUS_OPTIONS = [
  { name: "Ready to Start", color: "yellow" },
  { name: "Reading", color: "red" },
  { name: "Finished", color: "blue" },
  { name: "pause", color: "brown" },
  { name: "To read list", color: "purple" },
  { name: "想读", color: "green" },
];

export const SCORE_OPTIONS = [
  { name: "⭐️⭐️⭐️⭐️⭐️", color: "default" },
  { name: "⭐️⭐️⭐️⭐️", color: "default" },
  { name: "⭐️⭐️⭐️", color: "default" },
  { name: "⭐️⭐️", color: "default" },
  { name: "⭐️", color: "default" },
];

export const STARTER_TAGS = [
  { name: "小说", color: "purple" },
  { name: "人文社科", color: "blue" },
  { name: "商业", color: "orange" },
  { name: "传记", color: "gray" },
  { name: "历史", color: "blue" },
  { name: "科学", color: "green" },
  { name: "技术", color: "green" },
  { name: "心理学", color: "purple" },
  { name: "文学", color: "red" },
  { name: "个人成长", color: "blue" },
];

export const PROPERTY_ALIASES = {
  title: ["Name", "名称", "书名", "标题"],
  status: ["Status", "状态"],
  author: ["Author", "作者"],
  tags: ["Tags", "标签", "分类"],
  summary: ["Summary", "简介", "摘要"],
  doubanLink: ["豆瓣Link", "豆瓣链接", "Douban", "Douban Link"],
  cover: ["书籍封面", "封面", "Cover"],
  totalPages: ["总页数", "页数", "Total Pages"],
  readPages: ["已读页数", "阅读页数", "Read Pages"],
  progress: ["阅读进度", "Progress"],
  score: ["Score /5", "评分", "Score"],
  finishedDate: ["完成阅读的日期", "完成日期", "Finished Date"],
};

export const EXPECTED_TYPES = {
  title: "title",
  status: "select",
  author: "rich_text",
  tags: "multi_select",
  summary: "rich_text",
  doubanLink: "url",
  cover: "files",
  totalPages: "number",
  readPages: "number",
  progress: "formula",
  score: "select",
  finishedDate: "date",
};

export function parseCommonArgs(argv = []) {
  const args = { envPath: null, remaining: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--env-path") args.envPath = argv[++i];
    else args.remaining.push(value);
  }
  return args;
}

export function loadEnv(envPath = path.join(SKILL_DIR, ".env")) {
  const values = {};
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || line.trim().startsWith("#")) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return { ...values, ...process.env };
}

export function loadNotionToken(envPath = path.join(SKILL_DIR, ".env")) {
  return loadEnv(envPath).NOTION_TOKEN || null;
}

export function loadConfig(configPath = CONFIG_PATH) {
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

export function saveConfig(config, configPath = CONFIG_PATH) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function mergeSetupConfig(config, patch) {
  return {
    ...config,
    notionVersion: NOTION_VERSION,
    ...patch,
    propertyMap: {
      ...(config.propertyMap || {}),
      ...(patch.propertyMap || {}),
    },
    propertyIds: {
      ...(config.propertyIds || {}),
      ...(patch.propertyIds || {}),
    },
    views: {
      ...(config.views || {}),
      ...(patch.views || {}),
    },
  };
}

export async function notionRequest(token, method, apiPath, body = undefined) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  const response = await fetch(`https://api.notion.com/v1${apiPath}`, options);
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const details = json.message || json.raw || text || response.statusText;
    const error = new Error(`${response.status} ${json.code || "notion_error"}: ${details}`);
    error.status = response.status;
    error.code = json.code;
    error.details = json;
    throw error;
  }
  return json;
}

export function richTextPlain(items = []) {
  return items.map((item) => item.plain_text || "").join("");
}

export function text(content, extra = {}) {
  return { type: "text", text: { content }, ...extra };
}

export function titleText(content) {
  return [{ type: "text", text: { content } }];
}

export function normalizeId(id = "") {
  return String(id).replaceAll("-", "");
}

export function normalizeBookTitle(title = "") {
  return title.replace(/\s+/g, "").toLowerCase();
}

export function pageTitle(page, titlePropertyName = "Name") {
  return richTextPlain(page.properties?.[titlePropertyName]?.title || []);
}

export function isEmptyNotionProperty(property) {
  if (!property) return true;
  if (property.type === "title") return richTextPlain(property.title).trim() === "";
  if (property.type === "rich_text") return richTextPlain(property.rich_text).trim() === "";
  if (property.type === "url") return !property.url;
  if (property.type === "multi_select") return (property.multi_select || []).length === 0;
  if (property.type === "files") return (property.files || []).length === 0;
  if (property.type === "number") return property.number == null;
  if (property.type === "date") return property.date == null;
  if (property.type === "select") return property.select == null;
  return false;
}

export function textProperty(content) {
  return { rich_text: [{ type: "text", text: { content } }] };
}

export function titleProperty(content) {
  return { title: [{ type: "text", text: { content } }] };
}

export function multiSelectProperty(names = []) {
  return { multi_select: names.map((name) => ({ name })) };
}

export function externalCoverFile(name, url) {
  return {
    files: [
      {
        name,
        type: "external",
        external: { url },
      },
    ],
  };
}

export function progressFormula() {
  return [
    "if(or(empty(prop(\"总页数\")), empty(prop(\"已读页数\")), prop(\"总页数\") == 0), \"\", ",
    "if(prop(\"已读页数\") >= prop(\"总页数\"), \"✅\", ",
    "slice(\"✦✦✦✦✦✦✦✦✦✦\", 0, floor(prop(\"已读页数\") / prop(\"总页数\") * 10)) + ",
    "slice(\"✧✧✧✧✧✧✧✧✧✧\", 0, ceil(10 - prop(\"已读页数\") / prop(\"总页数\") * 10)) + ",
    "format(round(prop(\"已读页数\") / prop(\"总页数\") * 100)) + \"%\"))",
  ].join("");
}

export function readingPropertiesSchemaWithoutFormula() {
  const schema = {};
  for (const [name, value] of Object.entries(readingPropertiesSchema())) {
    if (name !== "阅读进度") schema[name] = value;
  }
  return schema;
}

export function readingPropertiesSchema() {
  return {
    Name: { title: {} },
    Status: { select: { options: STATUS_OPTIONS } },
    Author: { rich_text: {} },
    Tags: { multi_select: { options: STARTER_TAGS } },
    Summary: { rich_text: {} },
    豆瓣Link: { url: {} },
    书籍封面: { files: {} },
    总页数: { number: { format: "number" } },
    已读页数: { number: { format: "number" } },
    阅读进度: { formula: { expression: progressFormula() } },
    "Score /5": { select: { options: SCORE_OPTIONS } },
    完成阅读的日期: { date: {} },
  };
}

export function mapProperties(properties = {}) {
  const result = {};
  const ids = {};
  const issues = [];

  for (const [key, aliases] of Object.entries(PROPERTY_ALIASES)) {
    const expectedType = EXPECTED_TYPES[key];
    const match = aliases
      .map((name) => [name, properties[name]])
      .find(([, property]) => property && property.type === expectedType);
    if (match) {
      result[key] = match[0];
      ids[key] = match[1].id;
      continue;
    }

    const wrongType = aliases
      .map((name) => [name, properties[name]])
      .find(([, property]) => property);
    if (wrongType) {
      issues.push(`字段「${wrongType[0]}」类型是 ${wrongType[1].type}，需要是 ${expectedType}。`);
    } else {
      issues.push(`缺少字段「${CANONICAL_PROPERTIES[key]}」（类型：${expectedType}）。`);
    }
  }

  return { propertyMap: result, propertyIds: ids, issues };
}

export function applyProgressFormulaEvidence(mapped, config = {}) {
  if (!config.progressFormulaPatched) return mapped;
  const issues = mapped.issues.filter((issue) => !issue.includes("阅读进度"));
  return {
    ...mapped,
    propertyMap: {
      ...mapped.propertyMap,
      progress: mapped.propertyMap.progress || "阅读进度",
    },
    issues,
  };
}

export async function retrieveDataSource(token, dataSourceId) {
  return notionRequest(token, "GET", `/data_sources/${dataSourceId}`);
}

export async function retrieveDatabase(token, databaseId) {
  return notionRequest(token, "GET", `/databases/${databaseId}`);
}

export async function listViews(token, databaseId) {
  const result = await notionRequest(token, "GET", `/views?database_id=${databaseId}&page_size=100`);
  return result.results || [];
}

export async function searchNotion(token, query, object) {
  return notionRequest(token, "POST", "/search", {
    query,
    filter: object ? { property: "object", value: object } : undefined,
    page_size: 20,
  });
}

export async function discoverReadingTarget(token, config = {}, env = loadEnv()) {
  const dataSourceId = config.dataSourceId || env.NOTION_READING_DATA_SOURCE_ID;
  if (dataSourceId) {
    const dataSource = await retrieveDataSource(token, dataSourceId);
    const mapped = applyProgressFormulaEvidence(mapProperties(dataSource.properties || {}), config);
    return {
      source: "config-data-source",
      dataSource,
      databaseId: config.databaseId || dataSource.parent?.database_id || env.NOTION_READING_DATABASE_ID,
      ...mapped,
    };
  }

  const databaseId = config.databaseId || env.NOTION_READING_DATABASE_ID;
  if (databaseId) {
    const database = await retrieveDatabase(token, databaseId);
    const firstDataSource = database.data_sources?.[0];
    if (firstDataSource?.id) {
      const dataSource = await retrieveDataSource(token, firstDataSource.id);
      const mapped = applyProgressFormulaEvidence(mapProperties(dataSource.properties || {}), config);
      return { source: "config-database", databaseId: database.id, dataSource, ...mapped };
    }
  }

  for (const query of ["书籍总览", "Reading", "阅读"]) {
    const result = await searchNotion(token, query, "data_source");
    for (const item of result.results || []) {
      const dataSource = item.object === "data_source" ? item : await retrieveDataSource(token, item.id);
      const mapped = applyProgressFormulaEvidence(mapProperties(dataSource.properties || {}), config);
      if (mapped.issues.length === 0 || dataSource.name === "书籍总览") {
        return {
          source: "search",
          databaseId: dataSource.parent?.database_id,
          dataSource,
          ...mapped,
        };
      }
    }
  }

  return null;
}

export async function queryDataSource(token, dataSourceId, body) {
  return notionRequest(token, "POST", `/data_sources/${dataSourceId}/query`, body);
}

export async function findBookByExactTitle(token, target, title) {
  const titleProperty = target.propertyMap?.title || "Name";
  const result = await queryDataSource(token, target.dataSourceId || target.dataSource.id, {
    page_size: 10,
    filter: { property: titleProperty, title: { equals: title } },
  });
  return result.results || [];
}

export async function listAllBookPages(token, target) {
  const pages = [];
  let startCursor;
  do {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;
    const result = await queryDataSource(token, target.dataSourceId || target.dataSource.id, body);
    pages.push(...(result.results || []));
    startCursor = result.has_more ? result.next_cursor : undefined;
  } while (startCursor);
  return pages;
}

export async function findBookByNormalizedTitle(token, target, title) {
  const exact = await findBookByExactTitle(token, target, title);
  if (exact.length > 0) return exact;
  const titleProperty = target.propertyMap?.title || "Name";
  const wanted = normalizeBookTitle(title);
  const pages = await listAllBookPages(token, target);
  return pages.filter((page) => normalizeBookTitle(pageTitle(page, titleProperty)) === wanted);
}

export async function verifyImageUrl(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  return {
    ok: response.status === 200 && contentType.startsWith("image/") && bytes.length > 1000,
    status: response.status,
    contentType,
    bytes: bytes.length,
    signature: bytes.slice(0, 8).toString("hex"),
  };
}

export async function patchOnlyEmptyProperties(token, page, desiredProperties) {
  const properties = {};
  for (const [name, value] of Object.entries(desiredProperties)) {
    if (isEmptyNotionProperty(page.properties?.[name])) {
      properties[name] = value;
    }
  }
  if (Object.keys(properties).length === 0) {
    return { changedFields: [], skipped: Object.keys(desiredProperties) };
  }
  await notionRequest(token, "PATCH", `/pages/${page.id}`, { properties });
  return {
    changedFields: Object.keys(properties),
    skipped: Object.keys(desiredProperties).filter((name) => !(name in properties)),
  };
}

export function bookProperties(book, propertyMap = CANONICAL_PROPERTIES) {
  const properties = {
    [propertyMap.title || "Name"]: titleProperty(book.title),
    [propertyMap.status || "Status"]: { select: { name: book.status || "Reading" } },
    [propertyMap.readPages || "已读页数"]: { number: book.readPages ?? 0 },
  };
  if (book.author) properties[propertyMap.author || "Author"] = textProperty(book.author);
  if (book.tags?.length) properties[propertyMap.tags || "Tags"] = multiSelectProperty(book.tags);
  if (book.summary) properties[propertyMap.summary || "Summary"] = textProperty(book.summary);
  if (book.doubanLink) properties[propertyMap.doubanLink || "豆瓣Link"] = { url: book.doubanLink };
  if (book.totalPages != null) properties[propertyMap.totalPages || "总页数"] = { number: book.totalPages };
  if (book.coverUrl) properties[propertyMap.cover || "书籍封面"] = externalCoverFile(`${book.title}-封面.jpg`, book.coverUrl);
  return properties;
}

export async function createTrackedReadingBook(token, target, book) {
  const existing = await findBookByNormalizedTitle(token, target, book.title);
  if (existing.length > 0) return { action: "existing", page: existing[0] };

  const parent = target.dataSourceId || target.dataSource?.id
    ? { data_source_id: target.dataSourceId || target.dataSource.id }
    : { database_id: target.databaseId };
  const page = await notionRequest(token, "POST", "/pages", {
    parent,
    properties: bookProperties(book, target.propertyMap || CANONICAL_PROPERTIES),
  });
  return { action: "created", page };
}

export function resolveScriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

function usage() {
  console.error("Usage:");
  console.error("  node scripts/notion_book_completer.mjs add-books [--status Reading] [--env-path .env] <title1> [title2 ...]");
  console.error("  node scripts/notion_book_completer.mjs complete-metadata [--env-path .env] <title1> [title2 ...]");
}

async function cli(argv) {
  const command = argv[0];
  const parsed = parseCommonArgs(argv.slice(1));
  const args = parsed.remaining;

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command !== "add-books" && command !== "complete-metadata") {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  let status = "Reading";
  const titles = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--status") status = args[++i];
    else if (args[i] === "--titles") {
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) titles.push(args[++i]);
    } else if (!args[i].startsWith("--")) {
      titles.push(args[i]);
    }
  }

  if (titles.length === 0) {
    usage();
    process.exit(1);
  }

  const token = loadNotionToken(parsed.envPath || undefined);
  if (!token) throw new Error("Missing NOTION_TOKEN.");

  const env = loadEnv(parsed.envPath || undefined);
  const target = await discoverReadingTarget(token, loadConfig(), env);
  if (!target || target.issues.length > 0) {
    throw new Error("没有找到可用的 Notion 阅读数据库。请先运行：node scripts/onboard.mjs");
  }

  if (command === "complete-metadata") {
    const results = [];
    for (const title of titles) {
      const pages = await findBookByNormalizedTitle(token, target, title);
      results.push(
        pages.length === 0
          ? { title, error: "未在数据库中找到此书" }
          : {
              title,
              pageId: pages[0].id,
              url: pages[0].url,
              note: "请让 Agent 先检索并验证作者、标签、摘要、豆瓣链接、页数、封面 URL；然后只补空字段。",
            },
      );
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const results = [];
  for (const title of titles) {
    const result = await createTrackedReadingBook(token, target, { title, status, readPages: 0 });
    results.push({
      title,
      action: result.action,
      pageId: result.page.id,
      url: result.page.url,
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
