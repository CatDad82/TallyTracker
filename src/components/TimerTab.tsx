import React, { useState, useEffect } from "react";
import { Play, Square, Plus, Award } from "lucide-react";
import { TimeEntry } from "../types.js";
import { NETSUITE_DATA } from "../data.js";
import { SearchableProjectSelect } from "./SearchableProjectSelect.js";
import { SearchableServiceItemSelect } from "./SearchableServiceItemSelect.js";

interface TimerTabProps {
  isTracking: boolean;
  timerSeconds: number;
  projects: string[];
  categories: string[];
  recentEntries: TimeEntry[];
  onStartTracking: (params: {
    task: string;
    project: string;
    category: string;
    notes: string;
    ns_project?: string;
    ns_task?: string;
    ns_service_item?: string;
    app_name?: string;
    url_context?: string;
  }) => Promise<void>;
  onStopTracking: () => Promise<void>;
  onAddProject: (name: string) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
}

export const TimerTab: React.FC<TimerTabProps> = ({
  isTracking,
  timerSeconds,
  projects,
  categories,
  recentEntries,
  onStartTracking,
  onStopTracking,
  onAddProject,
  onAddCategory
}) => {
  const [task, setTask] = useState("");
  const [project, setProject] = useState("General");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [nsProject, setNsProject] = useState("");
  const [nsTask, setNsTask] = useState("");
  const [nsServiceItem, setNsServiceItem] = useState("");

  const [isAddingProj, setIsAddingProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Search/Filter states for Projects & Categories
  const [projSearch, setProjSearch] = useState("");
  const [showProjList, setShowProjList] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [showCatList, setShowCatList] = useState(false);

  // Auto-fill form fields when Resuming an entry
  const handleResume = (entry: TimeEntry) => {
    setTask(entry.task || "");
    setProject(entry.project || "General");
    setCategory(entry.category || "");
    setNotes(entry.notes || "");
    setNsProject(entry.ns_project || "");
    setNsTask(entry.ns_task || "");
    setNsServiceItem(entry.ns_service_item || "");

    onStartTracking({
      task: entry.task || "",
      project: entry.project || "General",
      category: entry.category || "",
      notes: entry.notes || "",
      ns_project: entry.ns_project || "",
      ns_task: entry.ns_task || "",
      ns_service_item: entry.ns_service_item || ""
    });
  };

  const handleToggleTimer = () => {
    if (isTracking) {
      onStopTracking();
    } else {
      if (!task.trim()) {
        alert("Please enter a task description before starting the timer.");
        return;
      }
      onStartTracking({
        task,
        project,
        category,
        notes,
        ns_project: nsProject || undefined,
        ns_task: nsTask || undefined,
        ns_service_item: nsServiceItem || undefined
      });
    }
  };

  const handleAddNewProject = async () => {
    if (newProjName.trim()) {
      await onAddProject(newProjName.trim());
      setProject(newProjName.trim());
      setNewProjName("");
      setIsAddingProj(false);
    }
  };

  const handleAddNewCategory = async () => {
    if (newCatName.trim()) {
      await onAddCategory(newCatName.trim());
      setCategory(newCatName.trim());
      setNewCatName("");
      setIsAddingCat(false);
    }
  };

  // Helper to format stopwatch time
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return {
      hm: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
      s: `:${s.toString().padStart(2, "0")}`
    };
  };

  const { hm, s: sec } = formatTime(timerSeconds);

  // Filter NetSuite Tasks depending on selected Project
  const nsProjectCode = nsProject.split(" — ")[0].trim();
  const nsTasks = nsProjectCode === "1778"
    ? NETSUITE_DATA.tasks_1778
    : nsProjectCode === "1779"
    ? NETSUITE_DATA.tasks_1779
    : [];

  const filteredProjects = projects.filter(p => p.toLowerCase().includes(projSearch.toLowerCase()));
  const filteredCategories = categories.filter(c => c.toLowerCase().includes(catSearch.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Timer Watch Card */}
      <div className="border-2 border-brand-navy bg-white p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs relative">
        <div className="space-y-1 text-center md:text-left">
          <div className="font-mono text-xs font-semibold tracking-widest text-brand-red uppercase">
            {isTracking ? "• NOW TRACKING" : "TIMER INACTIVE"}
          </div>
          <div className="font-mono text-xs text-brand-dim font-medium uppercase tracking-wider">
            {isTracking ? `YOUR ACCOUNT · ${project.toUpperCase()}` : "READY TO LOG WORK"}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Large clock */}
          <div className="font-display font-black text-6xl md:text-7xl tracking-tighter text-brand-navy tabular-nums select-none">
            {isTracking ? hm : "00:00"}
            <span className="text-brand-red font-extrabold">{isTracking ? sec : ":00"}</span>
          </div>

          {/* Toggle Button */}
          <button
            onClick={handleToggleTimer}
            className={`flex items-center gap-2 px-6 py-4 font-display font-black text-sm tracking-widest uppercase transition-colors cursor-pointer ${
              isTracking
                ? "bg-brand-red text-white hover:bg-brand-red-dark"
                : "bg-brand-navy text-white hover:bg-brand-navy/90"
            }`}
          >
            {isTracking ? (
              <>
                <Square size={14} fill="white" /> STOP
              </>
            ) : (
              <>
                <Play size={14} fill="white" /> START
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-brand-navy bg-white">
        {/* Task field */}
        <div className="p-4 md:p-5 border-b md:border-b-0 md:border-r border-brand-navy relative">
          <label className="block font-mono text-[10px] font-bold tracking-widest text-brand-dim uppercase mb-2">TASK DESCRIPTION</label>
          <input
            type="text"
            value={task}
            onChange={e => setTask(e.target.value)}
            disabled={isTracking}
            className="w-full text-lg font-bold text-brand-navy bg-transparent placeholder:text-brand-border"
            placeholder="What are you working on?"
          />
        </div>

        {/* Project search dropdown field */}
        <div className="p-4 md:p-5 border-b border-brand-navy relative">
          <label className="block font-mono text-[10px] font-bold tracking-widest text-brand-dim uppercase mb-2">PROJECT</label>
          {isTracking ? (
            <div className="text-lg font-bold text-brand-navy py-1">{project}</div>
          ) : (
            <div className="relative">
              <div
                onClick={() => setShowProjList(!showProjList)}
                className="w-full text-lg font-bold text-brand-navy py-1 cursor-pointer flex justify-between items-center"
              >
                <span>{project}</span>
                <span className="text-brand-dim text-xs">▾</span>
              </div>
              {showProjList && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-brand-navy z-20 max-h-48 overflow-y-auto shadow-md">
                  <input
                    type="text"
                    placeholder="Search project..."
                    value={projSearch}
                    onChange={e => setProjSearch(e.target.value)}
                    className="w-full p-2 border-b border-brand-border text-xs font-mono"
                    onClick={e => e.stopPropagation()}
                  />
                  {filteredProjects.map(p => (
                    <div
                      key={p}
                      onClick={() => {
                        setProject(p);
                        setShowProjList(false);
                        setProjSearch("");
                      }}
                      className="p-2.5 text-xs font-bold text-brand-navy hover:bg-brand-accent cursor-pointer"
                    >
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category search dropdown field */}
        <div className="p-4 md:p-5 border-r border-brand-navy relative">
          <label className="block font-mono text-[10px] font-bold tracking-widest text-brand-dim uppercase mb-2">CATEGORY</label>
          {isTracking ? (
            <div className="text-lg font-bold text-brand-navy py-1">{category || "—"}</div>
          ) : (
            <div className="relative">
              <div
                onClick={() => setShowCatList(!showCatList)}
                className="w-full text-lg font-bold text-brand-navy py-1 cursor-pointer flex justify-between items-center"
              >
                <span className={category ? "text-brand-navy" : "text-brand-dim-dark font-medium"}>
                  {category || "Select category..."}
                </span>
                <span className="text-brand-dim text-xs">▾</span>
              </div>
              {showCatList && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-brand-navy z-20 max-h-48 overflow-y-auto shadow-md">
                  <input
                    type="text"
                    placeholder="Search category..."
                    value={catSearch}
                    onChange={e => setCatSearch(e.target.value)}
                    className="w-full p-2 border-b border-brand-border text-xs font-mono"
                    onClick={e => e.stopPropagation()}
                  />
                  <div
                    onClick={() => {
                      setCategory("");
                      setShowCatList(false);
                      setCatSearch("");
                    }}
                    className="p-2.5 text-xs italic text-brand-dim hover:bg-brand-accent cursor-pointer"
                  >
                    — None —
                  </div>
                  {filteredCategories.map(c => (
                    <div
                      key={c}
                      onClick={() => {
                        setCategory(c);
                        setShowCatList(false);
                        setCatSearch("");
                      }}
                      className="p-2.5 text-xs font-bold text-brand-navy hover:bg-brand-accent cursor-pointer"
                    >
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes field */}
        <div className="p-4 md:p-5 relative">
          <label className="block font-mono text-[10px] font-bold tracking-widest text-brand-dim uppercase mb-2">NOTES</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isTracking}
            className="w-full text-base text-brand-navy bg-transparent placeholder:text-brand-border"
            placeholder="Add some details..."
          />
        </div>
      </div>

      {/* NetSuite Details Panel (Navy frame, flat style) */}
      <div className="border-2 border-brand-navy">
        <div className="bg-brand-navy text-white px-4 py-2 font-mono text-xs font-bold tracking-wider uppercase">
          NetSuite Billing Details
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 bg-white">
          <div className="p-4 border-b md:border-b-0 md:border-r border-brand-navy">
            <label className="block font-mono text-[9px] font-bold text-brand-dim uppercase mb-1">CUSTOMER : PROJECT</label>
            <SearchableProjectSelect
              value={nsProject}
              onChange={val => {
                setNsProject(val);
                setNsTask("");
              }}
              disabled={isTracking}
            />
          </div>
          <div className="p-4 border-b md:border-b-0 md:border-r border-brand-navy">
            <label className="block font-mono text-[9px] font-bold text-brand-dim uppercase mb-1">TASK</label>
            <select
              value={nsTask}
              onChange={e => setNsTask(e.target.value)}
              disabled={isTracking || nsTasks.length === 0}
              className="w-full flat-select text-xs disabled:opacity-50"
            >
              <option value="">— Select NetSuite Task —</option>
              {nsTasks.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="p-4">
            <label className="block font-mono text-[9px] font-bold text-brand-dim uppercase mb-1">SERVICE ITEM</label>
            <SearchableServiceItemSelect
              value={nsServiceItem}
              onChange={val => setNsServiceItem(val)}
              disabled={isTracking}
            />
          </div>
        </div>
      </div>

      {/* Quick Creator Actions */}
      <div className="flex gap-4">
        {isAddingProj ? (
          <div className="flex items-center gap-2 border-2 border-brand-navy bg-white p-2">
            <input
              type="text"
              value={newProjName}
              onChange={e => setNewProjName(e.target.value)}
              placeholder="Project name..."
              className="flat-input text-xs"
            />
            <button
              onClick={handleAddNewProject}
              className="bg-brand-navy text-white px-3 py-1.5 font-display font-black text-xs uppercase"
            >
              Add
            </button>
            <button
              onClick={() => setIsAddingProj(false)}
              className="text-brand-dim hover:text-brand-navy text-xs px-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingProj(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs tracking-wider uppercase cursor-pointer"
          >
            <Plus size={14} /> Add Project
          </button>
        )}

        {isAddingCat ? (
          <div className="flex items-center gap-2 border-2 border-brand-navy bg-white p-2">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Category name..."
              className="flat-input text-xs"
            />
            <button
              onClick={handleAddNewCategory}
              className="bg-brand-navy text-white px-3 py-1.5 font-display font-black text-xs uppercase"
            >
              Add
            </button>
            <button
              onClick={() => setIsAddingCat(false)}
              className="text-brand-dim hover:text-brand-navy text-xs px-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCat(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs tracking-wider uppercase cursor-pointer"
          >
            <Plus size={14} /> Add Category
          </button>
        )}
      </div>

      {/* Recent Entries */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="font-display font-black text-sm tracking-wider uppercase text-brand-navy flex items-center gap-1.5">
            <Award size={16} /> Recent Entries
          </div>
          <div className="flex-1 h-[2px] bg-brand-navy"></div>
        </div>

        <div className="border-2 border-brand-navy divide-y-2 divide-brand-navy overflow-hidden">
          {recentEntries.length === 0 ? (
            <div className="bg-white p-6 text-center text-sm text-brand-dim font-semibold">
              No recent logs found. Start the timer to record some entries!
            </div>
          ) : (
            recentEntries.map(e => {
              const h = Math.floor((e.duration_seconds || 0) / 3600);
              const m = Math.floor(((e.duration_seconds || 0) % 3600) / 60);
              const s = (e.duration_seconds || 0) % 60;
              const durStr = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;

              return (
                <div key={e.id} className="bg-white p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-brand-navy">{e.task}</div>
                    <div className="font-mono text-xs text-brand-dim">
                      {e.project} · {durStr}
                    </div>
                  </div>
                  <button
                    onClick={() => handleResume(e)}
                    className="font-display font-black text-xs text-brand-red tracking-wider uppercase hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer"
                  >
                    ▶ Resume
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
export default TimerTab;
