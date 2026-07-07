---
name: notion-book
name_codex: notion-book-completer
description: "Set up, validate, and maintain a Notion reading database. Use when adding books, filling empty metadata/cover, or importing Apple Books highlights — never overwrites existing content. Supports Codex and Hermes on macOS and Windows."
version: 2.0.0
license: MIT
metadata:
  hermes:
    tags: [Notion, Reading, Books, Database, Apple-Books]
    related_skills: [notion]
  codex:
    invoke_syntax: "$notion-book-completer"
    agent_config: "agents/openai.yaml"
  platforms: [hermes, codex]
  os: [macOS, Windows, Linux]
prerequisites:
  env_vars: [NOTION_TOKEN]
---

# Notion Book Completer

## Core Rule

**Only fill fields that are empty or explicitly broken.** Never overwrite existing ratings, status, progress, dates, notes, tags, summaries, page cover, or other user-entered content unless the user explicitly asks.

**Never print Notion tokens or Apple Books private contents.** Preview only small snippets of private local reading data unless the user asks for export or import.

## Supported Platforms

| Platform | Invocation | Skill Root |
|---|---|---|
| Hermes | `$notion-book` | `~/.hermes/skills/productivity/notion-book/` |
| Codex | `$notion-book-completer` | `~/.codex/skills/notion-book-completer/` |
| macOS / Linux CLI | `node scripts/...` | Same as above |
| Windows CLI | `node scripts/...` | Same as above |

Both platforms use the same scripts, SKILL.md, and `notion-book-completer.config.json`. The skill is designed to be drop-in compatible across all four contexts.

## Setup — First Time

> **SKILL_DIR note:** The skill root is automatically resolved relative to the running script. Both `~/.codex/skills/notion-book-completer/` and `~/.hermes/skills/productivity/notion-book/` work without any path configuration. Scripts detect the correct location regardless of platform.

**macOS / Linux:**
```bash
cd ~/.hermes/skills/productivity/notion-book   # Hermes
# or
cd ~/.codex/skills/notion-book-completer        # Codex

# First run — interactive setup wizard
node scripts/onboard.mjs
```

**Windows (PowerShell / CMD):**
```powershell
# Hermes
cd $env:USERPROFILE\.hermes\skills\productivity\notion-book

# Codex
cd $env:USERPROFILE\.codex\skills\notion-book-completer

node scripts\onboard.mjs
```

The onboarding wizard will:
1. Load `NOTION_TOKEN` and `NOTION_READING_PARENT_PAGE_ID` from `SKILL_DIR/.env`
2. Search for an existing `书籍总览` / `Reading` database
3. If none found, ask for `NOTION_READING_PARENT_PAGE_ID`, then create the full `Reading` page, `书籍总览` data source, and views
4. Save discovered IDs to `SKILL_DIR/notion-book-completer.config.json`

> **Node.js SSL/certificate errors:** If you see `DEPTH_ZERO_SELF_SIGNED_CERT` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, prepend cert flags:
> ```bash
> NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem NODE_USE_SYSTEM_CA=1 node scripts/onboard.mjs
> ```
> On Windows with Node 20+, set the environment variable first: `set NODE_EXTRA_CA_CERTS=C:\path\to\cert.pem`

Read-only check (no writes):
```bash
node scripts/check_setup.mjs
```

## Adding New Books

Triggered by: "add to reading list", "track these books", "开始在读", "添加到书籍总览", "把《书名》加到待读列表".

**macOS / Linux:**
```bash
cd SKILL_DIR  # see table above for your platform
node scripts/notion_book_completer.mjs add-books --titles "书名1" "书名2" --status "To read list"
```

**Windows:**
```powershell
cd SKILL_DIR
node scripts\notion_book_completer.mjs add-books --titles "书名1" "书名2" --status "To read list"
```

- Default status: `Reading`. Options: `Ready to Start`, `Reading`, `Finished`, `pause`, `To read list`, `想读`.
- Initializes `已读页数` to `0`.
- Queries existing books first — exact title match or normalized match (whitespace removed, lowercase). If exists, updates only empty fields.
- Metadata (author, tags, summary, cover) is NOT auto-filled by this command; use the fill-metadata command below.

