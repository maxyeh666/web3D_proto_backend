# Changelog

開發日誌：依日期記錄後端各階段的變更與設計決策。每則包含背景（為何做）、變更（做了什麼）、設計決策（為何這樣做）、學習筆記、已知限制 / 後續。

## 2026-10-22 — 近期終點收斂與後端 CI

**背景**
- 作品集終點一直停留在「Phase 3 有三項未勾」，但沒有決定什麼在終點內；對話中把終點收斂為「近期終點」：打開連結能用、切得動資產、存得住設定、每個決定有理由。
- 後端沒有 CI：型別檢查目前只在 Render 部署的 Build Command 裏跑，而它的順序是 `npm ci && npm run migrate && npm run build`——migrate 要連資料庫，Neon 睡著時 build 會在編譯之前失敗，型別錯誤根本還沒被檢查到。

**變更**
- `.github/workflows/ci.yml`（新增）：push 到 main 時跑 `npm ci` + `npm run typecheck`，不需要資料庫
- `README.md`：Phase 3 新增模型相關待辦（`GET /models/*`、`model_key` 欄位與 seed），Phase 5「休眠喚醒」改寫為「冷啟動實測與前端提示對齊」

**設計決策**
- CI 只跑 `typecheck`、不跑 `build`：`typecheck` 是 `tsc --noEmit`，只檢查不產物；兩者檢查的是同一批型別錯誤，跑一個就夠
- CI 不連資料庫：它的價值正是把型別檢查從「需要資料庫的部署流程」裏解耦；push 後約 30 秒回報，比等 1–3 分鐘的 Render build 更早發現錯誤
- 沒有為對稱而裝 ESLint：目前沒有實際需求（風格問題靠肉眼檢查），多一個工具就多一份維護

**已知限制 / 後續**
- Render 部署的 build 仍會先跑 migrate：migrate 失敗時部署照樣被擋，CI 不影響這部分

## 2026-10-22 — Roadmap 收斂：不做 API 文件

**背景**
- Roadmap 原本把「API Documentation」排在部署之前（Phase 5），部署反而被排到 Phase 6。
- 這後端從一開始就刻意不提供 `POST` / `DELETE`：Viewer 只讀取與更新既有資產，唯一的呼叫端是 `web3D_proto_react`。

**變更**
- `README.md`：移除「API Documentation」階段，`Deployment` 由 Phase 6 改為 Phase 5（部署筆記一併歸在該階段下）；`## API` 段尾補一行「目前不提供 OpenAPI 規格或 `/docs` 頁面；API 契約以上面的端點表格與錯誤碼為準」
- `CHANGELOG.md`：2026-10-03 學習筆記的 OpenAPI 那則，把「Phase 5 再補」改為「最初規劃、後續評估不做」並補上理由；2026-10-21 條目標題的 Phase 6 改為 Phase 5，與重新編號後的 Roadmap 一致

**設計決策**
- 不做 OpenAPI 規格與 `/docs` 頁面：唯一的呼叫端是自家前端，沒有第三方要串接，寫出來的規格只有自己會讀；契約改由 README 的端點表格、請求範例與錯誤碼承擔，5 個端點的規模維護一份就夠
- 日後若真的需要對外開放 API，做法是一份 `openapi.yaml` 加 `swagger-ui-express`，而不是在每個 route 塞 JSDoc：端點少的時候 JSDoc 會讓 `routers/assets.ts` 混雜 HTTP 處理與文件細節，而獨立規格檔還能用 `openapi-typescript` 產生前端型別，省下前後端各寫一次

**已知限制 / 後續**
- 沒有機器可讀的 API 規格：契約目前由 README 與 `src/validators/assetValidator.ts` 描述，改動端點時要記得同步
- Neon 冷啟動喚醒仍未處理（見 Phase 5 — Deployment）

## 2026-10-21 — Phase 5：連線池、健康檢查、關機流程與部署測試

**背景**
- Render 與 Neon 免費方案已建立，並透過 GitHub 連動部署；migrations 已確認執行完成，進入部署後的 SQL 與資料操作測試階段。
- 上線前要先釐清三件事：連線池的人數上限、本機與雲端 DB 的連線保護、重新部署時的關機流程。
- 同時需要一個「只看資料庫」的健康檢查：Render 的免費方案會休眠、雲端 DB 會主動切斷閒置連線，服務存活不代表資料庫連線正常。

