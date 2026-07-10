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

export const BOOK_NOTE_SECTIONS = {
  appleBooks: "Apple Books 高亮与笔记",
  drafts: "批注与草稿",
  notes: "读书笔记",
};

export const READING_NOTE_PROMPTS = [
  "一、这本书整体在谈什么？",
  "二、作者具体是怎样展开他的观点的？",
  "三、作者说得对吗？",
  "这和我有什么关系？",
];

export function emptyParagraphBlock() {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [] },
  };
}

export function toggleHeading3Block(title, children = []) {
  return {
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [text(title)],
      is_toggleable: true,
      ...(children.length > 0 ? { children } : {}),
    },
  };
}

export function bookNoteTemplateBlocks() {
  return [
    toggleHeading3Block(BOOK_NOTE_SECTIONS.appleBooks, [
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [text("尚未导入 Apple Books 标注。")] },
      },
    ]),
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    toggleHeading3Block(BOOK_NOTE_SECTIONS.drafts, [emptyParagraphBlock()]),
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    toggleHeading3Block(
      BOOK_NOTE_SECTIONS.notes,
      READING_NOTE_PROMPTS.flatMap((prompt) => [
        {
          object: "block",
          type: "heading_4",
          heading_4: { rich_text: [text(prompt)] },
        },
        emptyParagraphBlock(),
      ]),
    ),
  ];
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

export const DISABLED_COVER_DISCOVERY_SOURCES = new Set(["open-library", "google-books"]);

export function detectImageSignature(bytes) {
  const hex = bytes.slice(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "png";
  if (hex.startsWith("474946383761") || hex.startsWith("474946383961")) return "gif";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export async function verifyImageUrl(url, { maxAttempts = 2, timeoutMs = 15_000 } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url", url };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "unsupported-protocol", url };
  }

  let lastResult = { ok: false, reason: "fetch-failed", url };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(parsed, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const imageType = detectImageSignature(bytes);
      const ok = response.status === 200
        && contentType.startsWith("image/")
        && bytes.length >= 2_048
        && Boolean(imageType);
      lastResult = {
        ok,
        reason: ok ? undefined : "not-a-valid-image",
        status: response.status,
        contentType,
        bytes: bytes.length,
        imageType,
        signature: bytes.slice(0, 12).toString("hex"),
        url: response.url || url,
        attempt,
      };
      if (ok || (response.status < 500 && response.status !== 429)) return lastResult;
    } catch (error) {
      lastResult = {
        ok: false,
        reason: error.name === "TimeoutError" ? "timeout" : "fetch-failed",
        url,
        attempt,
      };
    }
  }
  return lastResult;
}

export async function selectVerifiedCover(candidates = []) {
  const attempts = [];
  const seen = new Set();
  const ordered = [...candidates]
    .filter((candidate) => candidate?.url)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  for (const candidate of ordered) {
    const source = String(candidate.source || "unknown").trim().toLowerCase().replace(/[\s_]+/g, "-");
    let provider = source;
    try {
      const hostname = new URL(candidate.url).hostname.toLowerCase();
      if (hostname === "covers.openlibrary.org") provider = "open-library";
      if (hostname === "books.google.com" || hostname === "www.googleapis.com") provider = "google-books";
    } catch {
      // URL validity is reported by verifyImageUrl below.
    }
    if (DISABLED_COVER_DISCOVERY_SOURCES.has(source) || DISABLED_COVER_DISCOVERY_SOURCES.has(provider)) {
      attempts.push({ source, provider, url: candidate.url, ok: false, reason: "disabled-source" });
      continue;
    }
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    const check = await verifyImageUrl(candidate.url);
    attempts.push({ source, ...check });
    if (check.ok) {
      return { url: check.url || candidate.url, source, verified: true, attempts };
    }
  }

  return { url: null, source: null, verified: false, attempts };
}

