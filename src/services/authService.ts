import { AppError } from "../errors/error.js";
import { ErrorCode } from "../errors/errorCode.js";
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken"
import { JWT_ALGORITHM, TOKEN_EXPIRES_IN } from "../constants/jwt.js";

export function login(password: string): string {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;
    // 沒有設定管理者密碼或是JWT
    if (!adminPassword || !jwtSecret) throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR);
    // timingSafeEqual需要轉換為Buffer
    const inputBuffer = Buffer.from(password, "utf8")
    const expectedBuffer = Buffer.from(adminPassword, "utf8")
    // 密碼比對，使用timingSafeEqual讓比對不會提前結束，消除時間差異，提升透過回應時間推測密碼的安全性
    const passwordMatches = inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);

    if (!passwordMatches) throw new AppError(ErrorCode.INVALID_CREDENTIALS)
    // 簽發token -> 管理者角色 15分鐘後過期
    return jwt.sign(
        { role: "admin" },
        jwtSecret,
        {
            algorithm: JWT_ALGORITHM,
            expiresIn: TOKEN_EXPIRES_IN
        }
    )
};