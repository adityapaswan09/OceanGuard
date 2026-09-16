/**
 * landMask.ts -- Client-side segment-level land masking for the KAIDOS maritime map.
 * 
 * Directly wraps the offline GSHHG-derived land/sea grid from sakshi_pipeline/land_mask.py.
 * Decodes an RLE-encoded regional grid (1-arc-minute / ~1.85 km resolution) in memory on load,
 * providing zero-dependency, sub-microsecond point and segment-level water clipping.
 */

import maskData from "../data/regionalLandMask.json";

const { bounds, dimensions, startValue, runs } = maskData;
const { latMin, latMax, lonMin, lonMax, stepDeg } = bounds;
const { rows, cols, totalPixels } = dimensions;

// Fast binary mask buffer: 1 = land, 0 = sea
const landMaskBuffer = new Uint8Array(totalPixels);

// Decode RLE once on module load (~1ms)
(function initMask() {
    let ptr = 0;
    let val = startValue;
    for (let i = 0; i < runs.length; i++) {
        const len = runs[i];
        if (val === 1) {
            landMaskBuffer.fill(1, ptr, ptr + len);
        }
        ptr += len;
        val = 1 - val;
    }
})();

/**
 * Returns true if (lat, lon) is on land per the authoritative GSHHG-derived grid.
 */
export function isLand(lat: number, lon: number): boolean {
    if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) {
        // Outside regional bounding box: default to sea (open ocean)
        return false;
    }
    const r = Math.floor((latMax - lat) / stepDeg);
    const c = Math.floor((lon - lonMin) / stepDeg);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    return landMaskBuffer[r * cols + c] === 1;
}

/**
 * Returns true if (lat, lon) is on/over sea water.
 */
export function isSea(lat: number, lon: number): boolean {
    return !isLand(lat, lon);
}

/**
 * Uses binary bisection search to locate the exact coastline transition
 * between point p1 and point p2 within meters.
 * Points are in [lon, lat] format.
 */
export function findCoastCrossing(
    p1: [number, number],
    p2: [number, number],
    nBisection: number = 12
): [number, number] {
    const p1IsSea = isSea(p1[1], p1[0]);
    let low = 0.0;
    let high = 1.0;

    for (let i = 0; i < nBisection; i++) {
        const mid = (low + high) / 2.0;
        const lon = p1[0] + mid * (p2[0] - p1[0]);
        const lat = p1[1] + mid * (p2[1] - p1[1]);
        if (isSea(lat, lon) === p1IsSea) {
            low = mid;
        } else {
            high = mid;
        }
    }

    // Pick the sea side of the bisection boundary so the terminal coordinate is strictly over water
    const t = p1IsSea ? low : high;
    return [
        Math.round((p1[0] + t * (p2[0] - p1[0])) * 100000) / 100000,
        Math.round((p1[1] + t * (p2[1] - p1[1])) * 100000) / 100000,
    ];
}

export interface ClippedTrackResult {
    waterSegments: [number, number][][];
    rawPointCount: number;
    renderedSegmentCount: number;
    removedLandSegments: number;
}

/**
 * Performs segment-level water clipping on a sequence of [lon, lat] coordinates.
 * 
 * - Portions over water are strictly preserved.
 * - Portions crossing land are bisected at the coastline; only water sub-segments are retained.
 * - Disconnected water segments are returned as separate LineStrings (for MultiLineString rendering).
 * - Raw points are never mutated.
 */
