# Windows and macOS Compatibility

Use this reference when installing or troubleshooting the skill on macOS or Windows.

## Skill Directories

| Agent | macOS | Windows |
| --- | --- | --- |
| Codex | `~/.codex/skills/notion-book-completer` | `%USERPROFILE%\.codex\skills\notion-book-completer` |
| Hermes | `~/.hermes/skills/productivity/notion-book` | `%USERPROFILE%\.hermes\skills\productivity\notion-book` |
| OpenClaw | `~/.openclaw/skills/notion-book` | `%USERPROFILE%\.openclaw\skills\notion-book` |

Scripts resolve `SKILL_DIR` from their own file location, so commands can be run from any current working directory. Put `.env` and `notion-book-completer.config.json` in the skill root.

## Commands

macOS:

```bash
node scripts/onboard.mjs
node scripts/check_setup.mjs
node scripts/init_notion_database.mjs --dry-run
node scripts/notion_book_completer.mjs add-books --status "To read list" "书名"
```

Windows PowerShell:

```powershell
node scripts\onboard.mjs
node scripts\check_setup.mjs
node scripts\init_notion_database.mjs --dry-run
node scripts\notion_book_completer.mjs add-books --status "To read list" "书名"
```

Node accepts forward slashes on Windows too, but use backslashes in user-facing PowerShell examples.

## Environment Variables

macOS:

```bash
export NOTION_TOKEN=ntn_xxx
export NOTION_READING_PARENT_PAGE_ID=xxx
```

Windows PowerShell:

```powershell
$env:NOTION_TOKEN = "ntn_xxx"
$env:NOTION_READING_PARENT_PAGE_ID = "xxx"
```

Windows CMD:

```cmd
set NOTION_TOKEN=ntn_xxx
set NOTION_READING_PARENT_PAGE_ID=xxx
```

## `.env` Encoding

Save `.env` as UTF-8 without BOM. The scripts strip a leading BOM, but UTF-8 without BOM avoids hidden-token bugs across editors.

## TLS / Certificate Issues

If Node reports `DEPTH_ZERO_SELF_SIGNED_CERT` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set a certificate path before running the command.

macOS examples:

```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem NODE_USE_SYSTEM_CA=1 node scripts/onboard.mjs
NODE_EXTRA_CA_CERTS=/opt/homebrew/etc/ca-certificates/cert.pem NODE_USE_SYSTEM_CA=1 node scripts/onboard.mjs
```

Windows PowerShell:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\cert.pem"
$env:NODE_USE_SYSTEM_CA = "1"
node scripts\onboard.mjs
```

Do not disable TLS verification unless the user explicitly accepts the security risk.

## Apple Books

Apple Books import is macOS-only. On Windows the script exits with a clear message; all Notion database setup and book-management features still work.

