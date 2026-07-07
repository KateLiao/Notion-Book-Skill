# Notion Reading Schema

Use this reference when setting up, validating, or repairing a user's Notion reading database.

For platform-specific install/path notes, read `windows-compat.md`.
For API-specific view/formula behavior, read `notion-api-quirks.md`.

## Canonical Reading Page

Create a page titled `Reading` under the user-provided parent page. Add:

- A callout: `读书不要贪多,而是要多加思索,这样的读书使我获益不少——卢梭`
- A heading: `➡️在读`
- A linked database view for reading books
- A two-column section:
  - Left heading: `🌟完成阅读`
  - Right heading: `📎To Read List`

Do not copy any user's existing book rows into a public template.

## Data Source

Create a data source named `书籍总览` with these canonical properties:

| Property | Type | Required behavior |
| --- | --- | --- |
| `Name` | title | Book title |
| `Status` | select | Options: `Ready to Start`, `Reading`, `Finished`, `pause`, `To read list`, `想读` |
| `Author` | rich_text | Author names |
| `Tags` | multi_select | Seed only general tags; let Codex add more later |
| `Summary` | rich_text | Concise summary |
| `豆瓣Link` | url | Douban subject link |
| `书籍封面` | files | External file object for cover images |
| `总页数` | number | Total pages |
| `已读页数` | number | Read pages; initialize to `0` for new books |
| `阅读进度` | formula | Show completed state or progress bar/percentage |
| `Score /5` | select | 1-5 star options |
| `完成阅读的日期` | date | Finished date |

## Starter Tags

Use a small neutral starter set instead of copying a personal tag taxonomy:

- 小说
- 人文社科
- 商业
- 传记
- 历史
- 科学
- 技术
- 心理学
- 文学
- 个人成长

## Views

Use property IDs from the newly created data source. Never copy property IDs from another workspace.

- Reading table: `Status = Reading`
- Reading gallery: `Status = Reading`, sort `阅读进度` ascending, cover property `书籍封面`, show `Name` and `阅读进度`
- Finished table: `Status = Finished`, sort `完成阅读的日期` descending
- Finished gallery: cover property `书籍封面`
- To Read List table: `Status = To read list`

If the Notion API rejects formula sorting during initialization, keep the view and fall back to `last_edited_time`; report this in Chinese instead of abandoning the whole setup.

## Existing Database Validation

If a user already has a database:

- Accept aliases only when the Notion property type matches the expected type.
- Save the actual property names and IDs in config.
- Do not rename or delete existing properties automatically.
- If a required property is missing or has the wrong type, explain the exact fix in Chinese.
