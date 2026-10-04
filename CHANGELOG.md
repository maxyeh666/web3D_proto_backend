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
- 目前產品只有一筆 `id` 為 `1` 的資產，因此 Phase 3 只做 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id`；`POST` / `DELETE` / `PATCH` 等前端有多場景管理功能後再依需求補上

## 2026-10-04 — assets 資料表 id 與時間欄位型別

**背景**
- 檢查 `src/migrations/001_create_assets.sql`，發現 `id` 與時間欄位的型別跟前後端契約對不上，確定方向後已直接修改該檔。
- 實作 `src/migrate.ts` 跑 migration 的流程，過程中連修三個 bug（見學習筆記）。

**migration 機制說明**

- migration（資料庫變更紀錄：每個 `.sql` 檔代表一次變更，照檔名排序跑）解決的問題：資料庫的表結構也要版本控制，不能靠手打 SQL 建。`000` 建記錄表自己，`001` 建 `assets` 表，之後加表或改欄位就加 `002`、`003`
- `schema_migrations`（記錄哪支跑過的表，欄位 `file_name` 是主鍵）解決的問題：`migrate` 重跑時要知道誰跑過了，跑過的顯示 `Skipping`，沒跑過的才跑
- `migrate.ts` 的流程：讀 `migrations/` 全部 `.sql` 照檔名排序 → `000` 直接跑建表（不查不寫記錄，靠 `IF NOT EXISTS` 保證重跑不炸）→ `001` 之後先查記錄，跑過就跳過，沒跑過就借一條專線跑 `BEGIN` / SQL / 寫記錄 / `COMMIT`（交易：成功整組存檔、失敗整組丟掉），跑完還線
- `pool.connect()`（跟連線池借一條專線）解決的問題：交易整組要在同一條連線上跑，直接用 `pool` 連下四次可能拿到四條不同的線，存檔跟丟掉的指令就管不到真正跑的那條

**設計決策**
- `id` 用 `BIGINT`（長整數，存的範圍比 `INTEGER` 大很多）加 `GENERATED ALWAYS AS IDENTITY`（自動編號功能，新增一筆資料庫自動填 1、2、3…）。`IDENTITY` 是現在 PostgreSQL 官方推薦的寫法，舊的 `SERIAL` 不用
- `id` 不走 `TEXT` 存 `"default"`：那是前端純靜態託管時的暫時方案，不是資料庫設計。`id` 由資料庫產生，前端不能自己取名。前端已改成 `id: number`，詳見前端 CHANGELOG 2026-10-04
- 時間兩欄都用 `TIMESTAMPTZ`（附帶時區的時間，PostgreSQL 會統一轉成 UTC 存起來），預設值維持 `CURRENT_TIMESTAMP`（SQL 標準拿現在時間的寫法），並加 `NOT NULL`（此欄一定要有值，不可以空著）。`001_create_assets.sql` 已按此修改
- `UUID`（一種很長的亂數字串，多台機器同時產生也不會撞到）先不用：單一本機 PostgreSQL 用不到，多一層複雜度

**學習筆記**

- 問：id的`BIGINT`跟`INTEGER`的取捨
  答：方向對一半，後半的 `GENERATED ALWAYS AS IDENTITY` 保留，前半的 `INTEGER`（整數型別，最多存到約 21 億）要換成 `BIGINT`。實務上新專案預設都用 `BIGINT`，不是因為會有 21 億筆，而是多佔的空間很小，可以少掉一個以後爆掉要換型別的大麻煩

- 問：TIMESTAMP 跟 TIMESTAMPZ 的差別
  答：`TIMESTAMP`（不帶時區的時間，只存幾月幾號幾點，不記這是台灣時間還是 UTC 時間）以後資料庫搬家會被解讀成不同時刻。`TIMESTAMPTZ` 會統一轉成 UTC 存，顯示時再轉回連線時區，就沒這個問題。前端傳的本來就是結尾有 `Z` 的格式（`Z` 就是 UTC 的意思），跟 `TIMESTAMPTZ` 剛好對上

- 問：`CURRENT_TIMESTAMP` 跟 `NOW()` 的差別
  答：`NOW()` 是 PostgreSQL 常用的寫法，`CURRENT_TIMESTAMP` 是 SQL 標準（跨資料庫通用的寫法）的寫法，在 PostgreSQL 裡兩者功能完全一樣。

- 問：為什麼剛剛怎麼輸入指令都會報錯，PostgreSQL 中的 =# 跟 -#有什麼差別
  答：這兩個是 `psql`（PostgreSQL 內附的指令列工具，用來直接下 SQL）的提示符號，看它就知道上一句有沒有打完。`=#` 是空閒（上一句已結束，可以下新指令）；`-#` 是接續（上一句少了分號，`psql` 還在等你把話講完）。卡在 `-#` 時新打的指令會被黏在上一句後面一起解讀，所以怎麼打都報錯。解法只有兩種：把話講完（補 `;` 後按 Enter 送出），或整句不要了（按 `Ctrl + C` 取消，回到 `=#` 再重打）

