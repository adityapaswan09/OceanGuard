const navItems = ["Overview", "Incidents", "Vessels", "Alerts", "Reports"];

interface SideRailProps {
    activeSection: string;
    onNavigate: (section: string) => void;
}

export function SideRail({ activeSection, onNavigate }: SideRailProps) {
    return <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-white px-3 py-5 max-lg:hidden"><div className="mb-7 px-3"><p className="eyebrow text-signal">Workspace</p><p className="mt-1 text-xs font-semibold text-[#173247]">Operations center</p></div><nav className="space-y-1">{navItems.map((item, index) => <button className={`flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-xs font-medium ${activeSection === item ? "bg-[#e8f5f8] text-signal" : "text-mist hover:bg-[#f1f6f8] hover:text-[#173247]"}`} key={item} onClick={() => onNavigate(item)} type="button"><span className="w-5 text-center text-[11px]">{["⌂", "◉", "≋", "!", "▤"][index]}</span><span className="flex-1">{item}</span>{item === "Alerts" && <span className="rounded-full bg-[#e8f5f8] px-1.5 py-0.5 font-mono text-[9px] text-signal">2</span>}</button>)}</nav><div className="mt-auto space-y-1 border-t border-line pt-4"><button className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-xs text-mist hover:bg-[#f1f6f8]" type="button"><span className="w-5 text-center">⚙</span>Settings</button><p className="px-3 pt-4 text-[9px] text-mist/70">OCEANGUARD v1.0.0</p></div></aside>;
}