**變更**
- `src/db.ts`：`Pool` 加上 `max: 5`、`idleTimeoutMillis: 30_000`、`connectionTimeoutMillis: 15_000`、`statement_timeout: 5_000`；新增 `pool.on('error')`，閒置連線出錯時記下完整 error 物件
- `src/index.ts`：新增 `GET /health/db`（執行 `SELECT 1`，回 `{ status, database: { connected: true }, durationMs }`）；`app.listen` 的回傳值存成 `server`，新增 `shutdown()` 處理 `SIGTERM` / `SIGINT`（關閒置 keep-alive 連線 → 停止接受新請求 → `pool.end()` → 結束；10 秒後強制 `process.exit(1)`）
- `src/env.ts`：啟動時檢查 `DATABASE_URL`，缺少就直接丟錯結束
- `package.json`：新增 `"engines": { "node": "24.x" }`，固定 Render 用的 Node 版本（與前端 workflow 的 `node-version: 24` 對齊）
- 部署流程改為每次自動跑 migration：Build Command 用 `npm ci && npm run migrate && npm run build`（由 Render 於 build 階段執行；`npm run build` 只做 `tsc`，不會把 `src/migrations/*.sql` 複製到 `dist/`）。001 / 002 靠 `schema_migrations` 的執行記錄跳過、000 用 `IF NOT EXISTS`，重跑是安全的；Render build 失敗時該次部署會被取消、舊版本繼續運作，線上服務不受影響。
- 使用 Neon SQL Editor 查詢 assets 資料，確認目前初始化資料；開始學習 SQL `UPDATE`、`RETURNING` 與 Transaction 的用途，規劃以 `BEGIN` 搭配 `ROLLBACK` 測試資料更新，避免測試修改被保存

**設計決策**
- `pool.on('error')` 必須存在：pg-pool 在閒置連線壞掉時會先移除該連線再發出 `error`，若無 listener 便會成為未捕捉例外，導致整個 process 結束；直接印出完整 error 物件，是為了保留 stack 與 pg 附帶的欄位（`severity`、`detail`、`[errors]`）
- `/health/db` 不寫 try/catch：Express 5 會自動把 async handler 的 reject 交給 `errorHandler`，重複包裹一層會使同一邏輯需在兩處維護
- 成功路徑不加 log：每次健康檢查都記錄一行會使 log 被健康檢查訊息淹沒，正常情況下不應有 log
- `durationMs` 由 handler 自己算：`pool.query` 不會回傳耗時；將來變慢時可直接判斷是 DB 慢還是網路慢
- `statement_timeout` 放在 pool 上而不是每支查詢各自設：一次套用到所有查詢，漏寫的地方也有保護
- 關機用 `server.closeIdleConnections()` 先關閒置 keep-alive 連線：舊版 Node 的 `server.close()` 不會自動關閉它們，可能導致關機停滯；主動關閉便無需依賴特定版本的行為
- `pool.end()` 加 `.catch()`：`pool.end()` 的 reject 若沒人接會變成 unhandled rejection，讓 process 異常結束；記 log 後照常 `process.exit(0)`
- 10 秒保險用 `.unref()` 且觸發時印 log：計時器只是保險，不該成為程式活著的理由；真的觸發時可從 log 判斷為強制結束，而非由平台直接終止
- 強制結束用 exit code 1、正常結束用 0：讓 Render 端從結束碼判斷這次是「正常關閉」還是「逾時強制結束」
- 以 GitHub 中的 migration 檔案作為資料表結構的版本依據，不直接手動重建資料表；從今天起，每支新的 migration 必須是冪等的（`CREATE TABLE` 加 `IF NOT EXISTS`，`INSERT` 種子資料先檢查不存在才插），因為自動跑之後同一支會在每次部署都被執行一次
- SQL 測試先用現有初始化 Asset，不新增測試資料、不改 Schema
- 部署驗證依序從資料庫操作、後端 API 到前端整合，避免同時排查多個層次的問題

**學習筆記**
- 問：Node.js 的關機流程裡，強制結束用的計時器為什麼要寫成 `setTimeout(...).unref()`？不加會有什麼差別？

  答：Node 的程式要「還有事情等著做」才會繼續活著，而計時器就是其中一種會讓它等下去的事情。

  `unref()` 的意思是「這個計時器不用算進『還有事要做』」——時間到了它照樣執行，但它自己不會成為程式不結束的理由。

  放在關機流程是因為這個 10 秒計時器只是保險：正常情況關機很快就完成，不該因為一個 10 秒的計時器尚未到期而延長程式的存活時間；加了 `unref()` 之後，一旦其他工作都做完、程式該結束時就不會被它拖住，僅在真正發生停滯時它才會被觸發執行 `process.exit(1)`。

  需要說明的是，以目前的寫法它主要是「語意上的保險」：成功路徑最後一定會呼叫 `process.exit(0)`，所以行為差別不大；它的價值在於把「這個計時器不該是程式活著的理由」寫進程式裡，日後若有人改動流程而遺漏 exit，也不會被它多佔用 10 秒。
