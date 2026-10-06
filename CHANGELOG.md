# Changelog

開發日誌：依日期記錄後端各階段的變更與設計決策。每則包含背景（為何做）、變更（做了什麼）、設計決策（為何這樣做）、學習筆記、已知限制 / 後續。

## 2026-10-06 — Phase 3：錯誤處理架構與收尾

**背景**
- Asset API 的三個端點已通，但錯誤回應各處手寫字串、未知路徑回 Express 預設 HTML、文件錯誤形狀與實作對不上，需要一次收成統一架構。

**變更**
- 新增 `errors/errorCode.ts`：`ErrorCode` 列舉（`INVALID_ASSET_ID` / `INVALID_REQUEST_BODY` / `ASSET_NOT_FOUND` / `ROUTE_NOT_FOUND` / `INTERNAL_SERVER_ERROR`），錯誤只用代碼傳遞，不手寫字串
- 新增 `errors/errorDefinition.ts`：`Record<ErrorCode, { statusCode, message }>` 查表，狀態碼與訊息只有一份真相
- 新增 `errors/error.ts`：`AppError` 只帶 `errorCode`，訊息統一查表取得
- 新增 `errorHandler.ts`：三段分支——JSON 解析失敗轉 400（避免前端少打逗號被誤判為 500）、`AppError` 查表回對應狀態碼、其餘未預期錯誤記 log 後統一回 500（不漏堆疊追蹤給前端）
- `routers/assets.ts`：`id` 格式不對拋 400（`INVALID_ASSET_ID`）、請求內容不合法拋 400（`INVALID_REQUEST_BODY`），只決定 HTTP 層的事
- `services/assetService.ts`：找不到拋 404（`ASSET_NOT_FOUND`），回傳型別為 `Promise<Asset>`（找不到用拋錯，不回 `null`）
- `index.ts`：新增 404 捕手，所有路由之後、`errorHandler` 之前，未知路徑拋 `ROUTE_NOT_FOUND`，統一轉成 JSON
- `README.md`：錯誤形狀改為 `{ "error": { "code", "message" } }` 並列出五個 code；結構圖補上 `errorHandler.ts` + `errors/`；

**設計決策**
- 分層：`validators` 只檢查回 `null` 不碰 HTTP，`routers` 只決定 400，`services` 只決定 404，`errors` 只定義與查表，`errorHandler` 只轉 JSON——哪一層出錯、哪一層負責
- 狀態碼與訊息只以 `errorDefinition` 為真相：改文案或狀態碼只改一處，`errorHandler` 不寫死數字就不會漏改
- 未知路徑用專屬 `ROUTE_NOT_FOUND`：打錯路徑卻回 `ASSET_NOT_FOUND` 會誤導除錯（路徑錯卻說資產找不到），專屬代碼讓前端與 log 一眼分辨是路徑錯還是資料不存在

**學習筆記**

- 問：Express 的 `app.use((req, res, next) => { next(...) })` 裡，沒用到的 `req` 要寫 `void req;` 或改成 `_req` 是什麼意思？兩者有什麼差別？

  答：`void req;` 是「假裝用一下」的動作（`void` 在這裡只是把變數讀一次、不做任何事），目的是堵住「宣告了卻沒用到」的警告；`_req` 開頭的底線是「我故意不用」的暗號，TypeScript 的 `noUnusedParameters`（沒用到的參數就報錯的設定）內建就認得，會直接跳過。兩者是同一個問題的兩種解法，用一種就好，不並存。

  補充：本專案後端 `tsconfig.json` 根本沒開 `noUnusedParameters`，也沒裝 ESLint（檢查程式寫法的工具），所以兩種都不需要，`(req, res, next)` 直接寫沒問題。而且 TypeScript 有個例外：後面還有參數被用到（這裡的 `next`）時，前面的 `req`、`res` 不會被點名，因為位置參數不能亂拿掉。前端 `tsconfig.app.json` 有開這個檢查，所以同一個寫法在前端是真的會用到（例如後端 `src/routers/assets.ts` 的 `_req` 也是同一個暗號）。

  注意：底線的涵義依語言而異，換語言時要重新確認，不要直接沿用這裡的理解。