export function decodeHtmlEntities(value = "") {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripHtml(value = "") {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function doubanHeaders() {
  return {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    accept: "text/html,application/xhtml+xml,application/json",
  };
}

function exactTitleSuggestions(suggestions, title) {
  const wanted = normalizeBookTitle(title);
  return suggestions.filter((item) => normalizeBookTitle(item.title || "") === wanted);
}

export async function fetchDoubanSuggestions(title) {
  const url = new URL("https://book.douban.com/j/subject_suggest");
  url.searchParams.set("q", title);
  const response = await fetch(url, { headers: doubanHeaders() });
  if (!response.ok) throw new Error(`豆瓣 suggest 查询失败：HTTP ${response.status}`);
  const suggestions = await response.json();
  const exact = exactTitleSuggestions(suggestions, title);
  const candidates = exact.length > 0 ? exact : suggestions;
  return candidates
    .filter((item) => item.type === "b" && item.id)
    .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
}

function extractMetaContent(html, property) {
  const pattern = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i");
  return decodeHtmlEntities(html.match(pattern)?.[1] || "");
}

function extractInfoValue(html, label) {
  const info = html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  const pattern = new RegExp(`<span class=["']pl["']>\\s*${label}\\s*:?\\s*<\\/span>\\s*([\\s\\S]*?)(?:<br\\s*\\/?>|<\\/span>)`, "i");
  return stripHtml(info.match(pattern)?.[1] || "").replace(/^[\s:：]+/, "");
}

function extractDoubanTags(html) {
  const criteria = html.match(/criteria\s*=\s*'([^']*)'/)?.[1] || "";
  return [...criteria.matchAll(/7:([^|']+)/g)]
    .map((match) => decodeHtmlEntities(match[1]).trim())
    .filter(Boolean)
    .filter((tag) => !/^\d{4}$/.test(tag))
    .slice(0, 4);
}

function extractIntro(html) {
  const headingIndex = html.search(/内容简介/);
  if (headingIndex < 0) return "";
  const nextHeadingIndex = html.indexOf("<h2", headingIndex + 4);
  const section = html.slice(headingIndex, nextHeadingIndex > headingIndex ? nextHeadingIndex : undefined);
  const intro = section.match(/<div class="intro">([\s\S]*?)<\/div>/)?.[1] || "";
  return stripHtml(intro).slice(0, 280);
}

export async function fetchDoubanBookMetadata(title) {
  const [candidate] = await fetchDoubanSuggestions(title);
  if (!candidate) return { found: false, title };

  const url = `https://book.douban.com/subject/${candidate.id}/`;
  const response = await fetch(url, { headers: doubanHeaders() });
  if (!response.ok) throw new Error(`豆瓣详情页查询失败：HTTP ${response.status}`);
  const html = await response.text();

  const author = extractInfoValue(html, "作者") || candidate.author_name || "";
  const totalPagesText = extractInfoValue(html, "页数");
  const totalPages = Number.parseInt(totalPagesText.replace(/[^\d]/g, ""), 10);
  const coverUrl = extractMetaContent(html, "og:image") || candidate.pic || "";
  const tags = extractDoubanTags(html);
  const summary = extractIntro(html);

  const metadata = {
    found: true,
    title: candidate.title || title,
    author,
    doubanLink: url,
    totalPages: Number.isFinite(totalPages) ? totalPages : undefined,
    tags,
    summary,
    coverUrl,
    coverVerified: false,
  };

  if (coverUrl) {
    const cover = await selectVerifiedCover([{ url: coverUrl, source: "douban", priority: 20 }]);
    metadata.coverUrl = cover.url;
    metadata.coverVerified = cover.verified;
    metadata.coverSource = cover.source;
    metadata.coverAttempts = cover.attempts;
  }

  return metadata;
}

export async function resolveBookMetadata(title, options = {}) {
  const lookupTitle = options.lookupTitle || title;
  let metadata = { found: false, title };
  try {
    metadata = await fetchDoubanBookMetadata(lookupTitle);
  } catch (error) {
    metadata = { found: false, title, error: error.message };
  }

  const tags = options.tags?.length ? options.tags : metadata.tags;
  const totalPages = options.totalPages != null ? options.totalPages : metadata.totalPages;
  const coverCandidates = [];
  if (options.coverUrl) {
    coverCandidates.push({
      url: options.coverUrl,
      source: options.coverSource || "official",
      priority: 100,
    });
  }
  if (metadata.coverUrl) {
    coverCandidates.push({ url: metadata.coverUrl, source: metadata.coverSource || "douban", priority: 20 });
  }
  const cover = await selectVerifiedCover(coverCandidates);

  return {
    ...metadata,
    found: Boolean(metadata.found || options.author || options.summary || tags?.length || totalPages != null || cover.verified),
    title,
    author: options.author || metadata.author,
    tags,
    summary: options.summary || metadata.summary,
    doubanLink: options.doubanLink || metadata.doubanLink,
    totalPages,
    coverUrl: cover.url,
    coverVerified: cover.verified,
    coverSource: cover.source,
    coverAttempts: cover.attempts,
  };
}

export function metadataProperties(metadata, propertyMap = CANONICAL_PROPERTIES) {
  const properties = {};
  if (metadata.author) properties[propertyMap.author || "Author"] = textProperty(metadata.author);
  if (metadata.tags?.length) properties[propertyMap.tags || "Tags"] = multiSelectProperty(metadata.tags);
  if (metadata.summary) properties[propertyMap.summary || "Summary"] = textProperty(metadata.summary);
  if (metadata.doubanLink) properties[propertyMap.doubanLink || "豆瓣Link"] = { url: metadata.doubanLink };
  if (metadata.totalPages != null) properties[propertyMap.totalPages || "总页数"] = { number: metadata.totalPages };
  if (metadata.coverUrl && metadata.coverVerified) {
    properties[propertyMap.cover || "书籍封面"] = externalCoverFile(`${metadata.title || "book"}-封面.jpg`, metadata.coverUrl);
  }
  return properties;
}

export async function patchOnlyEmptyProperties(token, page, desiredProperties, { replaceCover = false } = {}) {
  const properties = {};
  for (const [name, value] of Object.entries(desiredProperties)) {
    const existing = page.properties?.[name];
    if (isEmptyNotionProperty(existing) || (replaceCover && existing?.type === "files" && value?.files)) {
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
    children: book.includeTemplate === false ? undefined : bookNoteTemplateBlocks(),
  });
  return { action: "created", page };
}

export function resolveScriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

function usage() {
  console.error("Usage:");
  console.error("  node scripts/notion_book_completer.mjs add-books [options] <title1> [title2 ...]");
  console.error("  node scripts/notion_book_completer.mjs complete-metadata [options] <title1> [title2 ...]");
  console.error("  Options: --status, --lookup-title, --author, --tags, --summary, --total-pages, --douban-link, --cover-url, --cover-source, --replace-cover, --env-path");
  console.error("  Add-books researches verified metadata by default and only writes empty fields on existing records.");
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
  const metadataOptions = {};
  const titles = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--status") status = args[++i];
    else if (args[i] === "--lookup-title") metadataOptions.lookupTitle = args[++i];
    else if (args[i] === "--author") metadataOptions.author = args[++i];
    else if (args[i] === "--tags") metadataOptions.tags = args[++i].split(/[,，|]/).map((tag) => tag.trim()).filter(Boolean);
    else if (args[i] === "--summary") metadataOptions.summary = args[++i];
    else if (args[i] === "--total-pages") metadataOptions.totalPages = Number.parseInt(args[++i], 10);
    else if (args[i] === "--douban-link") metadataOptions.doubanLink = args[++i];
    else if (args[i] === "--cover-url") metadataOptions.coverUrl = args[++i];
    else if (args[i] === "--cover-source") metadataOptions.coverSource = args[++i];
    else if (args[i] === "--replace-cover") metadataOptions.replaceCover = true;
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
  if (titles.length > 1 && Object.keys(metadataOptions).length > 0) {
    throw new Error("元数据覆盖参数一次只能用于一本书，避免把同一作者或封面误写到多本书。");
  }
  if (metadataOptions.totalPages != null && (!Number.isFinite(metadataOptions.totalPages) || metadataOptions.totalPages <= 0)) {
    throw new Error("--total-pages 必须是正整数。");
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
      if (pages.length === 0) {
        results.push({ title, error: "未在数据库中找到此书" });
        continue;
      }
      const metadata = await resolveBookMetadata(title, metadataOptions);
      if (!metadata.found) {
        results.push({ title, pageId: pages[0].id, url: pages[0].url, error: "未找到可验证的书籍元数据" });
        continue;
      }
      const patch = await patchOnlyEmptyProperties(
        token,
        pages[0],
        metadataProperties(metadata, target.propertyMap || CANONICAL_PROPERTIES),
        { replaceCover: metadataOptions.replaceCover },
      );
      results.push({
        title,
        pageId: pages[0].id,
        url: pages[0].url,
        changedFields: patch.changedFields,
        skippedFields: patch.skipped,
        coverWritten: Boolean(metadata.coverUrl && metadata.coverVerified),
        coverSource: metadata.coverSource,
        coverAttempts: metadata.coverAttempts,
      });
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const results = [];
  for (const title of titles) {
    const metadata = await resolveBookMetadata(title, metadataOptions);
    const metadataPatch = metadata.found ? metadataProperties(metadata, target.propertyMap || CANONICAL_PROPERTIES) : {};
    const result = await createTrackedReadingBook(token, target, {
      title,
      status,
      readPages: 0,
      ...(metadata.found
        ? {
            author: metadata.author,
            tags: metadata.tags,
            summary: metadata.summary,
            doubanLink: metadata.doubanLink,
            totalPages: metadata.totalPages,
            coverUrl: metadata.coverVerified ? metadata.coverUrl : undefined,
          }
        : {}),
    });
    let changedFields = [];
    let skippedFields = [];
    if (result.action === "existing" && Object.keys(metadataPatch).length > 0) {
      const patch = await patchOnlyEmptyProperties(token, result.page, metadataPatch, { replaceCover: metadataOptions.replaceCover });
      changedFields = patch.changedFields;
      skippedFields = patch.skipped;
    }
    results.push({
      title,
      action: result.action,
      pageId: result.page.id,
      url: result.page.url,
      metadataFound: Boolean(metadata.found),
      metadataError: metadata.error,
      changedFields,
      skippedFields,
      coverWritten: Boolean(metadata.found && metadata.coverUrl && metadata.coverVerified),
      coverSource: metadata.coverSource,
      coverAttempts: metadata.coverAttempts,
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
