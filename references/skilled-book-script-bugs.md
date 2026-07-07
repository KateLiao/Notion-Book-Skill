# notion-book Script Bugs (Session Log)

## Bug 1 (FIXED v2.0.0): SKILL_DIR path resolution

**Status:** Fixed in skill v2.0.0. The workaround (copy `.env` to parent directory) is no longer needed.

**Original symptom:** `node scripts/notion_book_completer.mjs add-books` → `Missing NOTION_TOKEN`

**Root cause:** In the original code, `path.resolve(__dirname, "..")` resolved to `~/.hermes/skills/productivity` instead of `~/.hermes/skills/productivity/notion-book`, causing `loadEnv()` to look for `.env` in the wrong directory.

**Fix (v2.0.0):** Scripts now use `fileURLToPath(import.meta.url)` which is the Node.js-recommended cross-platform way to determine the current file's directory. The SKILL_DIR resolves correctly on macOS, Windows, and Linux without any manual workaround.

**What to do now:** Ensure `.env` is inside `SKILL_DIR` (the skill root). Scripts auto-detect the correct location.

---

## Bug 2: Missing `阅读进度` formula field → `discoverReadingTarget` returns issues

**Symptom:** After Bug 1 workaround, running `add-books` still fails with:
```
没有找到可用的 Notion 阅读数据库。请先运行：node scripts/onboard.mjs
```

**Root cause:** The `init_notion_database.mjs` script creates the data source without the `阅读进度` formula field (Notion API rejects `formula` in `initial_data_source`). The field is supposed to be patched in after, but this patch step appears to fail silently or was never triggered. The `discoverReadingTarget` function calls `mapProperties()` which reports the missing field as an `issues` entry, causing the check at line 481 (`target.issues.length > 0`) to fail.

**Diagnosis:** Check if `issues` is non-empty:
```python
import json, urllib.request
token = open("/Users/admin/.hermes/skills/productivity/notion-book/.env").read().split("NOTION_TOKEN=")[1].split()[0]
config = json.load(open("/Users/admin/.hermes/skills/productivity/notion-book/notion-book-completer.config.json"))
req = urllib.request.Request(f"https://api.notion.com/v1/data_sources/{config['dataSourceId']}")
req.add_header("Authorization", f"Bearer {token}")
req.add_header("Notion-Version", "2026-03-11")
with urllib.request.urlopen(req) as resp:
    ds = json.loads(resp.read())
    has_progress = "阅读进度" in ds.get("properties", {})
    print("Has 阅读进度:", has_progress)
    if not has_progress:
        print("Missing formula field — apply fix below")
```

**Fix: Add the formula field via PATCH:**
```python
import urllib.request, json

token = open("/Users/admin/.hermes/skills/productivity/notion-book/.env").read()
token = token.split("NOTION_TOKEN=")[1].split()[0]
config = json.load(open("/Users/admin/.hermes/skills/productivity/notion-book/notion-book-completer.config.json"))

url = f"https://api.notion.com/v1/data_sources/{config['dataSourceId']}"
formula_expr = 'if(toNumber(prop("总页数")) > 0, round(prop("已读页数") / prop("总页数") * 100) / 100, 0)'
data = json.dumps({
    "properties": {
        "阅读进度": {
            "type": "formula",
            "formula": {"formula": formula_expr}
        }
    }
}).encode()

req = urllib.request.Request(url, data=data, method="PATCH")
req.add_header("Authorization", f"Bearer {token}")
req.add_header("Notion-Version", "2026-03-11")
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    print("Added:", "阅读进度" in result.get("properties", {}))
```

After this fix, `add-books` works normally. No re-initialization needed.

---
---

## Bug 3: Douban cover images return 418 (bot detection)

**Symptom:** Cover image URL writes successfully to Notion API (returns 200), but the image does not display in Notion — shows as broken link.

**Root cause:** The Douban image CDN (`img9.doubanio.com`, `img1.doubanio.com`, `img3.doubanio.com`) returns HTTP 418 with "TencentEdgeOne" server header — it blocks all non-browser requests.

**Verification:**
```bash
curl -sI "https://img9.doubanio.com/view/subject/s/public/s26835674.jpg" -A "Mozilla/5.0"
# Returns: HTTP/2 418 (blocked)
```