## Filling Empty Metadata

Triggered by: "补全元数据", "fill metadata", "补全书籍信息", "complete book fields", "fix cover".

### Python — Recommended (cross-platform, avoids Node.js loadEnv quirks)

```python
import urllib.request, json, os

# Detect platform and find skill directory
skill_dir = os.path.dirname(os.path.abspath(__file__))  # if running from skill dir
# Or on Windows, you can pass the skill root explicitly:
# skill_dir = r"C:\Users\<you>\.hermes\skills\productivity\notion-book"

token = open(os.path.join(skill_dir, ".env")).read().split("NOTION_TOKEN=")[1].split()[0]
config = json.load(open(os.path.join(skill_dir, "notion-book-completer.config.json")))
```

Full field update example:
```python
import urllib.request, json

token = open("SKILL_DIR/.env").read().split("NOTION_TOKEN=")[1].split()[0]
config = json.load(open("SKILL_DIR/notion-book-completer.config.json"))
page_id = "PAGE_ID_HERE"  # from add-books output

cover_url = None  # set if you have a verified URL

update_data = {
    "properties": {
        "Author":  {"rich_text": [{"type": "text", "text": {"content": "作者名"}}]},
        "Tags":    {"multi_select": [{"name": "历史"}, {"name": "人文社科"}]},
        "Summary": {"rich_text": [{"type": "text", "text": {"content": "简短摘要"}}]},
        "豆瓣Link": {"url": "https://book.douban.com/subject/XXXXXX/"},
        "总页数":   {"number": 400},
    }
}
if cover_url:
    update_data["cover"] = {"external": {"url": cover_url}}
    update_data["properties"]["书籍封面"] = {
        "files": [{"type": "external", "name": "书名", "external": {"url": cover_url}}]
    }

body = json.dumps(update_data).encode()
req = urllib.request.Request(
    f"https://api.notion.com/v1/pages/{page_id}",
    data=body, method="PATCH",
    headers={"Authorization": f"Bearer {token}", "Notion-Version": "2026-03-11"}
)
with urllib.request.urlopen(req) as resp:
    print("Updated:", json.loads(resp.read()).get("id"))
```

### Cover Image Workflow

> **Douban is blocked server-side (HTTP 418) on all platforms.** No User-Agent, referer, or header trick bypasses this. Use the priority order below on both macOS and Windows.

**Priority order:**
1. **Open Library** — verified correct covers, HTTP 200. Search by Chinese title + author.
2. **Douban via browser** — extract `src` from `document.querySelector('img[alt*="关键词"]')?.src` using `browser_console`. Requires active Douban session.
3. **arkread** — HTTP 200 but risk of wrong book. Always verify visually before using.

**Open Library cover extraction:**
1. `browser_navigate` → `https://openlibrary.org/search?q={中文标题}+{作者}`
2. Click the correct book title link
3. `browser_console` → `document.querySelector('img[alt*="关键词"]')?.src`
   - The `alt` attribute contains the book title in pinyin
   - Example for 《反脆弱》: `document.querySelector('img[alt*="Fan cui ruo"]')?.src`
   - Returns: `https://covers.openlibrary.org/b/id/8558576-M.jpg`
4. Verify: `curl -sI "<url>"` → must return HTTP 200

**⚠️ HTTP 200 ≠ correct book.** Always verify via browser visual confirmation or `alt` attribute extraction.

**Setting cover — must update TWO places simultaneously:**
```python
update_data = {
    "cover": {"external": {"url": cover_url}},                    # gallery + page header
    "properties": {
        "书籍封面": {"files": [{"type": "external", "name": book_title, "external": {"url": cover_url}}]}
    }
}
PATCH /v1/pages/{page_id}
```

### Node.js Script (alternative)
```bash
cd SKILL_DIR
node scripts/notion_book_completer.mjs complete-metadata "书名"
```

## Initializing Notion Database Structure