- 問：`package.json` 裡的 `"engines": { "node": "24.x" }` 有什麼作用？本機明明跑得起來，為什麼還要寫？

  答：`engines` 是「這個專案預期在哪個 Node 版本上跑」的宣告，寫給兩個對象看：安裝工具（npm）和部署平臺（Render）。

  對 npm 來說，版本不符時預設只會印警告、不會擋下安裝，所以它主要是「告知」而不是「保護」；真正有作用的是部署平臺——Render 會讀這個欄位決定用哪個版本建置和執行，沒寫就用平臺自己的預設版本，而那可能是本機沒測過的版本。

  寫成 `24.x` 代表「24 系列的任何一個版本」，好處是自動吃到 24 的安全性修補；若要完全重現某個問題，才改用固定的完整版本。

  部署後應檢查 Render 的 log 開頭是否出現 `Using Node version v24.x.x`；若有，表示 Render 已採用指定的版本；若未出現並伴隨警告訊息，表示 Render 無法解析該版本而退回預設值，此時應改用完整版本號。（前端不是用 `engines`，而是 GitHub Actions 的 `node-version: 24`，兩邊指的都是 Node 24。）
- 問： SQL Transaction（交易）是什麼？

  答： 將多個 SQL 操作視為一個整體，確保相關資料操作的一致性。
- 問： `BEGIN`、`COMMIT`、`ROLLBACK` 有什麼用途？

  答：
  - `BEGIN`：開始交易。
  - `COMMIT`：提交交易，保存修改。
  - `ROLLBACK`：取消尚未提交的修改。
- 問： 什麼時候需要使用 Transaction？

  答： 當多個資料庫操作必須一起成功時，例如銀行轉帳中的扣款與加款，可以使用交易避免只完成部分操作。單一 SQL 操作通常不需要特別建立交易。
- 問： Transaction 的核心概念是什麼？

  答： Atomicity（原子性），也就是一組相關操作要嘛全部成功，要嘛全部不生效。
- 問： Transaction 是通用概念還是 PostgreSQL 專用？

  答： Transaction 是常見的關聯式資料庫概念。不同資料庫都可能支援交易，但語法與行為細節有所差異。
- 問： `RETURNING` 的用途是什麼？

  答： PostgreSQL 可以在 `INSERT`、`UPDATE` 或 `DELETE` 後，直接回傳受影響資料的欄位，方便立即檢查操作結果。
- 問： 為什麼測試 SQL 時可以使用 `BEGIN` + `ROLLBACK`？

  答： 可以在交易中執行修改並觀察結果，再取消未提交的變更。但這不代表所有資料庫操作都能透過 `ROLLBACK` 復原。
- 問：SQL 的 `COMMIT` 實際上有什麼用途？跟普通寫 SQL 差在哪，什麼時候要用？

  答：`COMMIT` 即「確定送出」。

  在一個交易中進行的所有修改，在 `COMMIT` 之前都只是草稿：僅有發起該交易的連線可見，資料庫也尚未真正寫入。

  一旦 `COMMIT`，草稿才會成為正式紀錄，對所有連線可見，即使發生斷電也不會遺失；`ROLLBACK` 則是將該交易的所有修改全部放棄，視為未曾執行。

  跟普通寫 SQL 的差別在於：沒寫 `BEGIN` 的單句 SQL，PostgreSQL 會自動包一層隱形交易、跑完等於自動 `COMMIT`，所以單句根本不需要手動寫；只有在需要把多句 SQL 綁成一個整體時，才需要親自 `BEGIN`，最後親自 `COMMIT`。

  非要它不可的時機是好幾個操作必須一起成功時，例如轉帳的扣款與加款兩句 `UPDATE` 包在 `BEGIN` 裡，第二句失敗就 `ROLLBACK`，第一句的扣款也會一併取消，不會出現扣款成功、加款失敗的資金不一致狀態。

  跟本專案有關的例子是 `migrate.ts`：每一支 migration 都包在交易裡，連同登記到 `INSERT INTO schema_migrations` 一起 `COMMIT`，任何一步失敗就全部取消，資料庫永遠是要嘛跑完、要嘛沒跑的乾淨狀態，這正是即使將 migration 納入自動部署流程，也能保證重複執行安全的根本原因。
