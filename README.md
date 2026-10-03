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

## Progress Log

開發過程與設計決策見 [CHANGELOG.md](./CHANGELOG.md)。

## Roadmap

### Phase 1 — Backend Foundation

- [ ] Node.js + TypeScript
- [ ] REST API
- [ ] Project structure
- [ ] Environment configuration
- [ ] Basic error handling

### Phase 2 — Database

- [ ] PostgreSQL（本機安裝）
- [ ] 資料存取方式（直接用 `pg` 寫 SQL）
- [ ] Migration
- [ ] Asset Model

### Phase 3 — Asset API

- [ ] `GET /assets`
- [ ] `GET /assets/:id`
- [ ] `PUT /assets/:id`
- [ ] Request validation
- [ ] API error handling

> 目前產品只有一筆 `id` 為 `default` 的資產（前端一次只編輯一筆），
> 因此 Phase 3 不做 `POST / DELETE`；`PATCH /assets/:id` 暫緩，之後依需求視情況實作。
> 前端實際會呼叫的只有 `GET /assets/:id` 與 `PUT /assets/:id`
> （`web3D_proto_react` 的 `src/hooks/useAssetConfig.ts`）。

### Phase 4 — Frontend Integration

- [ ] Connect React Viewer
- [ ] Load Asset
- [ ] Save (Update) Asset
- [ ] Loading / Error handling

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
├── id          (文字 / 主鍵)
├── name        (文字)
├── config      (JSONB)
├── created_at  (時間)
└── updated_at  (時間)
```

**API 資料形狀**

```json
{
  "id": "default",
  "name": "Default Cube",
  "config": {
    "camera": { "position": [3, 5, 5], "fov": 60 },
    "cube": { "color": "#999999" }
  },
  "updatedAt": "2026-10-03T00:00:00.000Z"
}
```

## Project Structure

```text
src/
├── routes/
├── services/
├── db/
├── schemas/
└── ...
```

實際結構將於實作階段補上。

## Related Project

Frontend：

`web3D_proto_react`

前端以環境變數 `VITE_API_BASE_URL` 指定後端位址（預設 `http://localhost:3000`）。
未設定時，前端改用本機資料來源，不發出任何網路請求。

## Development Goal

以實作驅動學習，從 REST API 與 Database 基礎開始，建立可與 3D Viewer 串接的 Asset Backend。