## 2026-10-05 — Phase 3：Asset API 與 id 統一改為字串

**背景**
- `assets` 主鍵是 `BIGINT`，而 `pg` 讀 BIGINT 一律回傳字串（JS 的 `number` 無法精準表示超過 2^53 的整數）。
- `assetService.ts` 原本用 `Number(row.id)` 把字串轉成數字，等於默默假設 id 永遠不會超過安全範圍，且回傳型別要跟前端契約一起對齊。
- Phase 2 完成資料庫與 Asset Model 後，前端已有 `AssetRepository` 接縫，接著實作後端端點。

**變更**
- `Asset.id` 型別由 `number` 改為 `string`，並移除 `Number(row.id)` 轉換（`services/assetService.ts`）
- 前端同步改為字串契約（詳見前端 CHANGELOG 2026-10-05）
- 新增 `AssetRow`（資料庫列形狀，`updatedAt: Date`）作為 `pool.query<AssetRow>` 的泛型，`Asset`（API 形狀，`updatedAt: string`）維持給前端（`services/assetService.ts`）
- 新增 `routers/assets.ts`：`GET /assets`、`GET /assets/:id`、`PUT /assets/:id`
- 新增 `services/assetService.ts`：`listAssets` / `getAsset` / `updateAsset`，共用 `toAsset` 轉換
- 新增 `validators/assetValidator.ts`：`id` 與請求內容驗證
- 新增 `migrations/002_seed_default_asset.sql`：寫入第一筆預設資產
- `index.ts`：`CORS_ORIGIN` 支援逗號分隔多來源

**設計決策**
- id 一路用字串（資料庫 → API JSON → 前端型別全部是字串）：
  - id 是識別碼、不是數量，不會拿來做數學運算，用字串語意正確
  - `BIGINT` 天生超出 JS `number` 的安全整數範圍（2^53−1），維持 number 等於埋下「以後偷偷失真」的定時炸彈
  - 網址與 JSON 本來就是字串導向，統一成字串反而少一次轉換
  - 之後若改用 UUID（亂數字串），前端型別不用動
- 這取代 2026-10-04「前端 id 改成數字」的決定
- 分層：`routers` 只處理 HTTP（驗證、狀態碼），`services` 只處理 SQL 與資料形狀，`validators` 只做輸入驗證
- `id` 格式用 `/^[1-9]\d*$/` 檢查（只收正整數字串），格式不對回 400、找不到回 404，兩者分開
- `name` 與 `color` 不接受空字串或只有空白；`position` 與 `fov` 除型別外還要通過 `Number.isFinite`，擋掉 `NaN` / `Infinity`
- 驗證只回傳 `{ name, config }`，前端多帶其他欄位不會被寫進資料庫
- `config` 整包存進 JSONB，新增資產類型不用改資料表
- CORS 用 `CORS_ORIGIN` 當允許清單，支援逗號分隔多個來源（本機 + 之後的 GitHub Pages），只有清單內的來源才拿得到 `Access-Control-Allow-Origin`；未設定時傳 `undefined`，cors 套件會回 `Access-Control-Allow-Origin: *`（不限來源），本機開發與前端未部署時不必設定，正式環境必須設成明確白名單
- 清單逐筆 `trim()`：`"a, b"` 不 trim 會變成 `["a", " b"]`，而 `" b"` 與 `"b"` 是不同字串，比對失敗卻不會有任何錯誤訊息，是這種設定最難查的坑

**學習筆記**

