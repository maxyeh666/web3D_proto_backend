import "./env.js"
import express from 'express';
import cors from 'cors';
// 這裡採用js副檔名是因為在NodeNext模式下，ts檔案會被編譯成js檔案，並且使用ESM模組系統，所以要使用.js副檔名來引入模組
import { pool } from './db.js';
import assetsRouter from './routers/assets.js';
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
// 將assetsRouter掛載到/assets路徑下，這樣所有以/assets開頭的請求都會交給assetsRouter處理
app.use('/assets', assetsRouter);
// server健康度測試
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// db狀況測試
app.get('/health/db', async (req, res) => {
    const result = await pool.query('SELECT 1');
    res.json({ status: 'ok', database: result.rows[0] });
});
// 404捕手:沒有路由統一由此處裡
// 因為依序加載，順序必須在所有路由之後，errorHandler之前
app.use((req, res, next) => {
    next(new AppError(ErrorCode.ROUTE_NOT_FOUND))
})
// error handling middleware，放在所有路由之後
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})