Creates the full `Reading` page and `书籍总览` data source from scratch. Requires `NOTION_TOKEN` and `NOTION_READING_PARENT_PAGE_ID` in `SKILL_DIR/.env`:

**macOS / Linux:**
```bash
cd SKILL_DIR
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem NODE_USE_SYSTEM_CA=1 node scripts/init_notion_database.mjs --parent-page-id PARENT_ID
```

**Windows:**
```powershell
set NODE_EXTRA_CA_CERTS=C:\path\to\cert.pem
set NODE_USE_SYSTEM_CA=1
node scripts\init_notion_database.mjs --parent-page-id PARENT_ID
```

Creates:
- `Reading` page with Rousseau quote callout, headings for 在读/已完成/待读
- `书籍总览` data source with canonical schema
- Five views: Reading (table), Reading Gallery, Finished (table), Finished Gallery, To Read List (table)

**Not idempotent.** Each run wipes the old page and rebuilds. Check `notion-book-completer.config.json` first; if `readingPageId` already exists, skip unless you want to recreate.

## Importing Apple Books Highlights

Triggered by: "import Apple Books highlights", "导入Apple Books高亮", "同步图书笔记", "Apple Books读书笔记".

**Prerequisites:** macOS only, `sqlite3` installed, Apple Books local databases present.

```bash
cd SKILL_DIR
node scripts/apple_books_notes_to_notion.mjs "书名"
```

- Confirms sqlite3 and database paths exist first
- Finds or creates the Notion book page
- Skips duplicate imports (checks for `Apple Books 高亮与笔记` heading)
- Appends as Notion blocks: heading → count paragraph → each annotation as quote block

> **Apple Books import is macOS-only.** The script exits cleanly on Windows/Linux with a clear error message.

## Configuration File

After setup, config lives at `SKILL_DIR/notion-book-completer.config.json`:

```json
{
  "notionVersion": "2026-03-11",
  "parentPageId": "...",
  "readingPageId": "...",
  "databaseId": "...",
  "dataSourceId": "...",
  "dataSourceName": "书籍总览",
  "propertyMap": { "title": "Name", "status": "Status", ... },
  "propertyIds": { "title": "title", "status": "sgWr", ... },
  "views": { "readingTable": "...", ... }
}
```

Fallback env vars (used if config missing):
```bash
NOTION_TOKEN=ntn_xxx
NOTION_READING_PARENT_PAGE_ID=xxx       # for creating new database
NOTION_READING_DATABASE_ID=xxx          # existing database (legacy)
NOTION_READING_DATA_SOURCE_ID=xxx       # existing data source
```

## Database Schema (Canonical)

| Property | Type | Notes |
|---|---|---|
| Name | title | Book title |
| Status | select | Ready to Start / Reading / Finished / pause / To read list / 想读 |
| Author | rich_text | |
| Tags | multi_select | 小说, 人文社科, 商业, 传记, 历史, 科学, 技术, 心理学, 文学, 个人成长 |
| Summary | rich_text | |
| 豆瓣Link | url | Douban subject link |
| 书籍封面 | files | External cover image |
| 总页数 | number | |
| 已读页数 | number | Initialize to 0 for new books |
| 阅读进度 | formula | ✦✧ progress bar + percentage |
| Score /5 | select | ⭐️ through ⭐️⭐️⭐️⭐️⭐️ |
| 完成阅读的日期 | date | |

## Notion API Version

Uses `2026-03-11`. Databases = "data sources" in this API version.

For detailed API quirks, see `references/notion-api-quirks.md`.
For platform compatibility details (path formats, shell syntax, cert setup), see `references/windows-compat.md`.

## Common Pitfalls

