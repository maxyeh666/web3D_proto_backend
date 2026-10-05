import { pool } from "../db.js";
import type { UpdateAssetInput } from "../validators/assetValidator.js"

// Asset: API 回傳形狀（給前端 / res.json 用）
export type Asset = {
    id: string;
    name: string;
    config: unknown;
    updatedAt: string;
}
// AssetRow: 資料庫列的實際形狀（pg 回傳的型別）
// - BIGINT      → string（pg 的安全設計，避免超出 JS number 範圍）
// - JSONB       → 已解析成 JS 物件
// - TIMESTAMPTZ → JS Date 物件（注意：不是字串）
type AssetRow = {
    id: string;
    name: string;
    config: unknown;
    updatedAt: Date;
}

// listAssets: 取得全部資產
export async function listAssets(): Promise<Asset[]> {
    const result = await pool.query<AssetRow>(`SELECT
        id, 
        name, 
        config, 
        updated_at AS "updatedAt"
        FROM assets 
        ORDER BY id ASC`);
    return result.rows.map((row) => (toAsset(row)));
}
// getAsset: 取得單一資產
export async function getAsset(id: string): Promise<Asset | null> {
    // 使用參數化查詢，避免 SQL Injection
    const result = await pool.query<AssetRow>(`SELECT
        id, 
        name, 
        config, 
        updated_at AS "updatedAt"
        FROM assets 
        WHERE id = $1`, [id]);
    // 取得第一列資料（如果有的話）
    const row = result.rows[0];
    // 如果找不到對應的資產，回傳 null
    if (!row) {
        return null;
    }

    return toAsset(row);
}
// updateAsset: 更新單一資產
export async function updateAsset(id: string, input: UpdateAssetInput): Promise<Asset | null> {
    // RETURNING 是 PostgreSQL 的一個特性，可以在 UPDATE 語句中回傳更新後的資料列
    const result = await pool.query<AssetRow>(
        `UPDATE assets SET
        name = $1,
        config = $2,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, name, config, updated_at AS "updatedAt"`, [input.name, input.config, id]);

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return toAsset(row);
}
// 共用寫入asset
function toAsset(row: AssetRow): Asset {
    return {
        id: row.id,
        name: row.name,
        config: row.config,
        updatedAt: row.updatedAt.toISOString(),
    };
}