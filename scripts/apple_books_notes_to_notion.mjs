#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

import {
  createTrackedReadingBook,
  discoverReadingTarget,
  findBookByNormalizedTitle,
  loadConfig,
  loadEnv,
  loadNotionToken,
  notionRequest,
  pageTitle,
  richTextPlain,
} from "./notion_book_completer.mjs";

const APPLE_EPOCH_OFFSET = 978307200;
const DEFAULT_HEADING = "Apple Books 高亮与笔记";

function parseArgs(argv) {
  const args = {
    title: null,
    author: null,
    status: null,
    finishDate: null,
    totalPages: null,
    readPages: null,
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--author") args.author = argv[++i];
    else if (value === "--status") args.status = argv[++i];
    else if (value === "--finish-date") args.finishDate = argv[++i];
    else if (value === "--total-pages") args.totalPages = Number(argv[++i]);
    else if (value === "--read-pages") args.readPages = Number(argv[++i]);
    else if (value === "--force") args.force = true;
    else if (value === "--dry-run") args.dryRun = true;
    else if (!args.title) args.title = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }

  if (!args.title) {
    throw new Error(
      "Usage: apple_books_notes_to_notion.mjs <book title> [--author name] [--status Finished] [--finish-date YYYY-MM-DD] [--total-pages n] [--read-pages n] [--force] [--dry-run]",
    );
  }

  return args;
}

function appleBooksPaths() {
  const home = os.homedir();
  return {
    annotationsDb: `${home}/Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation_v10312011_1727_local.sqlite`,
    libraryDb: `${home}/Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary-1-091020131601.sqlite`,
  };
}