- 問：目前階段、實務上推薦使用 Auto Deploy（自動部署）嗎？

  答：建議啟用，但有 3 個條件。單人、原型階段、免費方案的最大成本是「手動步驟」，每減少一步手動操作就少一次出錯的機會，所以實務上這種組合都是開 Auto Deploy（推上 GitHub 就自動建置上線）。

  條件一：`main` 分支隨時可以上線，不應將尚未完成的程式推送上去，每個 commit 都是完整可跑的。

  條件二：migration 向後相容且冪等，不要寫破壞性的（刪欄位、改欄位型別）；損壞的 migration 會導致 build 失敗、部署停滯，但 Render 會讓舊版本繼續運作，線上服務不受影響，修復後重新推送即可。

  條件三：每次部署後進行約 30 秒的驗證——檢查 Render log 開頭（Node 版本、migration 是 Applied 還是 Skipping）、`GET /health/db` 有沒有 `durationMs`、前端改色存檔後重載還在不在。

  要關掉的時機是：有真實使用者、多人協作、要做破壞性 migration 需要手動選擇時機執行；到時的做法是開 `develop` 分支日常推、只把驗過的合進 `main`，現階段尚無此需求。

**已知限制 / 後續**
- `statement_timeout` 同樣套用到 `migrate.ts`（同一顆 pool）：超過 5 秒的 migration（例如大表的 `CREATE INDEX`）會被中斷，屆時要另外給 migrate 專用的 pool 或暫時調高
- `/health/db` 失敗回 500（走既有 `errorHandler`），不是 503：健康檢查語意上 503 更準確，但這是沿用既有錯誤架構的取捨
- Windows 上無法送出真正的 SIGTERM（會被直接終止），關機流程只能用 `process.emit('SIGTERM')` 模擬或以 Render 端觀察驗證
- 部署後要在 Render log 開頭確認 `Using Node version v24.x.x`，證明 `engines` 生效
- 免費方案雲端 DB（Neon）閒置會暫停，喚醒時首次連線可能較慢：表現為 `/health/db` 或首個 API 請求延遲偏高、甚至觸發 `connectionTimeoutMillis`；後續需決定處理方式（例如首次請求重試、前端載入狀態提示、或評估付費方案；已決定維持免費方案，解法另行討論）

## 2026-10-07 — Phase 3：列表改回摘要，單筆維持完整

**背景**
- `GET /assets` 原本回完整 `Asset[]`（含整包 `config`），但列表的功能是「挑哪一筆」，不需要把整包場景設定撈出來。
- 前端實際編輯的是某一筆資產（`GET /assets/:id` + `PUT /assets/:id`），列表摘要化後 `get` 即為完整內容的取得端點——這是一次破壞性變更（breaking change：回應形狀改變），前端同步跟進。

**變更**
- `services/assetService.ts`：新增 `AssetSummary = { id, name }`；`listAssets()` 改為只 `SELECT id, name`，回傳 `Promise<AssetSummary[]>`，直接回 `result.rows`（不經 `toAsset` 轉換）
- `getAsset` / `updateAsset` 維持回完整 `Asset`；`routers` / `validators` 不動
- `README.md`：`GET /assets` 回應改為 `AssetSummary[]`，補上列表資料形狀範例

**設計決策**
- 列表只回辨識欄位（`id`、`name`）：列表僅作為挑選用途，完整 `config` 只在 `get` 拿；避免每筆都序列化傳輸整包 JSONB
- `AssetSummary` 不做 `updatedAt` 轉換：只有 `string` 欄位，無需 `toAsset` 那層 Date 轉 ISO
- `getAsset` / `updateAsset` 的 `AssetRow` 與 `toAsset` 保留：它們仍需要處理 `Date` 轉 ISO

**學習筆記**
- 問：什麼是「破壞性變更（breaking change）」？這次把 `GET /assets` 的回應從完整 `Asset[]` 改成摘要 `{ id, name }[]`，為什麼算？

  答：破壞性變更指的是「改了之後，原本照舊使用的人會壞掉」的改動。

  這次 `GET /assets` 回傳的資料形狀變了（每筆少了 `config`、`updatedAt` 等欄位），任何原本直接拿 `config` 來用的前端程式都會拿到 undefined 而導致錯誤——即使後端本身運作正常，對使用它的那一端仍是破壞性的。

  這種改動必須前後端一起改、一起上線，不能只改一邊，故特別標示以提醒後續維護者。
