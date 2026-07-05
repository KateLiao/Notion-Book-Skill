#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  CONFIG_PATH,
  discoverReadingTarget,
  loadConfig,
  loadEnv,
  loadNotionToken,
  mergeSetupConfig,
  saveConfig,
} from "./notion_book_completer.mjs";
import { initializeReadingWorkspace } from "./init_notion_database.mjs";

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  console.log("Notion Book Completer 初始化向导");
  console.log("我会先检查现有配置；如果没有可用数据库，会帮你创建 Reading 页面和书籍总览数据库。");

  const env = loadEnv();
  const token = loadNotionToken();
  if (!token) {
    console.error("未找到 NOTION_TOKEN。请复制 .env.example 为 .env，并填入你的 Notion integration token。");
    process.exit(1);
  }

  const config = loadConfig();
  const target = await discoverReadingTarget(token, config, env).catch((error) => {
    console.warn(`检查现有数据库时遇到问题：${error.message}`);
    return null;
  });

  if (target && target.issues.length === 0) {
    const nextConfig = mergeSetupConfig(config, {
      databaseId: target.databaseId,
      dataSourceId: target.dataSource.id,
      dataSourceName: target.dataSource.name || "书籍总览",
      propertyMap: target.propertyMap,
      propertyIds: target.propertyIds,
    });
    saveConfig(nextConfig, CONFIG_PATH);
    console.log("已找到可用的 Notion 阅读数据库。");
    console.log(`Data source：${target.dataSource.name || "书籍总览"} (${target.dataSource.id})`);
    console.log(`配置已保存到 ${CONFIG_PATH}`);
    return;
  }

  if (target?.issues?.length) {
    console.log("找到了可能的数据库，但字段还不能直接使用：");
    for (const issue of target.issues) console.log(`- ${issue}`);
    console.log("为了避免误改你的数据库，本向导会创建一套新的标准 Reading 页面。");
  } else {
    console.log("没有找到可直接使用的 Notion 阅读数据库。");
  }

  let parentPageId = env.NOTION_READING_PARENT_PAGE_ID || config.parentPageId;
  if (!parentPageId) {
    parentPageId = await ask("请输入已共享给 integration 的 Notion 父页面 ID：");
  }
  if (!parentPageId) {
    console.error("没有父页面 ID，无法创建 Reading 页面。");
    process.exit(1);
  }

  console.log("开始创建 Reading 页面和数据库...");
  const result = await initializeReadingWorkspace(token, parentPageId);
  const viewIds = Object.fromEntries(Object.entries(result.views).map(([name, view]) => [name, view.id]));
  const nextConfig = mergeSetupConfig(config, {
    parentPageId,
    readingPageId: result.page.id,
    readingPageUrl: result.page.url,
    databaseId: result.database.id,
    dataSourceId: result.dataSource.id,
    dataSourceName: result.dataSource.name || "书籍总览",
    propertyMap: result.propertyMap,
    propertyIds: result.propertyIds,
    views: viewIds,
  });
  saveConfig(nextConfig, CONFIG_PATH);

  console.log("初始化完成。");
  console.log(`Reading 页面：${result.page.url}`);
  console.log(`配置已保存到 ${CONFIG_PATH}`);
}

main().catch((error) => {
  console.error(`初始化失败：${error.message}`);
  console.error("请确认 integration 已连接到父页面，并具备 insert content / update content 权限。");
  process.exit(1);
});

