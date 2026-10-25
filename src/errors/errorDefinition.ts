import { ErrorCode } from "./errorCode.js"

type ErrorDefinition = {
    statusCode: number;
    message: string;
}
// 統一管理錯誤/狀態碼/回復訊息
export const errorDefinition: Record<ErrorCode, ErrorDefinition> = {
    [ErrorCode.INVALID_REQUEST_BODY]: {
        statusCode: 400,
        message: "Invalid JSON body"
    },
    [ErrorCode.UNAUTHORIZED]: {
        statusCode: 401,
        message: "Authorization required"
    },
    [ErrorCode.INVALID_CREDENTIALS]: {
        statusCode: 401,
        message: "Invalid credentials"
    },
    [ErrorCode.INVALID_ASSET_ID]: {
        statusCode: 400,
        message: "Invalid asset ID"
    },
    [ErrorCode.FORBIDDEN]: {
        statusCode: 403,
        message: "Forbidden"
    },
    [ErrorCode.ASSET_NOT_FOUND]: {
        statusCode: 404,
        message: "Asset not found"
    },
    [ErrorCode.ROUTE_NOT_FOUND]: {
        statusCode: 404,
        message: "Route not found"
    },
    [ErrorCode.MODEL_NOT_FOUND]: {
        statusCode: 404,
        message: "Model not found"
    },
    [ErrorCode.INTERNAL_SERVER_ERROR]: {
        statusCode: 500,
        message: "Internal server error"
    }
}