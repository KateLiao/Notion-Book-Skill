---
name: notion-book-completer
description: Set up, validate, and maintain a Notion reading database for books across Codex, Hermes, and OpenClaw on macOS and Windows. Use when an agent needs to onboard a new user, create a Reading page and book database with views, connect an existing Notion reading database, add books, track reading status and progress, fill only empty metadata fields such as author, tags, summary, Douban link, total pages, cover image, finished date, import Apple Books highlights and notes, skip duplicate imports, verify image accessibility, and preserve existing user-entered content.
---

# Notion Book Completer

## Core Rule

Only fill fields that are empty or explicitly broken. Do not overwrite existing ratings, status, progress, dates, notes, tags, summaries, page cover, or other user-entered content unless the user explicitly asks.

Never print Notion tokens or Apple Books private contents. Preview only small snippets of private local reading data unless the user asks for export or import.

## Setup And Onboarding

Use `scripts/onboard.mjs` when the user needs first-time setup, database initialization, or a guided check.

This skill supports:

- Codex: invoke as `$notion-book-completer`; metadata lives in `agents/openai.yaml`.
- Hermes: invoke as `$notion-book`; metadata lives in `agents/hermes.yaml`.
- OpenClaw: install as a local skill with this `SKILL.md`; metadata lives in `agents/openclaw.yaml`.
- macOS and Windows for Notion setup, validation, and book tracking.
- macOS only for Apple Books import.

For cross-platform shell, path, TLS, and `.env` issues, read `references/windows-compat.md`.
For Notion API version, data source, formula, and view quirks, read `references/notion-api-quirks.md`.

The onboarding path must:

1. Load `NOTION_TOKEN` from `.env` or the process environment.
2. Search for a usable reading database/data source by config, then by Notion search.
3. Validate the schema against `references/notion-schema.md`.
4. If no usable database exists, ask for or use `NOTION_READING_PARENT_PAGE_ID`, then create a Reading page, `书籍总览` data source, and the expected views.
5. Save local setup details to `notion-book-completer.config.json`.
6. Report all user-facing setup, permission, and repair messages in Chinese.

Read `references/notion-schema.md` before creating or repairing Notion structure.

## Configuration

Prefer `notion-book-completer.config.json` for discovered Notion IDs and property mappings. Fall back to `.env` for:

```bash
NOTION_TOKEN=ntn_xxx
NOTION_READING_PARENT_PAGE_ID=...
NOTION_READING_DATABASE_ID=...
NOTION_READING_DATA_SOURCE_ID=...
```

Scripts resolve paths relative to the skill root, not the shell's current working directory. Keep `.env` and `notion-book-completer.config.json` in the skill root. Use `--env-path <path>` only when the user intentionally keeps credentials elsewhere.

Use Notion API version `2026-03-11` for setup and views. Use data source APIs for new setup, and accept older database IDs only as compatibility inputs.

## Adding New Tracked Books

Use this path when the user gives book titles that are not yet in Notion, especially phrasing like "添加到书籍总览", "开始跟踪这些书", "To read list", or "Reading".

1. Load config and locate the source data source/database.
2. Research and verify metadata before writing whenever network access is available.
   - Use Douban subject suggest first for Chinese books.
   - Prefer an exact normalized title match. If multiple exact matches exist and the user did not specify an edition, prefer the newest publication year.
   - Use the title plus author hint when the title is ambiguous or translated. Use `--lookup-title` when the Notion title differs from the catalog title.
   - Verify author, Douban link, total pages, tags, summary, and cover URL before writing.
   - Read `references/cover-sources.md` before finding or repairing a cover.
   - Prefer original cover files from the author or publisher, then stable retailer CDNs, then a directly accessible Douban image.
   - Do not use Open Library, Google Books, or search-engine image proxies for automatic cover discovery. They may help identify an edition, but their cover paths are too unreliable for writeback.
   - Pass a verified high-priority candidate with `--cover-url` and `--cover-source`. The script validates it and falls back to a valid Douban image when available.
   - Use `--replace-cover` only when the user explicitly asks to repair or replace an existing cover. Never use it for routine fill-only enrichment.
