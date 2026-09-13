import type { AlphaSurfaceResponse, CustodesStatusResponse, SpillAnalysis, SuspectCandidate } from "../../types/intelligence";
import { AlphaSurfaceHeatmap } from "./AlphaSurfaceHeatmap";
import { CustodesCard } from "./CustodesCard";

function formatUtcTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function formatScore(score: number | null): string {
    if (score === null) return "N/A";
    return String(Math.round(score * 100));
}

interface InvestigationPanelProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    suspects: SuspectCandidate[];
    suspectsLoading: boolean;
    suspectsError: boolean;
    selectedSuspectId: number | null;
    onSuspectSelect: (vesselId: number) => void;
    detectionTime: string | null;
    analysis: SpillAnalysis | null;
    onIdentifySuspects: () => void;
    identifyLoading: boolean;
    identifyError: boolean;
    identified: boolean;
    alphaSurface: AlphaSurfaceResponse | null;
    custodes: CustodesStatusResponse | null;
    winningVesselId: number | null;
}

const timelineEvents = [
    ["Spill detected", "Surface anomaly recorded for investigation.", 0],
    ["Origin estimated", "Probable origin region and time window calculated.", 18],
    ["AIS correlation", "Nearby vessel tracks correlated with the incident.", 31],
    ["Forecast generated", "Forward footprint and uncertainty envelope prepared.", 47],
    ["Suspect ranking updated", "Candidate vessel evidence scores refreshed.", 63],
] as const;

