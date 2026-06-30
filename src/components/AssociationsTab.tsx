import React, { useState } from "react";
import { Plus, Trash2, Edit3, Settings, Play, Check, AlertCircle } from "lucide-react";
import { AppAssociation, MondayBoard, SystemSettings } from "../types.js";

interface AssociationsTabProps {
  rules: AppAssociation[];
  boards: MondayBoard[];
  settings: SystemSettings;
  onAddRuleClick: () => void;
  onEditRuleClick: (rule: AppAssociation) => void;
  onDeleteRule: (appName: string) => Promise<void>;
  onToggleRule: (rule: AppAssociation) => Promise<void>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onSaveSettings: (settings: Partial<SystemSettings>) => Promise<void>;
  onRunDailyReview: (dateStr: string, boardId: string) => Promise<{ success: boolean; posted: number; updated: number; msg: string }>;
}

export const AssociationsTab: React.FC<AssociationsTabProps> = ({
  rules,
  boards,
  settings,
  onAddRuleClick,
  onEditRuleClick,
  onDeleteRule,
  onToggleRule,
  onDeleteBoard,
  onSaveSettings,
  onRunDailyReview
}) => {
  // Local states for settings
  const [boardId, setBoardId] = useState(settings.REVIEW_BOARD_ID || "");
  const [runHour, setRunHour] = useState(settings.REVIEW_HOUR || "18");
  const [postDate, setPostDate] = useState(new Date().toISOString().split("T")[0]);

  const [saving, setSaving] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleSaveSettings = async () => {
    setSaving(true);
    await onSaveSettings({
      REVIEW_BOARD_ID: boardId,
      REVIEW_HOUR: runHour
    });
    setSaving(false);
    alert("Settings saved successfully!");
  };

  const handleRunReview = async () => {
    if (!boardId) {
      alert("Please configure a Board ID first.");
      return;
    }
    setReviewRunning(true);
    setReviewStatus("Running review... Preparing summary and contacting Monday.com API...");
    setReviewError(null);

    try {
      const result = await onRunDailyReview(postDate, boardId);
      if (result.success) {
        setReviewStatus(result.msg);
      } else {
        setReviewError(result.msg);
        setReviewStatus(null);
      }
    } catch (err: any) {
      setReviewError(err.message || "Execution failed");
      setReviewStatus(null);
    } finally {
      setReviewRunning(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Auto-Assign Rules Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-display font-black text-xl text-brand-navy uppercase tracking-wide">AUTO-ASSIGN RULES</h2>
          <p className="text-sm text-brand-dim mt-1.5 leading-relaxed">
            When a tracked window matches a source or keyword, Tally files it to the right project and category automatically.
          </p>
        </div>
        <button
          onClick={onAddRuleClick}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-red text-white hover:bg-brand-red-dark transition-colors font-display font-black text-xs uppercase cursor-pointer"
        >
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {/* Rules Table */}
      <div className="border-2 border-brand-navy bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-navy text-white text-xs font-display font-black tracking-wider uppercase select-none">
                <th className="py-3 px-4 w-52">When source matches</th>
                <th className="py-3 px-4 w-44">Assign project</th>
                <th className="py-3 px-4 w-36">Assign category</th>
                <th className="py-3 px-4 min-w-[200px]">NetSuite Default Fields</th>
                <th className="py-3 px-4 w-20 text-center">Auto-Track</th>
                <th className="py-3 px-4 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-brand-navy">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-semibold text-brand-dim bg-white">
                    No rules configured. Click "Add Rule" to automate your tracking!
                  </td>
                </tr>
              ) : (
                rules.map((r, index) => {
                  const isEven = index % 2 === 1;

                  return (
                    <tr
                      key={r.app_name}
                      onDoubleClick={() => onEditRuleClick(r)}
                      className={`hover:bg-brand-accent/40 select-none group transition-colors duration-100 ${
                        isEven ? "bg-brand-bg/40" : "bg-white"
                      }`}
                    >
                      {/* Match Source */}
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-brand-red uppercase">
                        <span className="bg-brand-accent/60 border border-brand-border px-2 py-1">
                          {r.app_name}
                        </span>
                      </td>

                      {/* Project */}
                      <td className="py-3 px-4 font-sans font-bold text-sm text-brand-navy">
                        {r.project}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-dim font-medium">
                        {r.category || "—"}
                      </td>

                      {/* NetSuite Details */}
                      <td className="py-3 px-4 font-sans text-xs text-brand-navy max-w-xs truncate" title={`${r.ns_project || ""} / ${r.ns_task || ""}`}>
                        {r.ns_project ? (
                          <div>
                            <span className="font-semibold">{r.ns_project.split(" — ")[0]}</span>
                            {r.ns_task && ` · ${r.ns_task}`}
                            {r.ns_service_item && ` · ${r.ns_service_item}`}
                          </div>
                        ) : "—"}
                      </td>

                      {/* Toggle */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => onToggleRule(r)}
                            className={`w-10 h-5 p-0.5 transition-colors relative flex items-center ${
                              r.auto_track === 1 ? "bg-brand-red" : "bg-brand-dim/30"
                            }`}
                          >
                            <div className={`w-4 h-4 bg-white transition-all ${r.auto_track === 1 ? "translate-x-5" : ""}`} />
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditRuleClick(r)}
                            className="p-1 hover:text-brand-red text-brand-navy transition-colors"
                            title="Edit Rule"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete rule for "${r.app_name}"?`)) {
                                onDeleteRule(r.app_name);
                              }
                            }}
                            className="p-1 hover:text-brand-red text-brand-navy transition-colors"
                            title="Delete Rule"
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

      {/* Monday Boards Divider */}
      <div className="pt-2">
        <h3 className="font-display font-black text-sm text-brand-navy uppercase tracking-wider mb-3">MONDAY.COM CONNECTED BOARDS</h3>
        <div className="border-2 border-brand-navy bg-white overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-navy text-white text-xs font-display font-black tracking-wider uppercase select-none">
                <th className="py-3 px-4 w-44">Board ID</th>
                <th className="py-3 px-4">Board Name</th>
                <th className="py-3 px-4 w-44">Default Project</th>
                <th className="py-3 px-4 w-44">Default Category</th>
                <th className="py-3 px-4 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-brand-navy">
              {boards.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm font-semibold text-brand-dim bg-white">
                    No Monday.com boards connected yet. These are learned automatically when a Monday task is focused.
                  </td>
                </tr>
              ) : (
                boards.map(b => (
                  <tr key={b.board_id} className="hover:bg-brand-accent/40 select-none">
                    <td className="py-3 px-4 font-mono text-xs text-brand-dim">{b.board_id}</td>
                    <td className="py-3 px-4 font-sans font-bold text-sm text-brand-navy">{b.board_name || `Board ${b.board_id}`}</td>
                    <td className="py-3 px-4 font-sans text-xs font-semibold text-brand-navy">{b.project}</td>
                    <td className="py-3 px-4 font-sans text-xs text-brand-dim">{b.category || "—"}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          if (window.confirm("Disconnect this board from Tally?")) {
                            onDeleteBoard(b.board_id);
                          }
                        }}
                        className="p-1 hover:text-brand-red text-brand-navy transition-colors"
                        title="Disconnect Board"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Review Panel */}
      <div className="pt-2">
        <h3 className="font-display font-black text-sm text-brand-navy uppercase tracking-wider mb-3">DAILY REVIEW TO MONDAY</h3>
        <div className="border-2 border-brand-navy bg-white shadow-xs p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block font-mono text-xs font-bold text-brand-dim uppercase tracking-wider mb-1.5">BOARD ID</label>
              <input
                type="text"
                value={boardId}
                onChange={e => setBoardId(e.target.value)}
                className="w-full flat-input font-mono text-sm"
                placeholder="e.g. 18418713154"
              />
            </div>
            <div>
              <label className="block font-mono text-xs font-bold text-brand-dim uppercase tracking-wider mb-1.5">RUN AT HOUR</label>
              <select
                value={runHour}
                onChange={e => setRunHour(e.target.value)}
                className="w-full flat-select font-sans text-sm font-semibold"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h.toString()}>
                    {h.toString().padStart(2, "0")}:00 (Review Hour)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs font-bold text-brand-dim uppercase tracking-wider mb-1.5">POST DATE</label>
              <input
                type="date"
                value={postDate}
                onChange={e => setPostDate(e.target.value)}
                className="w-full flat-input font-mono text-sm"
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-5 py-3 border-2 border-brand-navy hover:bg-brand-accent text-brand-navy font-display font-black text-xs uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Settings size={14} /> Save Review Settings
            </button>
            <button
              onClick={handleRunReview}
              disabled={reviewRunning}
              className="px-6 py-3 bg-brand-navy hover:bg-brand-navy/95 text-white disabled:opacity-60 font-display font-black text-xs uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Play size={14} fill="white" /> Run Daily Review Now
            </button>
          </div>

          {/* Feed Output Status */}
          {reviewStatus && (
            <div className="p-3 bg-brand-accent/30 border border-brand-border flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <Check size={16} className="text-brand-navy flex-shrink-0 mt-0.5" />
              <div className="text-xs font-mono font-medium text-brand-navy leading-normal">{reviewStatus}</div>
            </div>
          )}

          {reviewError && (
            <div className="p-3 bg-red-50 border border-brand-red flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <AlertCircle size={16} className="text-brand-red flex-shrink-0 mt-0.5" />
              <div className="text-xs font-mono font-medium text-brand-red leading-normal">{reviewError}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default AssociationsTab;
