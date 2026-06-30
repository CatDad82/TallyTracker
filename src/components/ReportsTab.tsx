import React, { useState } from "react";
import { RefreshCw, Download } from "lucide-react";

interface ReportRow {
  grp: string;
  n: number;
  secs: number;
  extra: string;
}

interface ReportsTabProps {
  reportRows: ReportRow[];
  groupBy: string;
  onGroupByChange: (val: string) => void;
  days: number;
  onDaysChange: (val: number) => void;
  fromDate: string;
  onFromDateChange: (d: string) => void;
  toDate: string;
  onToDateChange: (d: string) => void;
  onRefresh: () => Promise<void>;
  onExport: (format: "csv" | "json") => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  reportRows,
  groupBy,
  onGroupByChange,
  days,
  onDaysChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  onRefresh,
  onExport
}) => {
  const [mode, setMode] = useState<"days" | "range">("days");

  const formatDuration = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  return (
    <div className="space-y-4">
      {/* Controls Card */}
      <div className="border-2 border-brand-navy bg-white p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Days Back Selector */}
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="mode-days"
                name="report-mode"
                checked={mode === "days"}
                onChange={() => setMode("days")}
                className="accent-brand-red cursor-pointer"
              />
              <label htmlFor="mode-days" className="font-mono text-xs font-bold text-brand-dim uppercase cursor-pointer mr-1">
                Days Back
              </label>
              <select
                value={days}
                onChange={e => {
                  onDaysChange(parseInt(e.target.value));
                  setMode("days");
                }}
                disabled={mode !== "days"}
                className="flat-select text-xs py-1.5 font-semibold font-mono disabled:opacity-50"
              >
                <option value={1}>1 Day</option>
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="radio"
                id="mode-range"
                name="report-mode"
                checked={mode === "range"}
                onChange={() => setMode("range")}
                className="accent-brand-red cursor-pointer"
              />
              <label htmlFor="mode-range" className="font-mono text-xs font-bold text-brand-dim uppercase cursor-pointer mr-1">
                Date Range
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => {
                  onFromDateChange(e.target.value);
                  setMode("range");
                }}
                disabled={mode !== "range"}
                className="flat-input text-xs font-mono py-1.5 disabled:opacity-50"
              />
              <span className="font-mono text-xs text-brand-dim">to</span>
              <input
                type="date"
                value={toDate}
                onChange={e => {
                  onToDateChange(e.target.value);
                  setMode("range");
                }}
                disabled={mode !== "range"}
                className="flat-input text-xs font-mono py-1.5 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onExport("json")}
              className="flex items-center gap-1.5 px-3 py-2 border-2 border-brand-navy bg-white text-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs uppercase cursor-pointer"
            >
              <Download size={13} /> Export JSON
            </button>
            <button
              onClick={() => onExport("csv")}
              className="flex items-center gap-1.5 px-3 py-2 border-2 border-brand-navy bg-white text-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs uppercase cursor-pointer"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        <div className="h-[1px] bg-brand-border"></div>

        {/* Refresh & Group By */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-brand-dim uppercase mr-1">Group By</span>
            <select
              value={groupBy}
              onChange={e => onGroupByChange(e.target.value)}
              className="flat-select text-xs py-1.5 font-semibold"
            >
              <option value="Task">Task</option>
              <option value="Board">Monday Board</option>
              <option value="Project">Project</option>
              <option value="Day">Day</option>
            </select>
          </div>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-navy text-white hover:bg-brand-navy/95 transition-colors font-display font-extrabold text-xs uppercase cursor-pointer"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Aggregate Report Table */}
      <div className="border-2 border-brand-navy overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-navy text-white text-xs font-display font-black tracking-wider uppercase select-none">
                <th className="py-3 px-4 min-w-[260px]">{groupBy.toUpperCase()}</th>
                <th className="py-3 px-4 w-28 text-center"># Entries</th>
                <th className="py-3 px-4 w-32 text-right">Duration</th>
                <th className="py-3 px-4 min-w-[260px]">Detail / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y border-brand-navy">
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm font-semibold text-brand-dim bg-white">
                    No matching report data found. Click "Refresh" or select a wider time range.
                  </td>
                </tr>
              ) : (
                reportRows.map((r, index) => {
                  const isEven = index % 2 === 1;

                  return (
                    <tr
                      key={index}
                      className={`hover:bg-brand-accent/40 select-none group transition-colors duration-100 ${
                        isEven ? "bg-brand-bg/40" : "bg-white"
                      }`}
                    >
                      {/* Group title */}
                      <td className="py-3 px-4 font-sans font-bold text-brand-navy text-sm max-w-sm truncate" title={r.grp}>
                        {r.grp}
                      </td>

                      {/* Entries count */}
                      <td className="py-3 px-4 font-mono text-xs text-brand-dim text-center">
                        {r.n}
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-brand-red text-right whitespace-nowrap">
                        {formatDuration(r.secs)}
                      </td>

                      {/* Detail */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-navy max-w-sm truncate" title={r.extra || ""}>
                        {r.extra || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default ReportsTab;
