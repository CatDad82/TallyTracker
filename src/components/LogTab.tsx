import React, { useState } from "react";
import { Trash2, Edit3, Download, RefreshCw, FileText } from "lucide-react";
import { TimeEntry } from "../types.js";

interface LogTabProps {
  entries: TimeEntry[];
  projects: string[];
  categories: string[];
  onDeleteEntries: (ids: number[]) => Promise<void>;
  onEditEntryClick: (entry: TimeEntry) => void;
  onBulkUpdate: (ids: number[], project?: string, category?: string) => Promise<void>;
  onBulkNetSuite: (ids: number[]) => void;
  onExportCSV: () => void;
  onFilterChange: (params: {
    days?: number;
    category?: string;
    project?: string;
    from?: string;
    to?: string;
  }) => void;
}

export const LogTab: React.FC<LogTabProps> = ({
  entries,
  projects,
  categories,
  onDeleteEntries,
  onEditEntryClick,
  onBulkUpdate,
  onBulkNetSuite,
  onExportCSV,
  onFilterChange
}) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [period, setPeriod] = useState<"Today" | "This Week" | "All" | "Custom">("Today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [bulkProj, setBulkProj] = useState("");
  const [bulkCat, setBulkCat] = useState("");

  const [filterProj, setFilterProj] = useState("All");
  const [filterCat, setFilterCat] = useState("All");

  const handlePeriodChange = (val: "Today" | "This Week" | "All" | "Custom") => {
    setPeriod(val);
    setSelectedIds([]);

    let days = 7;
    if (val === "Today") days = 1;
    if (val === "This Week") days = 7;
    if (val === "All") days = 36500; // Big number to fetch all

    if (val !== "Custom") {
      onFilterChange({ days, project: filterProj, category: filterCat });
    } else {
      // Trigger with existing custom dates if available
      onFilterChange({ from: customFrom, to: customTo, project: filterProj, category: filterCat });
    }
  };

  const handleCustomDateApply = () => {
    if (customFrom && customTo) {
      onFilterChange({ from: customFrom, to: customTo, project: filterProj, category: filterCat });
    }
  };

  const handleProjFilterChange = (proj: string) => {
    setFilterProj(proj);
    const params: any = { project: proj, category: filterCat };
    if (period === "Custom") {
      params.from = customFrom;
      params.to = customTo;
    } else {
      params.days = period === "Today" ? 1 : period === "This Week" ? 7 : 36500;
    }
    onFilterChange(params);
  };

  const handleCatFilterChange = (cat: string) => {
    setFilterCat(cat);
    const params: any = { project: filterProj, category: cat };
    if (period === "Custom") {
      params.from = customFrom;
      params.to = customTo;
    } else {
      params.days = period === "Today" ? 1 : period === "This Week" ? 7 : 36500;
    }
    onFilterChange(params);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(entries.map(e => e.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleApplyBulkUpdate = async () => {
    if (selectedIds.length === 0) return;
    await onBulkUpdate(selectedIds, bulkProj || undefined, bulkCat || undefined);
    setSelectedIds([]);
    setBulkProj("");
    setBulkCat("");
  };

  const handleBulkNetSuiteClick = () => {
    if (selectedIds.length === 0) return;
    onBulkNetSuite(selectedIds);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected entries?`)) {
      await onDeleteEntries(selectedIds);
      setSelectedIds([]);
    }
  };

  const formatDuration = (secs?: number) => {
    if (!secs) return "0s";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="space-y-4">
      {/* Filters Control Card */}
      <div className="border-2 border-brand-navy bg-white p-5 space-y-4 shadow-xs">
        {/* Top row: periods and export */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold tracking-wider text-brand-dim uppercase mr-2">SHOW</span>
            {(["Today", "This Week", "All", "Custom"] as const).map(p => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
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

          <div className="flex items-center gap-3">
            {selectedIds.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white hover:bg-brand-red-dark transition-colors font-display font-extrabold text-xs uppercase cursor-pointer"
              >
                <Trash2 size={13} /> Delete ({selectedIds.length})
              </button>
            )}
            <button
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 border-2 border-brand-navy bg-white text-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs uppercase cursor-pointer"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* Custom date range row */}
        {period === "Custom" && (
          <div className="flex items-center gap-3 bg-brand-accent/30 p-3 border border-brand-border animate-in slide-in-from-top-2 duration-150">
            <span className="font-mono text-xs font-bold text-brand-dim">FROM:</span>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="flat-input text-xs font-mono py-1.5"
            />
            <span className="font-mono text-xs font-bold text-brand-dim">TO:</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="flat-input text-xs font-mono py-1.5"
            />
            <button
              onClick={handleCustomDateApply}
              className="bg-brand-navy text-white px-3 py-1.5 font-display font-bold text-xs uppercase transition-colors"
            >
              Apply Range
            </button>
          </div>
        )}

        {/* Bottom row: category/project filters & bulk modifiers */}
        <div className="h-[1px] bg-brand-border"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* List filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-brand-dim uppercase">FILTER CAT</span>
              <select
                value={filterCat}
                onChange={e => handleCatFilterChange(e.target.value)}
                className="flat-select text-xs py-1.5 font-semibold"
              >
                <option value="All">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-brand-dim uppercase">FILTER PROJ</span>
              <select
                value={filterProj}
                onChange={e => handleProjFilterChange(e.target.value)}
                className="flat-select text-xs py-1.5 font-semibold"
              >
                <option value="All">All Projects</option>
                {projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Updators */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[9px] font-bold text-brand-dim uppercase">Bulk Assign:</span>
            <select
              value={bulkProj}
              onChange={e => setBulkProj(e.target.value)}
              disabled={selectedIds.length === 0}
              className="flat-select text-xs py-1.5 disabled:opacity-50"
            >
              <option value="">— Set Project —</option>
              {projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={bulkCat}
              onChange={e => setBulkCat(e.target.value)}
              disabled={selectedIds.length === 0}
              className="flat-select text-xs py-1.5 disabled:opacity-50"
            >
              <option value="">— Set Category —</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={handleApplyBulkUpdate}
              disabled={selectedIds.length === 0 || (!bulkProj && !bulkCat)}
              className="bg-brand-navy text-white hover:bg-brand-navy/90 disabled:opacity-40 px-3 py-1.5 font-display font-bold text-xs uppercase"
            >
              Apply Updates
            </button>
            <button
              onClick={handleBulkNetSuiteClick}
              disabled={selectedIds.length === 0}
              className="bg-brand-dim text-white hover:bg-brand-navy disabled:opacity-40 px-3 py-1.5 font-display font-bold text-xs uppercase"
            >
              Bulk NetSuite
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="border-2 border-brand-navy overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-navy text-white text-xs font-display font-black tracking-wider uppercase select-none">
                <th className="py-3 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={entries.length > 0 && selectedIds.length === entries.length}
                    onChange={e => handleSelectAll(e.target.checked)}
                    className="accent-brand-red cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 w-28">Date</th>
                <th className="py-3 px-4 min-w-[200px]">Task</th>
                <th className="py-3 px-4 min-w-[150px]">Project</th>
                <th className="py-3 px-4 min-w-[120px]">Category</th>
                <th className="py-3 px-4 min-w-[180px]">NS Project</th>
                <th className="py-3 px-4 min-w-[150px]">NS Task</th>
                <th className="py-3 px-4 w-28 text-right">Duration</th>
                <th className="py-3 px-4 w-24">Source</th>
                <th className="py-3 px-4 w-14 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-brand-navy">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm font-semibold text-brand-dim bg-white">
                    No matching log entries found for this period.
                  </td>
                </tr>
              ) : (
                entries.map((e, index) => {
                  const isSelected = selectedIds.includes(e.id);
                  const isEven = index % 2 === 1;

                  return (
                    <tr
                      key={e.id}
                      onDoubleClick={() => onEditEntryClick(e)}
                      className={`hover:bg-brand-accent/40 select-none group transition-colors duration-100 ${
                        isSelected
                          ? "bg-brand-accent/50"
                          : isEven
                          ? "bg-brand-bg/40"
                          : "bg-white"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={ev => handleSelectRow(e.id, ev.target.checked)}
                          className="accent-brand-red cursor-pointer"
                        />
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 font-mono text-xs text-brand-dim">
                        {formatDate(e.start_time)}
                      </td>

                      {/* Task Name */}
                      <td className="py-3 px-4 font-sans font-bold text-brand-navy text-sm max-w-xs truncate" title={e.task}>
                        {e.task}
                      </td>

                      {/* Project */}
                      <td className="py-3 px-4 font-sans font-bold text-sm text-brand-navy">
                        {e.project}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-dim font-medium">
                        {e.category || "—"}
                      </td>

                      {/* NetSuite Project */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-navy max-w-[180px] truncate" title={e.ns_project || ""}>
                        {e.ns_project || "—"}
                      </td>

                      {/* NetSuite Task */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-dim max-w-[150px] truncate" title={e.ns_task || ""}>
                        {e.ns_task || "—"}
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-brand-navy text-right whitespace-nowrap">
                        {formatDuration(e.duration_seconds)}
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4 font-mono text-[10px] text-brand-red font-bold uppercase tracking-wider whitespace-nowrap">
                        {e.monday_board_id ? "Monday.com" : e.app_name || "Manual"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditEntryClick(e)}
                            className="p-1 hover:text-brand-red text-brand-navy transition-colors"
                            title="Edit Log"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this log entry?")) {
                                onDeleteEntries([e.id]);
                              }
                            }}
                            className="p-1 hover:text-brand-red text-brand-navy transition-colors"
                            title="Delete Log"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
export default LogTab;
