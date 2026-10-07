# Web 3D Viewer Backend

Web 3D Viewer 的 Backend Prototype，負責 Asset API 與把資料存進資料庫。

## Goal

建立獨立的 Backend，讓 3D Viewer 的 Asset 從 Frontend Config 演進為可透過 API 管理的資料。

```text
React / R3F
     ↓
REST API
     ↓
Node.js
     ↓
PostgreSQL
```

## Development

```bash
npm install

# 複製 .env.example 為 .env，填入 DATABASE_URL

npm run migrate   # 建立 schema_migrations / assets，並寫入第一筆預設資產
npm run dev       # http://localhost:3000
```

其他指令：`npm run typecheck` / `npm run build` / `npm start`

環境變數：`PORT`（預設 3000）、`CORS_ORIGIN`（前端來源，多個以逗號分隔）、`DATABASE_URL`

## Progress Log

開發過程與設計決策見 [CHANGELOG.md](./CHANGELOG.md)。

## Roadmap

### Phase 1 — Backend Foundation

- [x] Node.js + TypeScript
- [x] REST API（Express + `/health`）
- [x] Project structure（`src/index.ts` / `db.ts` / `env.ts` / `migrate.ts`）
- [x] Environment configuration（`.env` + `.env.example`）
- [x] Basic error handling（錯誤處理中介層）

### Phase 2 — Database

- [x] PostgreSQL（本機安裝）
- [x] 資料存取方式（直接用 `pg` 寫 SQL）
- [x] Migration（`migrate.ts` + `000` / `001` / `002`，`npm run migrate` 可重複跑）
- [x] Asset Model（`assets` 資料表：`BIGINT` 主鍵 + `JSONB` + `TIMESTAMPTZ`）

### Phase 3 — Asset API

- [x] `GET /assets`
- [x] `GET /assets/:id`
- [x] `PUT /assets/:id`
- [x] Request validation
- [x] API error handling（4xx / 500 的統一 JSON 回應）

> 目前產品只有一筆 `id` 為 `1` 的資產（前端一次只編輯一筆）。
> 這個後端是給 3D Viewer 用的：資產由種子資料（或之後的後台）提供，App 本身不新增、也不刪除資產，
> 所以沒有 `POST` / `DELETE`；`PATCH /assets/:id` 暫緩，之後依需求視情況實作。
> 前端會用到的就是 `GET /assets`（挑一筆）、`GET /assets/:id`（拿完整內容）、`PUT /assets/:id`（存回去）
> （`web3D_proto_react` 的 `src/hooks/useAssetConfig.ts`）。

### Phase 4 — Frontend Integration

- [x] Connect React Viewer
- [x] Load Asset
- [x] Save (Update) Asset
- [x] Loading / Error handling

### Phase 5 — API Documentation

- [ ] 用註解產生 API 文件（例如 swagger-jsdoc + swagger-ui-express）
- [ ] 文件頁面掛在 `/docs` 可瀏覽
- [ ] Review API contract

### Phase 6 — Deployment

- [ ] 後端部署到託管平台
- [ ] 資料庫改用雲端 PostgreSQL
- [ ] 設定正式環境變數（`PORT`、`DATABASE_URL`、`CORS_ORIGIN`）
- [ ] 前端 `VITE_API_BASE_URL` 改指正式後端網址

## Tech Stack

### Backend

- Node.js
- TypeScript
- Express
- REST API

### Database

- PostgreSQL（以 `pg` 套件直接連線）

## API

| Method | Path | 說明 | 回應 |
| --- | --- | --- | --- |
| GET | `/health` | 服務狀態 | 200 |
| GET | `/health/db` | 資料庫連線狀態 | 200 |
| GET | `/assets` | 取得全部資產（摘要，只含辨識欄位） | 200 `AssetSummary[]` |
| GET | `/assets/:id` | 取得單一資產 | 200 `Asset` |
| PUT | `/assets/:id` | 更新單一資產 | 200 `Asset` |

`PUT /assets/:id` 的請求內容（`id`、`updatedAt` 由資料庫維護，不接受前端指定）：

```json
{
  "name": "Default Cube",
  "config": {
    "camera": { "position": [3, 5, 5], "fov": 60 },
    "cube": { "color": "#999999" }
  }
}
```

錯誤回應統一為 `{ "error": { "code", "message" } }`：

- 400 — `INVALID_ASSET_ID` / `INVALID_REQUEST_BODY`
- 404 — `ASSET_NOT_FOUND` / `ROUTE_NOT_FOUND`
- 500 — `INTERNAL_SERVER_ERROR`

驗證規則見 `src/validators/assetValidator.ts`。

## Asset

Asset 的資料形狀（`web3D_proto_react` 的 `src/types/asset.ts`）：

```text
Asset
├── id
├── name
├── config      ← 整包場景設定（物件）
└── updatedAt
```

`config` 的內容會隨資產類型變化，整包存成一欄（`config` 欄位型別為 JSONB），不拆成個別欄位。

```text
assets 資料表
├── id          (BIGINT / 主鍵 / 自動編號)
├── name        (文字)
├── config      (JSONB)
├── created_at  (TIMESTAMPTZ)
└── updated_at  (TIMESTAMPTZ)
```

**API 資料形狀**

```json
{
  "id": "1",
  "name": "Default Cube",
  "config": {
    "camera": { "position": [3, 5, 5], "fov": 60 },
    "cube": { "color": "#999999" }
  },
  "updatedAt": "2026-10-03T00:00:00.000Z"
}
```

`GET /assets` 回摘要 `AssetSummary[]`（只含辨識欄位），完整內容用 `GET /assets/:id`：

```json
[
  { "id": "1", "name": "Default Cube" }
]
```

## Project Structure

```text
src/
├── index.ts              ← Express 進入點（中介層 / 路由掛載）
├── db.ts                 ← PostgreSQL 連線池
├── env.ts                ← 讀取 .env
├── migrate.ts            ← 跑 migration 的程式
├── errorHandler.ts       ← 統一轉成 JSON 回應
├── errors/               ← ErrorCode + 錯誤查表 + AppError
│   ├── errorCode.ts      ← 錯誤代碼
│   ├── errorDefinition.ts ← 狀態碼與訊息查表
│   └── error.ts          ← AppError
├── routers/
│   └── assets.ts         ← /assets 路由：HTTP 進出與狀態碼
├── services/
│   └── assetService.ts   ← Asset 的 SQL 與資料形狀轉換
├── validators/
│   └── assetValidator.ts ← 請求參數驗證
└── migrations/           ← 資料庫變更紀錄（000_…、001_…、002_…）
    ├── 000_create_schema_migrations.sql   ← 記錄表自己
    ├── 001_create_assets.sql              ← assets 表
    └── 002_seed_default_asset.sql         ← 第一筆預設資產
```

分層：`routers` 只處理 HTTP（驗證、狀態碼），`services` 只處理 SQL 與資料形狀，`validators` 只做輸入驗證，`errors` 只定義錯誤與查表，`errorHandler` 只轉 JSON。

## Related Project

Frontend：

`web3D_proto_react`

前端以環境變數 `VITE_API_BASE_URL` 指定後端位址（預設 `http://localhost:3000`）。
未設定時，前端改用本機資料來源，不發出任何網路請求。

## Development Goal

以實作驅動學習，從 REST API 與 Database 基礎開始，建立可與 3D Viewer 串接的 Asset Backend。
