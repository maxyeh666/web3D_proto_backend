import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { AppError } from "../errors/error.js";
import { ErrorCode } from "../errors/errorCode.js";
import { JWT_ALGORITHM } from "../constants/jwt.js";

export const requireAdmin: RequestHandler = (req, _res, next) => {
    const authorization = req.headers.authorization;
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR);
    if (!authorization?.startsWith("Bearer ")) throw new AppError(ErrorCode.UNAUTHORIZED);

    const token = authorization.slice("Bearer ".length);

    if (!token) throw new AppError(ErrorCode.UNAUTHORIZED);

    let payload: string | jwt.JwtPayload;
    try {
        payload = jwt.verify(token, jwtSecret, { algorithms: [JWT_ALGORITHM] })
    } catch (error) {
        console.error("[auth] Auth error", error)
        throw new AppError(ErrorCode.UNAUTHORIZED)
    }

    if (
        typeof payload !== "object" ||
        payload === null ||
        payload.role !== "admin"
    ) {
        throw new AppError(ErrorCode.FORBIDDEN)
    }

    next()
}