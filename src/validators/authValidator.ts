export interface LoginInput {
    password: string
}

export function validateLoginInput (
    input: unknown
): LoginInput | null {
    // 分段處裡，先確認input型別 -> 確認input內容
    if (input === null || typeof input !== "object") return null
    if (!("password" in input) || typeof input.password !== "string" || input.password.length === 0) return null

    return {
        password: input.password
    }
}