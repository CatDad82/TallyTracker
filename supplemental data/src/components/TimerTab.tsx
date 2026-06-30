/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Play, Square, Tag, Layers, FileText, Briefcase, Sparkles } from "lucide-react";

interface TimerTabProps {
  task: string;
  setTask: (val: string) => void;
  project: string;
  setProject: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  isTracking: boolean;
  onStart: () => void;
  onStop: () => void;
  durationSeconds: number;
  projects: string[];
  categories: string[];
  onAddProject: (p: string) => void;
  onAddCategory: (c: string) => void;
}

export default function TimerTab({
  task,
  setTask,
  project,
  setProject,
  category,
  setCategory,
  notes,
  setNotes,
  isTracking,
  onStart,
  onStop,
  durationSeconds,
  projects,
  categories,
  onAddProject,
  onAddCategory,
}: TimerTabProps) {
  const [newProject, setNewProject] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showAddProj, setShowAddProj] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);

  // Format digital clock time
  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProject.trim()) {
      onAddProject(newProject.trim());
      setProject(newProject.trim());
      setNewProject("");
      setShowAddProj(false);
    }
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setCategory(newCategory.trim());
      setNewCategory("");
      setShowAddCat(false);
    }
  };

  return (
    <div className="space-y-6" id="timer-tab-container">
      {/* Visual Timer Display Card */}
      <div 
        className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl transition-all duration-300 transform"
        id="timer-visual-card"
      >
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#f4673b]"></div>
        
        {/* Glow backdrop decorative accent */}
        <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-[#15ade2]/10 blur-3xl pointer-events-none"></div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#15ade2] font-mono" id="timer-state-label">
            {isTracking ? "● TRACKING YOUR TIME" : "READY TO START"}
          </p>
          <h1 
            className={`font-mono text-7xl font-bold tracking-tight text-white tabular-nums drop-shadow-md select-all transition-all duration-300 ${
              isTracking ? "scale-105 text-[#15ade2]" : "text-slate-300"
            }`}
            id="digital-timer-text"
          >
            {formatTime(durationSeconds)}
          </h1>
          <div className="max-w-md mx-auto truncate min-h-[1.5rem]" id="timer-active-preview">
            {isTracking ? (
              <span className="text-sm text-slate-400 font-medium">
                Working on <strong className="text-white">{task || "Untitled Task"}</strong>
                {project && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    {project}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-slate-500 italic">Enter your task details below to start tracking</span>
            )}
          </div>
        </div>

        {/* Start/Stop Primary Buttons */}
        <div className="mt-8 flex justify-center gap-4" id="timer-action-buttons">
          {!isTracking ? (
            <button
              id="start-timer-btn"
              onClick={onStart}
              className="flex items-center gap-2.5 bg-[#f4673b] hover:bg-[#ff7b52] active:scale-95 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-[#f4673b]/20 hover:shadow-[#f4673b]/30 transition-all font-sans cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Tracker
            </button>
          ) : (
            <button
              id="stop-timer-btn"
              onClick={onStop}
              className="flex items-center gap-2.5 bg-[#ef4444] hover:bg-red-500 active:scale-95 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all font-sans cursor-pointer"
            >
              <Square className="w-5 h-5 fill-current" />
              Stop Tracking
            </button>
          )}
        </div>
      </div>

      {/* Task Attributes Config Form */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-5 shadow-sm" id="timer-attributes-panel">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Work Details</h3>
        
        {/* Task Title Field */}
        <div className="space-y-1.5" id="field-task">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#f4673b]" />
            What are you working on?
          </label>
          <input
            id="input-task-name"
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            disabled={isTracking}
            placeholder="e.g. Design newsletter template or Client onboarding slides"
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-[#f4673b] focus:ring-1 focus:ring-[#f4673b] rounded-lg px-4 py-3 placeholder:text-slate-600 text-sm transition-all focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Dropdowns row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="fields-dropdowns">
          {/* Project dropdown */}
          <div className="space-y-1.5" id="field-project">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-[#15ade2]" />
                Select Project
              </label>
              <button
                id="toggle-add-project"
                type="button"
                onClick={() => setShowAddProj(!showAddProj)}
                disabled={isTracking}
                className="text-xs text-[#15ade2] hover:underline hover:text-cyan-400 disabled:opacity-50"
              >
                {showAddProj ? "Cancel" : "+ New"}
              </button>
            </div>

            {showAddProj ? (
              <form onSubmit={handleCreateProject} className="flex gap-2" id="create-project-form">
                <input
                  id="new-project-input"
                  type="text"
                  required
                  placeholder="New project name..."
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-[#15ade2] text-sm text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-[#15ade2] hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </form>
            ) : (
              <select
                id="select-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={isTracking}
                className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-[#15ade2] rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                <option value="">-- No Project --</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Category dropdown */}
          <div className="space-y-1.5" id="field-category">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#7cc821]" />
                Work Category
              </label>
              <button
                id="toggle-add-category"
                type="button"
                onClick={() => setShowAddCat(!showAddCat)}
                disabled={isTracking}
                className="text-xs text-[#7cc821] hover:underline hover:text-green-400 disabled:opacity-50"
              >
                {showAddCat ? "Cancel" : "+ New"}
              </button>
            </div>

            {showAddCat ? (
              <form onSubmit={handleCreateCategory} className="flex gap-2" id="create-category-form">
                <input
                  id="new-category-input"
                  type="text"
                  required
                  placeholder="New category..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-[#7cc821] text-sm text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-[#7cc821] hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </form>
            ) : (
              <select
                id="select-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isTracking}
                className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-[#7cc821] rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                <option value="">-- No Category --</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Detailed Notes Field */}
        <div className="space-y-1.5" id="field-notes">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Notes or Outcomes (Optional)
          </label>
          <textarea
            id="textarea-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isTracking}
            placeholder="Describe what you accomplished during this session..."
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-slate-700 rounded-lg px-4 py-3 placeholder:text-slate-600 text-sm transition-all focus:outline-none disabled:opacity-50 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