- 問：後端從資料庫查資料回來時，為什麼要宣告兩個型別（`Asset` 和 `AssetRow`），只宣告一個不行嗎？好處、成本與必要性各是什麼？
  答：這兩個型別描述的是不同層的東西，實際形狀本來就不一樣。`AssetRow` 是「資料庫列的真實長相」，也就是 `pg` 讀出來的值：`BIGINT` 是字串、`JSONB` 是已解析的物件、`TIMESTAMPTZ` 是 JS 的 `Date` 物件；`Asset` 是「API 回傳的長相」，是給前端看的形狀，其中 `updatedAt` 是 ISO 字串。兩者最明顯的差別就是 `updatedAt`：一邊是 `Date`、一邊是 `string`，所以不會是同一個型別。

  只宣告一個會出的問題：如果硬把 `Asset`（`updatedAt: string`）套在 `pg` 回來的列上，等於型別在說謊——實際塞進去的是 `Date`，TypeScript 不會報錯；之後只要有人把 `updatedAt` 當字串用（例如取前 10 碼、字串比對），就會在執行時才爆，編譯期完全沒警告。另一個極端是完全不給型別（`pool.query()` 不帶泛型），這時 `row` 是 `any`（等於關掉所有欄位與型別的檢查），有型別等於沒型別。

  必要性：至少在 `query` 給一個「資料庫列」型別，編譯器才能檢查欄位有沒有打錯；把 API 形狀另外宣告，則是為了讓「給前端的契約」保持乾淨（`updatedAt` 是字串），不被驅動層的 `Date` 汙染。分開也代表兩層能各自獨立演進：以後換 ORM、或多砍 API 欄位時，各自改各自的型別，不會互相牽動。

  好處：型別誠實、邊界清楚（DB 層 vs API 層）、編譯期就能抓到欄位打錯、設計對外講得出來。成本：多一個型別要維護、看起來比較囉唆。什麼時候可以只用一個：如果資料庫的形狀跟 API 形狀完全一致（沒有 `Date`↔`string` 這類轉換），就只留一個型別即可。

- 問：把 PostgreSQL 的 `BIGINT` id 用 JavaScript 的 `number` 處理，為什麼會「無聲地」遺失精確度？根本原因是什麼？
  答：因為 JavaScript 的 `number` 不是整數型別，而是 IEEE 754 的 64 位元雙精度浮點數（用「符號 × 有效位數 × 2 的次方」來表示數字），能精確表示的整數只到 2^53（`Number.MAX_SAFE_INTEGER`＝9,007,199,254,740,991）。超過之後，相鄰整數之間開始出現空隙，而且空隙會隨數值變大而加倍放大（因為有效位數固定只有 53 位）。

  實際後果是「默默捨入、不報錯」：
  - `Number("9007199254740993")` → `9007199254740992`（少 1）
  - 因此資料庫裡兩個不同的 id 9007199254740992 與 9007199254740993，轉成 `number` 後會**變成同一個值**（`===` 為 true）——查 A 可能拿到 B
  - `String(Number("9007199254740993"))` 得到 `"9007199254740992"`，字串↔數字來回轉換不再還原

  而 PostgreSQL 的 `BIGINT` 是 8 位元組的 64 位元有號整數，上限 9,223,372,036,854,775,807，約是 `number` 精確範圍的 1024 倍。

  原因：**`BIGINT` 可表示的整數範圍，比 JS `number` 能精確表示的範圍大，兩者不是同一個範圍**；一旦硬把 `BIGINT` 交給 `number` 承接，超出有效位數的部分就會被浮點數的捨入規則默默丟掉，既不報錯也不警告。這正是 `pg` 讀 `BIGINT` 時刻意回傳「字串」的原因——把「精確表示」交回給字串（字串逐字元保存，沒有進位與捨入問題）。

  為什麼本專案仍要當一回事：`assets.id` 是 IDENTITY 從 1 開始編號，實務上幾乎不可能累積到 9,007,199,254,740,991 筆（約 9 千兆筆，現實中到不了），但型別決定的意義在於「模型要誠實」——用 `number` 等於宣告了一個比實際小的範圍，把「以後某天偷偷失真」變成一顆不報錯的地雷；用 `string` 則不論 id 多大都不會失真。