- 問：要「重新套用」現有的 migration（資料庫變更）時，為什麼是保留 `schema_migrations` 記錄表、只刪掉裡面的記錄再重跑，而不是把整個資料庫砍掉重練？

  答：`migrate.ts` 是看 `schema_migrations`（記錄哪支 migration 跑過的表）決定每一支要「跳過」還是「重跑」：記錄還在就跳過，記錄被刪掉就重跑。所以只需刪某幾支的記錄，即可只重跑那幾支、其餘照樣跳過，不用整庫歸零。

  但要注意「刪記錄只影響跑不跑，不會把已經造成的結果還原」：`001` 是 `CREATE TABLE assets`（沒有 `IF NOT EXISTS`），若表仍存在，重跑會直接回報「資料表已存在」錯誤；`002` 是 `INSERT` 種子資料，重跑會再多插一筆。

  所以能重跑的前提是，先把要重建的表（`assets`）也砍掉、再刪掉對應記錄，讓那幾支從乾淨狀態重跑一次。（`000` 例外：它用 `CREATE TABLE IF NOT EXISTS` 且每次都會跑，不受記錄表影響。）

**已知限制 / 後續**
- 目前產品只有一筆 `id` 為 `1` 的資產；多筆資產的選擇介面出現時，直接沿用 `GET /assets` 摘要

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

  答：`void req;` 是「假裝用一下」的動作（`void` 在這裡只是把變數讀一次、不做任何事），目的是堵住「宣告了卻沒用到」的警告。

  `_req` 開頭的底線是「我故意不用」的暗號，TypeScript 的 `noUnusedParameters`（沒用到的參數就報錯的設定）內建就認得，會直接跳過。

  兩者是同一個問題的兩種解法，用一種就好，不並存。

  補充：本專案後端 `tsconfig.json` 根本沒開 `noUnusedParameters`，也沒裝 ESLint（檢查程式寫法的工具），所以兩種都不需要，`(req, res, next)` 直接寫沒問題。而且 TypeScript 有個例外：後面還有參數被用到（這裡的 `next`）時，前面的 `req`、`res` 不會被點名，因為位置參數不能亂拿掉。前端 `tsconfig.app.json` 有開這個檢查，所以同一個寫法在前端是真的會用到（例如後端 `src/routers/assets.ts` 的 `_req` 也是同一個暗號）。

  注意：底線的涵義依語言而異，換語言時要重新確認，不要直接沿用這裡的理解。

## 2026-10-05 — Phase 3：Asset API 與 id 統一改為字串

**背景**
- `assets` 主鍵是 `BIGINT`，而 `pg` 讀 BIGINT 一律回傳字串（JS 的 `number` 無法精準表示超過 2^53 的整數）。
- `assetService.ts` 原本用 `Number(row.id)` 把字串轉成數字，等於隱含假設 id 永遠不會超過安全範圍，且回傳型別要跟前端契約一起對齊。
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
  - 之後若改用 UUID（隨機字串），前端型別不用動
- 這取代 2026-10-04「前端 id 改成數字」的決定
- 分層：`routers` 只處理 HTTP（驗證、狀態碼），`services` 只處理 SQL 與資料形狀，`validators` 只做輸入驗證
- `id` 格式用 `/^[1-9]\d*$/` 檢查（只收正整數字串），格式不對回 400、找不到回 404，兩者分開
- `name` 與 `color` 不接受空字串或只有空白；`position` 與 `fov` 除型別外還要通過 `Number.isFinite`，擋掉 `NaN` / `Infinity`
- 驗證只回傳 `{ name, config }`，前端多帶其他欄位不會被寫進資料庫
- `config` 整包存進 JSONB，新增資產類型不用改資料表
- CORS 用 `CORS_ORIGIN` 當允許清單，支援逗號分隔多個來源（本機 + 之後的 GitHub Pages），只有清單內的來源才拿得到 `Access-Control-Allow-Origin`；未設定時傳 `undefined`，cors 套件會回 `Access-Control-Allow-Origin: *`（不限來源），本機開發與前端未部署時不必設定，正式環境必須設成明確白名單
- 清單逐筆 `trim()`：`"a, b"` 未經 trim 會被解析為 `["a", " b"]`，而 `" b"` 與 `"b"` 是不同字串，比對失敗時不會產生任何錯誤訊息，是此類設定中最不易排查的問題

**學習筆記**

