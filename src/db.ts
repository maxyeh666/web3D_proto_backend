// 預先管理一組PostgreSQL連線做為pool，避免每次查詢都要重新建立連線
import './env.js'
import { Pool } from "pg";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});