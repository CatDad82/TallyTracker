import React, { useState, useEffect } from "react";
import { Calendar } from "lucide-react";

interface SummaryTabProps {
  summaryData: {
    total_seconds: number;
    by_project: Array<{ project: string; secs: number; count: number }>;
    by_category: Array<{ category: string; secs: number; count: number }>;
  };
  period: string;
  onPeriodChange: (p: string) => void;
  fromDate: string;
  onFromDateChange: (d: string) => void;
  toDate: string;
  onToDateChange: (d: string) => void;
  onApplyCustomRange: () => void;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
  summaryData,
  period,
  onPeriodChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  onApplyCustomRange
}) => {
  const formatDuration = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  };

  const getPercentage = (secs: number) => {
    if (!summaryData.total_seconds) return 0;
    return Math.round((secs / summaryData.total_seconds) * 100);
  };

  const barColors = [
    "bg-indigo-500",
    "bg-violet-500",
    "bg-sky-400",
    "bg-emerald-400",
    "bg-amber-400",
    "bg-rose-500"
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Period Selection Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs font-bold tracking-wider text-brand-dim uppercase mr-2">Period</span>
        {(["Today", "This Week", "This Month", "Custom"] as const).map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`font-display font-extrabold text-xs tracking-wider uppercase px-4 py-2 border-2 border-brand-navy cursor-pointer transition-colors ${
              period === p
                ? "bg-brand-navy text-white"
                : "bg-white text-brand-navy hover:bg-brand-accent"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Custom range dates */}
      {period === "Custom" && (
        <div className="border-2 border-brand-navy bg-white p-4 flex items-center gap-4 flex-wrap max-w-lg">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => onFromDateChange(e.target.value)}
              className="flat-input text-xs font-mono py-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase">To</span>
            <input
              type="date"
              value={toDate}
              onChange={e => onToDateChange(e.target.value)}
              className="flat-input text-xs font-mono py-1.5"
            />
          </div>
          <button
            onClick={onApplyCustomRange}
            className="bg-brand-navy text-white px-4 py-2 font-display font-bold text-xs uppercase hover:bg-brand-navy/95 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Large Total Tracked banner */}
      <div className="bg-brand-red text-white p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs relative">
        <div className="space-y-1 text-center md:text-left">
          <div className="font-mono text-xs font-semibold tracking-widest uppercase opacity-85">
            {period === "Today" ? "TODAY · " + new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "SELECTED RANGE TIME"}
          </div>
          <div className="font-display font-black text-2xl text-white uppercase tracking-wider">
            Total Tracked Time
          </div>
        </div>

        <div className="font-display font-black text-5xl md:text-6xl tracking-tighter text-white tabular-nums select-none whitespace-nowrap">
          {formatDuration(summaryData.total_seconds)}
        </div>
      </div>

      {summaryData.total_seconds === 0 ? (
        <div className="border-2 border-brand-navy bg-white p-12 text-center text-brand-dim font-semibold rounded-xs">
          No log entries exist for the selected period. Start tracking to generate reports!
        </div>
      ) : (
        /* Breakdowns grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Projects Breakdown */}
          <div className="border-2 border-brand-navy bg-white">
            <div className="font-display font-black text-sm tracking-wider uppercase text-white bg-brand-navy px-4 py-3">
              By Project
            </div>
            <div className="p-4 md:p-5 space-y-4 max-h-[360px] overflow-y-auto">
              {summaryData.by_project.length === 0 ? (
                <div className="text-center py-8 text-xs text-brand-dim font-medium italic">No projects recorded.</div>
              ) : (
                summaryData.by_project.map((p, idx) => {
                  const pct = getPercentage(p.secs);
                  const barColor = barColors[idx % barColors.length];

                  return (
                    <div key={p.project} className="space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="font-sans font-bold text-sm text-brand-navy truncate max-w-[210px]">{p.project}</span>
                        <span className="font-mono text-xs text-brand-navy font-semibold">{formatDuration(p.secs)} · {pct}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-brand-accent rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Categories Breakdown */}
          <div className="border-2 border-brand-navy bg-white">
            <div className="font-display font-black text-sm tracking-wider uppercase text-white bg-brand-navy px-4 py-3">
              By Category
            </div>
            <div className="p-4 md:p-5 space-y-4 max-h-[360px] overflow-y-auto">
              {summaryData.by_category.length === 0 ? (
                <div className="text-center py-8 text-xs text-brand-dim font-medium italic">No categories recorded.</div>
              ) : (
                summaryData.by_category.map((c, idx) => {
                  const pct = getPercentage(c.secs);
                  const barColor = barColors[(idx + 2) % barColors.length]; // Offset color scheme slightly

                  return (
                    <div key={c.category} className="space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="font-sans font-bold text-sm text-brand-navy truncate max-w-[210px]">{c.category}</span>
                        <span className="font-mono text-xs text-brand-navy font-semibold">{formatDuration(c.secs)} · {pct}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-brand-accent rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SummaryTab;