function InvestigationTimeline({ detectionTime }: { detectionTime: string | null }) {
    const start = detectionTime ? new Date(detectionTime) : null;
    return <div className="mt-4 space-y-0">{timelineEvents.map(([name, description, offset], index) => {
        const time = start && !Number.isNaN(start.getTime()) ? new Date(start.getTime() + offset * 60 * 1000).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "Time unavailable";
        const latest = index === timelineEvents.length - 1;
        return <div className="flex gap-3" key={name}><div className="flex w-4 shrink-0 flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${latest ? "border-signal bg-signal" : "border-[#9bb8c4] bg-panel/90"}`} />{index < timelineEvents.length - 1 && <span className="w-px flex-1 bg-line" />}</div><div className={`min-w-0 flex-1 border-b border-line/70 pb-4 ${index > 0 ? "pt-1" : ""}`}><div className="flex items-baseline justify-between gap-2"><p className={`text-[11px] font-semibold ${latest ? "text-signal" : "text-ink"}`}>{name}</p><span className="shrink-0 font-mono text-[9px] text-mist">{time}</span></div><p className="mt-1 text-[10px] leading-4 text-mist">{description}</p></div></div>;
    })}</div>;
}

export function InvestigationPanel({ activeTab, onTabChange, suspects, suspectsLoading, suspectsError, selectedSuspectId, onSuspectSelect, detectionTime, analysis, onIdentifySuspects, identifyLoading, identifyError, identified, alphaSurface, custodes, winningVesselId }: InvestigationPanelProps) {
    const confidence = Math.round((analysis?.detection.confidence ?? 0) * 100);
    const rows = activeTab === "Hindcast" ? [
        ["Hypothesized origin", analysis ? `${analysis.backward_hindcast.hypothesized_origin_lonlat.lon.toFixed(2)}°E ${analysis.backward_hindcast.hypothesized_origin_lonlat.lat.toFixed(2)}°N` : "Unavailable"],
        ["Time before detection", analysis ? `${analysis.backward_hindcast.hypothesized_t0_hours_before_detection.toFixed(1)} h` : "Unavailable"],
        ["Best candidate MMSI", analysis ? String(analysis.backward_hindcast.vessel_mmsi) : "Unavailable"],
        ["L shape", analysis ? analysis.backward_hindcast.L_shape.toFixed(3) : "Unavailable"],
        ["L age", analysis ? analysis.backward_hindcast.L_age.toFixed(3) : "Unavailable"],
        ["Behavioral prior", analysis ? `${(analysis.backward_hindcast.prior * 100).toFixed(1)}%` : "Unavailable"],
        ["Evidence score", analysis ? analysis.backward_hindcast.score.toFixed(3) : "Unavailable"],
        ["Estimated spill age", analysis ? `${analysis.age_estimate_hours.toFixed(1)} h` : "Unavailable"],
    ] : activeTab === "Forecast" ? [
        ["24h forecast centroid", analysis ? `${analysis.forward_forecast_centroid_lonlat.lon.toFixed(2)}°E ${analysis.forward_forecast_centroid_lonlat.lat.toFixed(2)}°N` : "Unavailable"],
    ] : [
        ["Detection time", analysis ? formatUtcTimestamp(analysis.detection.detection_timestamp) : "Unavailable"],
        ["Surface area", analysis ? `${analysis.detection.physical_area_km2.toFixed(2)} km²` : "Unavailable"],
        ["Estimated age", analysis ? `${analysis.age_estimate_hours.toFixed(1)} h` : "Unavailable"],
        ["Location", analysis ? `${analysis.detection.centroid_latlon.lon.toFixed(2)}°E ${analysis.detection.centroid_latlon.lat.toFixed(2)}°N` : "Unavailable"],
        ["Lookalike", analysis ? (analysis.detection.is_lookalike ? "Yes" : "No") : "Unavailable"],
        ["Texture signature", analysis ? `${analysis.detection.observed_texture_signature_db.toFixed(2)} dB` : "Unavailable"],
    ];
    const tabs = ["Overview", "Hindcast", "Forecast", "AIS Analysis", "Suspects", "Timeline"];
    const selectedSuspect = suspects.find((candidate) => candidate.vessel_id === selectedSuspectId);

    return <section className="w-full shrink-0 border-t border-line bg-panel/90 p-5 panel-shadow lg:border-l lg:border-t-0 lg:p-6">
        <div className="flex items-center justify-between"><p className="eyebrow text-signal">Investigation</p><span className="rounded-sm bg-panelAlt/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-signal">Open</span></div>
        <div className="mt-5 border-b border-line pb-5"><p className="font-display text-xl font-semibold text-ink">Spill MS-001</p><p className="mt-1 text-[11px] text-mist">{activeTab === "Hindcast" ? "Origin estimation view" : activeTab === "Forecast" ? "Forward projection view" : activeTab === "Suspects" ? "Candidate vessel review" : "Candidate review in progress"}</p>{activeTab !== "Suspects" && <><div className="mt-4 flex items-end justify-between"><span className="eyebrow">Confidence</span><span className="font-display text-3xl text-signal">{confidence}<span className="text-base">%</span></span></div><div className="mt-2 h-1 bg-panelAlt/60"><div className="h-full bg-signal" style={{ width: `${confidence}%` }} /></div></>}</div>
        {activeTab === "Timeline" ? <InvestigationTimeline detectionTime={detectionTime} /> : activeTab === "Suspects" ? <div className="mt-4"><div className="mb-3 flex items-center justify-between"><p className="eyebrow">Investigation priority</p><span className="font-mono text-[9px] text-mist">{suspects.length} CANDIDATES</span></div><div className="mt-3 rounded-sm border border-line bg-panelAlt/80 p-2.5">
                            <div>
                                <p className="eyebrow">CAW attribution</p>
                                <p className="mt-1 text-[9px] leading-4 text-mist">Alpha surface + Custodes meta-check</p>
                            </div>
                            <button
                                className={`mt-3 w-full rounded-sm border px-4 py-3 text-[11px] font-bold uppercase tracking-[.12em] transition-colors ${
                                    identifyLoading
                                        ? "cursor-wait border-line bg-panelAlt/80 text-mist"
                                        : identified
                                            ? "border-signal bg-panel/90 text-signal hover:bg-panelAlt/80"
                                            : "border-signal bg-signal text-white hover:bg-signalDim"
                                }`}
                                aria-label={identifyLoading ? "Identification in progress" : identified ? "Re-run CAW and Custodes identification" : "Identify suspect vessels"}
                                onClick={onIdentifySuspects}
                                disabled={identifyLoading}
                                type="button"
                            >
                                {identifyLoading ? "IDENTIFYING…" : identified ? "RE-RUN IDENTIFICATION" : "IDENTIFY SUSPECTS"}
                            </button>
                        </div>
                        {identifyLoading && <p className="mt-2 flex items-center gap-1.5 text-[9px] text-signal"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />Querying alpha surface & Custodes status…</p>}
                        {identifyError && <p className="mt-2 rounded-sm border border-ember/30 bg-panelAlt/80 px-2 py-1.5 text-[9px] leading-4 text-ember">CAW/Custodes identification is unavailable right now. Verify the Sakshi pipeline fixture and that the API is running.</p>}
                    {suspectsLoading && <p className="py-6 text-xs text-mist">Loading candidate vessel evidence…</p>}
                    {suspectsError && <p className="border border-ember/30 bg-panelAlt/80 p-3 text-xs text-ember">Candidate evidence is unavailable.</p>}
                    {!suspectsLoading && !suspectsError && suspects.length === 0 && <p className="py-6 text-xs text-mist">No candidate vessels returned.</p>}
                    {!suspectsLoading && !suspectsError && suspects.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-[9px]"><thead className="border-b border-line text-[8px] uppercase tracking-[.1em] text-mist"><tr><th className="pb-2 pr-2">Rank</th><th className="pb-2 pr-2">Candidate vessel</th><th className="pb-2 pr-2">Evidence</th><th className="pb-2">S / T / Tr</th></tr></thead><tbody>{suspects.map((candidate) => <tr className={`cursor-pointer border-b border-line/60 ${candidate.vessel_id === selectedSuspectId ? "bg-panelAlt/80" : "hover:bg-panelAlt/80"}`} key={candidate.vessel_id} onClick={() => onSuspectSelect(candidate.vessel_id)}><td className="py-2 pr-2 font-mono text-signal">#{candidate.rank}</td><td className="py-2 pr-2 font-semibold text-ink">{candidate.vessel_name}</td><td className="py-2 pr-2"><div className="flex items-center gap-2"><div className="h-1.5 w-14 bg-panelAlt/60"><div className="h-full bg-signal" style={{ width: `${candidate.overall_score * 100}%` }} /></div><span className="font-mono text-ink">{Math.round(candidate.overall_score * 100)}</span></div></td><td className="py-2 font-mono text-mist">{formatScore(candidate.spatial_score)} / {formatScore(candidate.temporal_score)} / {formatScore(candidate.trajectory_score)}</td></tr>)}</tbody></table></div>}
                    {selectedSuspect && <div className="mt-4 border-t border-line pt-3"><p className="eyebrow">Evidence score · {selectedSuspect.vessel_name}</p><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-mist"><span>Behaviour <b className="font-mono text-ink">{formatScore(selectedSuspect.behaviour_score)}</b></span><span>Historical risk <b className="font-mono text-ink">{formatScore(selectedSuspect.historical_risk_score)}</b></span></div>{selectedSuspect.reasons && <ul className="mt-3 list-disc space-y-1 pl-4 text-[10px] leading-4 text-mist">{selectedSuspect.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>}
                    {identified && custodes && alphaSurface && <div className="mt-4 space-y-3"><CustodesCard custodes={custodes} /><AlphaSurfaceHeatmap alphaSurface={alphaSurface} winningVesselId={winningVesselId} onVesselClick={onSuspectSelect} /><p className="border-t border-line/60 pt-2 text-[9px] italic leading-4 text-mist">AIS candidates are synthetic demo data; CAW/Custodes uses the validated attention checkpoint.</p></div>}
               </div>
                : <><div className="mt-5 space-y-3">{rows.map(([label, value]) => <div className="flex items-center justify-between border-b border-line/70 pb-3" key={label}><span className="text-[10px] text-mist">{label}</span><span className="text-right font-mono text-[10px] text-ink">{value}</span></div>)}</div></>}
            <div className="mt-5"><p className="eyebrow">Investigation tabs</p><div className="mt-3 grid grid-cols-2 gap-1 text-[10px]">{tabs.map((tab) => <button className={`border px-2 py-2 text-left ${activeTab === tab ? "border-signal bg-panelAlt/80 font-semibold text-signal" : "border-line text-mist hover:text-signal"}`} key={tab} onClick={() => onTabChange(tab)} type="button">{tab}</button>)}</div></div>
        </section>;
}
