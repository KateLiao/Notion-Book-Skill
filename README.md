# Notion Book Completer

**一句话：** 当你要在 Notion 里新建或维护阅读数据库、录入新书并补全元数据/封面，或把 Apple Books 高亮笔记导入书籍页面时，用这个 Codex Skill 让 AI 自动完成——且**只补空字段，不覆盖你已填写的内容**。

Skill 指令本体使用英文，便于 Codex / Hermes / OpenClaw 稳定执行；本仓库的安装与 onboarding 文档使用中文。

## 适用场景

| 你说的话 / 需求 | Skill 会帮你做什么 |
|---|---|
| 第一次搭建 Notion 阅读库 | 创建 Reading 页面、`书籍总览` 数据库，以及在读 / 已读 / 待读视图 |
| 「我在读这几本书，还没录入 Notion」 | 查重后新建记录，设置状态与阅读进度 |
| 书籍缺作者、标签、摘要、豆瓣链接、总页数 | 从豆瓣等来源补全**空字段** |
| 封面链接失效或缺失 | 验证可访问的外部图片 URL 并写入 `书籍封面` |
| 把 Apple Books 高亮 / 笔记同步到 Notion | 以引用块形式追加到对应书籍页面正文 |

## 你会得到什么

- 一个 `Reading` / `阅读｜Reading` 风格的 Notion 阅读页面
- 标准 `书籍总览` 数据库，含 `➡️在读`、`🌟完成阅读`、`📎To Read List` 三个视图
- 可复用的 Codex / Hermes / OpenClaw Skill 指令与脚本
- 默认安全策略：只补空字段或修复明确损坏的封面，不覆盖评分、进度、日期、笔记等已有内容

## 实际效果

初始化完成后，你会得到一个结构清晰的 Reading 页面：`➡️在读` 与 `🌟完成阅读` 以封面画廊展示，`📎To Read List` 以表格管理待读书单。

![Reading 页面总览：在读、已读、待读三个视图](references/notion%20页面参考图.jpg)

Skill 录入或补全单本书时，会自动填充作者、标签、摘要、豆瓣链接、封面，并同步阅读进度。

![单本书籍详情：元数据与阅读进度](references/notion%20页面参考图%202.jpg)

## 支持范围

| Agent | 调用方式 | macOS 安装目录 | Windows 安装目录 |
|---|---|---|---|
| Codex | `$notion-book-completer` | `~/.codex/skills/notion-book-completer` | `%USERPROFILE%\.codex\skills\notion-book-completer` |
| Hermes | `$notion-book` | `~/.hermes/skills/productivity/notion-book` | `%USERPROFILE%\.hermes\skills\productivity\notion-book` |
| OpenClaw | 本地 skill / `notion book` | `~/.openclaw/skills/notion-book` | `%USERPROFILE%\.openclaw\skills\notion-book` |

Notion 初始化、书籍管理、元数据补全支持 macOS 和 Windows。Apple Books 导入仅支持 macOS。

## 安装

### Codex

```bash
mkdir -p ~/.codex/skills
cp -R notion-book-completer ~/.codex/skills/
```

在 Codex 中通过 `$notion-book-completer` 调用，例如：

```text
Use $notion-book-completer 帮我初始化 Notion 阅读数据库
```

```text
Use $notion-book-completer 把《书名》加到待读列表，并补全作者和封面
```

```text
Use $notion-book-completer 把 Apple Books 里《书名》的高亮导入 Notion
```

### Hermes

macOS：

```bash
mkdir -p ~/.hermes/skills/productivity
cp -R notion-book-completer ~/.hermes/skills/productivity/notion-book
```

Windows PowerShell：

```powershell
mkdir $env:USERPROFILE\.hermes\skills\productivity -Force
Copy-Item -Recurse notion-book-completer $env:USERPROFILE\.hermes\skills\productivity\notion-book
```

在 Hermes 中通过 `$notion-book` 调用。