function assertAppleBooksAvailable() {
  if (process.platform !== "darwin") {
    throw new Error("Apple Books 导入仅支持 macOS。");
  }
  try {
    execFileSync("sqlite3", ["--version"], { encoding: "utf8" });
  } catch {
    throw new Error("本机未找到 sqlite3，无法读取 Apple Books 本地数据库。");
  }
  const paths = appleBooksPaths();
  for (const dbPath of [paths.annotationsDb, paths.libraryDb]) {
    if (!fs.existsSync(dbPath)) throw new Error(`Apple Books database not found: ${dbPath}`);
  }
  return paths;
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function notionDate(appleEpochSeconds) {
  if (!appleEpochSeconds) return "";
  return new Date((Number(appleEpochSeconds) + APPLE_EPOCH_OFFSET) * 1000).toISOString().slice(0, 10);
}

function truncateForNotion(text, max = 1900) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

function textRich(content, options = {}) {
  return {
    type: "text",
    text: { content: truncateForNotion(content, options.max ?? 1900) },
    annotations: options.annotations || {},
  };
}

function getAppleBooksAnnotations(title) {
  const { annotationsDb, libraryDb } = assertAppleBooksAvailable();
  const sql = `
ATTACH '${escapeSql(libraryDb)}' AS lib;
SELECT json_group_array(json_object(
  'uuid', ZANNOTATIONUUID,
  'bookTitle', ZTITLE,
  'author', ZAUTHOR,
  'created', ZANNOTATIONCREATIONDATE,
  'modified', ZANNOTATIONMODIFICATIONDATE,
  'selectedText', ZANNOTATIONSELECTEDTEXT,
  'note', ZANNOTATIONNOTE,
  'representativeText', ZANNOTATIONREPRESENTATIVETEXT,
  'style', ZANNOTATIONSTYLE,
  'type', ZANNOTATIONTYPE,
  'location', ZANNOTATIONLOCATION
))
FROM (
  SELECT *
  FROM ZAEANNOTATION
  JOIN lib.ZBKLIBRARYASSET
    ON ZAEANNOTATION.ZANNOTATIONASSETID = lib.ZBKLIBRARYASSET.ZASSETID
  WHERE ifnull(ZANNOTATIONDELETED, 0) = 0
    AND lib.ZBKLIBRARYASSET.ZTITLE = '${escapeSql(title)}'
    AND (
      length(ifnull(ZANNOTATIONSELECTEDTEXT, '')) > 0
      OR length(ifnull(ZANNOTATIONNOTE, '')) > 0
    )
  ORDER BY ZANNOTATIONCREATIONDATE ASC
);
`;

  const raw = execFileSync("sqlite3", [annotationsDb, sql], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
  return JSON.parse(raw || "[]").filter(Boolean);
}

async function ensureBookPage(token, target, args, annotations) {
  const existing = await findBookByNormalizedTitle(token, target, args.title);
  if (existing.length > 0) return { action: "existing", page: existing[0] };

  return createTrackedReadingBook(token, target, {
    title: args.title,
    author: args.author || annotations[0]?.author,
    status: "Reading",
    readPages: 0,
  });
}

async function pageHasImportedSection(token, pageId) {
  let cursor;
  do {
    const path = `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const result = await notionRequest(token, "GET", path);
    for (const block of result.results || []) {
      if (block.type !== "heading_2") continue;
      const heading = richTextPlain(block.heading_2?.rich_text || []);
      if (heading.trim() === DEFAULT_HEADING) return true;
    }
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return false;
}

function annotationBlocks(annotations) {
  const blocks = [
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [textRich(DEFAULT_HEADING, { max: 200 })] },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [textRich(`共导入 ${annotations.length} 条 Apple Books 标注。`, { max: 200 })] },
    },
  ];

  for (const annotation of annotations) {
    const richText = [];
    const selectedText = truncateForNotion(annotation.selectedText);
    const note = truncateForNotion(annotation.note, 900);
    const createdDate = notionDate(annotation.created);

    if (selectedText) richText.push(textRich(selectedText));
    if (note) {
      if (richText.length > 0) richText.push(textRich("\n\n我的笔记：", { annotations: { bold: true }, max: 100 }));
      richText.push(textRich(note, { max: 900 }));
      if (createdDate) richText.push(textRich(createdDate, { annotations: { color: "gray" }, max: 100 }));
    } else if (createdDate) {
      richText.push(textRich(createdDate, { annotations: { color: "gray" }, max: 100 }));
    }

    blocks.push({
      object: "block",
      type: "quote",
      quote: {
        rich_text: richText.length ? richText : [textRich("(空标注)", { max: 100 })],
        color: "default",
      },
    });
  }

  return blocks;
}

async function appendBlocks(token, pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notionRequest(token, "PATCH", `/blocks/${pageId}/children`, {
      children: blocks.slice(i, i + 100),
    });
  }
}

async function patchRequestedProperties(token, pageId, target, args) {
  const names = target.propertyMap || {};
  const properties = {};
  if (args.status) properties[names.status || "Status"] = { select: { name: args.status === "已读完" ? "Finished" : args.status } };
  if (args.finishDate) properties[names.finishedDate || "完成阅读的日期"] = { date: { start: args.finishDate } };
  if (Number.isFinite(args.totalPages)) properties[names.totalPages || "总页数"] = { number: args.totalPages };
  if (Number.isFinite(args.readPages)) properties[names.readPages || "已读页数"] = { number: args.readPages };
  else if (args.status && Number.isFinite(args.totalPages)) properties[names.readPages || "已读页数"] = { number: args.totalPages };

  if (Object.keys(properties).length > 0) {
    await notionRequest(token, "PATCH", `/pages/${pageId}`, { properties });
  }
  return Object.keys(properties);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = loadNotionToken();
  if (!token) throw new Error("Missing NOTION_TOKEN.");

  const target = await discoverReadingTarget(token, loadConfig(), loadEnv());
  if (!target || target.issues.length > 0) {
    throw new Error("没有找到可用的 Notion 阅读数据库。请先运行 node scripts/onboard.mjs。");
  }

  const annotations = getAppleBooksAnnotations(args.title);
  const { action, page } = await ensureBookPage(token, target, args, annotations);
  const alreadyImported = await pageHasImportedSection(token, page.id);
  const blocks = annotationBlocks(annotations);
  const changedProperties = args.dryRun ? [] : await patchRequestedProperties(token, page.id, target, args);

  let appended = false;
  if (!args.dryRun && (!alreadyImported || args.force)) {
    await appendBlocks(token, page.id, blocks);
    appended = true;
  }

  const refreshed = await notionRequest(token, "GET", `/pages/${page.id}`);
  console.log(
    JSON.stringify(
      {
        dataSource: target.dataSource.name || "书籍总览",
        action,
        title: pageTitle(refreshed, target.propertyMap?.title || "Name"),
        pageId: refreshed.id,
        url: refreshed.url,
        annotationsFound: annotations.length,
        quoteBlocksPrepared: annotations.length,
        appended,
        skippedDuplicateImport: alreadyImported && !args.force,
        changedProperties,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

