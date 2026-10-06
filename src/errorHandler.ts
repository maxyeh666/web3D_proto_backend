import { Request, Response, NextFunction } from "express";
import { AppError } from './errors/error.js'
import { ErrorCode } from "./errors/errorCode.js";
import { errorDefinition } from "./errors/errorDefinition.js";

export function errorHandler (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) {
    // 無法解析json時回400避免造成誤解為server有問題
    if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
        const definition = errorDefinition[ErrorCode.INVALID_REQUEST_BODY]
        return res.status(definition.statusCode).json({ 
            error: {
                code: ErrorCode.INVALID_REQUEST_BODY,
                message: definition.message
            }
        })
    }
    // 回傳定義的Error
    if (err instanceof AppError) {
        const definition = errorDefinition[err.errorCode]
        return res.status(definition.statusCode).json({
            error: {
                code: err.errorCode,
                message: err.message
            }
        })
    }

    console.error(err)

    // 其餘未定義錯誤統一回傳500
    const definition = errorDefinition[ErrorCode.INTERNAL_SERVER_ERROR]

    res.status(definition.statusCode).json({
        error: {
            code: ErrorCode.INTERNAL_SERVER_ERROR,
            message: definition.message
        }
    });
}