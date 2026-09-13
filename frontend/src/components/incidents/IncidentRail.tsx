import type { SpillAnalysis } from "../../types/intelligence";

const historicalIncident = { id: "MS-000", title: "Historical review", location: "Gulf of Oman · 59.18°E 24.4°N", time: "04 Sep 2026 · 19:40 UTC", confidence: 68 };

type Incident = { id: string; title: string; location: string; time: string; confidence: number | null };

export function IncidentRail({ analysis }: { analysis: SpillAnalysis | null }) {
    const incidents: Incident[] = analysis ? [
        {
            id: "MS-001",
            title: "Surface anomaly",
            location: `Arabian Sea · ${analysis.detection.centroid_latlon.lon.toFixed(2)}°E ${analysis.detection.centroid_latlon.lat.toFixed(2)}°N`,
            time: new Date(analysis.detection.detection_timestamp * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC",
            confidence: Math.round(analysis.detection.confidence * 100),
        },
        historicalIncident,
    ] : [
        { id: "MS-001", title: "Surface anomaly", location: "Arabian Sea · Pending analysis", time: "—", confidence: null },
        historicalIncident,
    ];

    return <aside className="w-full shrink-0 border-b border-line bg-panel/90 p-5 lg:border-b-0 lg:border-r lg:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="eyebrow text-signal">Incidents</p><p className="mt-1 text-sm font-semibold text-ink">Regional overview</p></div><button className="rounded-sm border border-line px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-signal" type="button">View all</button></div><div className="space-y-2">{incidents.map((incident, index) => <button className={`w-full border p-3 text-left transition hover:border-signal/50 ${index === 0 ? "border-signal/60 bg-panelAlt" : "border-line bg-panel/90"}`} key={incident.id} type="button"><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-signal">{incident.id}</span><span className={`text-[9px] uppercase tracking-[.1em] ${index === 0 ? "text-ember" : "text-mist"}`}>{index === 0 ? "Active" : "Closed"}</span></div><p className="mt-2 text-xs font-semibold text-ink">{incident.title}</p><p className="mt-1 text-[10px] leading-4 text-mist">{incident.location}</p><div className="mt-3 flex justify-between border-t border-line pt-2 text-[9px] text-mist"><span>{incident.time}</span><span className="font-mono text-signal">{incident.confidence != null ? `${incident.confidence}%` : "—"}</span></div></button>)}</div></aside>;
}