- 問：為什麼用 result.rows.length 而不用原本 result.rowCount
  答：`rows`（查回來的資料陣列，`SELECT` 一定會有）跟 `rowCount`（資料庫回報受影響幾筆，`SELECT` 以外才保證有值）在 `SELECT` 是不一樣的東西。`pg` 的型別寫的是 `rowCount: number | null`（`|` 是或的意思：這個值可能是數字，也可能是空的），代表它允許是空的，`SELECT` 在某些情況會拿到空的，要多寫判斷。`migrate.ts` 只是要問「這筆 migration 跑過了沒」，`rows.length > 0` 直接數拿回幾筆，語意最直白，也不用處理空值的情況

- 問：schema_migrations 記錄表該由 000 這個 migration 建，還是直接寫死在 migrate.ts 裡？
  答：由 `000` 建才是對的。`migrate.ts`（跑 migration 的程式）只負責讀 `.sql` 檔、照檔名順序跑、記下誰跑過了，不該知道某張表的長相。建表語句放在 `000` 裡，資料庫長什麼樣子全部由 `.sql` 檔說了算，程式不用改。反例：如果在 `migrate.ts` 裡寫死 `CREATE TABLE`，以後記錄表要加欄位，就要同時改程式跟 SQL，兩邊很容易對不上

- 問：為什麼 migration 的交易不能直接用 pool 連續下 BEGIN / COMMIT？
  答：`pool`（預先管好的一組資料庫連線，每次查詢會從裡面隨便拿一條來用）連續下四次，可能拿到四條不同的連線，開交易跟跑 SQL 不在同一條，存檔跟丟掉的指令就管不到真正跑的那條。正確做法是先用 `pool.connect()`（跟 pool 借一條專線）借一條出來，整組 `BEGIN` / SQL / `COMMIT`（交易成功就存檔）或 `ROLLBACK`（交易失敗就整組丟掉）都在同一條上跑完，最後用 `finally`（不管成功失敗都會跑的段落）把線還回去

- 問：為什麼 migration 一開始完全沒有寫入記錄，後來又報表不存在，最後還撞主鍵？
  答：這是連續三個 bug。第一個是 `migrate.ts` 的 `INSERT ... VALUES ($1)` 少傳了 `[fileName]`，`$1`（第一個參數放這裡的意思）沒給值，所以記錄從來沒寫成功過；第二個是 `000` 建的表名（`migrations`）跟程式查的表名（`schema_migrations`）對不上，查記錄時直接報表不存在；前兩個修好後才露出第三個——`000` 建完表還硬要把自己寫進記錄表，下次跑又寫一次同一個檔名，檔名是主鍵（不可重複的身分證）就撞了。中間加過 `ON CONFLICT DO NOTHING`（撞到就跳過、不報錯），但那只是把報錯壓住。終點是讓 `000` 不查也不寫記錄：它的工作只有建表，`CREATE TABLE IF NOT EXISTS`（表已存在就跳過、不報錯）本來就保證重跑不會炸，不需要靠記錄表擋重複（中間 `fileName` 改 `file_name` 只是順手對齊 SQL 慣例）。代價是 `000` 每次都會真的跑一次、顯示 `Applied`啟動檔特殊處理，換來其他檔案的流程乾淨

**已知限制 / 後續**
- 前端 `id` 已改成數字，對齊後端 `BIGINT`