- 問：後端從資料庫查資料回來時，為什麼要宣告兩個型別（`Asset` 和 `AssetRow`），只宣告一個不行嗎？好處、成本與必要性各是什麼？

  答：這兩個型別描述的是不同層的東西，實際形狀本來就不一樣。

  `AssetRow` 是「資料庫列的真實長相」，也就是 `pg` 讀出來的值：`BIGINT` 是字串、`JSONB` 是已解析的物件、`TIMESTAMPTZ` 是 JS 的 `Date` 物件。

  `Asset` 是「API 回傳的長相」，是給前端看的形狀，其中 `updatedAt` 是 ISO 字串。兩者最明顯的差別就是 `updatedAt`：一邊是 `Date`、一邊是 `string`，所以不會是同一個型別。

  只宣告一個會出的問題：如果硬把 `Asset`（`updatedAt: string`）套在 `pg` 回來的列上，等於型別與實際不符——實際塞進去的是 `Date`，TypeScript 不會報錯；日後若有人把 `updatedAt` 當字串用（例如取前 10 碼、字串比對），就會在執行時才爆，編譯期完全沒警告。另一個極端是完全不給型別（`pool.query()` 不帶泛型），這時 `row` 是 `any`（等於關掉所有欄位與型別的檢查），等同缺乏型別。

  必要性：至少在 `query` 給一個「資料庫列」型別，編譯器才能檢查欄位有沒有打錯；把 API 形狀另外宣告，則是為了讓「給前端的契約」保持乾淨（`updatedAt` 是字串），不被驅動層的 `Date` 汙染。分開也代表兩層能各自獨立演進：以後換 ORM、或多砍 API 欄位時，各自改各自的型別，不會互相牽動。

  好處：型別誠實、邊界清楚（DB 層 vs API 層）、編譯期就能抓到欄位打錯、設計對外講得出來。成本：多一個型別要維護、看起來比較囉唆。什麼時候可以只用一個：如果資料庫的形狀跟 API 形狀完全一致（沒有 `Date`↔`string` 這類轉換），就只留一個型別即可。

- 問：把 PostgreSQL 的 `BIGINT` id 用 JavaScript 的 `number` 處理，為什麼會「無聲地」遺失精確度？根本原因是什麼？

  答：因為 JavaScript 的 `number` 不是整數型別，而是 IEEE 754 的 64 位元雙精度浮點數（用「符號 × 有效位數 × 2 的次方」來表示數字），能精確表示的整數只到 2^53（`Number.MAX_SAFE_INTEGER`＝9,007,199,254,740,991）。

  超過之後，相鄰整數之間開始出現空隙，而且空隙會隨數值變大而加倍放大（因為有效位數固定只有 53 位）。

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

  答：CORS（Cross-Origin Resource Sharing，跨來源資源共用）是瀏覽器的一道安全機制。

  瀏覽器預設只讓網頁讀「同一個來源」的資料，來源 = 通訊協定 + 網域 + 埠，三者有一個不同就算不同來源（`http://localhost:5173` 與 `http://localhost:3000` 埠不同，就是不同來源）。

  這叫同源政策，目的是防止隨便一個網頁偷讀你其他網站的資料。

  要跨來源時，做法是由伺服器在回應加上 `Access-Control-Allow-Origin` 標頭，告訴瀏覽器「我同意這個來源讀我的回應」。所以放不放行是後端決定的，前端怎麼寫都無法自己繞過 —— 這也是為什麼看到 CORS 錯誤時，要改的是後端設定而不是前端程式。

  要注意 CORS 是**瀏覽器在擋，不是伺服器在擋**：用 curl、Postman 或伺服器對伺服器呼叫都沒有這道限制，所以「前端被擋」不等於「API 沒人能打」；反過來，把 `Access-Control-Allow-Origin` 設成 `*` 等於對所有網站開放，正式環境應該用白名單。

## 2026-10-04 — assets 資料表 id 與時間欄位型別

**背景**
- 檢查 `src/migrations/001_create_assets.sql`，發現 `id` 與時間欄位的型別跟前後端契約對不上，確定方向後已直接修改該檔。
- 實作 `src/migrate.ts` 跑 migration 的流程，過程中連續修復三個 bug（見學習筆記）。

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

  答：前半正確，後半的 `GENERATED ALWAYS AS IDENTITY` 保留，前半的 `INTEGER`（整數型別，最多存到約 21 億）要換成 `BIGINT`。

  實務上新專案預設都用 `BIGINT`，不是因為會有 21 億筆，而是多佔的空間很小，可避免日後因容量不足而需更換型別的大規模異動

- 問：TIMESTAMP 跟 TIMESTAMPZ 的差別

  答：`TIMESTAMP`（不帶時區的時間，只存幾月幾號幾點，不記這是台灣時間還是 UTC 時間）以後資料庫搬家會被解讀成不同時刻。

  `TIMESTAMPTZ` 會統一轉成 UTC 存，顯示時再轉回連線時區，就沒這個問題。前端傳的本來就是結尾有 `Z` 的格式（`Z` 就是 UTC 的意思），跟 `TIMESTAMPTZ` 剛好對上

