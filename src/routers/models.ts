import { Router } from "express";
import path from "node:path";
import { AppError } from "../errors/error.js";
import { ErrorCode } from "../errors/errorCode.js";

const router = Router();

// 模型清單：key 是給前端的合約，檔名可以換；新增模型只改這張表，不改路由
// 注意 modelKey 不等於 file name
const MODEL_FIELDS: Record<string, string> = {
    "materials-variants-shoe": "MaterialsVariantsShoe.glb"
}

// 取得模型目錄-> /models
const modelDirectory = path.resolve(process.cwd(), "models")

router.get("/:modelKey", (req, res, next) => {
    const modelKey = String(req.params.modelKey);
    const fileName = MODEL_FIELDS[modelKey];
    // 用 typeof 擋掉 Object.prototype 上的名稱（例如 /models/constructor 會查到 Object 建構子），
    // 未登記的 modelKey 一律回 404
    if (typeof fileName !== "string") throw new AppError(ErrorCode.MODEL_NOT_FOUND);

    const filePath = path.resolve(modelDirectory, fileName);

    // 快取與 MIME 交給 send：它在檔案確定存在後才設標頭
    // max-age 過期後，瀏覽器再靠 Last-Modified / ETag 做條件請求（304 不重傳）
    // 成功 → Content-Type: model/gltf-binary（由 .glb 副檔名查表）、Cache-Control: public, max-age=3600
    // 失敗 → 兩個標頭都不會出現，錯誤 JSON 才拿得到 application/json
    res.sendFile(filePath, { maxAge: 3_600_000 }, (error) => {
        if (!error) return;

        // sendFile 找不到檔案時是 ENOENT（預設會變成 500），這裡轉成 404
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            console.error(`[models] model file not found: ${filePath}`);
            return next(new AppError(ErrorCode.MODEL_NOT_FOUND));
        }

        next(error);
    })
})

export default router;