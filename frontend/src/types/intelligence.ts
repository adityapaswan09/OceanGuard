import type { FeatureCollection } from "geojson";

export type Severity = "critical" | "elevated" | "watch";

export interface IncidentSummary {
    id: string;
    title: string;
    location: string;
    detectedAt: string;
    severity: Severity;
    confidence: number;
}

export interface VesselSummary {
    id: number;
    name: string;
    type: string;
    flag: string;
    score: number;
    status: "underway" | "anchored" | "unknown";
}

export interface VesselTrackPoint {
    vessel_id: number;
    timestamp: string;
    latitude: number;
    longitude: number;
    speed_knots: number;
    course_degrees: number;
}

export interface AisTrack {
    vesselId: number;
    vesselName: string;
    vesselType?: string | null;
    flag?: string | null;
    points: VesselTrackPoint[];
}

export interface SpillAnalysis {
    spill_id: number;
    status: string;
    detection: {
        polygon_latlon: [number, number][];
        centroid_latlon: { lon: number; lat: number };
        physical_area_km2: number;
        detection_timestamp: number;
        observed_texture_signature_db: number;
        is_lookalike: boolean;
        confidence: number;
    };
    backward_hindcast: {
        vessel_mmsi: number;
        hypothesized_t0_hours_before_detection: number;
        hypothesized_origin_lonlat: { lon: number; lat: number };
        L_shape: number;
        L_age: number;
        prior: number;
        score: number;
    };
    map_hypothesis?: {
        origin_lon: number;
        origin_lat: number;
        [key: string]: any;
    };
    forward_forecast_centroid_lonlat: { lon: number; lat: number };
    age_estimate_hours: number;
    // Optional new fields exported by Sakshi fixture
    forward_particle_cloud?: FeatureCollection;
    uncertainty_envelope?: FeatureCollection;
}

export interface SuspectCandidate {
    rank: number;
    vessel_id: number;
    vessel_name: string;
    overall_score: number;
    spatial_score: number | null;
    temporal_score: number | null;
    trajectory_score: number | null;
    behaviour_score: number | null;
    historical_risk_score: number | null;
    reasons: string[] | null;
}

export interface VesselAlphaItem {
    mmsi: number;
    alpha: number;
    is_injected_anomaly: boolean;
}

export interface AlphaSurfaceResponse {
    spill_id: number;
    vessel_ids: number[];
    t0_hours: number[];
    alpha: number[][];
    null_alpha: number | null;
    vessel_alpha_all?: VesselAlphaItem[];
}

export type CustodesDecision = "COMMIT" | "REFINE_GRID" | "ABSTAIN";

export interface CustodesStatusResponse {
    spill_id: number;
    decision: CustodesDecision;
    top_vessel: number | null;
    top_vessel_score: number | null;
    second_vessel: number | null;
    second_vessel_score: number | null;
    margin: number | null;
    same_vessel_top2_rows: boolean | null;
    abstain_flag: boolean | null;
    null_alpha: number | null;
}

export const CUSTODES_CHECKPOINT_PRECISION = "93.9% held-out precision";

