import dotenv from 'dotenv';

// 將.env設定加入process.env，這樣就可以在程式中使用process.env.VARIABLE_NAME來取得設定值
dotenv.config();

// 少了 DATABASE_URL，pg 會退回 localhost 並用作業系統的使用者名稱連線，
// 錯誤會變成「密碼錯誤 / 資料庫不存在」，看起來像資料庫壞了而不是設定漏了，所以在啟動時先擋
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}
