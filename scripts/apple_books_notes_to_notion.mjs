#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

import {
  BOOK_NOTE_SECTIONS,
  createTrackedReadingBook,
  discoverReadingTarget,
  emptyParagraphBlock,
  findBookByNormalizedTitle,
  loadConfig,
  loadEnv,
  loadNotionToken,
  notionRequest,
  parseCommonArgs,
  pageTitle,
  richTextPlain,
  text,
  toggleHeading3Block,
} from "./notion_book_completer.mjs";

const APPLE_EPOCH_OFFSET = 978307200;
const DEFAULT_HEADING = BOOK_NOTE_SECTIONS.appleBooks;

function parseArgs(argv) {
  const common = parseCommonArgs(argv);
  const args = {
    title: null,
    author: null,
    status: null,
    finishDate: null,
    totalPages: null,
    readPages: null,
    force: false,
    dryRun: false,
    envPath: common.envPath,
  };

  for (let i = 0; i < common.remaining.length; i += 1) {
    const value = common.remaining[i];
    if (value === "--author") args.author = common.remaining[++i];
    else if (value === "--status") args.status = common.remaining[++i];
    else if (value === "--finish-date") args.finishDate = common.remaining[++i];
    else if (value === "--total-pages") args.totalPages = Number(common.remaining[++i]);
    else if (value === "--read-pages") args.readPages = Number(common.remaining[++i]);
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

function stripTrailingDate(value) {
  return String(value || "").replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
}

function normalizeAnnotationText(value) {
  return stripTrailingDate(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function annotationKey(annotation) {
  const selected = normalizeAnnotationText(annotation.selectedText);
  if (selected) return `selected:${selected}`;
  return `note:${normalizeAnnotationText(annotation.note)}`;
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

async function listBlockChildren(token, blockId) {
  const blocks = [];
  let cursor;
  do {
    const path = `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const result = await notionRequest(token, "GET", path);
    blocks.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return blocks;
}

function blockPlainText(block) {
  return richTextPlain(block[block.type]?.rich_text || []);
}

function isAppleBooksHeading(block) {
  if (block.type !== "heading_3" && block.type !== "heading_2") return false;
  return blockPlainText(block).trim() === DEFAULT_HEADING;
}

async function findAppleBooksSection(token, pageId) {
  const topLevel = await listBlockChildren(token, pageId);
  return topLevel.find(isAppleBooksHeading) || null;
}

async function ensureAppleBooksSection(token, pageId) {
  const existing = await findAppleBooksSection(token, pageId);
  if (existing) return { section: existing, created: false };

  await appendBlocks(token, pageId, [toggleHeading3Block(DEFAULT_HEADING)]);
  const created = await findAppleBooksSection(token, pageId);
  if (!created) throw new Error("无法创建 Apple Books 高亮与笔记模块。");
  return { section: created, created: true };
}

function countParagraphBlock(count) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [text(`共导入 ${count} 条 Apple Books 标注。`)] },
  };
}

function annotationBlocks(annotations, { addLeadingSeparator = false } = {}) {
  const blocks = addLeadingSeparator ? [emptyParagraphBlock()] : [];

  annotations.forEach((annotation, index) => {
    const quoteText = [];
    const selectedText = truncateForNotion(annotation.selectedText);
    const note = truncateForNotion(annotation.note, 900);
    const createdDate = notionDate(annotation.created);

    if (selectedText) quoteText.push(textRich(selectedText));
    if (createdDate && selectedText) quoteText.push(textRich(createdDate, { annotations: { color: "gray" }, max: 100 }));

    blocks.push({
      object: "block",
      type: "quote",
      quote: {
        rich_text: quoteText.length ? quoteText : [textRich("(空标注)", { max: 100 })],
        color: "default",
      },
    });

    if (note) {
      const noteText = [textRich("我的笔记：", { annotations: { bold: true }, max: 100 }), textRich(note, { max: 900 })];
      if (createdDate) noteText.push(textRich(createdDate, { annotations: { color: "gray" }, max: 100 }));
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: noteText },
      });
    } else if (createdDate && !selectedText) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [textRich(createdDate, { annotations: { color: "gray" }, max: 100 })] },
      });
    }

    if (index < annotations.length - 1) blocks.push(emptyParagraphBlock());
  });

  return blocks;
}

function rebuiltAppleBooksBlocks(annotations) {
  return [
    countParagraphBlock(annotations.length),
    ...annotationBlocks(annotations),
  ];
}

function isEmptyParagraph(block) {
  return block.type === "paragraph" && blockPlainText(block).trim() === "";
}

function existingAnnotationKeys(blocks) {
  const keys = new Set();
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type !== "quote") continue;

    const selectedText = stripTrailingDate(blockPlainText(block));
    let note = "";
    const next = blocks[i + 1];
    if (next?.type === "paragraph") {
      const nextText = stripTrailingDate(blockPlainText(next));
      if (nextText.startsWith("我的笔记：")) note = nextText.slice("我的笔记：".length).trim();
    }

    const selectedKey = normalizeAnnotationText(selectedText);
    if (selectedKey) keys.add(`selected:${selectedKey}`);
    else if (note) keys.add(`note:${normalizeAnnotationText(note)}`);
  }
  return keys;
}

function findCountParagraph(blocks) {
  return blocks.find((block) => block.type === "paragraph" && /^共导入 \d+ 条 Apple Books 标注。$/.test(blockPlainText(block).trim()));
}

function hasOnlyPlaceholder(blocks) {
  return blocks.length > 0 && blocks.every((block) => {
    if (isEmptyParagraph(block)) return true;
    return block.type === "paragraph" && blockPlainText(block).trim() === "尚未导入 Apple Books 标注。";
  });
}

async function patchCountParagraph(token, block, count) {
  if (!block) return false;
  await notionRequest(token, "PATCH", `/blocks/${block.id}`, {
    paragraph: { rich_text: [text(`共导入 ${count} 条 Apple Books 标注。`)] },
  });
  return true;
}

async function archiveBlocks(token, blocks) {
  for (const block of blocks) {
    await notionRequest(token, "PATCH", `/blocks/${block.id}`, { archived: true });
  }
}

async function syncAppleBooksModule(token, pageId, annotations, args) {
  const { section, created } = args.dryRun ? { section: await findAppleBooksSection(token, pageId), created: false } : await ensureAppleBooksSection(token, pageId);
  if (!section && args.dryRun) {
    return {
      appleBooksSectionCreated: true,
      existingAnnotations: 0,
      newAnnotations: annotations.length,
      appended: false,
      refreshed: false,
      skippedDuplicateImport: false,
    };
  }

  const currentChildren = section ? await listBlockChildren(token, section.id) : [];
  if (args.force) {
    if (!args.dryRun) {
      await archiveBlocks(token, currentChildren);
      await appendBlocks(token, section.id, rebuiltAppleBooksBlocks(annotations));
    }
    return {
      appleBooksSectionCreated: created,
      existingAnnotations: 0,
      newAnnotations: annotations.length,
      appended: !args.dryRun,
      refreshed: !args.dryRun,
      skippedDuplicateImport: false,
    };
  }

  const existingKeys = existingAnnotationKeys(currentChildren);
  const newAnnotations = annotations.filter((annotation) => !existingKeys.has(annotationKey(annotation)));
  const totalCount = existingKeys.size + newAnnotations.length;

  if (!args.dryRun) {
    const countBlock = findCountParagraph(currentChildren);
    if (currentChildren.length === 0) {
      await appendBlocks(token, section.id, rebuiltAppleBooksBlocks(newAnnotations));
    } else if (hasOnlyPlaceholder(currentChildren)) {
      await archiveBlocks(token, currentChildren);
      await appendBlocks(token, section.id, rebuiltAppleBooksBlocks(newAnnotations));
    } else {
      await patchCountParagraph(token, countBlock, totalCount);
      if (newAnnotations.length > 0) {
        const lastMeaningfulBlock = [...currentChildren].reverse().find((block) => block.type !== "unsupported");
        const addLeadingSeparator = Boolean(lastMeaningfulBlock && !isEmptyParagraph(lastMeaningfulBlock));
        await appendBlocks(token, section.id, annotationBlocks(newAnnotations, { addLeadingSeparator }));
      }
    }
  }

  return {
    appleBooksSectionCreated: created,
    existingAnnotations: existingKeys.size,
    newAnnotations: newAnnotations.length,
    appended: !args.dryRun && newAnnotations.length > 0,
    refreshed: false,
    skippedDuplicateImport: newAnnotations.length === 0,
  };
}

async function appendBlocks(token, pageId, blocks) {
  if (blocks.length === 0) return;
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
  const token = loadNotionToken(args.envPath || undefined);
  if (!token) throw new Error("Missing NOTION_TOKEN.");

  const target = await discoverReadingTarget(token, loadConfig(), loadEnv(args.envPath || undefined));
  if (!target || target.issues.length > 0) {
    throw new Error("没有找到可用的 Notion 阅读数据库。请先运行 node scripts/onboard.mjs。");
  }

  const annotations = getAppleBooksAnnotations(args.title);
  const { action, page } = await ensureBookPage(token, target, args, annotations);
  const syncResult = await syncAppleBooksModule(token, page.id, annotations, args);
  const changedProperties = args.dryRun ? [] : await patchRequestedProperties(token, page.id, target, args);

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
        quoteBlocksPrepared: syncResult.newAnnotations,
        ...syncResult,
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