- 問：`CURRENT_TIMESTAMP` 跟 `NOW()` 的差別

  答：`NOW()` 是 PostgreSQL 常用的寫法，`CURRENT_TIMESTAMP` 是 SQL 標準（跨資料庫通用的寫法）的寫法，在 PostgreSQL 裡兩者功能完全一樣。

- 問：為什麼無論輸入什麼指令都會報錯，PostgreSQL 中的 =# 跟 -#有什麼差別

  答：這兩個是 `psql`（PostgreSQL 內附的指令列工具，用來直接下 SQL）的提示符號，看它就知道上一句有沒有打完。`=#` 是空閒（上一句已結束，可以下新指令）；`-#` 是接續（上一句少了分號，`psql` 還在等你把話講完）。

  卡在 `-#` 時新打的指令會被黏在上一句後面一起解讀，所以怎麼打都報錯。

  處理方式有兩種：把話講完（補 `;` 後按 Enter 送出），或整句不要了（按 `Ctrl + C` 取消，回到 `=#` 再重打）

- 問：為什麼用 result.rows.length 而不用原本 result.rowCount

  答：`rows`（查回來的資料陣列，`SELECT` 一定會有）跟 `rowCount`（資料庫回報受影響幾筆，`SELECT` 以外才保證有值）在 `SELECT` 是不一樣的東西。

  `pg` 的型別寫的是 `rowCount: number | null`（`|` 是或的意思：這個值可能是數字，也可能是空的），代表它允許是空的，`SELECT` 在某些情況會拿到空的，要多寫判斷。

  `migrate.ts` 只是要問「這筆 migration 跑過了沒」，`rows.length > 0` 直接計算取回的筆數，語意最為直觀，也不用處理空值的情況

- 問：schema_migrations 記錄表該由 000 這個 migration 建，還是直接寫死在 migrate.ts 裡？

  答：由 `000` 建才是對的。`migrate.ts`（跑 migration 的程式）只負責讀 `.sql` 檔、照檔名順序跑、記下誰跑過了，不該知道某張表的長相。

  建表語句放在 `000` 裡，資料庫長什麼樣子全部由 `.sql` 檔說了算，程式不用改。

  反之，若在 `migrate.ts` 裡寫死 `CREATE TABLE`，以後記錄表要加欄位，就要同時改程式跟 SQL，兩邊很容易對不上

- 問：為什麼 migration 的交易不能直接用 pool 連續下 BEGIN / COMMIT？

  答：`pool`（預先管好的一組資料庫連線，每次查詢會從裡面隨便拿一條來用）連續下四次，可能拿到四條不同的連線，開交易跟跑 SQL 不在同一條，存檔跟丟掉的指令就管不到真正跑的那條。

  正確做法是先用 `pool.connect()`（跟 pool 借一條專線）借一條出來，整組 `BEGIN` / SQL / `COMMIT`（交易成功就存檔）或 `ROLLBACK`（交易失敗就整組丟掉）都在同一條上跑完，最後用 `finally`（不管成功失敗都會跑的段落）把線還回去

- 問：為什麼 migration 一開始完全沒有寫入記錄，後來又報表不存在，最後還撞主鍵？

  答：這是連續三個 bug。

  第一個是 `migrate.ts` 的 `INSERT ... VALUES ($1)` 少傳了 `[fileName]`，`$1`（第一個參數放這裡的意思）沒給值，所以記錄從來沒寫成功過。

  第二個是 `000` 建的表名（`migrations`）跟程式查的表名（`schema_migrations`）對不上，查記錄時直接報表不存在。

  前兩者修復後，第三個問題才浮現——`000` 建完表還硬要把自己寫進記錄表，下次跑又寫一次同一個檔名，檔名是主鍵（不可重複的身分證）就撞了。中間加過 `ON CONFLICT DO NOTHING`（撞到就跳過、不報錯），但那僅是將錯誤訊息掩蓋。

  最終做法是讓 `000` 不查也不寫記錄：它的工作只有建表，`CREATE TABLE IF NOT EXISTS`（表已存在就跳過、不報錯）本來就保證重跑不會炸，不需要靠記錄表擋重複（中間 `fileName` 改 `file_name` 只是順手對齊 SQL 慣例）。

  代價是 `000` 每次都會真的跑一次、顯示 `Applied`；作為交換，其他檔案的流程得以保持簡潔

