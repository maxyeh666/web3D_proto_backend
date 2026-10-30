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

環境變數：`PORT`（預設 3000）、`CORS_ORIGIN`（前端來源，多個以逗號分隔）、`DATABASE_URL`、`ADMIN_PASSWORD`（管理者登入密碼）、`JWT_SECRET`（簽發 JWT 的密鑰）

## Progress Log

開發過程與設計決策見 [CHANGELOG.md](./CHANGELOG.md)。

## Roadmap

### Phase 1 — Backend Foundation

- [x] Node.js + TypeScript
- [x] REST API（Express + `/health`）
- [x] Project structure（`src/index.ts` / `db.ts` / `env.ts` / `migrate.ts`）
- [x] Environment configuration（`.env` + `.env.example`）
- [x] Basic error handling（錯誤處理中介層）
- [x] API 存取紀錄（`src/index.ts`，輸出 `[API] <method> <path> <status> <duration>ms`）

### Phase 2 — Database

- [x] PostgreSQL（本機安裝）
- [x] 資料存取方式（直接用 `pg` 寫 SQL）
- [x] Migration（`migrate.ts` + `000` / `001` / `002`，`npm run migrate` 可重複跑）
- [x] Asset Model（`assets` 資料表：`BIGINT` 主鍵 + `JSONB` + `TIMESTAMPTZ`）

### Phase 3 — Asset API

- [x] `GET /assets`
- [x] `GET /assets/:id`
- [x] `PUT /assets/:id`（需管理者 token）
- [x] Request validation
- [x] API error handling（4xx / 500 的統一 JSON 回應）
- [x] `POST /auth/login`：管理者登入，驗密碼後簽發 15 分鐘有效的 JWT（`routers/auth.ts` / `services/authService.ts` / `validators/authValidator.ts`，需 `ADMIN_PASSWORD` 與 `JWT_SECRET`）
- [x] `PUT /assets/:id` 需管理者權限（`middlewares/requireAdmin.ts`：驗 `Authorization: Bearer <token>` 與 `role === "admin"`）
- [x] `GET /models/:modelKey`：依 `modelKey` 查白名單表對應檔名，再以 `sendFile` 回傳（快取 `Cache-Control: public, max-age=3600`；模型由後端提供，前端不寫死檔案位置）
- [x] `model_key` 欄位與 demo 資產 seed（migration `003` / `004`；DB 存 key 不存絕對 URL）

> 目前產品只有一筆 `id` 為 `1` 的資產（前端一次只編輯一筆）。
> 這個後端是給 3D Viewer 用的：資產由種子資料（或之後的後台）提供，App 本身不新增、也不刪除資產，
> 所以沒有 `POST` / `DELETE`；`PATCH /assets/:id` 暫不實作，日後依需求評估。
> 前端會用到的就是 `GET /assets`（挑一筆）、`GET /assets/:id`（拿完整內容）、`PUT /assets/:id`（存回去）
> （`web3D_proto_react` 的 `src/hooks/useAssetConfig.ts`）。

### Phase 4 — Frontend Integration

- [x] Connect React Viewer
- [x] Load Asset
- [x] Save (Update) Asset
- [x] Loading / Error handling
- [x] 逾時 / GET 重試 / 錯誤提示（前端 `src/api/client.ts`、`useAssetConfig.ts`）

### Phase 5 — Deployment

- [x] 後端部署到託管平台
- [x] 資料庫改用雲端 PostgreSQL
- [x] 設定正式環境變數（`PORT`、`DATABASE_URL`、`CORS_ORIGIN`、`ADMIN_PASSWORD`、`JWT_SECRET`）
- [ ] 冷啟動實測與前端提示對齊（Neon 喚醒期間由前端顯示啟動提示 + GET 自動重試；實測後補上量測結果，取代「處理喚醒」這種像待開發功能的寫法）

部署筆記（Render）：
- Build Command 用 `npm ci && npm run migrate && npm run build`，Start Command 用 `npm run start`。build 階段會先自動跑 migration 再編譯；`npm run build` 只做 `tsc`，不會把 `src/migrations/*.sql` 複製到 `dist/`。若 Render build 失敗（例如某支 migration 有誤），該次部署會被取消、舊版本繼續運作，線上服務不受影響。
- `/health/db` 成功回 200（含 `durationMs`），資料庫連不上時回 500。
- 連線池的 `statement_timeout: 5000` 同時套用到 `migrate.ts`（同一顆 pool），超過 5 秒的 migration 會被中斷。
- 部署後驗證：`/health/db` 有 `durationMs`、`/assets` 的 CORS 標頭正確、`/assets/999` 回 404、前端改色後 Save 並重載仍保留（需管理者 token，見 PUT 說明）、Render log 開頭有 `Using Node version v24.x.x`。

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
| GET | `/health/db` | 資料庫連線狀態 | 200 `{ status, database: { connected }, durationMs }`，DB 不可用時 500 |
| GET | `/assets` | 取得全部資產（摘要，只含辨識欄位） | 200 `AssetSummary[]` |
| GET | `/assets/:id` | 取得單一資產 | 200 `Asset` |
| GET | `/models/:modelKey` | 取得模型檔（`modelKey` 查表對應檔名，未登記時 404） | 200 檔案本體：`Content-Type: model/gltf-binary`、`Cache-Control: public, max-age=3600` |
| POST | `/auth/login` | 管理者登入，驗密碼後簽發 token | 200 `{ token }`，密碼錯誤時 401 |
| PUT | `/assets/:id` | 更新單一資產（需管理者 token：`Authorization: Bearer <token>`） | 200 `Asset`，未帶 token 時 401、非管理者時 403 |

`PUT /assets/:id` 的請求內容（`id`、`updatedAt` 由資料庫維護，不接受前端指定）：

