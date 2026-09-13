export function TimelineBar() {
    return (
        <footer className="grid shrink-0 border-t border-line bg-panel/80 lg:grid-cols-[1fr auto] backdrop-blur-sm">
            <div className="flex min-w-0 items-center gap-5 overflow-x-auto px-5 py-3 lg:px-6">
                <div className="shrink-0">
                    <p className="eyebrow text-signal">Latest updates</p>
                    <p className="mt-1 font-mono text-[9px] text-mist">06 SEP 2026 / UTC</p>
                </div>
                <div className="flex min-w-max items-center gap-5 text-[10px] text-mist">
                    <span>
                        <b className="mr-2 text-ember">04:12</b>
                        Spill detected
                    </span>
                    <span>
                        <b className="mr-2 text-signal">04:18</b>
                        Origin estimated
                    </span>
                    <span>
                        <b className="mr-2 text-signal">04:24</b>
                        AIS correlation
                    </span>
                    <span>
                        <b className="mr-2 text-signal">04:31</b>
                        Forecast generated
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-4 border-t border-line px-5 py-3 lg:border-l lg:border-t-0">
                <p className="eyebrow">System status</p>
                <div className="flex items-center gap-2">
                    <span className="relative h-1.5 w-1.5 rounded-full bg-success">
                        <span className="absolute inset-0 rounded-full bg-success" />
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-success">ALL SERVICES ONLINE</span>
                </div>
            </div>
        </footer>
    );
}