- 問：什麼是 SQL Injection（SQL 注入）？為什麼查資料一定要用參數化查詢，不能自己把字串拼進 SQL？

  答：SQL Injection 是「把使用者的輸入當成 SQL 指令執行」的攻擊。SQL 只是一段文字，資料庫分不出哪一段是程式寫的、哪一段是使用者輸入的，所以只要使用者的輸入有機會被拼進 SQL 字串，他就能改寫整句指令的意思。

  以本專案 `getAsset` 為例，如果寫成自己拼字串：

  ```ts
  pool.query(`SELECT * FROM assets WHERE id = '${id}')
  ```

  送 `id = "1"` 沒問題，但送 `id = "1' OR '1'='1"` 就變成 `SELECT * FROM assets WHERE id = '1' OR '1'='1'`，條件永遠成立，整張表都會被查出來；再接上 `; DROP TABLE assets; --` 甚至可以刪表（`--` 是 SQL 的註解，會把後面原本的引號與條件吃掉）。

  參數化查詢就是把 SQL 和資料分開送：

  ```ts
  pool.query('SELECT * FROM assets WHERE id = $1', [id])
  ```

  `$1` 只是佔位符（先佔一個位置），真正的值放在第二個參數的陣列裡另外送。資料庫會先把 SQL 的句型編譯好，再把值填進去；填進去的值永遠只被當成資料，不會被當成指令，所以使用者送什麼字元都改不了句型。這跟「自己跳脫（escape，把特殊字元改寫成安全形式）」不同：跳脫是逐一擋特例、容易漏，參數化是從結構上就不可能被注入。

  注意事項：

  - **只對「值」有效**：表名、欄名、`ORDER BY` 的欄位、`LIMIT` 的數量屬於「結構」，不能用 `$1` 帶入（會被當成字串值而不是識別碼）。之後若要做「依欄位排序」，要用白名單（在程式裡比對允許的欄位名、對應到寫死的 SQL），不能直接接使用者輸入。
  - 任何來自請求的內容（`req.params`、`req.body`、`req.query`、header）都走參數化，只有寫死的 SQL 片段才可以直接拼接。
  - 驗證（如 `validateAssetId`）不能取代參數化：驗證負責「提早擋掉不合理的輸入、給好的錯誤訊息」，參數化負責「就算驗證漏了也注入不進來」，兩者是互補。
  - 錯誤訊息不要回傳 SQL 原文：資料庫的錯誤常會帶出表名與欄名，等於免費給攻擊者線索；錯誤中介層對 5xx 一律回固定字串就是這個原因。

- 問：CORS 是什麼？為什麼前端打後端時，要後端「允許」才拿得到資料？

  答：CORS（Cross-Origin Resource Sharing，跨來源資源共用）是瀏覽器的一道安全機制。瀏覽器預設只讓網頁讀「同一個來源」的資料，來源 = 通訊協定 + 網域 + 埠，三者有一個不同就算不同來源（`http://localhost:5173` 與 `http://localhost:3000` 埠不同，就是不同來源）。這叫同源政策，目的是防止隨便一個網頁偷讀你其他網站的資料。

  要跨來源時，做法是由伺服器在回應加上 `Access-Control-Allow-Origin` 標頭，告訴瀏覽器「我同意這個來源讀我的回應」。所以放不放行是後端決定的，前端怎麼寫都無法自己繞過 —— 這也是為什麼看到 CORS 錯誤時，要改的是後端設定而不是前端程式。

  要注意 CORS 是**瀏覽器在擋，不是伺服器在擋**：用 curl、Postman 或伺服器對伺服器呼叫都沒有這道限制，所以「前端被擋」不等於「API 沒人能打」；反過來，把 `Access-Control-Allow-Origin` 設成 `*` 等於對所有網站開放，正式環境應該用白名單。

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