```json
{
  "name": "Default Cube",
  "config": {
    "camera": { "position": [3, 5, 5], "fov": 60 },
    "cube": { "color": "#999999" },
    "model": { "materialColorOverrides": {} }
  }
}
```

錯誤回應統一為 `{ "error": { "code", "message" } }`：

- 400 — `INVALID_ASSET_ID` / `INVALID_REQUEST_BODY`
- 401 — `INVALID_CREDENTIALS`（登入密碼錯誤）/ `UNAUTHORIZED`（未帶 token 或 token 無效）
- 403 — `FORBIDDEN`（token 有效但不是管理者）
- 404 — `ASSET_NOT_FOUND` / `MODEL_NOT_FOUND` / `ROUTE_NOT_FOUND`
- 500 — `INTERNAL_SERVER_ERROR`

驗證規則見 `src/validators/assetValidator.ts`（`model` 可省略；出現時材質槽 id 不可為空、顏色只收 `#rrggbb`）。

目前不提供 OpenAPI 規格或 `/docs` 頁面；API 契約以上面的端點表格與錯誤碼為準。

## Asset

Asset 的資料形狀（`web3D_proto_react` 的 `src/types/asset.ts`）：

```text
Asset
├── id
├── name
├── config      ← 整包場景設定（物件）
├── updatedAt
└── modelKey    ← 對應模型檔案的 key（DB 存 key 不存絕對 URL）
```

`config` 的內容會隨資產類型變化，整包存成一欄（`config` 欄位型別為 JSONB），不拆成個別欄位。

```text
assets 資料表
├── id          (BIGINT / 主鍵 / 自動編號)
├── name        (文字)
├── config      (JSONB)
├── created_at  (TIMESTAMPTZ)
├── updated_at  (TIMESTAMPTZ)
└── model_key   (文字 / 非空，migration 003 加欄位、004 回填既有資料)
```

**API 資料形狀**

```json
{
  "id": "1",
  "name": "Default Cube",
  "config": {
    "camera": { "position": [3, 5, 5], "fov": 60 },
    "cube": { "color": "#999999" },
    "model": { "materialColorOverrides": {} }
  },
  "updatedAt": "2026-10-03T00:00:00.000Z",
  "modelKey": "default-cube"
}
```

`GET /assets` 回摘要 `AssetSummary[]`（只含辨識欄位），完整內容用 `GET /assets/:id`：

```json
[
  { "id": "1", "name": "Default Cube" }
]
```

### 模型檔案

資產只存 `modelKey`，模型檔由 `GET /models/:modelKey` 提供。`src/routers/models.ts` 的 `MODEL_FIELDS` 是白名單查表（例如 `materials-variants-shoe` → `MaterialsVariantsShoe.glb`），未登記的 key 回 `MODEL_NOT_FOUND` 404；檔案放在後端根目錄的 `models/`（與第三方授權標註同目錄），不是 `public/`。

## Project Structure

```text
src/
├── index.ts              ← Express 進入點（中介層 / 路由掛載）
├── db.ts                 ← PostgreSQL 連線池
├── env.ts                ← 讀取 .env
├── migrate.ts            ← 跑 migration 的程式
├── errorHandler.ts       ← 統一轉成 JSON 回應
├── constants/
│   └── jwt.ts            ← JWT 演算法與 token 有效期
├── errors/               ← ErrorCode + 錯誤查表 + AppError
│   ├── errorCode.ts      ← 錯誤代碼
│   ├── errorDefinition.ts ← 狀態碼與訊息查表
│   └── error.ts          ← AppError
├── middlewares/
│   └── requireAdmin.ts   ← 驗管理者 token（Bearer）與 role
├── routers/
│   ├── assets.ts         ← /assets 路由：HTTP 進出與狀態碼
│   ├── auth.ts           ← /auth 路由：登入發 token
│   └── models.ts         ← /models 路由：依 modelKey 查白名單表回傳 .glb
├── services/
│   ├── assetService.ts   ← Asset 的 SQL 與資料形狀轉換
│   └── authService.ts    ← 驗密碼並簽發 JWT
├── validators/
│   ├── assetValidator.ts ← 請求參數驗證
│   └── authValidator.ts  ← 登入請求驗證
└── migrations/           ← 資料庫變更紀錄（000_…、001_…、…）
    ├── 000_create_schema_migrations.sql   ← 記錄表自己
    ├── 001_create_assets.sql              ← assets 表
    ├── 002_seed_default_asset.sql         ← 第一筆預設資產
    ├── 003_add_model_key.sql              ← 加 model_key 欄位
    └── 004_back_fill_model_key.sql        ← 回填既有資料並設為非空
```

分層：`routers` 只處理 HTTP（驗證、狀態碼），`services` 只處理業務邏輯（`assetService` 是 SQL 與資料形狀、`authService` 是驗密碼並簽發 token），`validators` 只做輸入驗證，`middlewares` 只做跨路由的檢查，`errors` 只定義錯誤與查表，`errorHandler` 只轉 JSON。

```text
models/
├── MaterialsVariantsShoe.glb ← KHR_materials_variants 範例模型（約 7.8MB）
└── ATTRIBUTION.md            ← 第三方資產授權標註
```

## Third-party Assets

`models/` 下的模型檔案為第三方資產，各自依其授權條款使用，詳見 [models/ATTRIBUTION.md](./models/ATTRIBUTION.md)。

## Related Project

Frontend：

`web3D_proto_react`

前端以環境變數 `VITE_API_BASE_URL` 指定後端位址（預設 `http://localhost:3000`）。
未設定時，前端改用本機資料來源，不發出任何網路請求。

## Development Goal

以實作驅動學習，從 REST API 與 Database 基礎開始，建立可與 3D Viewer 串接的 Asset Backend。
