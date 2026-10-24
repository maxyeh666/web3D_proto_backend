import "./env.js"
import express from 'express';
import cors from 'cors';
// 這裡採用js副檔名是因為在NodeNext模式下，ts檔案會被編譯成js檔案，並且使用ESM模組系統，所以要使用.js副檔名來引入模組
import { pool } from './db.js';
import assetsRouter from './routers/assets.js';
import authRouter from './routers/auth.js';
import { errorHandler } from "./errorHandler.js";
import { AppError } from "./errors/error.js";
import { ErrorCode } from "./errors/errorCode.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 注意順序，middleware會按照註冊順序執行，要留意依賴性問題
// CORS：只允許 CORS_ORIGIN 清單內的來源；未設定則不限來源
// 判斷的取捨與細節見 CHANGELOG 2026-10-05「設計決策」
app.use(cors({
    origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
        : undefined
}));
// 讓express解析request body為JSON格式
app.use(express.json());
// API log
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        console.log(`[API] ${req.method} ${req.originalUrl} ${req.statusCode} ${Date.now() - start}ms`)
    })

    next();
})
// 將assetsRouter掛載到/assets路徑下，這樣所有以/assets開頭的請求都會交給assetsRouter處理
app.use('/assets', assetsRouter);
// 將authRouter掛載到/auth路徑下，這樣所有以/auth開頭的請求都會交給authRouter處理
app.use('/auth', authRouter);
// server健康度測試
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// db狀況測試
// Express 5 會自動接住 async handler 的 reject 並交給 errorHandler，不需要自己 try/catch
app.get('/health/db', async (_req, res) => {
    const startAt = Date.now();
    const result = await pool.query('SELECT 1');

    res.json({
        status: 'ok',
        database: { connected: true },
        durationMs: Date.now() - startAt
    });
});
// 404捕手:沒有路由統一由此處裡
// 因為依序加載，順序必須在所有路由之後，errorHandler之前
app.use((req, res, next) => {
    next(new AppError(ErrorCode.ROUTE_NOT_FOUND))
})
// error handling middleware，放在所有路由之後
app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
// 收到終止訊號時先停止接受新請求，再關閉資料庫連線（Render 重新部署時會送 SIGTERM）
let isShuttingDown = false;

function shutdown() {
    // 平台或使用者可能重送訊號（例如連按兩次 Ctrl+C），只跑一次避免重複關閉
    if (isShuttingDown) return;
    isShuttingDown = true;

    // 保險：若還有請求卡住，10 秒後強制結束，不要讓平台直接砍掉
    setTimeout(() => {
        console.error('[shutdown] Forced exit after 10s: server or pool did not close in time');
        process.exit(1);
    }, 10_000).unref();

    // 先關閒置的 keep-alive 連線，server.close() 才會立刻回呼（Node 18 不會自動關）
    server.closeIdleConnections();

    // 先停止接受新請求，再關資料庫連線
    server.close(() => {
        pool.end()
            .catch((error) => console.error('[shutdown] Failed to close database pool', error))
            .finally(() => process.exit(0));
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
