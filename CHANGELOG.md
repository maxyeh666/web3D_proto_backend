# Changelog

開發日誌：依日期記錄後端各階段的變更與設計決策。每則包含背景（為何做）、變更（做了什麼）、設計決策（為何這樣做）、已知限制 / 後續。學習筆記另外放在 [LEARNING.md](./LEARNING.md)。

## 2026-10-25 — 模型端點 GET /models/:modelKey

**背景**
- 前端 Phase 3 要顯示真實 glTF 模型，模型檔需要一個穩定出處；資產只存 `modelKey`，不存絕對 URL。
- 需求很具體：只允許已知模型、標頭正確（瀏覽器認得 `model/gltf-binary`）、找不到時給 404 而不是 500。

**變更**
- 新增 `src/routers/models.ts`：`MODEL_FIELDS` 白名單查表把 `modelKey` 對到檔名，再用 `res.sendFile(filePath, { maxAge: 3_600_000 })` 回傳；`src/index.ts` 把路由掛到 `/models`。
- `MODEL_FIELDS` 目前只有一筆：`materials-variants-shoe` → `MaterialsVariantsShoe.glb`。
- `sendFile` 找不到檔案是 `ENOENT`（預設會變成 500），在 callback 轉成 `MODEL_NOT_FOUND` 404；目錄用 `path.resolve(process.cwd(), "models")`。
- `src/errors/errorCode.ts` + `errorDefinition.ts` 新增 `MODEL_NOT_FOUND` → 404；`src/errorHandler.ts` 加 `res.headersSent` 保護（標頭已送出時不再碰狀態碼）。
- 模型檔：`models/MaterialsVariantsShoe.glb`（約 7.8MB，KHR_materials_variants 範例），授權標註見 `models/ATTRIBUTION.md`。

**設計決策**
- 不用 `express.static`，改白名單路由：`express.static` 會把目錄整個暴露出去（任意檔名、目錄穿越都要另外擋），白名單查表反過來寫——只認登記過的 key，其他一律 404。
- `modelKey` 與檔名解耦：前端只認 `modelKey`，換檔案（優化版 glb、不同解析度）不用改前端；`MODEL_FIELDS` 裡多加一行就是多一個模型。
- 標頭交給 `send` 在 `fs.stat` 成功後設：不要自己先 `res.type()` / `res.set()`，否則 404 的 JSON 會拿到 glTF 的 `Content-Type` 還被長快取污染；`send` 只在尚未設定時補 `Cache-Control`。
- `typeof fileName !== "string"` 擋掉原型鏈上的名稱：`/models/constructor` 會查到 `Object` 建構子，不擋就會被當成合法檔名。

**學習筆記**
4 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-25 段。

**已知限制 / 後續**
- `models/` 用 `process.cwd()` 解析：部署時工作目錄必須是後端根目錄（Render 用 `npm run start` 啟動，符合這個假設）；換啟動方式時要檢查。
- `modelKey` 只認 `MODEL_FIELDS` 登記的值：新增模型要改程式；模型變多時改由 DB 查表（與 `assets.model_key` 對齊）。
- Render 從 git 拉程式碼才有檔案：`models/*.glb` 必須 commit 進 repo（約 7.8MB），否則正式環境 `/models/...` 全部 404。
- Render smoke test 待跑：`/models/materials-variants-shoe` 應 200、未登記的 key 與 `/models/constructor` 應 404。


## 2026-10-24 — API 存取紀錄中介層

**背景**
- 部署到 Render 後，出問題時只能靠猜；前端回報「存不進去」時，無法分辨是請求沒打到後端，還是打到了但被 401 擋下。
- 需要最小成本的請求紀錄：方法、路徑、狀態碼、耗時。

**變更**
- `src/index.ts`：新增 API log 中介層，註冊在 `express.json()` 之後、路由之前；以 `res.on('finish')` 在回應結束時輸出 `[API] <method> <path> <status> <duration>ms`，並在尾端呼叫 `next()` 讓請求繼續往下走
- `src/middlewares/requireAdmin.ts`：`console.error` 由樣板字串改為逗號分隔參數，保留錯誤的 stack（出錯位置與呼叫路徑）

**設計決策**
- 用 `res.on('finish')` 而非在路由內印：`finish` 在回應送出後觸發，拿得到最終狀態碼；404 / 500 等錯誤路徑也會被記錄，寫在路由內會漏掉沒匹配到路由的請求
- 寫成中介層（請求進來前先經過的檢查站）而不是每條路由各印一次：新增路由不需要補程式，格式也一致
- 註冊在 `express.json()` 之後、路由之前：太前面拿不到已解析的請求，太後面則晚於路由執行
- 用 `console.log` 不引入 winston / pino：單一 process、Render 直接收 stdout，現在沒有結構化查詢或分級需求
- 不記錄 request body：登入請求含密碼，記 body 等於把密碼寫進 log
- `console.error` 用逗號分隔參數：樣板字串只留下第一行訊息，會丟掉 stack

