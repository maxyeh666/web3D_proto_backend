import { Router } from "express";
import { listAssets, getAsset, updateAsset } from "../services/assetService.js";
import { validateAssetId, validateUpdateAssetInput } from "../validators/assetValidator.js";
import { AppError } from "../errors/error.js";
import { ErrorCode } from "../errors/errorCode.js";

const router = Router();

// GET /assets: 回傳全部資產（陣列）
router.get("/", async (_req, res) => {
    const assets = await listAssets();
    res.json(assets);
});

router.get("/:id", async (req, res) => {
    const id = validateAssetId(req.params.id);

    if (!id) throw new AppError(ErrorCode.INVALID_ASSET_ID)

    const asset = await getAsset(id);
    
    res.json(asset);
});

router.put("/:id", async (req, res) => {
    const id = validateAssetId(req.params.id);

    if (!id) throw new AppError(ErrorCode.INVALID_ASSET_ID)

    const input = validateUpdateAssetInput(req.body)

    if (input === null) throw new AppError(ErrorCode.INVALID_REQUEST_BODY)

    const asset = await updateAsset(id, input);

    res.json(asset);
})

export default router;