### OpenClaw

macOS：

```bash
mkdir -p ~/.openclaw/skills
cp -R notion-book-completer ~/.openclaw/skills/notion-book
```

Windows PowerShell：

```powershell
mkdir $env:USERPROFILE\.openclaw\skills -Force
Copy-Item -Recurse notion-book-completer $env:USERPROFILE\.openclaw\skills\notion-book
```

OpenClaw 的公开资料显示 skill 通常以包含 `SKILL.md` 的目录形式安装；如果你的 OpenClaw 发行版有工作区级 skill 目录，优先放在工作区目录中。

## Notion 权限准备

1. 在 [Notion Integrations](https://www.notion.so/profile/integrations) 创建一个 **Internal Integration**。
2. 复制 integration token，写入项目根目录 `.env`（可参考 `.env.example`）：

```bash
NOTION_TOKEN=ntn_xxx
```

3. 在 Notion 中打开你希望放置 Reading 页面的**父页面**。
4. 点击右上角 `···` → **连接** → 选择你的 integration。
5. 复制父页面 ID，写入 `.env`：

```bash
NOTION_READING_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Integration 需要 **Read content**、**Insert content**、**Update content** 权限。

## 第一次运行

在 skill 目录中执行 onboarding 向导：

```bash
node scripts/onboard.mjs
```

Windows PowerShell：

```powershell
node scripts\onboard.mjs
```

向导会：

- 检查 Notion token 是否有效
- 搜索已有的 `书籍总览` / Reading 数据库
- 若不存在，则在父页面下创建 Reading 页面、`书籍总览` 数据库及对应视图
- 将发现的 ID 与字段映射保存到 `notion-book-completer.config.json`

只检查、不写入：

```bash
node scripts/check_setup.mjs
```

添加书籍：

```bash
node scripts/notion_book_completer.mjs add-books --status "To read list" "书名"
```

Windows PowerShell：

```powershell
node scripts\notion_book_completer.mjs add-books --status "To read list" "书名"
```

## 常见问题

| 报错 / 现象 | 原因与处理 |
|---|---|
| `Missing NOTION_TOKEN` | `.env` 未配置 token，或环境变量未加载 |
| `object_not_found` | Notion 页面或数据库未共享给 integration |
| 找到 linked view 但无法写入 | 需将**源数据库**（而非仅 linked view）共享给 integration |
| 视图创建失败 | 确认 integration 具备 insert / update content 权限 |
| Apple Books 导入失败 | 仅支持 macOS；需本机 `sqlite3`，并授权访问 Apple Books 本地数据 |
| Windows 路径或 `.env` 读取异常 | 参考 `references/windows-compat.md`，确认 `.env` 在 skill 根目录且保存为 UTF-8 |
| 初始化时 formula / view 创建失败 | 参考 `references/notion-api-quirks.md`，脚本会保留已创建的页面并报告失败视图 |

## 文件结构

```text
notion-book-completer/
├── SKILL.md                              # Codex Skill 主指令
├── agents/openai.yaml                    # Skill 元数据与默认提示词
├── agents/hermes.yaml                    # Hermes 元数据
├── agents/openclaw.yaml                  # OpenClaw 元数据
├── references/notion-schema.md           # 数据库字段与结构约定
├── references/windows-compat.md          # macOS / Windows 运行说明
├── references/notion-api-quirks.md       # Notion API 注意事项
├── references/notion 页面参考图.jpg      # README 效果截图：Reading 总览
├── references/notion 页面参考图 2.jpg    # README 效果截图：书籍详情
├── scripts/onboard.mjs                   # 首次安装向导
├── scripts/check_setup.mjs               # 只读检查配置与权限
├── scripts/init_notion_database.mjs      # 初始化 Notion 数据库结构
├── scripts/notion_book_completer.mjs     # 加书、补字段、修封面
└── scripts/apple_books_notes_to_notion.mjs  # 导入 Apple Books 高亮与笔记
```
