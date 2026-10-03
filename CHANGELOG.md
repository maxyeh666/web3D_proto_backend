# Changelog

開發日誌：依日期記錄後端各階段的變更與設計決策。每則包含背景（為何做）、變更（做了什麼）、設計決策（為何這樣做）、學習筆記、已知限制 / 後續。

## 2026-10-03 — 專案初始化與技術選擇

**背景**
- 前端 Proto 已完成資料存取接縫（`AssetRepository`），後端要開始實作 Asset API。
- 後端目前是空的 TypeScript 骨架，逐步依 README 的 Roadmap 實作。

**設計決策**
- 選 Express 5 而非 Fastify / NestJS：生態最普及、範例與社群資源最多，初學者入門不需過重的框架
- Express 5 而非 4：`async` 函式出錯會自動轉給錯誤處理中介層，不用自己包 `try/catch`
- 資料庫用本機 PostgreSQL，不使用 Docker：本機安裝即可，原型階段不需要多一層容器。Docker 是一種把程式連同環境包起來跑的工具（例如把 Node 加資料庫包成一個可攜帶的環境），本專案暫時用不到，先不加這一層複雜度
- 資料庫存取直接用 `pg`（連接 PostgreSQL 的套件，寫法是把 SQL 字串傳進去）寫 SQL，暫不引入 ORM
- Asset 的 `config` 整包存成一欄：內容會隨資產類型變化，整包存之後新增資產類型不用改資料表結構。`config` 欄位用 JSONB（PostgreSQL 存 JSON 的二進位格式：寫入比 JSON 慢一點點，但處理快很多、還能建索引，官方建議預設用它）
- 資料庫保留 `created_at`，但 API 只回傳前端需要的欄位（`id` / `name` / `config` / `updatedAt`），讓前後端契約一致

**學習筆記**

- 問：什麼是建索引？聽說後端改善效能通常會加這個，為什麼不一開始就建？
  答：索引（Index）是資料庫的目錄：沒建的話，查一筆資料要整張表從頭翻到尾；建了之後可以直接翻目錄定位，幾百萬筆時差很多。但它有代價：每次寫入或更新都要順手更新目錄，所以寫入會變慢一點，也會多佔空間；而且加錯地方（例如在幾乎不查的欄位上建）等於白付代價還拖慢寫入。所以實務上是先不建，等真的慢了、用慢查詢紀錄找到瓶頸在哪一欄，再針對那一欄建。

- 問：慢查詢（Slow query）是什麼？跟普通查詢有什麼差別？
  答：慢查詢不是一種特別的語法，就是普通的 SQL，只是跑得太慢、超過資料庫設定的時間（例如超過 1 秒）被記下來。資料庫會自動把這些超時的查詢寫進一份慢查詢紀錄，後端要優化效能時就先看這份紀錄：最常出現、跑最久的那幾條，就是要修的目標，加索引通常就是加在這些查詢用到的欄位上。普通查詢跟慢查詢的差別只在「有沒有超時被記下來」，寫法上完全一樣

- 問：JSONB 是什麼？跟 JSON 差在哪？為什麼 `config` 要用它？
  答：JSONB（PostgreSQL 存 JSON 的二進位格式）跟 JSON 的差別是取捨：JSON 存的是原文，寫入快、但每次查詢都要重新解析；JSONB 存之前要多一道轉換所以寫入慢一點點，但查詢快很多、還能建索引。官方文件說預設用 JSONB，除非有特殊需求（例如要保留鍵的順序）。本專案 `config` 讀得多寫得少，所以用 JSONB

- 問：REST API 是什麼？常聽到的 RESTful 又是什麼意思，兩者有什麼關係？
  答：REST API 是「用網址代表東西、用 HTTP 方法代表動作」的一種寫 API 的風格，例如 `GET /assets/abc` 就是「拿 id 是 abc 的資產」。RESTful 是形容詞，意思是「這支 API 有照 REST 的風格寫」，所以會說「這是一支 RESTful 的 API」。本專案的 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id` 就是照這個風格設計的。反例：`GET /getAssetById?id=abc`（動作寫在網址裡，方法永遠只用 GET）、`POST /assets/delete`（用 POST 做刪除，動作跟方法對不上），這兩種就不算 RESTful

- 問：後端會不會像前端一樣，因為相依性被卡住而停在舊版？
  答：不會。後端套件（express / cors / dotenv / tsx）幾乎沒有對別的套件的版本要求（peerDependencies），可以各自獨立升級；不像前端的 React / three 生態，動一個就要動一串。版本鎖定靠 `package-lock.json`（記錄「實際裝了哪一版」），`package.json` 的 `^` / `~` 只是「允許的範圍」，lockfile 要進版控

- 問：ORM 是什麼？
  答：ORM（Object-Relational Mapping）把資料庫表格對應成程式裡的物件，不用手寫 SQL，例如 `prisma.asset.findUnique({ where: { id } })` 就等於 `SELECT ... WHERE id = ...`。本專案先用 `pg` 手寫 SQL，因為端點少、查詢單純，先把 SQL 基礎學扎實

- 問：既然有 ORM 這種方便的工具，為什麼上班時後端還要自己寫 SQL？改表格還要經過運維處理，是架構不同還是語言的問題？
  答：跟語言無關。複雜查詢用 ORM 寫起來彆扭、效能也要自己掌控，所以很多公司照樣手寫 SQL；而且就算用了 ORM，改表格這一關還是要審核——改錯一張表會影響所有用到它的服務，ORM 的自動改表是一鍵執行的，跳過了審核這一關

- 問：OpenAPI 是什麼？公司內部的實務開發會這樣處理嗎？
  答：OpenAPI 是一種寫 API 規格的標準格式，寫好後可以用 Swagger 這類工具自動產生可瀏覽的文件頁面。多數團隊公司內部沒有專門做，這是常態。本專案的做法是 Phase 5 再補，而且不用手刻 yaml，改用註解加工具自動產生（例如 swagger-jsdoc 加 swagger-ui-express），文件頁面掛在 `/docs`

**已知限制 / 後續**
- 目前產品只有一筆 `id` 為 `default` 的資產，因此 Phase 3 只做 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id`；`POST` / `DELETE` / `PATCH` 等前端有多場景管理功能後再依需求補上