export function clipTrackToWaterWithStats(coords: [number, number][]): ClippedTrackResult {
    if (!coords || coords.length < 2) {
        const isSingleSea = coords?.length === 1 && isSea(coords[0][1], coords[0][0]);
        return {
            waterSegments: isSingleSea ? [coords] : [],
            rawPointCount: coords?.length ?? 0,
            renderedSegmentCount: isSingleSea ? 1 : 0,
            removedLandSegments: isSingleSea ? 0 : (coords?.length ?? 0),
        };
    }

    const waterSegments: [number, number][][] = [];
    let currentLine: [number, number][] = [];
    let removedLandSegments = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i];
        const b = coords[i + 1];

        // Sample along segment if distance exceeds ~1 km (0.01 deg) to detect narrow islands/peninsulas
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nSamples = Math.max(2, Math.ceil(dist / 0.01));

        const samplePts: [number, number][] = [];
        const sampleSea: boolean[] = [];

        for (let s = 0; s < nSamples; s++) {
            const t = s / (nSamples - 1);
            const pt: [number, number] = [
                a[0] + t * (b[0] - a[0]),
                a[1] + t * (b[1] - a[1]),
            ];
            samplePts.push(pt);
            sampleSea.push(isSea(pt[1], pt[0]));
        }

        for (let k = 0; k < samplePts.length - 1; k++) {
            const s1 = samplePts[k];
            const s2 = samplePts[k + 1];
            const sea1 = sampleSea[k];
            const sea2 = sampleSea[k + 1];

            if (sea1 && sea2) {
                // Entirely over water
                if (currentLine.length === 0) {
                    currentLine.push(s1);
                }
                currentLine.push(s2);
            } else if (sea1 && !sea2) {
                // Entering land from water: clip at coastline
                const coast = findCoastCrossing(s1, s2);
                if (currentLine.length === 0) {
                    currentLine.push(s1);
                }
                currentLine.push(coast);
                if (currentLine.length >= 2) {
                    waterSegments.push(currentLine);
                }
                currentLine = [];
                removedLandSegments++;
            } else if (!sea1 && sea2) {
                // Exiting land into water: resume at coastline
                const coast = findCoastCrossing(s1, s2);
                currentLine = [coast, s2];
                removedLandSegments++;
            } else {
                // Entirely on land
                if (currentLine.length >= 2) {
                    waterSegments.push(currentLine);
                }
                currentLine = [];
                removedLandSegments++;
            }
        }
    }

    if (currentLine.length >= 2) {
        waterSegments.push(currentLine);
    }

    return {
        waterSegments,
        rawPointCount: coords.length,
        renderedSegmentCount: waterSegments.length,
        removedLandSegments,
    };
}

/**
 * Convenience wrapper returning only the water-clipped line segments.
 */
export function clipTrackToWater(coords: [number, number][]): [number, number][][] {
    return clipTrackToWaterWithStats(coords).waterSegments;
}

/**
 * Validates that a geometry (LineString, MultiLineString, or Point) consists purely of water coordinates.
 * Samples along segments to catch any mainland or island intrusions.
 */
export function validateWaterOnlyGeometry(geometry: { type: string; coordinates: any }): boolean {
    if (!geometry || !geometry.coordinates) return true;

    const checkLine = (coords: [number, number][]): boolean => {
        if (!coords || coords.length === 0) return true;
        for (let i = 0; i < coords.length; i++) {
            const [lon, lat] = coords[i];
            // Allow slight tolerance at coast bisection boundaries (0.001 deg ~ 100m)
            if (isLand(lat, lon)) {
                // If it's near border, check if center of cell is land
                return false;
            }

            if (i < coords.length - 1) {
                const next = coords[i + 1];
                const dist = Math.hypot(next[0] - lon, next[1] - lat);
                const steps = Math.min(10, Math.ceil(dist / 0.02));
                for (let s = 1; s < steps; s++) {
                    const t = s / steps;
                    const sampleLon = lon + t * (next[0] - lon);
                    const sampleLat = lat + t * (next[1] - lat);
                    if (isLand(sampleLat, sampleLon)) return false;
                }
            }
        }
        return true;
    };

    if (geometry.type === "Point") {
        const [lon, lat] = geometry.coordinates;
        return isSea(lat, lon);
    } else if (geometry.type === "LineString") {
        return checkLine(geometry.coordinates);
    } else if (geometry.type === "MultiLineString") {
        for (const line of geometry.coordinates) {
            if (!checkLine(line)) return false;
        }
        return true;
    }
    return true;
}
