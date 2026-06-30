/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { TimeEntry } from "../types";
import { INITIAL_PROJECTS } from "../mockData";
import { Clock, Layers, Award, CheckCircle2, TrendingUp, Calendar, ArrowRight } from "lucide-react";

interface DashboardTabProps {
  entries: TimeEntry[];
  projects: string[];
}

export default function DashboardTab({ entries, projects }: DashboardTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  // Resize listener to prevent division-by-zero and resize charts fluidly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((observedEntries) => {
      for (let entry of observedEntries) {
        if (entry.contentRect.width > 50) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter today's entries
  const todayStr = new Date().toDateString();
  const todayEntries = entries.filter(
    (e) => new Date(e.startTime).toDateString() === todayStr
  );

  // Total times math
  const totalSecondsToday = todayEntries.reduce((sum, e) => sum + e.durationSeconds, 0);
  const formatSecsToHoursDecimal = (secs: number) => (secs / 3600).toFixed(1);

  // Deep focus stats
  const deepWorkSecondsToday = todayEntries
    .filter((e) => e.category === "Deep Focus")
    .reduce((sum, e) => sum + e.durationSeconds, 0);

  const deepWorkPercentage = totalSecondsToday > 0 
    ? Math.round((deepWorkSecondsToday / totalSecondsToday) * 100) 
    : 0;

  // Track active project counts
  const todayProjects = Array.from(new Set(todayEntries.map((e) => e.project).filter(Boolean)));

  // Mock streak
  const streakDays = 5;

  // Group by project for custom bar chart
  const projectTimeMap: Record<string, number> = {};
  todayEntries.forEach((e) => {
    const p = e.project || "General";
    projectTimeMap[p] = (projectTimeMap[p] || 0) + e.durationSeconds;
  });

  const chartData = Object.entries(projectTimeMap).map(([name, seconds]) => ({
    name,
    seconds,
    hours: seconds / 3600,
  })).sort((a, b) => b.seconds - a.seconds);

  const maxSeconds = chartData.length > 0 ? Math.max(...chartData.map((d) => d.seconds)) : 1;

  // Project colors mapping
  const getProjectColor = (pName: string) => {
    switch (pName) {
      case "Client A": return "#15ade2"; // secondary blue
      case "Client B": return "#f4673b"; // primary orange
      case "Admin": return "#e3ac44"; // yellow/warn
      case "Internal": return "#7cc821"; // green
      case "Break": return "#64748b"; // slate
      default: return "#9aa6c7"; // dim gray
    }
  };

  const getPercentageColor = (percent: number) => {
    if (percent >= 70) return "text-green-400";
    if (percent >= 40) return "text-[#15ade2]";
    return "text-slate-400";
  };

  return (
    <div className="space-y-6" ref={containerRef} id="dashboard-tab-container">
      
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in" id="dashboard-kpi-row">
        
        {/* KPI 1: Today's tracked hours */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between h-34 shadow-sm" id="kpi-total-time">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Today's Total</span>
            <div className="p-2 rounded-lg bg-[#15ade2]/10 text-[#15ade2]">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">{formatSecsToHoursDecimal(totalSecondsToday)}h</h2>
            <p className="text-slate-500 text-xs mt-1">across {todayEntries.length} sessions today</p>
          </div>
        </div>

        {/* KPI 2: Active Projects */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between h-34 shadow-sm" id="kpi-active-projects">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Active Projects</span>
            <div className="p-2 rounded-lg bg-[#f4673b]/10 text-[#f4673b]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">{todayProjects.length}</h2>
            <p className="text-slate-500 text-xs mt-1">projects actively advanced today</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-charts-layout">
        
        {/* Project Time Distribution */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between" id="chart-project-distribution-card">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-200">Daily Project Time</h3>
                <p className="text-xs text-slate-500">How your recorded hours are divided across your projects</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-1 border border-slate-800 rounded-lg text-slate-400">TODAY</span>
            </div>

            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600 space-y-2">
                <Clock className="w-10 h-10 stroke-1" />
                <p className="text-sm italic">No tracking entries recorded for today yet.</p>
              </div>
            ) : (
              <div className="space-y-4" id="project-bars-list">
                {chartData.map((project) => {
                  const percent = Math.max(8, (project.seconds / maxSeconds) * 100);
                  const displayPercent = Math.round((project.seconds / totalSecondsToday) * 100);
                  const color = getProjectColor(project.name);

                  return (
                    <div key={project.name} className="space-y-1.5" id={`project-bar-${project.name.replace(/\s+/g, '-')}`}>
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-300 font-semibold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                          {project.name}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {project.hours.toFixed(2)} hrs <span className="opacity-40 text-[10px]/none">({displayPercent}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-900 flex">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${percent}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 10px ${color}30`
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800/80 mt-6 pt-4 flex items-center justify-between text-xs text-slate-500 font-mono" id="chart-time-footer">
            <span>Total effort hours today:</span>
            <span className="text-white font-bold">{formatSecsToHoursDecimal(totalSecondsToday)} hours</span>
          </div>
        </div>

        {/* Dynamic Activity Timeline block */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col" id="chart-daily-timeline-card">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-200">Activity Timeline</h3>
            <p className="text-xs text-slate-500">The chronological order of your tracked work today</p>
          </div>

          {todayEntries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-600 space-y-2">
              <Calendar className="w-8 h-8 stroke-1" />
              <p className="text-xs italic text-center px-4">Timeline will show details as work sessions are added and saved.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[300px] pr-1" id="timeline-scroll-area">
              {todayEntries.map((entry, idx) => {
                const startTime = new Date(entry.startTime);
                const endTime = entry.endTime ? new Date(entry.endTime) : new Date();
                const color = getProjectColor(entry.project);

                return (
                  <div 
                    key={entry.id || idx} 
                    className="relative pl-6 border-l border-slate-800 text-xs py-1 transition-all hover:bg-slate-900/40 rounded-r-lg px-2 group"
                    id={`timeline-node-${entry.id}`}
                  >
                    {/* Circle marker indicating project color */}
                    <div 
                      className="absolute left-0 -translate-x-[4.5px] top-2 w-2 h-2 rounded-full ring-4 ring-slate-950 transition-all group-hover:scale-125"
                      style={{ backgroundColor: color }}
                    ></div>
                    
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 group-hover:text-slate-300">
                      <span>
                        {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {" "}
                        {entry.endTime 
                          ? endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : "Active"}
                      </span>
                      <span className="font-bold">{formatSecsToHoursDecimal(entry.durationSeconds)}h</span>
                    </div>

                    <p className="font-semibold text-white mt-1 group-hover:text-[#15ade2] transition-colors line-clamp-1">{entry.task || "Untitled Task"}</p>
                    
                    <div className="flex items-center gap-2 mt-1">
                      <span 
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-950 border border-slate-800 font-bold"
                        style={{ color: color }}
                      >
                        {entry.project || "General"}
                      </span>
                      {entry.category && (
                        <span className="text-[10px] text-slate-500 font-sans">{entry.category}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
