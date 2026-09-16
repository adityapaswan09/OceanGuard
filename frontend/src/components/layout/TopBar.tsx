import { useOperationsClock } from "../../hooks/useOperationsClock";

export function TopBar() {
    const clock = useOperationsClock();
    return (
        <header className="flex h-13 shrink-0 items-center justify-between border-b border-[#1b344b] bg-[#030d17] px-4 lg:px-6">
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded border border-[#00d4ff]/40 bg-[#061e33] font-mono text-xs font-bold text-[#00d4ff] shadow-[0_0_10px_rgba(0,212,255,0.15)]">KD</div>
                <div>
                    <p className="font-display text-sm font-bold tracking-tight text-[#f8fafc]">KAIDOS</p>
                    <p className="text-[8.5px] font-semibold uppercase tracking-[.18em] text-[#5a7d96]">Maritime Intelligence Platform</p>
                </div>
            </div>
            <div className="hidden w-[320px] items-center rounded border border-[#1b344b] bg-[#020912] px-3 py-1.5 md:flex">
                <span className="mr-2 text-xs text-[#5a7d96]">⌕</span>
                <input className="w-full bg-transparent text-xs text-[#f8fafc] outline-none placeholder:text-[#5a7d96]" placeholder="Search incidents, vessels, regions..." />
                <span className="ml-2 font-mono text-[9px] text-[#5a7d96]">⌘K</span>
            </div>
            <div className="flex items-center gap-5 text-right">
                <div className="hidden sm:flex items-center gap-4">
                    <div>
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[#5a7d96]">Region</p>
                        <p className="text-xs font-semibold text-[#cbd5e1]">Arabian Sea</p>
                    </div>
                    <div>
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[#5a7d96]">UTC Time</p>
                        <p className="font-mono text-xs text-[#00d4ff]">{clock}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 border-l border-[#1b344b] pl-4">
                    <span className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
                    <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#10b981]">Operational</span>
                </div>
                <div className="h-7 w-7 rounded border border-[#00d4ff]/40 bg-[#0c2438] text-center font-mono text-[10px] font-bold leading-7 text-[#00d4ff]">
                    AM
                </div>
            </div>
        </header>
    );
}
