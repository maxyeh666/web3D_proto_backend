// node:fs/promises是Node.js內建的檔案系統模組，提供非同步的檔案操作方法，node這邊是指內建模組
// 舊版的fs模組使用callback的方式，容易造成callback hell，
// 而fs/promises模組使用Promise的方式，搭配async/await語法，程式碼更簡潔易讀
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './db.js';
// import.meta.url是Node.js內建的模組，提供當前模組的URL，
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 取得migrations資料夾路徑
const migrationDir = path.join(__dirname, 'migrations');
// 取得所有sql檔案，並依照檔名排序，確保執行順序正確
const files = (await (fs.readdir(migrationDir))).filter((file) => file.endsWith('.sql')).sort();
// 依序執行每個sql檔案，並將檔名記錄到schema_migrations資料表中，避免重複執行
// 000 負責建 schema_migrations 自己的表，不需要查記錄也不需要寫記錄
const BOOTSTRAP_MIGRATION = '000_create_schema_migrations.sql';

for (const fileName of files) {
    const migrationPath = path.join(migrationDir, fileName);
    const sql = await fs.readFile(migrationPath, 'utf-8');

    if (fileName !== BOOTSTRAP_MIGRATION) {
        // 檢查schema_migrations資料表中是否已經有這個migration的紀錄
        const result = await pool.query('SELECT 1 FROM schema_migrations WHERE file_name = $1', [fileName]);
        if (result.rows.length > 0) {
            console.log(`Skipping migration: ${fileName}`);
            continue;
        }
    }


    // 使用pool.connect()取得一個client，並在try/catch/finally區塊中使用，確保在執行完畢後釋放連線
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        if (fileName !== BOOTSTRAP_MIGRATION) {
            await client.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [fileName]);
        }
        await client.query('COMMIT');

        console.log(`Applied migration: ${fileName}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Failed migration: ${fileName}`);
        throw error;
    } finally {
        client.release();
    }
}

console.log('Migration completed successfully.');

await pool.end();