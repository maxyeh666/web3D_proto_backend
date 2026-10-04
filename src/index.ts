import "./env.js"
import express from 'express';
import cors from 'cors';
// 這裡採用js副檔名是因為在NodeNext模式下，ts檔案會被編譯成js檔案，並且使用ESM模組系統，所以要使用.js副檔名來引入模組
import { pool } from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 注意順序，middleware會按照註冊順序執行，要留意依賴性問題
// 允許跨域請求
app.use(cors({
    origin: process.env.CORS_ORIGIN
}));
// 讓express解析request body為JSON格式
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/health/db', async (req, res) => {
    const result = await pool.query('SELECT 1');
    res.json({ status: 'ok', database: result.rows[0] });
});

// error handling middleware，放在所有路由之後
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})