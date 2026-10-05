export type ViewConfig = {
    camera: CameraConfig;
    cube: CubeConfig;
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
    
    return { 
        name: data.name,
        config: data.config
    };
}
// 資產設定驗證
function isAssetConfig(value: unknown): value is ViewConfig {
    // 檢查 data.config 是否為物件，且不是 null 或陣列
    if (typeof value !== 'object' || value === null || Array.isArray(value) ) return false;
    
    const config = value as Record<string, unknown>
    
    return (isCameraConfig(config.camera) && isCubeConfig(config.cube))
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