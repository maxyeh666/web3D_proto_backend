import { ErrorCode } from "./errorCode.js";
import { errorDefinition } from "./errorDefinition.js";
// AppError: 只帶 ErrorCode，實際訊息與狀態碼統一查 errorDefinition
export class AppError extends Error {
    constructor(
        readonly errorCode: ErrorCode
    ) {
        const definition = errorDefinition[errorCode]
        // 繼承Error傳入message
        super(definition.message)

        this.name = 'AppError'
    }
}