export function TimelineBar() {
    return (
        <footer className="grid shrink-0 border-t border-[#1b344b] bg-[#030d17] lg:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 items-center gap-5 overflow-x-auto px-4 py-2.5 lg:px-5">
                <div className="shrink-0">
                    <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#00d4ff]">Sector Updates</p>
                    <p className="mt-0.5 font-mono text-[8.5px] text-[#5a7d96]">06 SEP 2026 / UTC</p>
                </div>
                <div className="flex min-w-max items-center gap-5 text-[9.5px] text-[#8aaec4]">
                    <span>
                        <b className="mr-1.5 font-mono text-[#f97316]">04:12</b>
                        Spill anomaly registered
                    </span>
                    <span>
                        <b className="mr-1.5 font-mono text-[#0284c7]">04:18</b>
                        Origin backtracked (t₀=68h)
                    </span>
                    <span>
                        <b className="mr-1.5 font-mono text-[#00d4ff]">04:24</b>
                        AIS fleet correlation
                    </span>
                    <span>
                        <b className="mr-1.5 font-mono text-[#22d4ee]">04:31</b>
                        24h envelope projected
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-4 border-t border-[#1b344b] px-4 py-2.5 lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                    <span className="font-mono text-[9px] font-bold tracking-wider text-[#10b981]">ALL SYSTEMS NOMINAL</span>
                </div>
            </div>
        </footer>
    );
}
