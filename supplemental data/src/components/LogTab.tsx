/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { TimeEntry } from "../types";
import { Search, Filter, Download, Trash2, Edit3, X, ExternalLink, Calendar, CheckSquare, ChevronUp, ChevronDown, CalendarDays } from "lucide-react";

interface LogTabProps {
  entries: TimeEntry[];
  projects: string[];
  categories: string[];
  onDeleteEntry: (id: string) => void;
  onUpdateEntry: (updated: TimeEntry) => void;
}

export default function LogTab({
  entries,
  projects,
  categories,
  onDeleteEntry,
  onUpdateEntry,
}: LogTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // ISO YYYY-MM-DD
  const [sortColumn, setSortColumn] = useState<"startTime" | "task" | "project" | "category" | "duration">("startTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

  // Modal edit fields
  const [editTask, setEditTask] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDuration, setEditDuration] = useState(0);

  // Format digital values
  const formatSeconds = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getProjectColor = (pName: string) => {
    switch (pName) {
      case "Client A": return "text-cyan-400 border-cyan-400/30 bg-cyan-950/20";
      case "Client B": return "text-[#f4673b] border-[#f4673b]/30 bg-[#f4673b]/10";
      case "Admin": return "text-yellow-500 border-yellow-500/30 bg-yellow-950/20";
      case "Internal": return "text-green-400 border-green-400/30 bg-green-950/20";
      case "Break": return "text-slate-400 border-slate-500/30 bg-slate-950/30";
      default: return "text-slate-300 border-slate-800 bg-slate-950/30";
    }
  };

  // Sorting helper logic
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const renderSortArrow = (column: typeof sortColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 ml-1 text-[#15ade2] inline-block" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 ml-1 text-[#15ade2] inline-block" />
    );
  };

  // Filter computation
  const filteredEntries = entries.filter((e) => {
    const matchesSearch =
      (e.task || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.notes || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.appName || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = projectFilter === "" || e.project === projectFilter;
    
    // Pick a day match (using local start date string or ISO date match)
    const matchesDate = !dateFilter || new Date(e.startTime).toISOString().split("T")[0] === dateFilter;
    
    return matchesSearch && matchesProject && matchesDate;
  });

  // Sort computation
  const sortedAndFilteredEntries = [...filteredEntries].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    switch (sortColumn) {
      case "startTime":
        valA = new Date(a.startTime).getTime();
        valB = new Date(b.startTime).getTime();
        break;
      case "task":
        valA = (a.task || "").toLowerCase();
        valB = (b.task || "").toLowerCase();
        break;
      case "project":
        valA = (a.project || "").toLowerCase();
        valB = (b.project || "").toLowerCase();
        break;
      case "category":
        valA = (a.category || "").toLowerCase();
        valB = (b.category || "").toLowerCase();
        break;
      case "duration":
        valA = a.durationSeconds;
        valB = b.durationSeconds;
        break;
      default:
        valA = new Date(a.startTime).getTime();
        valB = new Date(b.startTime).getTime();
    }

    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Edit action triggers
  const startEdit = (e: TimeEntry) => {
    setEditingEntry(e);
    setEditTask(e.task);
    setEditProject(e.project);
    setEditCategory(e.category);
    setEditNotes(e.notes);
    setEditDuration(e.durationSeconds);
  };

  const saveEdit = () => {
    if (!editingEntry) return;
    const updated: TimeEntry = {
      ...editingEntry,
      task: editTask,
      project: editProject,
      category: editCategory,
      notes: editNotes,
      durationSeconds: Number(editDuration),
    };
    onUpdateEntry(updated);
    setEditingEntry(null);
  };

  // Export spreadsheet log to Excel CSV compatibility
  const exportCSV = () => {
    const headers = [
      "ID",
      "Date",
      "Start Time",
      "End Time",
      "Total Time (Secs)",
      "Total Time (Formatted)",
      "Project",
      "Category",
      "Task",
      "Sub-App/Active Window",
      "Context URL",
      "Monday Board ID",
      "Monday Item ID",
      "Monday Board Name",
      "Monday Task Name",
      "Status",
      "Assignee",
      "Notes",
    ];

    const rows = sortedAndFilteredEntries.map((e) => {
      const dateStr = new Date(e.startTime).toLocaleDateString();
      const stTime = new Date(e.startTime).toLocaleTimeString();
      const edTime = e.endTime ? new Date(e.endTime).toLocaleTimeString() : "";
      
      return [
        e.id,
        dateStr,
        stTime,
        edTime,
        e.durationSeconds,
        formatSeconds(e.durationSeconds),
        e.project || "General",
        e.category || "None",
        `"${(e.task || "").replace(/"/g, '""')}"`,
        e.appName || "Manual Tracker",
        e.urlContext || "",
        e.mondayBoardId || "",
        e.mondayItemId || "",
        e.mondayBoardName || "",
        e.mondayTaskName || "",
        e.mondayStatus || "",
        e.mondayAssignee || "",
        `"${(e.notes || "").replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `timetracker_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 animate-fade-in" id="log-tab-container">
      
      {/* Spreadsheet Filter Options */}
      <div className="flex flex-col xl:flex-row gap-3 items-center" id="log-filters-bar">
        {/* Search Input */}
        <div className="relative flex-1 w-full" id="filter-search-group">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            id="log-search-input"
            type="text"
            placeholder="Search tasks, applications, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 focus:border-[#15ade2] text-sm text-slate-200 rounded-lg pl-9 pr-4 py-2 focus:outline-none"
          />
        </div>

        {/* Filters and actions line */}
        <div className="flex flex-wrap gap-3 w-full xl:w-auto items-center justify-between xl:justify-end" id="filter-options-group">
          
          {/* Pick a Day Filter */}
          <div className="flex gap-2 items-center" id="filter-date-group">
            <CalendarDays className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <div className="flex items-center gap-1.5 relative">
              <input
                id="log-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none cursor-pointer w-full sm:w-36 focus:border-[#15ade2]"
                title="Filter entries by selecting a specific calendar date"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter("")}
                  className="absolute right-2 text-slate-500 hover:text-white text-xs cursor-pointer font-bold focus:outline-none"
                  title="Show all days"
                >
                  ✕
                </button>
              )}
            </div>
            
            <button
              type="button"
              onClick={() => setDateFilter(new Date().toISOString().split("T")[0])}
              className={`px-3 py-2 text-xs font-bold rounded-lg border transition cursor-pointer select-none ${
                dateFilter === new Date().toISOString().split("T")[0]
                  ? "bg-[#f4673b] border-[#f4673b] text-white font-extrabold shadow-sm"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
              title="Shortcut to view today's entries"
            >
              Today
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <Filter className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <select
              id="log-project-filter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full sm:w-44 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none cursor-pointer"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {/* Download spreadsheet */}
            <button
              id="export-csv-btn"
              onClick={exportCSV}
              className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-[#15ade2] font-semibold flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-700 cursor-pointer shrink-0 transition"
              title="Download timesheet in Excel/CSV format"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
          
        </div>
      </div>

      {/* Spreadsheet rows view */}
      <div className="overflow-x-auto bg-slate-900/40 border border-slate-800 rounded-xl" id="log-table-wrapper">
        <table className="w-full text-left border-collapse text-xs" id="log-data-table">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono font-medium tracking-wider uppercase text-[10px]/none select-none">
              <th className="py-3 px-4 cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={() => handleSort("task")}>
                <div className="flex items-center gap-1.5">
                  Task Description
                  {renderSortArrow("task")}
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={() => handleSort("project")}>
                <div className="flex items-center gap-1.5">
                  Project / Badge
                  {renderSortArrow("project")}
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={() => handleSort("category")}>
                <div className="flex items-center gap-1.5">
                  Category
                  {renderSortArrow("category")}
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={() => handleSort("startTime")}>
                <div className="flex items-center gap-1.5">
                  Date / Start
                  {renderSortArrow("startTime")}
                </div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-slate-900/40 transition-colors" onClick={() => handleSort("duration")}>
                <div className="flex items-center justify-end gap-1.5">
                  Net Tracked
                  {renderSortArrow("duration")}
                </div>
              </th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {sortedAndFilteredEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-600 italic">
                  No tracked activities found.
                </td>
              </tr>
            ) : (
              sortedAndFilteredEntries.map((e) => {
                const startTime = new Date(e.startTime);
                const hasMondayValue = e.mondayItemId || e.mondayBoardId;

                return (
                  <tr key={e.id} className="hover:bg-slate-900/60 transition-colors group" id={`log-row-${e.id}`}>
                    {/* Task details & technical outcomes */}
                    <td className="py-3 px-4 max-w-xs md:max-w-md">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-100 group-hover:text-[#15ade2] transition-colors">
                          {e.task || "Manual Session"}
                        </p>
                        {e.notes && (
                          <p className="text-slate-500 line-clamp-2 italic text-[11px] leading-relaxed">
                            {e.notes}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 pt-0.5">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          {startTime.toLocaleDateString()} at {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {e.endTime && ` - ${new Date(e.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                    </td>

                    {/* Project Association color-coded badges */}
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 border rounded text-[10px] font-mono font-bold tracking-wide uppercase ${getProjectColor(e.project)}`} id={`badge-project-${e.id}`}>
                        {e.project || "General"}
                      </span>
                    </td>

                    {/* Category text */}
                    <td className="py-3 px-3 text-slate-400 font-sans tracking-wide">
                      {e.category || <span className="text-slate-700 font-mono italic">Unspecified</span>}
                    </td>

                    {/* Window context / Monday.com linkages */}
                    <td className="py-3 px-4 max-w-xs select-all text-slate-400">
                      <div className="space-y-1 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-950 px-1.5 py-0.5 border border-slate-800 rounded font-mono text-[10px] text-slate-500">
                            {e.appName || "Manual"}
                          </span>
                        </div>
                        {hasMondayValue && (
                          <div className="mt-1 bg-amber-500/5 border border-amber-500/20 rounded p-1.5 space-y-0.5" id={`monday-meta-${e.id}`}>
                            <p className="text-amber-400/90 font-bold flex items-center gap-1 text-[10px]">
                              <CheckSquare className="w-3 h-3 text-amber-500" />
                              Monday.com item synchronized
                            </p>
                            {e.mondayTaskName && (
                              <p className="text-slate-300 font-semibold line-clamp-1">{e.mondayTaskName}</p>
                            )}
                            <div className="flex gap-1.5 text-[9px] font-mono text-slate-500 pt-0.5">
                              {e.mondayStatus && <span className="bg-[#f6ae2d]/10 text-[#f6ae2d] px-1 rounded">{e.mondayStatus}</span>}
                              {e.mondayAssignee && <span>Assignee: {e.mondayAssignee}</span>}
                            </div>
                          </div>
                        )}
                        {e.urlContext && (
                          <a
                            href={e.urlContext}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#15ade2] hover:underline flex items-center gap-0.5 text-[9px]/tight font-mono hover:text-cyan-400"
                            id={`url-context-link-${e.id}`}
                          >
                            Visit Link
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Net Tracked Duration formatting tabular values */}
                    <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-white/95 tabular-nums">
                      {formatSeconds(e.durationSeconds)}
                    </td>

                    {/* Action item buttons editable / removable options */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          id={`edit-log-btn-${e.id}`}
                          onClick={() => startEdit(e)}
                          className="p-1 px-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded hover:text-white cursor-pointer transition shrink-0"
                          title="Edit session details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`delete-log-btn-${e.id}`}
                          onClick={() => onDeleteEntry(e.id)}
                          className="p-1 px-1.5 bg-red-950/20 text-red-400 border border-red-900/35 rounded hover:bg-red-950/55 hover:text-white cursor-pointer transition shrink-0"
                          title="Delete activity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Edit Drawer dialog */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" id="edit-log-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-scale-in" id="edit-modal-content">
            <button
              id="close-edit-modal"
              onClick={() => setEditingEntry(null)}
              className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">Edit Activity Details</h3>

            <div className="space-y-4">
              {/* Task name */}
              <div className="space-y-1 flex flex-col">
                <label className="text-xs text-slate-400 font-semibold uppercase font-mono">Task</label>
                <input
                  id="edit-input-task"
                  type="text"
                  value={editTask}
                  onChange={(e) => setEditTask(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-100 text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-[#15ade2]"
                />
              </div>

              {/* Project select */}
              <div className="space-y-1 flex flex-col">
                <label className="text-xs text-slate-400 font-semibold uppercase font-mono">Project</label>
                <select
                  id="edit-select-project"
                  value={editProject}
                  onChange={(e) => setEditProject(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-100 text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-[#15ade2] cursor-pointer"
                >
                  <option value="">No Project</option>
                  {projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category select */}
              <div className="space-y-1 flex flex-col">
                <label className="text-xs text-slate-400 font-semibold uppercase font-mono">Category</label>
                <select
                  id="edit-select-category"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-100 text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-[#15ade2] cursor-pointer"
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duration slider */}
              <div className="space-y-1 flex flex-col">
                <div className="flex justify-between text-xs text-slate-400 font-semibold uppercase font-mono">
                  <span>Tracked duration</span>
                  <span className="text-[#15ade2] font-mono font-bold font-sans">{formatSeconds(editDuration)}</span>
                </div>
                <input
                  id="edit-slider-duration"
                  type="range"
                  min={10}
                  max={36000} // 10h
                  step={10}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-950 rounded-lg cursor-pointer accent-[#15ade2]"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1 flex flex-col">
                <label className="text-xs text-slate-400 font-semibold uppercase font-mono">Notes</label>
                <textarea
                  id="edit-textarea-notes"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-100 text-sm px-3.5 py-2.5 rounded-lg focus:outline-none h-20 resize-none"
                />
              </div>

              {/* Actions row */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  id="cancel-edit-btn"
                  onClick={() => setEditingEntry(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-lg"
                >
                  Discard
                </button>
                <button
                  id="save-edit-btn"
                  onClick={saveEdit}
                  className="bg-[#15ade2] hover:bg-cyan-500 text-white font-semibold text-xs px-4 py-2 rounded-lg"
                >
                  Apply Changes
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
