import React, { useState, useEffect } from "react";
import { X, Calendar } from "lucide-react";
import { TimeEntry, AppAssociation } from "../types.js";
import { NETSUITE_DATA } from "../data.js";
import { SearchableProjectSelect } from "./SearchableProjectSelect.js";
import { SearchableServiceItemSelect } from "./SearchableServiceItemSelect.js";

interface EditEntryModalProps {
  entry: TimeEntry;
  projects: string[];
  categories: string[];
  onClose: () => void;
  onSave: (id: number, fields: Partial<TimeEntry>) => Promise<void>;
}

export const EditEntryModal: React.FC<EditEntryModalProps> = ({
  entry,
  projects,
  categories,
  onClose,
  onSave,
}) => {
  const [task, setTask] = useState(entry.task || "");
  const [project, setProject] = useState(entry.project || "No Project");
  const [category, setCategory] = useState(entry.category || "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [nsProject, setNsProject] = useState(entry.ns_project || "");
  const [nsTask, setNsTask] = useState(entry.ns_task || "");
  const [nsServiceItem, setNsServiceItem] = useState(entry.ns_service_item || "");

  // Convert ISO string to YYYY-MM-DDTHH:MM local format for input[type="datetime-local"]
  const toLocalISO = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const tzOffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  };

  useEffect(() => {
    setStartTime(toLocalISO(entry.start_time));
    setEndTime(toLocalISO(entry.end_time));
  }, [entry]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;

    // Convert datetime-local value back to ISO string
    const isoStart = startTime ? new Date(startTime).toISOString() : entry.start_time;
    const isoEnd = endTime ? new Date(endTime).toISOString() : undefined;

    await onSave(entry.id, {
      task,
      project,
      category,
      notes,
      start_time: isoStart,
      end_time: isoEnd,
      ns_project: nsProject || undefined,
      ns_task: nsTask || undefined,
      ns_service_item: nsServiceItem || undefined,
    });
    onClose();
  };

  const nsProjectCode = nsProject.split(" — ")[0].trim();
  const nsTasks = nsProjectCode === "1778"
    ? NETSUITE_DATA.tasks_1778
    : nsProjectCode === "1779"
    ? NETSUITE_DATA.tasks_1779
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-brand-bg border-2 border-brand-navy shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-brand-red text-white px-5 py-4 flex items-center justify-between">
          <span className="font-display font-extrabold text-lg tracking-wide uppercase">Edit Entry</span>
          <button onClick={onClose} className="hover:opacity-80 transition-opacity">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Task */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">Task</label>
            <input
              type="text"
              value={task}
              onChange={e => setTask(e.target.value)}
              className="w-full flat-input font-semibold"
              required
            />
          </div>

          {/* Project & Category row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">Project</label>
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                className="w-full flat-select font-semibold"
              >
                {projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full flat-select font-semibold"
              >
                <option value="">— Uncategorized —</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} /> Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full flat-input font-mono text-xs"
                required
              />
            </div>
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} /> End Time
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full flat-input font-mono text-xs"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full flat-input"
              placeholder="Add details about this block..."
            />
          </div>

          {/* NetSuite Details Divider */}
          <div className="pt-2">
            <div className="bg-brand-navy text-white px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase mb-3">
              NetSuite Billing Integration
            </div>
          </div>

          {/* NetSuite Project */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Customer : Project</label>
            <SearchableProjectSelect
              value={nsProject}
              onChange={val => {
                setNsProject(val);
                setNsTask("");
              }}
            />
          </div>

          {/* NetSuite Task */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Task</label>
            <select
              value={nsTask}
              onChange={e => setNsTask(e.target.value)}
              disabled={nsTasks.length === 0}
              className="w-full flat-select font-sans text-xs disabled:opacity-50"
            >
              <option value="">— Select NetSuite Task —</option>
              {nsTasks.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* NetSuite Service Item */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Service Item</label>
            <SearchableServiceItemSelect
              value={nsServiceItem}
              onChange={val => setNsServiceItem(val)}
            />
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors font-display font-extrabold text-xs uppercase"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddRuleModalProps {
  projects: string[];
  categories: string[];
  onClose: () => void;
  onSave: (rule: AppAssociation) => Promise<void>;
  existingRule?: AppAssociation | null;
}

export const AddRuleModal: React.FC<AddRuleModalProps> = ({
  projects,
  categories,
  onClose,
  onSave,
  existingRule,
}) => {
  const [appName, setAppName] = useState(existingRule?.app_name || "");
  const [project, setProject] = useState(existingRule?.project || "No Project");
  const [category, setCategory] = useState(existingRule?.category || "");
  const [nsProject, setNsProject] = useState(existingRule?.ns_project || "");
  const [nsTask, setNsTask] = useState(existingRule?.ns_task || "");
  const [nsServiceItem, setNsServiceItem] = useState(existingRule?.ns_service_item || "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;

    await onSave({
      app_name: appName.trim().toLowerCase(),
      project,
      category: category || undefined,
      auto_track: existingRule ? existingRule.auto_track : 1,
      ns_project: nsProject || undefined,
      ns_task: nsTask || undefined,
      ns_service_item: nsServiceItem || undefined,
    });
    onClose();
  };

  const nsProjectCode = nsProject.split(" — ")[0].trim();
  const nsTasks = nsProjectCode === "1778"
    ? NETSUITE_DATA.tasks_1778
    : nsProjectCode === "1779"
    ? NETSUITE_DATA.tasks_1779
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-brand-bg border-2 border-brand-navy shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-brand-red text-white px-5 py-4 flex items-center justify-between">
          <span className="font-display font-extrabold text-lg tracking-wide uppercase">
            {existingRule ? "Edit Rule" : "Add Auto-Assign Rule"}
          </span>
          <button onClick={onClose} className="hover:opacity-80 transition-opacity">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Source keyword */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">
              WHEN SOURCE MATCHES (app name or domain)
            </label>
            <input
              type="text"
              value={appName}
              onChange={e => setAppName(e.target.value)}
              className="w-full flat-input font-mono font-semibold text-sm"
              placeholder="e.g. claude.ai or chrome or vlc"
              disabled={!!existingRule}
              required
            />
            {!existingRule && (
              <span className="text-[11px] text-brand-dim mt-1 block">
                Tally looks up the active window title or website domain using this keyword.
              </span>
            )}
          </div>

          {/* Project & Category row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">ASSIGN PROJECT</label>
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                className="w-full flat-select font-semibold"
              >
                {projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">ASSIGN CATEGORY</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full flat-select font-semibold"
              >
                <option value="">— Uncategorized —</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NetSuite Details Divider */}
          <div className="pt-2">
            <div className="bg-brand-navy text-white px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase mb-3">
              NetSuite Auto-Fill Defaults
            </div>
          </div>

          {/* NetSuite Project */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Customer : Project</label>
            <SearchableProjectSelect
              value={nsProject}
              onChange={val => {
                setNsProject(val);
                setNsTask("");
              }}
            />
          </div>

          {/* NetSuite Task */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Task</label>
            <select
              value={nsTask}
              onChange={e => setNsTask(e.target.value)}
              disabled={nsTasks.length === 0}
              className="w-full flat-select font-sans text-xs disabled:opacity-50"
            >
              <option value="">— Select NetSuite Task —</option>
              {nsTasks.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* NetSuite Service Item */}
          <div>
            <label className="block font-mono text-xs font-semibold tracking-wider text-brand-dim uppercase mb-1">NS Service Item</label>
            <SearchableServiceItemSelect
              value={nsServiceItem}
              onChange={val => setNsServiceItem(val)}
            />
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-brand-navy hover:bg-brand-accent transition-colors font-display font-extrabold text-xs uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors font-display font-extrabold text-xs uppercase"
            >
              Save Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