3. Query existing pages before creating anything.
   - First try exact title lookup.
   - For batches, compare normalized titles with whitespace removed.
   - If a record exists, update only empty fields and report that it already existed.
4. Create new records with:
   - `Name`: exact user title unless a correction is obvious
   - `Status`: requested status, default `Reading`
   - `已读页数`: `0`
   - all verified metadata fields available from the source: author, tags, summary, Douban link, total pages, and cover image
5. Leave `Score /5` and `完成阅读的日期` empty unless the user provides them.

## Completing Existing Book Fields

Treat these as empty:

- `rich_text`: no plain text
- `url`: null or empty
- `multi_select`: empty array
- `files`: empty array or a known broken external URL
- `number`: null
- `date`: null
- `select`: null

Research missing metadata conservatively. Use Douban subject suggest to identify the edition, then verify ISBN, publisher, pages, author, and edition details where possible. Use concise, neutral summaries and do not paste long copyrighted descriptions.

Before writing a cover URL, fetch it without a referer and require HTTP 200, an image content type, at least 2 KB, and a JPEG/PNG/GIF/WebP signature. If all candidates fail, skip only the cover and report every attempted source.

## Apple Books Highlights And Notes

Use `scripts/apple_books_notes_to_notion.mjs` when the user asks to import Apple Books / Apple 图书 / iBooks highlights, notes, excerpts, 摘要, 高亮, or 标注.

Before writing:

1. Confirm the user is on macOS.
2. Confirm `sqlite3` exists.
3. Confirm the common Apple Books databases exist:
   - `~/Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation_v10312011_1727_local.sqlite`
   - `~/Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary-1-091020131601.sqlite`
4. Find or create the Notion book page.
5. Locate or create only the `Apple Books 高亮与笔记` module. It must be a toggleable `heading_3` when newly created.
6. Never edit the sibling modules `批注与草稿` or `读书笔记` during Apple Books import.
7. Skip duplicate imports by comparing existing quote text inside the `Apple Books 高亮与笔记` module before appending new annotations.

Format the `Apple Books 高亮与笔记` module like the user's sample:

- One toggleable `heading_3` named `Apple Books 高亮与笔记`
- One paragraph with the imported annotation count
- Each selected excerpt as a Notion `quote` block
- If a user note exists, put it in the following paragraph, not inside the quote
- Bold only `我的笔记：` in that paragraph
- Append the creation date in gray text when available
- Add empty paragraph separators between annotation groups

For repeated pulls, append only new annotations. With `--force`, refresh only the children of the `Apple Books 高亮与笔记` module.

## Book Page Note Template

When creating a new book page, initialize the page body with:

- Toggleable `heading_3`: `Apple Books 高亮与笔记`
- Divider
- Toggleable `heading_3`: `批注与草稿`
- Divider
- Toggleable `heading_3`: `读书笔记`

Inside `读书笔记`, create these `heading_4` prompts with blank paragraphs beneath them:

- `一、这本书整体在谈什么？`
- `二、作者具体是怎样展开他的观点的？`
- `三、作者说得对吗？`
- `这和我有什么关系？`

## Scripts

- `scripts/onboard.mjs`: Chinese first-run setup.
- `scripts/check_setup.mjs`: Read-only setup validation.
- `scripts/init_notion_database.mjs`: Create the Reading page, data source, and views.
- `scripts/notion_book_completer.mjs`: Shared helpers plus CLI commands such as `add-books` and `complete-metadata`.
- `scripts/apple_books_notes_to_notion.mjs`: Optional macOS Apple Books import.

Use forward-slash examples for macOS and backslash examples for Windows in user-facing instructions. Never suggest disabling TLS verification unless the user explicitly accepts that risk.
