# 封面来源与校验

## 推荐顺序

1. 作者官网或出版社商品页中的原始封面图片直链。
2. 出版社公开媒体接口，例如 WordPress `wp-json/wp/v2/media/<id>` 返回的 `source_url`。
3. 正规书店商品页使用的稳定图片 CDN 直链。
4. 豆瓣详情页的封面直链，仅在无需 Referer 且通过校验时使用。

先用书名与作者确认版本，再从商品页找到原图。不要把网页地址、搜索结果缩略图、需要登录的临时地址或图片代理地址写入 Notion。

## 不用于自动发现

- Open Library：中文 ISBN 经常返回占位文件或超小响应，历史运行中也出现超时。
- Google Books：公开 API 容易触发配额限制，不作为自动封面发现链路。
- 搜索引擎图片代理、缓存缩略图：链接不稳定，可能过期或拒绝外链。
- 需要 Referer、Cookie、签名参数或防盗链绕过的地址：即使浏览器里暂时可见，也不适合写入 Notion。

这些来源可以用于人工确认版本，但不要作为脚本的自动封面候选。若所有可靠来源都失败，只跳过封面，不阻塞其他字段。

## 写入前校验

对最终直链执行无 Referer 的 GET 请求，并同时满足：

- HTTP 200，重定向后的最终地址仍为 HTTP(S)
- `Content-Type` 以 `image/` 开头
- 响应至少 2 KB
- 文件签名是 JPEG、PNG、GIF 或 WebP

可信来源遇到超时、HTTP 429 或服务端错误时最多重试一次；明确的 4xx、HTML、占位小文件或错误签名不重试。

使用 `--cover-url` 传入已找到的直链，并用 `--cover-source official`、`publisher` 或 `retailer` 标记来源。脚本会按优先级验证候选，失败后才尝试豆瓣直链。

只有在用户明确要求修复或替换已有封面时使用 `--replace-cover`。新候选仍需先通过完整校验，其他已有字段不会被覆盖。

```bash
node scripts/notion_book_completer.mjs add-books \
  --status "To read list" \
  --author "作者" \
  --cover-url "https://publisher.example/book-cover.jpg" \
  --cover-source publisher \
  "书名"
```
