import React, { useState, useEffect, useRef } from "react";
import { Monitor, Play, RefreshCw, AlertCircle, Compass, Terminal, ShieldAlert } from "lucide-react";
import { AppAssociation, MondayBoard } from "../types.js";

interface SimulationPanelProps {
  onSimulateFocus: (params: {
    app_name: string;
    url_context: string;
    page_title: string;
    monday_board_id?: string;
    monday_item_id?: string;
  }) => void;
  activeApp: string;
  activeTitle: string;
  activeUrl: string;
  rules: AppAssociation[];
  boards: MondayBoard[];
  isTracking: boolean;
}

interface SimulatedPreset {
  label: string;
  app_name: string;
  page_title: string;
  url_context: string;
  icon: React.ReactNode;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  onSimulateFocus,
  activeApp,
  activeTitle,
  activeUrl,
  rules,
  boards,
  isTracking
}) => {
  const [isOpen, setIsSetOpen] = useState(true);
  const [isMonitorOn, setIsMonitorOn] = useState(true);
  const [dwellTarget, setDwellTarget] = useState<SimulatedPreset | null>(null);
  const [dwellElapsed, setDwellTargetElapsed] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(10);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);

  const presets: SimulatedPreset[] = [
    {
      label: "Acme Monday.com Task",
      app_name: "chrome",
      page_title: "Acme Corp Web Redesign - Database migrations hookup",
      url_context: "https://company.monday.com/boards/18418713154/pulses/20384",
      icon: <Compass size={14} className="text-brand-blue" />
    },
    {
      label: "Figma App Design",
      app_name: "figma",
      page_title: "Figma.com - Globex Mobile App UI Screen 1",
      url_context: "https://figma.com/file/globex_app",
      icon: <Compass size={14} className="text-brand-red" />
    },
    {
      label: "VS Code Editor",
      app_name: "vscode",
      page_title: "server.ts - react-example - Visual Studio Code",
      url_context: "",
      icon: <Terminal size={14} className="text-brand-navy" />
    },
    {
      label: "GitHub Repo",
      app_name: "chrome",
      page_title: "Pull Request #12: Auth Middleware · github.com",
      url_context: "https://github.com/acme/auth",
      icon: <Compass size={14} className="text-brand-dim" />
    },
    {
      label: "Slack Internal Chat",
      app_name: "slack",
      page_title: "Slack - #sprint-planning - Acme Corp",
      url_context: "",
      icon: <ShieldAlert size={14} className="text-brand-dim" />
    },
    {
      label: "Spotify Music",
      app_name: "spotify",
      page_title: "Spotify - Focus Flow (Deep Instrumentals)",
      url_context: "",
      icon: <Play size={14} className="text-green-600" />
    }
  ];

  // Handle Dwell Timer countdown (Debounce simulation)
  useEffect(() => {
    if (!isMonitorOn || !dwellTarget) {
      if (timerRef.current) clearInterval(timerRef.current);
      setDwellTargetElapsed(0);
      return;
    }

    timerRef.current = setInterval(() => {
      setDwellTargetElapsed(prev => {
        if (prev >= 20) {
          if (timerRef.current) clearInterval(timerRef.current);
          setShowConfirm(true);
          setConfirmCountdown(10);
          return 20;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dwellTarget, isMonitorOn]);

  // Handle Switch Prompt Auto-Dismiss timer
  useEffect(() => {
    if (!showConfirm) {
      if (confirmTimerRef.current) clearInterval(confirmTimerRef.current);
      return;
    }

    confirmTimerRef.current = setInterval(() => {
      setConfirmCountdown(prev => {
        if (prev <= 1) {
          if (confirmTimerRef.current) clearInterval(confirmTimerRef.current);
          handleAcceptSwitch(); // Auto-confirm switch
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (confirmTimerRef.current) clearInterval(confirmTimerRef.current);
    };
  }, [showConfirm, dwellTarget]);

  const selectPreset = (preset: SimulatedPreset) => {
    if (!isMonitorOn) return;

    // Check if we are already focused on this exact app/URL
    const isSame = preset.app_name === activeApp && preset.url_context === activeUrl;
    if (isSame) {
      setDwellTarget(null);
      return;
    }

    setDwellTarget(preset);
    setDwellTargetElapsed(0);
    setShowConfirm(false);
  };

  const handleForceTrigger = () => {
    if (!dwellTarget) return;
    setDwellTargetElapsed(20);
    setShowConfirm(true);
    setConfirmCountdown(10);
  };

  const handleAcceptSwitch = () => {
    if (!dwellTarget) return;

    let monday_board_id: string | undefined;
    let monday_item_id: string | undefined;

    if (dwellTarget.url_context.includes("monday.com")) {
      const matchBoard = dwellTarget.url_context.match(/\/boards\/(\d+)/);
      const matchItem = dwellTarget.url_context.match(/\/(?:pulses|items)\/(\d+)/);
      if (matchBoard) monday_board_id = matchBoard[1];
      if (matchItem) monday_item_id = matchItem[1];
    }

    onSimulateFocus({
      app_name: dwellTarget.app_name,
      url_context: dwellTarget.url_context,
      page_title: dwellTarget.page_title,
      monday_board_id,
      monday_item_id
    });

    setDwellTarget(null);
    setShowConfirm(false);
  };

  const handleDeclineSwitch = () => {
    setDwellTarget(null);
    setShowConfirm(false);
  };

  return (
    <div className={`fixed right-0 top-[34px] bottom-0 z-40 bg-white border-l-2 border-brand-navy flex flex-col transition-all duration-300 ${isOpen ? "w-[340px]" : "w-0"}`}>
      {/* Toggle Tab */}
      <button
        onClick={() => setIsSetOpen(!isOpen)}
        className="absolute left-[-38px] top-4 bg-brand-navy text-white px-3 py-2 border-2 border-r-0 border-brand-navy cursor-pointer flex items-center justify-center gap-1 shadow-md hover:bg-brand-navy/95"
        style={{ transform: "rotate(0deg)", transformOrigin: "right center" }}
        title="Toggle Simulation Panel"
      >
        <Monitor size={16} />
      </button>

      {isOpen && (
        <div className="flex-1 flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="bg-brand-navy text-white px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor size={16} className="text-brand-red" />
              <span className="font-display font-black text-sm tracking-wide uppercase">Desktop Simulator</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-brand-dim-dark">MONITOR</span>
              <button
                onClick={() => setIsMonitorOn(!isMonitorOn)}
                className={`w-10 h-5 p-0.5 transition-colors relative flex items-center ${isMonitorOn ? "bg-brand-red" : "bg-brand-dim-dark"}`}
              >
                <div className={`w-4 h-4 bg-white transition-all ${isMonitorOn ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>

          {/* Simulated Focus Status Card */}
          <div className="p-4 bg-brand-accent/50 border-b border-brand-border">
            <div className="font-mono text-[9px] font-bold text-brand-dim tracking-wider uppercase mb-2">Active Simulated Focus</div>
            <div className="bg-white border border-brand-border p-3 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-brand-dim">App Process:</span>
                <span className="font-mono font-bold text-brand-red uppercase">{activeApp || "IDLE"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-brand-dim">Page Title:</span>
                <span className="font-semibold text-brand-navy text-right max-w-[170px] truncate" title={activeTitle}>{activeTitle || "None"}</span>
              </div>
              {activeUrl && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-brand-dim">URL/Host:</span>
                  <span className="font-mono text-brand-blue truncate max-w-[170px]" title={activeUrl}>{activeUrl}</span>
                </div>
              )}
            </div>
          </div>

          {/* Dwell Timer / Switch confirmation */}
          <div className="p-4 space-y-3">
            {isMonitorOn && dwellTarget && (
              <div className="p-3 bg-yellow-50 border-2 border-brand-navy space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="text-brand-red flex-shrink-0 mt-0.5 animate-pulse" />
                  <div className="space-y-1">
                    <div className="font-display font-black text-xs text-brand-navy uppercase tracking-wide">Dwell Switch Pending</div>
                    <div className="text-xs text-brand-dim font-medium leading-relaxed">
                      Continuous focus required: <strong className="text-brand-navy">{dwellTarget.label}</strong>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {!showConfirm && (
                  <div className="space-y-2">
                    <div className="h-2 w-full bg-brand-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-navy transition-all duration-1000"
                        style={{ width: `${(dwellElapsed / 20) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-brand-dim">{20 - dwellElapsed}s left</span>
                      <button
                        onClick={handleForceTrigger}
                        className="text-[10px] font-bold text-brand-red hover:underline flex items-center gap-0.5"
                      >
                        <RefreshCw size={10} /> Fast Forward
                      </button>
                    </div>
                  </div>
                )}

                {/* Switch confirmation dialog */}
                {showConfirm && (
                  <div className="bg-brand-navy p-3 space-y-2.5 animate-in slide-in-from-bottom-3 duration-200">
                    <div className="text-xs font-bold text-white leading-normal text-center">
                      Switch timer to:<br />
                      <span className="text-brand-dim-dark">{dwellTarget.page_title.slice(0, 50)}...</span>
                    </div>
                    <div className="text-[10px] text-brand-dim-dark text-center">
                      Auto-keeping current in {confirmCountdown}s
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAcceptSwitch}
                        className="flex-1 bg-brand-blue text-white font-display font-black text-[10px] uppercase py-2 hover:bg-brand-blue/90"
                      >
                        Yes, Switch
                      </button>
                      <button
                        onClick={handleDeclineSwitch}
                        className="flex-1 bg-brand-navy border border-brand-dim-dark text-white font-display font-semibold text-[10px] uppercase py-2 hover:bg-white/10"
                      >
                        Keep Current
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Presets List */}
            <div className="space-y-2">
              <div className="font-mono text-[10px] font-bold text-brand-dim tracking-wider uppercase">Simulate Focus Presets</div>
              <div className="grid grid-cols-1 gap-2">
                {presets.map(p => {
                  const isCurrent = p.app_name === activeApp && p.url_context === activeUrl;
                  const isPending = dwellTarget?.label === p.label;

                  return (
                    <button
                      key={p.label}
                      onClick={() => selectPreset(p)}
                      disabled={!isMonitorOn || isCurrent}
                      className={`w-full flex items-center justify-between p-2.5 border text-left text-xs transition-all ${
                        isCurrent
                          ? "border-brand-navy bg-white shadow-xs font-bold ring-2 ring-brand-navy/10"
                          : isPending
                          ? "border-brand-red bg-yellow-50/50"
                          : !isMonitorOn
                          ? "opacity-50 border-brand-border"
                          : "border-brand-border bg-white hover:border-brand-navy hover:shadow-xs cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-2 max-w-[210px]">
                        {p.icon}
                        <div className="truncate">
                          <div className="font-semibold text-brand-navy truncate">{p.label}</div>
                          <div className="font-mono text-[10px] text-brand-dim truncate">{p.app_name} · {p.page_title}</div>
                        </div>
                      </div>
                      <span className="font-mono text-[10px]">
                        {isCurrent ? "ACTIVE" : isPending ? "DWELLING" : "FOCUS"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SimulationPanel;