**已知限制 / 後續**
- log 沒有 request id，無法把同一請求的多行訊息串起來；目前也沒有遮蔽機制（刻意只記 method / path / status，不記 body）
- 中介層漏掉 `next()` 會讓請求停在該階段不再往下（本次已補上）
- 冷啟動的實際耗時仍待量測（見 README Phase 5）


## 2026-10-23 — 管理者登入、寫入保護與 model_key

**背景**
- `PUT /assets/:id` 要加上 `requireAdmin`（驗證管理者身分的中介層），只有帶管理者 token（令牌：登入後拿到的通行證）才能改資料。
- 加上之後 `npm run typecheck` 報 `ts(2345)`：`req.params.id` 變成 `string | string[]`，傳不進只收 `string` 的 `validateAssetId`。
- Viewer 之後會開放更新資產，但不能讓任何人改：需要一個管理者登入，寫入時驗身份。只做登入與守衛，不做帳號管理（使用者只有管理者一位）。
- 同時把 `model_key` 落地：DB 之後要存「對應哪個模型」的 key，Phase 3 的種子資料與 API 先對齊。

**變更**
- 登入：`src/routers/auth.ts` 新增 `POST /auth/login`；`src/services/authService.ts` 以 `timingSafeEqual` 比對 `ADMIN_PASSWORD`，簽發 15 分鐘有效的 JWT（`src/constants/jwt.ts`，`HS256`）；`src/validators/authValidator.ts` 驗請求內容；掛載為 `app.use('/auth', authRouter)`。錯誤碼新增 `INVALID_CREDENTIALS`（401）
- 寫入保護：`src/middlewares/requireAdmin.ts`（驗 `Authorization: Bearer <token>` 並限 `role === "admin"`）；`PUT /:id` 改為 `router.put<{ id: string }>("/:id", requireAdmin, async (req, res) => ...)`，在 `put` 上手動指定參數形狀；`requireAdmin` 本體不動。錯誤碼新增 `UNAUTHORIZED`（401）/ `FORBIDDEN`（403）
- `model_key`：migration `003_add_model_key`（`IF NOT EXISTS`）加欄位、`004_back_fill_model_key` 回填既有資料為 `default-cube` 並設為非空；`src/services/assetService.ts` 的 `Asset` / `AssetRow` 新增 `modelKey`（SELECT 與 RETURNING 以 `model_key AS "modelKey"` 帶出）
- 依賴：`package.json` 新增 `jsonwebtoken` + `@types/jsonwebtoken`

**設計決策**
- `requireAdmin` 維持 `RequestHandler` 預設的最寬型別：它是共用的檢查站，之後要能掛在沒有 `id`、或參數叫別的名字的路由上；為了一條 `/:id` 把它改窄，會跟其他路由對不上。
- 精準型別標在 `put` 上：型別檔的註解寫明這個泛型（角括號 `<...>`：呼叫時順手指定的型別）就是設計來手動指定的，寫成 `router.put<{ id: string }>` 讓整條路由共用同一個參數形狀；目前只有這條路由用 `id`，且 `requireAdmin` 用預設最寬型別仍能通過檢查。若日後 `requireAdmin` 要掛到參數形狀不同的路由，再改為只在需要的 `req` 上標（例如 `req: Request<{ id: string }>`），讓窄的只留在那一條。
- 密碼比對用 `timingSafeEqual` 並先比長度：避免回應時間洩漏密碼對錯的線索，長度不同時直接拒絕、不呼叫比對函式（`timingSafeEqual` 本身要求兩邊等長，否則會丟錯）
- token 只放 `role`、15 分鐘有效：原型階段不需要記住誰登入，只要分辨「是不是管理者」；短期有效降低 token 外流後的影響；不做 refresh（重新整理機制），明天前端登入流程會處理過期（打 API 回 401 就請使用者重新登入）

**學習筆記**
1 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-23 段。
**已知限制 / 後續**
- 前端尚未帶 `Authorization`：`PUT` 已上鎖，前端登入流程明天處理；屆時 Save 需帶 `Authorization: Bearer <token>`，401 時提示重新登入
- 登入是管理者單一密碼，沒有帳號管理；要多使用者時需另設計 users 表與密碼雜湊

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
11 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-21 段。
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
2 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-07 段。
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
1 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-06 段。
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
4 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-05 段。
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
8 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-04 段。
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
8 則，見 [LEARNING.md](./LEARNING.md) 的 2026-10-03 段。
**已知限制 / 後續**
- 目前產品只有一筆 `id` 為 `1` 的資產，因此 Phase 3 只做 `GET /assets`、`GET /assets/:id`、`PUT /assets/:id`；`POST` / `DELETE` / `PATCH` 等前端有多場景管理功能後再依需求補上
