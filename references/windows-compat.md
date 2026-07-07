# Windows / macOS Platform Compatibility

Cross-platform notes for running the Notion Book Completer skill on macOS, Linux, and Windows.

## Skill Directory Location

Both platforms resolve `SKILL_DIR` automatically from the running script's location. No manual path configuration is needed.

| Platform | Hermes skill root | Codex skill root |
|---|---|---|
| macOS / Linux | `~/.hermes/skills/productivity/notion-book/` | `~/.codex/skills/notion-book-completer/` |
| Windows | `%USERPROFILE%\.hermes\skills\productivity\notion-book\` | `%USERPROFILE%\.codex\skills\notion-book-completer\` |

## Path Separators in Code

Node.js `path.join()` automatically uses the correct separator for each platform. You do not need to handle this in JavaScript/Node.js code.

**Python users on Windows** should use raw strings or forward slashes for paths:
```python
# ✅ Correct on all platforms
skill_dir = r"C:\Users\<name>\.hermes\skills\productivity\notion-book"
skill_dir = "C:/Users/<name>/.hermes/skills/productivity/notion-book"  # also works

# ❌ Backslash in regular string without r prefix
skill_dir = "C:\Users\<name>\.hermes\skills\..."  # \U and \n are interpreted as escape sequences
```

When using `open()` with Windows paths in Python, the `r""` prefix or forward slashes are safest:
```python
env_path = os.path.join(skill_dir, ".env")  # best — uses os.path.join which is platform-aware
```

## Shell Command Differences

### cd + node (one-liner)

**macOS / Linux:**
```bash
cd ~/.hermes/skills/productivity/notion-book && node scripts/notion_book_completer.mjs add-books "书名"
```

**Windows (CMD):**
```cmd
cd %USERPROFILE%\.hermes\skills\productivity\notion-book
node scripts\notion_book_completer.mjs add-books "书名"
```

**Windows (PowerShell):**
```powershell
cd $env:USERPROFILE\.hermes\skills\productivity\notion-book
node scripts\notion_book_completer.mjs add-books "书名"
```

### npm/node script paths

Windows natively uses backslash in paths, but Node.js on Windows accepts forward slashes in most contexts:

```powershell
# Both work on Windows with Node.js:
node scripts\notion_book_completer.mjs add-books "书名"
node scripts/notion_book_completer.mjs add-books "书名"
```

The skill's internal `path.join()` calls handle the conversion automatically.

## Node.js SSL / Certificate Errors

### macOS / Linux

If you see `DEPTH_ZERO_SELF_SIGNED_CERT` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`:
```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem NODE_USE_SYSTEM_CA=1 node scripts/onboard.mjs
```

The cert file location varies by installation:
- macOS (Homebrew Node): `/opt/homebrew/etc/ca-certificates/cert.pem` or `/etc/ssl/cert.pem`
- Linux (apt): `/etc/ssl/certs/ca-certificates.crt`
- Linux (Fedora/RHEL): `/etc/pki/tls/certs/ca-bundle.crt`

Find your cert file:
```bash
# macOS
open -a "Keychain Access"  # or
ls /etc/ssl/cert.pem

# Linux
update-ca-certificates 2>/dev/null || ls /etc/ssl/certs/ca-certificates.crt
```

### Windows

On Windows with Node 20+, set the environment variable before running:
```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\cert.pem"
$env:NODE_USE_SYSTEM_CA = "1"
node scripts\onboard.mjs
```

Or set it permanently via System Properties → Environment Variables.

For corporate proxies, you may also need:
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"  # not recommended for production
```

## Environment Variable Syntax

### macOS / Linux

```bash
export NOTION_TOKEN=ntn_xxx
export NOTION_READING_PARENT_PAGE_ID=xxx
```

Or inline:
```bash
NOTION_TOKEN=ntn_xxx node scripts/onboard.mjs
```

### Windows CMD

```cmd
set NOTION_TOKEN=ntn_xxx
set NOTION_READING_PARENT_PAGE_ID=xxx
node scripts\onboard.mjs
```

Or inline (CMD):
```cmd
set "NOTION_TOKEN=ntn_xxx" && node scripts\onboard.mjs
```

### Windows PowerShell

```powershell
$env:NOTION_TOKEN = "ntn_xxx"
$env:NOTION_READING_PARENT_PAGE_ID = "xxx"
node scripts\onboard.mjs
```

Or inline:
```powershell
$env:NOTION_TOKEN="ntn_xxx"; node scripts\onboard.mjs
```

## Tilde Expansion

| Platform | `~` expands to |
|---|---|
| macOS / Linux | `/Users/<name>` |
| Windows CMD | Not expanded — use `%USERPROFILE%` or `%HOME%` |
| Windows PowerShell | `$HOME` or `$env:USERPROFILE` |

**PowerShell:**
```powershell
# ~ is NOT expanded by default in non-interactive contexts
# Use:
Split-Path $HOME
# Or:
$env:USERPROFILE

# ✅ Correct:
cd $env:USERPROFILE\.hermes\skills\productivity\notion-book

# ❌ Wrong:
cd ~\.hermes\skills\...  # ~ may not expand in script context
```

## .env File Encoding on Windows

Ensure your `.env` file is saved as **UTF-8 without BOM**. Notepad++ or VS Code can set this:
- VS Code: bottom-right corner → UTF-8 → Save as UTF-8
- Notepad++: Encoding → UTF-8

Using ANSI or UTF-8 with BOM can cause the token to be read with hidden leading characters, causing `object_not_found` errors from the Notion API.

## Apple Books Import — macOS Only

The `apple_books_notes_to_notion.mjs` script checks `process.platform === "darwin"` at startup and exits cleanly on Windows/Linux:

```
Error: Apple Books 导入仅支持 macOS。
```

The database paths are also macOS-specific:
```
~/Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/...
```

On Windows, simply skip this feature — the rest of the skill works normally.

## Line Endings (CRLF vs LF)

The scripts use Unix line endings (LF). On Windows, if you edit them with Notepad or some editors, line endings may become CRLF, causing `#!/usr/bin/env node` to fail.

**Fix if you see errors about unexpected tokens:**
```powershell
# Convert line endings to LF (Git may auto-convert on checkout; force if needed)
git config --global core.autocrlf true  # Windows: convert to CRLF on checkout, LF in repo
# or
dos2unix scripts\*.mjs  # if you have dos2unix installed
```

VS Code users: set `"files.eol": "\n"` in `.vscode/settings.json` to prevent this.

## Quick Diagnosis Checklist

```
[ ] .env exists in SKILL_DIR (not a parent directory)
[ ] NOTION_TOKEN starts with "ntn_"
[ ] NOTION_READING_PARENT_PAGE_ID is a 32-character Notion page ID
[ ] The parent page is shared with the integration (Notion → ··· → Connections)
[ ] Node.js version is 18+ (run: node --version)
[ ] On Windows: using PowerShell or CMD with correct path separators
[ ] On macOS/Linux: using bash/zsh with ~ expansion
[ ] If SSL errors: NODE_EXTRA_CA_CERTS is set to a valid cert file
[ ] If add-books fails: run check_setup.mjs first
```
