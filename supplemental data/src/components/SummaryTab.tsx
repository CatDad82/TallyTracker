/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { TimeEntry } from "../types";
import { Check, Bookmark, Percent, Award, ClipboardList } from "lucide-react";

interface SummaryTabProps {
  entries: TimeEntry[];
}

export default function SummaryTab({ entries }: SummaryTabProps) {
  const [reportMode, setReportMode] = useState<"single" | "range" | "all">("single");
  const [singleDate, setSingleDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Filtering of logged entries based on picked day or range
  const filteredEntries = entries.filter((e) => {
    const entryDate = new Date(e.startTime);
    const entryDay = entryDate.toISOString().split("T")[0];

    if (reportMode === "single") {
      return entryDay === singleDate;
    }
    if (reportMode === "range") {
      return entryDay >= startDate && entryDay <= endDate;
    }
    return true; // "all"
  });

  const totalSeconds = filteredEntries.reduce((sum, e) => sum + e.durationSeconds, 0);

  // Group by project
  const projectSeconds: Record<string, number> = {};
  const categorySeconds: Record<string, number> = {};

  filteredEntries.forEach((e) => {
    const p = e.project || "General";
    const c = e.category || "Unclassified";
    projectSeconds[p] = (projectSeconds[p] || 0) + e.durationSeconds;
    categorySeconds[c] = (categorySeconds[c] || 0) + e.durationSeconds;
  });

  const formatSecs = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const getPercentage = (secs: number) => {
    if (totalSeconds === 0) return 0;
    return Math.round((secs / totalSeconds) * 100);
  };

  const getProjectBgColor = (pName: string) => {
    switch (pName) {
      case "Client A": return "bg-cyan-500";
      case "Client B": return "bg-[#f4673b]";
      case "Admin": return "bg-amber-500";
      case "Internal": return "bg-emerald-500";
      case "Break": return "bg-slate-500";
      default: return "bg-indigo-500";
    }
  };

  const getCategoryTheme = (cName: string) => {
    switch (cName) {
      case "Deep Work": return { bar: "bg-cyan-600", text: "text-cyan-400" };
      case "Meetings": return { bar: "bg-indigo-600", text: "text-indigo-400" };
      case "Admin": return { bar: "bg-amber-600", text: "text-amber-400" };
      case "Email": return { bar: "bg-emerald-600", text: "text-emerald-400" };
      case "Research": return { bar: "bg-fuchsia-600", text: "text-fuchsia-400" };
      default: return { bar: "bg-slate-600", text: "text-slate-400" };
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="summary-tab-container">
      
      {/* Report Controls Panel with Datepickers */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-5 bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80" id="report-controls-panel">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-200 font-sans">Time Allocation Report</h2>
          <p className="text-xs text-slate-500">Pick a specific calendar day or range to generate a visual work summary</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center" id="report-inputs-row">
          {/* Mode Selector */}
          <div className="flex bg-slate-950 p-1 border border-slate-800/80 rounded-xl text-xs gap-1 select-none" id="report-period-selector">
            <button
              type="button"
              onClick={() => setReportMode("single")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                reportMode === "single"
                  ? "bg-[#f4673b] text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Single Day
            </button>
            <button
              type="button"
              onClick={() => setReportMode("range")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                reportMode === "range"
                  ? "bg-[#f4673b] text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Date Range
            </button>
            <button
              type="button"
              onClick={() => setReportMode("all")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                reportMode === "all"
                  ? "bg-[#f4673b] text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Time
            </button>
          </div>

          {/* Conditional Date Pickers */}
          {reportMode === "single" && (
            <div className="flex items-center gap-2" id="single-date-picker-box">
              <span className="text-xs font-mono text-slate-400">Select Day:</span>
              <input
                id="datepicker-single"
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-[#f4673b] cursor-pointer font-mono"
              />
            </div>
          )}

          {reportMode === "range" && (
            <div className="flex flex-wrap items-center gap-2.5" id="range-picker-box">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400">From:</span>
                <input
                  id="datepicker-from"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-[#f4673b] cursor-pointer font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400">To:</span>
                <input
                  id="datepicker-to"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-[#f4673b] cursor-pointer font-mono"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="bg-[#1b2238] border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#15ade2] font-mono">Report Summary</span>
          <p className="text-xs text-slate-400 mt-1">
            Total hours and sessions tracked during this timeframe
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-left">
            <span className="text-[10px]/none text-slate-500 font-mono uppercase">Sessions Tracked</span>
            <div className="text-xl font-bold text-white mt-1">{filteredEntries.length} items</div>
          </div>
          <div className="border-l border-slate-800 pl-6 text-left">
            <span className="text-[10px]/none text-slate-500 font-mono uppercase">Tracked Duration</span>
            <div className="text-xl font-bold text-[#f4673b] mt-1">{formatSecs(totalSeconds)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="summary-charts-grid">
        
        {/* Project group layout */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm" id="summary-by-project-card">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-200">Time Spent by Project</h3>
            <p className="text-xs text-slate-500">Your accumulated time across all projects</p>
          </div>

          <div className="space-y-4" id="summary-projects-list">
            {Object.keys(projectSeconds).length === 0 ? (
              <p className="text-xs text-slate-600 italic py-6 text-center">No logs currently linked to active projects.</p>
            ) : (
              Object.entries(projectSeconds).map(([project, secs]) => {
                const percent = getPercentage(secs);
                const bgClass = getProjectBgColor(project);

                return (
                  <div key={project} className="space-y-1" id={`summary-project-row-${project.replace(/\s+/g, '-')}`}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-200 font-semibold">{project}</span>
                      <span className="font-mono text-slate-400 font-bold">{formatSecs(secs)} ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900 flex">
                      <div className={`h-full rounded-full ${bgClass}`} style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Category breakdown layout */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm" id="summary-by-category-card">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-200">Time Spent by Category</h3>
            <p className="text-xs text-slate-500">See how your time is split among your work categories</p>
          </div>

          <div className="space-y-4" id="summary-categories-list">
            {Object.keys(categorySeconds).length === 0 ? (
              <p className="text-xs text-slate-600 italic py-6 text-center">No categorizations recorded.</p>
            ) : (
              Object.entries(categorySeconds).map(([cat, secs]) => {
                const percent = getPercentage(secs);
                const theme = getCategoryTheme(cat);

                return (
                  <div key={cat} className="space-y-1" id={`summary-category-row-${cat.replace(/\s+/g, '-')}`}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <Check className={`w-3.5 h-3.5 shrink-0 ${theme.text}`} />
                        {cat}
                      </span>
                      <span className="font-mono text-slate-400 font-bold">{formatSecs(secs)} ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900 flex">
                      <div className={`h-full rounded-full ${theme.bar}`} style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
