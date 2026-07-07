#!/usr/bin/env node
import {
  CONFIG_PATH,
  discoverReadingTarget,
  loadConfig,
  loadEnv,
  loadNotionToken,
  listViews,
  parseCommonArgs,
  saveConfig,
  mergeSetupConfig,
} from "./notion_book_completer.mjs";

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const env = loadEnv(args.envPath || undefined);
  const token = loadNotionToken(args.envPath || undefined);
  if (!token) {
    console.error("未找到 NOTION_TOKEN。请复制 .env.example 为 .env，并填入你的 Notion integration token。");
    process.exit(1);
  }

  const config = loadConfig();
  const target = await discoverReadingTarget(token, config, env);
  if (!target) {
    console.error("没有找到可直接使用的 Notion 阅读数据库。请运行：node scripts/onboard.mjs");
    process.exit(2);
  }

  const dataSourceId = target.dataSource.id;
  console.log(`已找到 data source：${target.dataSource.name || "书籍总览"} (${dataSourceId})`);
  console.log(`来源：${target.source}`);

  if (target.issues.length > 0) {
    console.error("数据库字段还不能直接使用：");
    for (const issue of target.issues) console.error(`- ${issue}`);
    process.exit(3);
  }

  const views = target.databaseId ? await listViews(token, target.databaseId).catch(() => []) : [];
  const nextConfig = mergeSetupConfig(config, {
    databaseId: target.databaseId,
    dataSourceId,
    propertyMap: target.propertyMap,
    propertyIds: target.propertyIds,
    discoveredViewIds: views.map((view) => view.id),
  });
  saveConfig(nextConfig, CONFIG_PATH);

  console.log("配置检查通过。");
  console.log(`已更新 ${CONFIG_PATH}。`);
}

main().catch((error) => {
  console.error(`检查失败：${error.message}`);
  process.exit(1);
});