1. **`object_not_found`**: Notion page/database not shared with the integration. Open the page in Notion → `···` → Connections → select your integration.
2. **Linked view cannot be written**: You connected a linked view, not the source database. Share the source `书籍总览` database with the integration.
3. **Cover image returns HTTP 200 but doesn't display**: Douban CDN returns 418 (bot block). Use Open Library covers or browser extraction. See Cover Image Workflow above.
4. **SSL/certificate errors**: Add `NODE_EXTRA_CA_CERTS` and `NODE_USE_SYSTEM_CA=1` to every node command on hermes cron jobs and some macOS environments.
5. **Apple Books import fails**: Only works on macOS. Requires `sqlite3` CLI. Database paths: `~/Library/Containers/com.apple.iBooksX/Data/Documents/...`.
6. **formula field causes `validation_error` on database creation**: The Notion API does not support `formula` in `initial_data_source`. The `init_notion_database.mjs` script creates the database without it, then patches it in after. A successful run will print "初始化完成".
7. **`add-books` fails with "请先运行 onboard.mjs"**: This happens when the `阅读进度` formula field is missing from the database. Fix: run `node scripts/check_setup.mjs` or apply the formula fix in `references/notion-api-quirks.md`.
8. **Path issues on Windows**: Node.js `path.join` handles both platforms automatically. For Python, use `os.path.join()` or forward-slash strings. See `references/windows-compat.md` for details.
9. **Chinese books have no Open Library record AND Douban is blocked**: For books like 《万古江河》, both primary cover sources fail — Open Library has zero results for Chinese titles, and Douban img CDN returns 418 to all server-side requests. **Always use known-domain-knowledge fallback** for these: set cover to null, fill author/tags/summary/douban link from your own knowledge, and tell the user to add the cover manually from their Douban session. Do not spend time retrying Douban.
10. **Cover must be set in TWO places**: Notion has two independent cover mechanisms — the page-level `cover` field and the `书籍封面` property. Setting only one results in no visible cover in some views. Always update both simultaneously. See the Python example in Filling Empty Metadata above.

## Environment Setup

Before using this skill, you need a Notion Integration:

1. Go to https://www.notion.so/profile/integrations
2. Create an **Internal Integration**, give it a name (e.g. "Book Tracker")
3. Copy the token (starts with `ntn_`)
4. Create a `.env` file inside `SKILL_DIR` with:
   ```
   NOTION_TOKEN=ntn_your_token_here
   ```
5. In Notion, open the **parent page** where you want the Reading page created
6. Click `···` → **Connections** → select your integration
7. Copy the parent page ID (last 32-character segment of the URL after the `/`)
8. Add to `SKILL_DIR/.env`:
   ```
   NOTION_READING_PARENT_PAGE_ID=your_parent_page_id_here
   ```

**File locations by platform:**

| Platform | Skill root | `.env` path |
|---|---|---|
| Hermes (macOS/Linux) | `~/.hermes/skills/productivity/notion-book/` | `~/.hermes/skills/productivity/notion-book/.env` |
| Codex (macOS/Linux) | `~/.codex/skills/notion-book-completer/` | `~/.codex/skills/notion-book-completer/.env` |
| Hermes (Windows) | `%USERPROFILE%\.hermes\skills\productivity\notion-book\` | `%USERPROFILE%\.hermes\skills\productivity\notion-book\.env` |
| Codex (Windows) | `%USERPROFILE%\.codex\skills\notion-book-completer\` | `%USERPROFILE%\.codex\skills\notion-book-completer\.env` |

## Scripts Reference

| Script | Purpose | macOS/Linux | Windows |
|---|---|---|---|
| `onboard.mjs` | First-run setup wizard | `node scripts/onboard.mjs` | `node scripts\onboard.mjs` |
| `check_setup.mjs` | Read-only validation | `node scripts/check_setup.mjs` | `node scripts\check_setup.mjs` |
| `init_notion_database.mjs` | Create DB + views | `node scripts/init_notion_database.mjs` | `node scripts\init_notion_database.mjs` |
| `notion_book_completer.mjs` | Add books / fill metadata | `node scripts/notion_book_completer.mjs` | `node scripts\notion_book_completer.mjs` |
| `apple_books_notes_to_notion.mjs` | Import Apple Books highlights | `node scripts/apple_books_notes_to_notion.mjs` | N/A (macOS only) |

All scripts accept `--env-path` to specify a custom `.env` location.
