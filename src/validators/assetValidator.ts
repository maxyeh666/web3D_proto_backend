export type ViewConfig = {
    camera: CameraConfig;
    cube: CubeConfig;
    model: ModelConfig;
}

export type CameraConfig = {
    position: [number, number, number];
    fov: number;
}

export type CubeConfig = {
    color: string;
}

export type UpdateAssetInput = {
    name: string;
    config: ViewConfig;
}

export type ModelConfig = {
    materialColorOverrides: Record<string, string>;
}

export function validateAssetId(value: string): string | null {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }

    return value;
}

export function validateUpdateAssetInput(input: unknown): UpdateAssetInput | null {
    // 檢查 input 是否為物件，且不是 null 或陣列
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;

    const data = input as Record<string, unknown>;

    if (typeof data.name !== 'string' || data.name.trim() === "" ) return null;
    if (!isAssetConfig(data.config)) return null;
    
    const config = data.config as Record<string, unknown>;
    
    return { 
        name: data.name,
        config: {
            camera: config.camera as CameraConfig,
            cube: config.cube as CubeConfig,
            model: (config.model ?? { materialColorOverrides: {} }) as ModelConfig
        }
    };
}
// 資產設定驗證
// 相容舊資料可能沒有model
function isAssetConfig(value: unknown): value is ViewConfig {
    // 檢查 data.config 是否為物件，且不是 null 或陣列
    if (typeof value !== 'object' || value === null || Array.isArray(value) ) return false;
    
    const config = value as Record<string, unknown>
    
    return (
        isCameraConfig(config.camera) &&
        isCubeConfig(config.cube)) &&
        (config.model === undefined || isModelConfig(config.model))
}
// camera設定驗證
function isCameraConfig(value: unknown): value is CameraConfig {
    if (typeof value !== 'object' || value === null || Array.isArray(value) ) return false;

    const cameraConfig = value as Record<string, unknown>

    return (
        Array.isArray(cameraConfig.position) &&
        cameraConfig.position.length == 3 &&
        cameraConfig.position.every(element => typeof element === 'number' && Number.isFinite(element) ) &&
        typeof cameraConfig.fov === 'number' &&
        Number.isFinite(cameraConfig.fov)
    )
}
// cube設定驗證
function isCubeConfig(value: unknown): value is CubeConfig {
    if (typeof value !== 'object' || value === null || Array.isArray(value) ) return false;

    const cubeConfig = value as Record<string, unknown>

    return typeof cubeConfig.color === 'string' && cubeConfig.color.trim() !== ""
}
// model設定驗證
// 顏色只接受 #rrggbb：前端唯一寫入來源是 <input type="color">，輸出固定 6 位；
// 放寬只會讓打錯的值靜默進 DB（例如 "not-a-color"），前端套色時才失敗
// key 是材質槽 id，空字串代表前端算錯，存進去只會多一筆永遠對不上的資料
function isModelConfig(value: unknown): value is ModelConfig {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

    const modelConfig = value as Record<string, unknown>;
    const overrides = modelConfig.materialColorOverrides;

    if (
        typeof overrides !== 'object' ||
        overrides === null ||
        Array.isArray(overrides)
    ) return false

    // 用 entries：values 只拿得到顏色，"#ff0000" 解構成 ["#", "f"] 會讓合法資料全被拒
    return Object.entries(overrides).every(([materialId, color]) =>
        materialId.trim() !== '' &&
        typeof color === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(color));
}