**Fallback sources:**
```bash
# arkread — HTTP 200 but RISK OF WRONG BOOK (confirmed: served wrong cover for 反脆弱)
curl -sI "https://pic.arkread.com/cover/ebook/f/679816101.1765951535.jpg" -A "Mozilla/5.0"
# Returns: HTTP/2 200 ✓ — WRONG BOOK, do NOT use without visual verification

# Open Library — BEST fallback, verified correct covers, HTTP 200
# Cover URL pattern: https://covers.openlibrary.org/b/id/{id}-M.jpg
```

**Cover-finding priority order:**
1. **browser_\* tool + Douban** — browser UA can load Douban; extract cover `src` via `browser_console` + `document.querySelector`
2. **Open Library** — search by Chinese title + author; verified correct covers, HTTP 200 (recommended when Douban blocked)
3. **arkread** — HTTP 200 but **WRONG book risk** — always verify visually before using
4. **Google Books** — often returns the correct page but not a clean cover image; low priority

**⚠️ HTTP 200 ≠ correct book.** Always verify the cover visually or via browser. arkread returned HTTP 200 but served a cover for the wrong book. Open Library is more reliable for correct matches when Douban is blocked.

**Finding covers via Open Library:**
```javascript
// 1. browser_navigate → https://openlibrary.org/search?q={title}+{author}
// 2. Find the correct book entry, click through to details page
// 3. browser_console → document.querySelector('img[alt*="关键词"]')?.src
//    e.g. for 反脆弱: document.querySelector('img[alt*="Fan cui ruo"]')?.src
//    → https://covers.openlibrary.org/b/id/8558576-M.jpg
// 4. Verify: curl -sI <url> → HTTP/2 200
```

---

## Bug 4: Setting only one cover field results in no visible cover

**Symptom:** `书籍封面` property is set but cover doesn't appear in Notion views, or vice versa.

**Root cause:** Notion has two independent cover mechanisms:
1. **Page-level cover** (`cover: {external: {url}}`) — shown in gallery views and page headers
2. **`书籍封面` property** (files type) — shown in table/card views

**Fix:** Always set both simultaneously:
```python
update_data = {
    "cover": {"external": {"url": cover_url}},
    "properties": {
        "书籍封面": {
            "files": [{
                "type": "external",
                "name": book_title,
                "external": {"url": cover_url}
            }]
        }
    }
}
```

---

## Complete Diagnostic & Fix Sequence

When `add-books` fails or cover verification is needed:

```python
import urllib.request, json

token = open("/Users/admin/.hermes/skills/productivity/notion-book/.env").read()
token = token.split("NOTION_TOKEN=")[1].split()[0]
config = json.load(open("/Users/admin/.hermes/skills/productivity/notion-book/notion-book-completer.config.json"))
ds_id = config["dataSourceId"]

# 1. Check if 阅读进度 exists
req = urllib.request.Request(f"https://api.notion.com/v1/data_sources/{ds_id}")
req.add_header("Authorization", f"Bearer {token}")
req.add_header("Notion-Version", "2026-03-11")
with urllib.request.urlopen(req) as resp:
    ds = json.loads(resp.read())
    if "阅读进度" not in ds.get("properties", {}):
        url = f"https://api.notion.com/v1/data_sources/{ds_id}"
        data = json.dumps({"properties": {"阅读进度": {"type": "formula", "formula": {"formula": 'if(toNumber(prop("总页数")) > 0, round(prop("已读页数") / prop("总页数") * 100) / 100, 0)'}}}}).encode()
        req2 = urllib.request.Request(url, data=data, method="PATCH")
        req2.add_header("Authorization", f"Bearer {token}")
        req2.add_header("Notion-Version", "2026-03-11")
        with urllib.request.urlopen(req2) as r: json.loads(r.read())
        print("Fixed: added 阅读进度 formula field")
    else:
        print("OK: 阅读进度 field present")

    # 2. Verify cover URL is accessible (skip Douban — returns 418)
    cover_url = "https://pic.arkread.com/cover/ebook/f/679816101.1765951535.jpg"
    cover_req = urllib.request.Request(cover_url)
    try:
        with urllib.request.urlopen(cover_req, timeout=10) as r:
            print(f"Cover OK: {r.status}")
    except Exception as e:
        print(f"Cover FAILED: {e} — use browser_get_images to find alternative")
```
