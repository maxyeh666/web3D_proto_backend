import { Router } from "express";
import { validateLoginInput } from "../validators/authValidator.js";
import { login } from "../services/authService.js";
import { AppError } from "../errors/error.js";
import { ErrorCode } from "../errors/errorCode.js";

const router = Router();

router.post("/login", async (req, res) => {
    const input = validateLoginInput(req.body);

    if (!input) throw new AppError(ErrorCode.INVALID_REQUEST_BODY);
    // login service回傳token
    const token = login(input.password)

    res.status(200).json({ token })
});

export default router;