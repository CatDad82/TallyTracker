/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AppAssociation, MondayBoardAssociation, AppSettings } from "../types";
import { 
  Link2, 
  Sparkles, 
  Volume2, 
  ShieldAlert, 
  Monitor, 
  Settings, 
  Clock, 
  Trash2, 
  CheckSquare,
  Search,
  ExternalLink,
  Key
} from "lucide-react";

interface AssociationsTabProps {
  associations: AppAssociation[];
  onAddAssociation: (assoc: AppAssociation) => void;
  onRemoveAssociation: (appName: string) => void;
  mondayBoards: MondayBoardAssociation[];
  onAddMondayBoard: (assoc: MondayBoardAssociation) => void;
  onRemoveMondayBoard: (boardId: string) => void;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  projects: string[];
  categories: string[];
  onLoadTaskToTimer?: (taskName: string, projName: string, catName: string, itemNotes: string, boardId?: string, itemId?: string) => void;
}

export default function AssociationsTab({
  associations,
  onAddAssociation,
  onRemoveAssociation,
  mondayBoards,
  onAddMondayBoard,
  onRemoveMondayBoard,
  settings,
  onUpdateSettings,
  projects,
  categories,
  onLoadTaskToTimer,
}: AssociationsTabProps) {
  // New App Rules fields
  const [appAppName, setAppAppName] = useState("");
  const [appProject, setAppProject] = useState("");
  const [appCategory, setAppCategory] = useState("");
  const [appTaskHint, setAppTaskHint] = useState("");

  // New Monday Rules fields
  const [monBoardId, setMonBoardId] = useState("");
  const [monBoardName, setMonBoardName] = useState("");
  const [monProject, setMonProject] = useState("");
  const [monCategory, setMonCategory] = useState("");

  // New states to customize temporary token edit
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [tempToken, setTempToken] = useState(settings.mondayApiToken || "");

  const handleAddAppRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (appAppName.trim() && appProject) {
      onAddAssociation({
        appName: appAppName.trim(),
        project: appProject,
        category: appCategory,
        taskHint: appTaskHint.trim() || "",
        autoTrack: true,
      });
      setAppAppName("");
      setAppProject("");
      setAppCategory("");
      setAppTaskHint("");
    }
  };

  const handleAddMondayRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (monBoardId.trim() && monBoardName.trim() && monProject) {
      onAddMondayBoard({
        boardId: monBoardId.trim(),
        boardName: monBoardName.trim(),
        project: monProject,
        category: monCategory,
        autoTrack: true,
      });
      setMonBoardId("");
      setMonBoardName("");
      setMonProject("");
      setMonCategory("");
    }
  };

  const handleSaveToken = () => {
    onUpdateSettings({
      ...settings,
      mondayApiToken: tempToken,
    });
    setIsEditingToken(false);
  };



  return (
    <div className="space-y-6 animate-fade-in text-slate-300 text-xs" id="associations-tab-container">
      
      {/* Top Credentials & Settings Block row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-in" id="rule-sections-layout">
        
        {/* Behavioral Config Options Column */}
        <div className="bg-slate-900 border border-[#3f4a78]/50 rounded-xl p-5 space-y-4 shadow-lg shadow-black/10" id="section-app-settings">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-[#f4673b]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Tracker Options</h3>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="space-y-0.5 pr-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-[#15ade2]" />
                Sound Alerts
              </span>
              <p className="text-[10px] text-slate-500">Play alert sound on task changes</p>
            </div>
            <input
              id="checkbox-ping-sound"
              type="checkbox"
              checked={settings.pingSound}
              onChange={(e) => onUpdateSettings({ ...settings, pingSound: e.target.checked })}
              className="w-4 h-4 rounded text-[#15ade2] bg-slate-900 border-slate-700 cursor-pointer accent-[#15ade2]"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="space-y-0.5 pr-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />
                Away Detection
              </span>
              <p className="text-[10px] text-slate-500">Alert me when I am away from computer</p>
            </div>
            <input
              id="checkbox-idle-detect"
              type="checkbox"
              checked={settings.idleDetect}
              onChange={(e) => onUpdateSettings({ ...settings, idleDetect: e.target.checked })}
              className="w-4 h-4 rounded text-yellow-500 bg-slate-900 border-slate-700 cursor-pointer accent-yellow-500"
            />
          </div>

          {settings.idleDetect && (
            <div className="space-y-1 bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex flex-col">
              <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Away threshold: {settings.idleThresholdMin} min
              </span>
              <input
                id="input-idle-threshold"
                type="range"
                min={1}
                max={30}
                value={settings.idleThresholdMin}
                onChange={(e) => onUpdateSettings({ ...settings, idleThresholdMin: Number(e.target.value) })}
                className="w-full accent-[#15ade2] cursor-pointer mt-1"
              />
            </div>
          )}

          <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="space-y-0.5 pr-2">
              <span className="font-semibold text-slate-200">End-Of-Day Review</span>
              <p className="text-[10px] text-slate-500">Show a summary popup at review time</p>
            </div>
            <input
              id="checkbox-eod-enabled"
              type="checkbox"
              checked={settings.eodEnabled}
              onChange={(e) => onUpdateSettings({ ...settings, eodEnabled: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 cursor-pointer accent-emerald-500"
            />
          </div>

          {settings.eodEnabled && (
            <div className="space-y-1 bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex flex-col">
              <span className="text-[11px] font-semibold text-slate-200">Daily Review Time</span>
              <input
                id="input-eod-time"
                type="time"
                value={settings.eodTime}
                onChange={(e) => onUpdateSettings({ ...settings, eodTime: e.target.value })}
                className="mt-1 bg-slate-900 border border-slate-800 text-white rounded px-2 py-1 focus:outline-none text-xs"
              />
            </div>
          )}
        </div>

        {/* Mappings Panel column */}
        <div className="md:col-span-2 bg-slate-900 border border-[#3f4a78]/50 rounded-xl p-5 space-y-4 shadow-lg shadow-black/10" id="section-app-associations">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-4 h-4 text-[#15ade2]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Automatic Project Detection</h3>
          </div>

          <form onSubmit={handleAddAppRule} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-950 p-3.5 border border-slate-800/80 rounded-lg" id="add-app-rule-form">
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] text-slate-500 font-mono">App / Window Name</label>
              <input
                id="rule-app-name"
                type="text"
                required
                placeholder="e.g. Chrome, Slack, Word"
                value={appAppName}
                onChange={(e) => setAppAppName(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none text-white text-xs"
              />
            </div>
            
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] text-slate-500 font-mono">Link to Project</label>
              <select
                id="rule-app-project"
                required
                value={appProject}
                onChange={(e) => setAppProject(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none cursor-pointer text-white text-xs"
              >
                <option value="">-- Project --</option>
                {projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] text-slate-500 font-mono">Category</label>
              <select
                id="rule-app-category"
                value={appCategory}
                onChange={(e) => setAppCategory(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none cursor-pointer text-white text-xs"
              >
                <option value="">None</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1 justify-end">
              <button
                id="add-app-rule-btn"
                type="submit"
                className="bg-[#15ade2] hover:bg-cyan-500 text-white font-bold h-8 px-3 rounded text-xs transition cursor-pointer"
              >
                Save Link
              </button>
            </div>
          </form>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1" id="app-rules-list">
            {associations.length === 0 ? (
              <p className="text-slate-500 text-center italic py-4">No application link rules added yet.</p>
            ) : (
              associations.map((assoc) => (
                <div key={assoc.appName} className="flex justify-between items-center p-2.5 bg-slate-950/80 border border-slate-800/60 rounded-lg">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white text-[11px]">{assoc.appName}</span>
                    <p className="text-[10px] text-slate-400">
                      Links to project <strong className="text-cyan-450 text-[#15ade2] font-semibold">{assoc.project}</strong>
                      {assoc.category && ` (${assoc.category})`}
                    </p>
                  </div>
                  <button
                    id={`remove-app-rule-${assoc.appName}`}
                    type="button"
                    onClick={() => onRemoveAssociation(assoc.appName)}
                    className="p-1.5 bg-red-950/20 text-red-400 border border-red-950/40 hover:bg-red-900 hover:text-white rounded cursor-pointer transition shrink-0"
                    title="Remove linked application"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Monday Board Linkage Identifiers section */}
      <div className="bg-slate-900 border border-[#3f4a78]/50 rounded-xl p-5 space-y-4 shadow-lg" id="section-monday-rules">
        <div className="flex items-center gap-2 mb-2">
          <CheckSquare className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Linked Monday.com Boards</h3>
        </div>

        <form onSubmit={handleAddMondayRule} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-950 p-3.5 border border-slate-800 rounded-lg">
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-slate-500 font-mono">Monday Board ID</label>
            <input
              id="rule-monday-id"
              type="text"
              required
              placeholder="e.g. 8172901"
              value={monBoardId}
              onChange={(e) => setMonBoardId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none text-white text-xs"
            />
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-slate-500 font-mono">Board Name</label>
            <input
              id="rule-monday-name"
              type="text"
              required
              placeholder="e.g. Campaign Planning Board"
              value={monBoardName}
              onChange={(e) => setMonBoardName(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none text-white text-xs"
            />
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-slate-500 font-mono">Link to Project</label>
            <select
              id="rule-monday-project"
              required
              value={monProject}
              onChange={(e) => setMonProject(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 focus:outline-none cursor-pointer text-white text-xs"
            >
              <option value="">-- Project --</option>
              {projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col space-y-1 justify-end">
            <button
              id="add-monday-rule-btn"
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-8 px-3 rounded text-xs transition cursor-pointer"
            >
              Link Board
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" id="monday-rules-list">
          {mondayBoards.length === 0 ? (
            <p className="md:col-span-3 text-slate-500 italic text-center py-2">No Monday.com boards linked yet.</p>
          ) : (
            mondayBoards.map((board) => (
              <div key={board.boardId} className="flex justify-between items-center p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <div className="space-y-0.5">
                  <span className="font-bold text-amber-400 font-mono">BOARD ID: {board.boardId}</span>
                  <p className="font-semibold text-white line-clamp-1">{board.boardName}</p>
                  <p className="text-[10px] text-slate-400">
                    Links to <strong className="text-cyan-400 font-bold">{board.project}</strong>
                  </p>
                </div>
                <button
                  id={`remove-monday-rule-${board.boardId}`}
                  type="button"
                  onClick={() => onRemoveMondayBoard(board.boardId)}
                  className="p-1.5 bg-red-950/20 text-red-400 border border-red-950/40 hover:bg-red-900 hover:text-white rounded cursor-pointer transition shrink-0 ml-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Monday Developer API Connection Key Card */}
      <div className="bg-slate-900 border border-[#3f4a78]/50 rounded-xl p-5 space-y-4 shadow-lg" id="section-monday-token">
        <div className="flex items-center justify-between border-b border-[#3f4a78]/30 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Monday.com Connection</h3>
          </div>
          <span className="text-[10px] uppercase font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 border border-amber-500/20 rounded-md">Connected</span>
        </div>
        
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Enter your Monday.com API Token to synchronize your tasks automatically in the background.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-slate-950 p-4 border border-slate-800 rounded-lg">
          <input
            id="settings-monday-token-input"
            type="password"
            placeholder="Enter Monday API Token"
            value={tempToken}
            onChange={(e) => setTempToken(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono tracking-widest placeholder:tracking-normal"
          />
          <button
            id="settings-monday-token-save-btn"
            type="button"
            onClick={handleSaveToken}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-lg font-bold text-xs font-sans transition whitespace-nowrap cursor-pointer hover:shadow-lg hover:shadow-amber-500/10"
          >
            Save Token
          </button>
        </div>
        {settings.mondayApiToken && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-mono" id="token-status-indicator">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Connection is active (••••••••{settings.mondayApiToken.slice(-6)})</span>
          </div>
        )}
      </div>

    </div>
  );
}
