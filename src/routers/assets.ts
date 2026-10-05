import { Router } from "express";
import { listAssets, getAsset, updateAsset } from "../services/assetService.js";
import { validateAssetId, validateUpdateAssetInput } from "../validators/assetValidator.js";

const router = Router();

// GET /assets: 回傳全部資產（陣列）
router.get("/", async (_req, res) => {
    const assets = await listAssets();
    res.json(assets);
});

router.get("/:id", async (req, res) => {
    const id = validateAssetId(req.params.id);
    // 如果驗證失敗，回傳 400 Bad Request
    if (!id) {
        res.status(400).json({ error: "Invalid asset ID" });
        return;
    }
    const asset = await getAsset(id);
    // 如果找不到對應的資產(對應null)，回傳 404 Not Found
    if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
    }
    
    res.json(asset);
});

router.put("/:id", async (req, res) => {
    const id = validateAssetId(req.params.id);
    // 如果驗證失敗，回傳 400 Bad Request
    if (!id) {
        res.status(400).json({ error: "Invalid asset ID" });
        return;
    }

    const input = validateUpdateAssetInput(req.body)

    if (input === null) {
        res.status(400).json({ error: "Invalid request body" });
        return;
    }

    const asset = await updateAsset(id, input);
    // 如果找不到對應的資產(對應null)，回傳 404 Not Found
    if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
    }

    res.json(asset);
})

export default router;