**已知限制 / 後續**
- 前端 `id` 已改成數字，對齊後端 `BIGINT`

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

  答：索引（Index）可視為資料庫的目錄：沒建的話，查一筆資料要整張表從頭翻到尾；建了之後可以直接翻目錄定位，幾百萬筆時差很多。

  但它有代價：每次寫入或更新都要順手更新目錄，所以寫入會變慢一點，也會多佔空間；而且加錯地方（例如在幾乎不查的欄位上建）等於白付代價還拖慢寫入。

  所以實務上是先不建，等真的慢了、用慢查詢紀錄找到瓶頸在哪一欄，再針對那一欄建。

- 問：慢查詢（Slow query）是什麼？跟普通查詢有什麼差別？

  答：慢查詢不是一種特別的語法，就是普通的 SQL，只是跑得太慢、超過資料庫設定的時間（例如超過 1 秒）被記下來。

  資料庫會自動把這些超時的查詢寫進一份慢查詢紀錄，後端要優化效能時就先看這份紀錄：最常出現、跑最久的那幾條，就是要修的目標，加索引通常就是加在這些查詢用到的欄位上。

  普通查詢跟慢查詢的差別只在「有沒有超時被記下來」，寫法上完全一樣

- 問：JSONB 是什麼？跟 JSON 差在哪？為什麼 `config` 要用它？

  答：JSONB（PostgreSQL 存 JSON 的二進位格式）跟 JSON 的差別是取捨：JSON 存的是原文，寫入快、但每次查詢都要重新解析；JSONB 存之前要多一道轉換所以寫入慢一點點，但查詢快很多、還能建索引。

  官方文件說預設用 JSONB，除非有特殊需求（例如要保留鍵的順序）。

  本專案 `config` 讀得多寫得少，所以用 JSONB

- 問：REST API 是什麼？常聽到的 RESTful 又是什麼意思，兩者有什麼關係？

  答：REST API 是「用網址代表東西、用 HTTP 方法代表動作」的一種寫 API 的風格，例如 `GET /assets/abc` 就是「拿 id 是 abc 的資產」。

  RESTful 是形容詞，意思是「這支 API 有照 REST 的風格寫」，所以會說「這是一支 RESTful 的 API」。本專案的 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id` 就是照這個風格設計的。

  反例：`GET /getAssetById?id=abc`（動作寫在網址裡，方法永遠只用 GET）、`POST /assets/delete`（用 POST 做刪除，動作跟方法對不上），這兩種就不算 RESTful

- 問：後端會不會像前端一樣，因為相依性被卡住而停在舊版？

  答：不會。後端套件（express / cors / dotenv / tsx）幾乎沒有對別的套件的版本要求（peerDependencies），可以各自獨立升級；不像前端的 React / three 生態，動一個就要動一串。

  版本鎖定靠 `package-lock.json`（記錄「實際裝了哪一版」），`package.json` 的 `^` / `~` 只是「允許的範圍」，lockfile 要進版控

- 問：ORM 是什麼？

  答：ORM（Object-Relational Mapping）把資料庫表格對應成程式裡的物件，不用手寫 SQL，例如 `prisma.asset.findUnique({ where: { id } })` 就等於 `SELECT ... WHERE id = ...`。

  本專案先用 `pg` 手寫 SQL，因為端點少、查詢單純，先把 SQL 基礎學扎實

- 問：既然有 ORM 這種方便的工具，為什麼上班時後端還要自己寫 SQL？改表格還要經過運維處理，是架構不同還是語言的問題？

  答：跟語言無關。複雜查詢用 ORM 寫起來彆扭、效能也要自己掌控，所以很多公司照樣手寫 SQL。

  而且就算用了 ORM，改表格這一關還是要審核——改錯一張表會影響所有用到它的服務，ORM 的自動改表是一鍵執行的，跳過了審核這一關

- 問：OpenAPI 是什麼？公司內部的實務開發會這樣處理嗎？

  答：OpenAPI 是一種寫 API 規格的標準格式，寫好後可以用 Swagger 這類工具自動產生可瀏覽的文件頁面。多數團隊公司內部沒有專門做，這是常態。

  本專案最初規劃在後續階段補這份文件（不用手刻 yaml，改用註解加工具自動產生，例如 swagger-jsdoc 加 swagger-ui-express，頁面掛在 `/docs`）。後來評估不做：唯一的呼叫端是自己的前端，README 的端點表格已足以描述契約，多一份規格只是多一份要同步的維護成本。

**已知限制 / 後續**
- 目前產品只有一筆 `id` 為 `1` 的資產，因此 Phase 3 只做 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id`；`POST` / `DELETE` / `PATCH` 等前端有多場景管理功能後再依需求補上
