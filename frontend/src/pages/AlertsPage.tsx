import { useState } from "react";

interface AlertRecord {
    id: string;
    severity: "HIGH" | "MEDIUM" | "INFO";
    title: string;
    description: string;
    timestamp: string;
    spillId?: number;
}

const demoAlerts: AlertRecord[] = [
    { id: "alert-001", severity: "HIGH", title: "New spill detected", description: "A surface anomaly has been registered in the Arabian Sea monitoring region.", timestamp: "06 Sep 2026 · 04:12 UTC", spillId: 1 },
    { id: "alert-002", severity: "MEDIUM", title: "Origin estimation updated", description: "The probable origin region and time window are now available for review.", timestamp: "06 Sep 2026 · 04:30 UTC", spillId: 1 },
    { id: "alert-003", severity: "INFO", title: "AIS correlation completed", description: "Candidate vessel tracks have been correlated against the incident window.", timestamp: "06 Sep 2026 · 04:43 UTC", spillId: 1 },
    { id: "alert-004", severity: "INFO", title: "Forecast generated", description: "Forward footprint layers and uncertainty envelope are ready for review.", timestamp: "06 Sep 2026 · 04:58 UTC", spillId: 1 },
    { id: "alert-005", severity: "MEDIUM", title: "Suspect ranking updated", description: "Evidence scores for candidate vessels have been refreshed.", timestamp: "06 Sep 2026 · 05:10 UTC", spillId: 1 },
];

const severityStyles = {
    HIGH: "border-[#e7b1a0] bg-[#fff7f4] text-[#b6533b]",
    MEDIUM: "border-[#ecd6a2] bg-[#fffaf0] text-[#9a711d]",
    INFO: "border-[#b9dce7] bg-[#f1fafc] text-signal",
};

interface AlertsPageProps {
    onOpenAlert: (alert: AlertRecord) => void;
}

export function AlertsPage({ onOpenAlert }: AlertsPageProps) {
    const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

    return <main className="min-w-0 flex-1 overflow-auto bg-[#f4f8fb]">
        <div className="border-b border-line bg-white px-5 py-5 lg:px-8">
            <div className="flex items-end justify-between gap-4">
                <div><div className="mb-2 flex items-center gap-2 text-[10px] text-mist"><span>Alerts</span><span>/</span><span className="text-signal">Regional monitoring</span></div><h1 className="font-display text-2xl font-semibold text-[#173247]">Alerts</h1><p className="mt-1 text-xs text-mist">Investigation events for the Arabian Sea workspace. Demo events for prototype review.</p></div>
                <div className="hidden text-right sm:block"><p className="eyebrow">Unread</p><p className="font-display text-2xl font-semibold text-signal">02</p></div>
            </div>
        </div>
        <div className="max-w-5xl px-5 py-6 lg:px-8">
            <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow text-signal">Alert stream</p><p className="mt-1 text-xs text-mist">Latest investigation updates</p></div><span className="font-mono text-[9px] text-mist">{demoAlerts.length} EVENTS</span></div>
            {demoAlerts.length === 0 ? <div className="border border-line bg-white px-4 py-8 text-center text-xs text-mist">No alerts for this region.</div> : <div className="border border-line bg-white panel-shadow">{demoAlerts.map((alert, index) => { const selected = selectedAlertId === alert.id; return <button className={`flex w-full items-start gap-4 border-b border-line px-4 py-4 text-left last:border-b-0 ${selected ? "bg-[#f1fafc]" : "hover:bg-[#f8fbfc]"}`} key={alert.id} onClick={() => { setSelectedAlertId(alert.id); if (alert.spillId) onOpenAlert(alert); }} type="button"><span className={`mt-0.5 min-w-[58px] rounded-sm border px-2 py-1 text-center text-[9px] font-semibold tracking-[.08em] ${severityStyles[alert.severity]}`}>{alert.severity}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#173247]">{alert.title}</span><span className="mt-1 block max-w-2xl text-[11px] leading-5 text-mist">{alert.description}</span><span className="mt-2 block font-mono text-[9px] text-mist">{alert.timestamp}{alert.spillId ? <span className="ml-3 text-signal">SPILL MS-{String(alert.spillId).padStart(3, "0")}</span> : null}</span></span><span className={`mt-1 text-xs ${index === 0 || index === 1 ? "text-signal" : "text-transparent"}`}>●</span></button>; })}</div>}
        </div>
    </main>;
}

export type { AlertRecord };
