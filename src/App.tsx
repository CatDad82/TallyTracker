import { useState, useEffect, useRef } from "react";
import { Calendar, Settings, Play, Check, AlertCircle, Clock, List, BarChart3, Users, Settings2, HelpCircle } from "lucide-react";
import { TimeEntry, AppAssociation, MondayBoard, SystemSettings } from "./types.js";
import { TimerTab } from "./components/TimerTab.js";
import { LogTab } from "./components/LogTab.js";
import { SummaryTab } from "./components/SummaryTab.js";
import { ReportsTab } from "./components/ReportsTab.js";
import { AssociationsTab } from "./components/AssociationsTab.js";
import { EditEntryModal, AddRuleModal } from "./components/Modals.js";

export default function App() {
  const [tab, setTab] = useState<"timer" | "log" | "summary" | "reports" | "associations">("timer");

  // Database states
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [rules, setRules] = useState<AppAssociation[]>([]);
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({});

  // Summary and Reports states
  const [summaryData, setSummaryData] = useState({ total_seconds: 0, by_project: [], by_category: [] });
  const [summaryPeriod, setSummaryPeriod] = useState("Today");
  const [summaryFrom, setSummaryFrom] = useState("");
  const [summaryTo, setSummaryTo] = useState("");

  const [reportRows, setReportRows] = useState([]);
  const [reportGroupBy, setReportGroupBy] = useState("Task");
  const [reportDays, setReportDays] = useState(7);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  // Timer states
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Modals / Overlays
  const [toast, setToast] = useState<{ msg: string; type: "success" | "monday" | "warn" } | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<AppAssociation | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch meta lists and initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Update live stopwatch
  useEffect(() => {
    if (activeEntry) {
      const start = new Date(activeEntry.start_time).getTime();
      const updateTimer = () => {
        const now = new Date().getTime();
        setTimerSeconds(Math.max(0, Math.floor((now - start) / 1000)));
      };
      updateTimer();
      timerIntervalRef.current = setInterval(updateTimer, 1000);
    } else {
      setTimerSeconds(0);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeEntry]);

  const fetchInitialData = async (retries = 5, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const [metaRes, activeRes, assocRes, settingsRes, summaryRes, reportsRes] = await Promise.all([
          fetch("/api/meta").then(r => { if (!r.ok) throw new Error("meta failed"); return r.json(); }),
          fetch("/api/active").then(r => { if (!r.ok) throw new Error("active failed"); return r.json(); }),
          fetch("/api/associations").then(r => { if (!r.ok) throw new Error("associations failed"); return r.json(); }),
          fetch("/api/settings").then(r => { if (!r.ok) throw new Error("settings failed"); return r.json(); }),
          fetch("/api/summary?period=Today").then(r => { if (!r.ok) throw new Error("summary failed"); return r.json(); }),
          fetch("/api/reports?group_by=Task&days=7").then(r => { if (!r.ok) throw new Error("reports failed"); return r.json(); })
        ]);

        setProjects(metaRes.projects || []);
        setCategories(metaRes.categories || []);
        setActiveEntry(activeRes || null);
        setRules(assocRes.rules || []);
        setBoards(assocRes.boards || []);
        setSettings(settingsRes || {});
        setSummaryData(summaryRes);
        setReportRows(reportsRes);

        // Fetch normal logs too
        fetchLogs();
        return; // Success, exit retry loop
      } catch (e) {
        if (attempt === retries) {
          console.error("Failed to load initial full-stack data after " + retries + " attempts", e);
        } else {
          console.warn(`Attempt ${attempt} to fetch initial data failed, retrying in ${delay}ms...`, e);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5; // Exponential backoff
        }
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/entries?days=7");
      const logs = await res.json();
      setEntries(logs);
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  };

  const showToast = (msg: string, type: "success" | "monday" | "warn" = "success") => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // --- Handlers ---

  const handleStartTracking = async (params: {
    task: string;
    project: string;
    category: string;
    notes: string;
    ns_project?: string;
    ns_task?: string;
    ns_service_item?: string;
    monday_board_id?: string;
    monday_item_id?: string;
    board_name?: string;
    task_name?: string;
    app_name?: string;
    url_context?: string;
  }) => {
    try {
      const res = await fetch("/api/entries/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setActiveEntry(data);
      showToast(`Auto-tracking:\n${params.project}  ${params.task}`, params.monday_item_id ? "monday" : "success");
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Failed to start timer");
    }
  };

  const handleStopTracking = async () => {
    try {
      const res = await fetch("/api/entries/stop", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setActiveEntry(null);
      showToast("Timer stopped successfully!");
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Failed to stop timer");
    }
  };

  const handleAddProject = async (name: string) => {
    try {
      const res = await fetch("/api/meta/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const list = await res.json();
      setProjects(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCategory = async (name: string) => {
    try {
      const res = await fetch("/api/meta/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const list = await res.json();
      setCategories(list);
    } catch (e) {
      console.error(e);
    }
  };

  // --- Log / Summary period updates ---
  const handleLogFilterChange = async (params: {
    days?: number;
    category?: string;
    project?: string;
    from?: string;
    to?: string;
  }) => {
    try {
      let url = `/api/entries?`;
      if (params.from && params.to) {
        url += `from=${params.from}&to=${params.to}`;
      } else {
        url += `days=${params.days || 7}`;
      }
      if (params.category) url += `&category=${params.category}`;
      if (params.project) url += `&project=${params.project}`;

      const res = await fetch(url);
      const data = await res.json();
      setEntries(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSummaryPeriodChange = async (p: string) => {
    setSummaryPeriod(p);
    try {
      const res = await fetch(`/api/summary?period=${p}`);
      const data = await res.json();
      setSummaryData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplySummaryCustomRange = async () => {
    if (summaryFrom && summaryTo) {
      try {
        const res = await fetch(`/api/summary?period=Custom&from=${summaryFrom}&to=${summaryTo}`);
        const data = await res.json();
        setSummaryData(data);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleReportsGroupByChange = async (val: string) => {
    setReportGroupBy(val);
    fetchReports(val, reportDays, reportFrom, reportTo);
  };

  const handleReportsDaysChange = async (val: number) => {
    setReportDays(val);
    fetchReports(reportGroupBy, val, reportFrom, reportTo);
  };

  const fetchReports = async (groupBy: string, daysBack: number, from?: string, to?: string) => {
    try {
      let url = `/api/reports?group_by=${groupBy}`;
      if (from && to) {
        url += `&from=${from}&to=${to}`;
      } else {
        url += `&days=${daysBack}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setReportRows(data);
    } catch (e) {
      console.error(e);
    }
  };

  // --- CRUD Actions ---

  const handleEditEntrySave = async (id: number, fields: Partial<TimeEntry>) => {
    try {
      await fetch(`/api/entries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields)
      });
      fetchInitialData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteEntries = async (ids: number[]) => {
    try {
      await fetch("/api/entries/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      fetchInitialData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkUpdate = async (ids: number[], project?: string, category?: string) => {
    try {
      await fetch("/api/entries/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, project, category })
      });
      fetchInitialData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkNetSuite = (ids: number[]) => {
    // Open bulk netsuite modal
    // To keep simple, we can prompt for a simulated bulk update or trigger.
    const ns_project = prompt("Enter NetSuite Project (e.g. '1778 — Admin (Leave / PTO)'):");
    if (ns_project === null) return;
    const ns_task = prompt("Enter NetSuite Task (e.g. 'PTO (Paid Time Off)'):") || "";
    const ns_service_item = prompt("Enter NetSuite Service Item (e.g. 'Consulting - Senior'):") || "";

    fetch("/api/entries/bulk-netsuite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ns_project, ns_task, ns_service_item })
    }).then(() => {
      fetchInitialData();
      alert("Successfully applied NetSuite parameters to selected entries.");
    });
  };

  const handleExportCSV = () => {
    // Build CSV file string
    let csv = "DATE,TASK,PROJECT,CATEGORY,NOTES,NS_PROJECT,NS_TASK,NS_SERVICE_ITEM,DURATION(s),SOURCE\n";
    entries.forEach(e => {
      csv += `"${e.start_time.split("T")[0]}","${e.task}","${e.project}","${e.category || ""}","${e.notes || ""}","${e.ns_project || ""}","${e.ns_task || ""}","${e.ns_service_item || ""}",${e.duration_seconds || 0},"${e.monday_board_id ? "Monday.com" : e.app_name || "Manual"}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tally_timelogs_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportReports = (format: "csv" | "json") => {
    if (format === "csv") {
      let csv = `${reportGroupBy.toUpperCase()},ENTRIES,DURATION(s),DETAIL\n`;
      reportRows.forEach((r: any) => {
        csv += `"${r.grp}",${r.n},${r.secs},"${r.extra || ""}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tally_report_${reportGroupBy.toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([JSON.stringify(reportRows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tally_report_${reportGroupBy.toLowerCase()}_${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSaveRule = async (rule: AppAssociation) => {
    try {
      const res = await fetch("/api/associations/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule)
      });
      const data = await res.json();
      setRules(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRule = async (appName: string) => {
    try {
      const res = await fetch(`/api/associations/rule/${appName}`, { method: "DELETE" });
      const data = await res.json();
      setRules(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRule = async (rule: AppAssociation) => {
    const updatedRule = { ...rule, auto_track: rule.auto_track === 1 ? 0 : 1 };
    await handleSaveRule(updatedRule);
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      const res = await fetch(`/api/associations/board/${boardId}`, { method: "DELETE" });
      const data = await res.json();
      setBoards(data.boards);
      fetchInitialData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<SystemSettings>) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunDailyReview = async (dateStr: string, boardId: string) => {
    const res = await fetch("/api/monday/run-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateStr, boardId })
    });
    const data = await res.json();
    fetchInitialData();
    return {
      success: !data.error,
      posted: data.posted || 0,
      updated: data.updated || 0,
      msg: data.error || data.msg
    };
  };

  const isTracking = !!activeEntry;
  const project = activeEntry?.project || "General";

  return (
    <div className="h-screen flex flex-col bg-brand-bg font-sans text-brand-navy overflow-hidden">
      {/* Native Windows-like title bar */}
      <div className="flex-none height-[34px] bg-brand-navy flex items-center justify-between px-3.5 select-none">
        <div className="flex items-center gap-2">
          <div className="w-[18px] h-[18px] bg-brand-red flex items-center justify-center">
            <div className="w-2 h-2 rounded-full border-2 border-white"></div>
          </div>
          <span className="font-mono text-xs text-brand-dim-dark letter-spacing-wide">Tally Time Tracker</span>
        </div>
        <div className="flex gap-3.5 text-brand-dim-dark font-sans text-xs cursor-pointer">
          <span>─</span>
          <span>□</span>
          <span onClick={() => alert("Tally is running locally in your background. Use the tabs to browse logs!")} className="hover:text-brand-red">✕</span>
        </div>
      </div>

      {/* Hero Brand Header */}
      <div className="flex-none bg-brand-navy px-6 py-4 flex items-end justify-between border-t border-brand-border/20">
        <div className="flex items-baseline gap-2.5">
          <div className="font-display font-black text-3xl md:text-4xl text-white tracking-tight uppercase">TALLY</div>
          <div className="font-mono text-[9px] font-bold tracking-widest text-brand-dim-dark uppercase">DECK WATCHER</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isTracking ? "bg-brand-red animate-pulse" : "bg-brand-dim-dark"}`}></span>
          <span className="font-mono text-[10px] font-bold text-white tracking-wider uppercase">
            {isTracking ? `LIVE · ${project.toUpperCase()}` : "IDLE"}
          </span>
        </div>
      </div>

      {/* Navigation Tab strip */}
      <div className="flex-none flex bg-brand-navy px-6 select-none border-t border-brand-border/10 overflow-x-auto">
        {(["timer", "log", "summary", "reports", "associations"] as const).map(t => {
          const isActive = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`font-display font-black text-xs tracking-wider uppercase px-4 py-3 cursor-pointer border-t-2 transition-all ${
                isActive
                  ? "text-white bg-brand-red border-brand-red"
                  : "text-brand-dim-dark bg-transparent border-transparent hover:text-white"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 pr-[340px] relative">
        {tab === "timer" && (
          <TimerTab
            isTracking={isTracking}
            timerSeconds={timerSeconds}
            projects={projects}
            categories={categories}
            recentEntries={entries.slice(0, 5)}
            onStartTracking={handleStartTracking}
            onStopTracking={handleStopTracking}
            onAddProject={handleAddProject}
            onAddCategory={handleAddCategory}
          />
        )}

        {tab === "log" && (
          <LogTab
            entries={entries}
            projects={projects}
            categories={categories}
            onDeleteEntries={handleDeleteEntries}
            onEditEntryClick={entry => setEditingEntry(entry)}
            onBulkUpdate={handleBulkUpdate}
            onBulkNetSuite={handleBulkNetSuite}
            onExportCSV={handleExportCSV}
            onFilterChange={handleLogFilterChange}
          />
        )}

        {tab === "summary" && (
          <SummaryTab
            summaryData={summaryData}
            period={summaryPeriod}
            onPeriodChange={handleSummaryPeriodChange}
            fromDate={summaryFrom}
            onFromDateChange={setSummaryFrom}
            toDate={summaryTo}
            onToDateChange={setSummaryTo}
            onApplyCustomRange={handleApplySummaryCustomRange}
          />
        )}

        {tab === "reports" && (
          <ReportsTab
            reportRows={reportRows}
            groupBy={reportGroupBy}
            onGroupByChange={handleReportsGroupByChange}
            days={reportDays}
            onDaysChange={handleReportsDaysChange}
            fromDate={reportFrom}
            onFromDateChange={setReportFrom}
            toDate={reportTo}
            onToDateChange={setReportTo}
            onRefresh={async () => fetchReports(reportGroupBy, reportDays, reportFrom, reportTo)}
            onExport={handleExportReports}
          />
        )}

        {tab === "associations" && (
          <AssociationsTab
            rules={rules}
            boards={boards}
            settings={settings}
            onAddRuleClick={() => setIsAddingRule(true)}
            onEditRuleClick={rule => setEditingRule(rule)}
            onDeleteRule={handleDeleteRule}
            onToggleRule={handleToggleRule}
            onDeleteBoard={handleDeleteBoard}
            onSaveSettings={handleSaveSettings}
            onRunDailyReview={handleRunDailyReview}
          />
        )}
      </div>

      {/* Toasts */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 bg-brand-navy border-t-4 border-brand-red text-white p-4 shadow-lg flex flex-col min-w-[280px] animate-in slide-in-from-bottom-5 duration-200">
          <span className="font-mono text-[9px] font-bold tracking-wider text-brand-dim-dark uppercase">System Alert</span>
          <span className="text-xs font-semibold mt-1 leading-normal whitespace-pre-line">{toast.msg}</span>
        </div>
      )}

      {/* Modals */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          projects={projects}
          categories={categories}
          onClose={() => setEditingEntry(null)}
          onSave={handleEditEntrySave}
        />
      )}

      {isAddingRule && (
        <AddRuleModal
          projects={projects}
          categories={categories}
          onClose={() => setIsAddingRule(false)}
          onSave={handleSaveRule}
        />
      )}

      {editingRule && (
        <AddRuleModal
          projects={projects}
          categories={categories}
          onClose={() => setEditingRule(null)}
          onSave={handleSaveRule}
          existingRule={editingRule}
        />
      )}
    </div>
  );
}
