// 預先管理一組PostgreSQL連線做為pool，避免每次查詢都要重新建立連線
import './env.js'
import { Pool } from "pg";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // 限制單一 process 的連線數（pg 預設 10）；開多個實例時要一起算，總數不能超過資料庫的 max_connections
    max: 5,
    // 閒置超過 30 秒就回收（pg 預設 10 秒）
    idleTimeoutMillis: 30_000,
    // 排隊等連線最多等 15 秒（pg 預設不限），避免請求無限等待
    connectionTimeoutMillis: 15_000,
    // 單一 SQL 最多執行 5 秒（pg 預設不限），避免卡住的查詢拖垮健康檢查與 API
    statement_timeout: 5_000
});

// 閒置連線出錯時，pg-pool 會先移除該連線再發出 error；
// 沒有這個 listener，error 會變成未捕捉例外，整個 process 直接結束
pool.on("error", (error) => {
    // 直接印 error 物件，才看得到 stack 與 pg 附帶的欄位（severity、detail…）
    console.error('[db] Unexpected idle client error', error);
});
