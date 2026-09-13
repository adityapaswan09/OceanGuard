import { useOperationsClock } from "../../hooks/useOperationsClock";

export function TopBar() {
    const clock = useOperationsClock();
    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-deepNavy/80 px-5 lg:px-8 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-signal font-bold text-white shadow-glow">OG</div>
                <div>
                    <p className="font-display text-[15px] font-bold text-ink tracking-tight">OceanGuard</p>
                    <p className="text-[9px] uppercase tracking-[.18em] text-mist">Maritime Intelligence Platform</p>
                </div>
            </div>
            <div className="hidden w-[320px] items-center border border-line/50 bg-panel/60 px-3 py-1.5 md:flex">
                <span className="mr-2 text-xs text-mist">⌕</span>
                <input className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-mist/60" placeholder="Search incidents, vessels, regions..." />
                <span className="ml-2 font-mono text-[9px] text-mist">⌘K</span>
            </div>
            <div className="flex items-center gap-5 text-right">
                <div className="hidden sm:flex items-center gap-4">
                    <div>
                        <p className="eyebrow">Region</p>
                        <p className="text-xs font-medium text-ink">Arabian Sea</p>
                    </div>
                    <div>
                        <p className="eyebrow">UTC</p>
                        <p className="font-mono text-xs text-ink">{clock}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 border-l border-line pl-4">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-success">Operational</span>
                </div>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-signal to-signalDim text-center text-[11px] font-bold leading-8 text-white">
                    AM
                </div>
            </div>
        </header>
    );
}
