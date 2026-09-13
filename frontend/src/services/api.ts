import type { AlphaSurfaceResponse, CustodesStatusResponse } from "../types/intelligence";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function getAlphaSurface(spillId: number | string): Promise<AlphaSurfaceResponse> {
    const response = await fetch(`${API_BASE_URL}/spills/${spillId}/alpha-surface`);
    if (!response.ok) {
        throw new Error(`Failed to fetch alpha surface for spill ${spillId}: ${response.status}`);
    }
    return response.json() as Promise<AlphaSurfaceResponse>;
}

export async function getCustodesStatus(spillId: number | string): Promise<CustodesStatusResponse> {
    const response = await fetch(`${API_BASE_URL}/spills/${spillId}/custodes-status`);
    if (!response.ok) {
        throw new Error(`Failed to fetch Custodes status for spill ${spillId}: ${response.status}`);
    }
    return response.json() as Promise<CustodesStatusResponse>;
}

export { API_BASE_URL };

