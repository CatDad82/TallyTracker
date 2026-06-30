/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  INITIAL_ENTRIES, 
  INITIAL_PROJECTS, 
  INITIAL_CATEGORIES, 
  DEFAULT_SETTINGS, 
  INITIAL_ASSOCIATIONS, 
  INITIAL_MONDAY_BOARDS 
} from "./mockData";
import { TimeEntry, AppAssociation, MondayBoardAssociation, AppSettings } from "./types";

// Component imports
import TimerTab from "./components/TimerTab";
import DashboardTab from "./components/DashboardTab";
import LogTab from "./components/LogTab";
import SummaryTab from "./components/SummaryTab";
import AssociationsTab from "./components/AssociationsTab";

import { 
  Play, 
  Square, 
  Clock, 
  List, 
  Sparkles, 
  HelpCircle, 
  LogOut, 
  Check, 
  AlertTriangle,
  Layers,
  Award,
  ChevronRight,
  Monitor
} from "lucide-react";

// Synthesizer custom alert tone for sandboxed browser spaces
const playWebAudioPing = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    // D5 note progressing to A5 to make a high-fidelity "success sync" alert sound
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); 
    
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.debug("Web Audio API not supported or blocked by user focus gesture permissions: ", e);
  }
};

// Polling static matching structures exactly copying Python counterpart
const SKIP_APPS = new Set([
  "explorer", "explorer.exe", "searchhost", "shellexperiencehost",
  "startmenuexperiencehost", "lockapp", "screenclipper",
  "timetracker", "python", "pythonw", "cmd", "powershell",
  "windowsterminal", "taskmgr", "applicationframehost", "cmd.exe", "powershell.exe"
]);

const BROWSER_APPS = new Set([
  "chrome", "msedge", "firefox", "brave", "opera", "safari", "vivaldi", 
  "google chrome", "microsoft edge", "brave.exe", "msedge.exe", "chrome.exe", "firefox.exe"
]);

function parseMondayUrl(url: string): { boardId: string | null, itemId: string | null } {
  if (!url || !url.includes("monday.com")) return { boardId: null, itemId: null };
  
  let boardId: string | null = null;
  let itemId: string | null = null;

  const boardMatch = url.match(/\/boards\/(\d+)/);
  if (boardMatch) boardId = boardMatch[1];
  
  if (!boardId) {
    const boardQp = url.match(/[?&]boardId=(\d+)/);
    if (boardQp) boardId = boardQp[1];
  }

  const itemMatch = url.match(/\/(?:pulses|items)\/(\d+)/);
  if (itemMatch) itemId = itemMatch[1];

  if (!itemId) {
    const itemQp = url.match(/[?&](?:pulseId|itemId)=(\d+)/);
    if (itemQp) itemId = itemQp[1];
  }

  if (!boardId) {
    const sections = url.match(/monday\.com\/([a-zA-Z][a-zA-Z0-9_-]*)/);
    const section = sections ? sections[1] : "home";
    if (section !== "boards") {
      boardId = `page_${section}`;
    }
  }

  return { boardId, itemId };
}

function hostnameFromUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host;
  } catch (e) {
    return "";
  }
}

function cleanBrowserTitle(title: string): string {
  if (!title) return "";
  const suffixes = [
    " - Google Chrome", " — Google Chrome",
    " - Microsoft Edge", " — Microsoft Edge",
    " - Mozilla Firefox", " — Mozilla Firefox",
    " - Brave", " — Brave",
    " - Opera", " — Opera",
  ];
  let t = title;
  for (const suf of suffixes) {
    if (t.endsWith(suf)) {
      t = t.slice(0, -suf.length).trim();
    }
  }
  return t.trim();
}

function browserTaskLabel(url: string, windowTitle: string): string {
  const host = hostnameFromUrl(url);
  const title = cleanBrowserTitle(windowTitle);
  if (host && title) {
    if (title.toLowerCase().startsWith(host)) {
      return title;
    }
    return `${host} - ${title}`;
  }
  return host || title || "Browser";
}

declare global {
  interface Window {
    electronAPI?: {
      getActiveWindowProcess: () => Promise<{ appName: string; urlContext?: string }>;
      onTrayNotification: (callback: (event: any, data: any) => void) => void;
    };
  }
}

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"timer" | "dashboard" | "log" | "summary" | "associations">("timer");

  // Core Data State
  const [entries, setEntries] = useState<TimeEntry[]>(() => {
    const saved = localStorage.getItem("timetracker_entries");
    return saved ? JSON.parse(saved) : INITIAL_ENTRIES;
  });

  const [projects, setProjects] = useState<string[]>(() => {
    const saved = localStorage.getItem("timetracker_projects");
    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
  });

  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("timetracker_categories");
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [associations, setAssociations] = useState<AppAssociation[]>(() => {
    const saved = localStorage.getItem("timetracker_associations");
    return saved ? JSON.parse(saved) : INITIAL_ASSOCIATIONS;
  });

  const [mondayBoards, setMondayBoards] = useState<MondayBoardAssociation[]>(() => {
    const saved = localStorage.getItem("timetracker_monday_boards");
    return saved ? JSON.parse(saved) : INITIAL_MONDAY_BOARDS;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("timetracker_settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // Active tracker state
  const [isTracking, setIsTracking] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Form Fields State
  const [task, setTask] = useState("");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  // Simulated state markers (OS Active window and browser tab URLs)
  const [simActiveWindow, setSimActiveWindow] = useState("Manual Management Mode");
  const [simActiveUrl, setSimActiveUrl] = useState("");

  // Real core OS tracker detected state (Desktop Mode execution)
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  const [detectedActiveWindow, setDetectedActiveWindow] = useState("Listening for Active OS Windows...");
  const [detectedActiveUrl, setDetectedActiveUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      setIsDesktopMode(true);
    }
  }, []);

  // Polling & Debouncing States (copying Python TimeTrackerApp mechanics)
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [pendingActionPayload, setPendingActionPayload] = useState<any | null>(null);

  // Popup overlay dialog references
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastColor, setToastColor] = useState("bg-[#7cc821]"); // success color default

  // Switch Confirm Dialog States (10-second autofocus switch rule countdown)
  const [pendingSwitchData, setPendingSwitchData] = useState<{
    project: string;
    category: string;
    task: string;
    notes: string;
    appName: string;
    urlContext: string;
  } | null>(null);
  const [switchCountdown, setSwitchCountdown] = useState(10);

  // Away Dialog States (Mock user inactivities)
  const [pendingAwaySeconds, setPendingAwaySeconds] = useState<number | null>(null);

  // End of Day Promotion states
  const [showEODPrompt, setShowEODPrompt] = useState(false);

  // Timer Tick implementation handling
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if (isTracking) {
      timerInterval = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
        
        // Update browser document tab title dynamically
        const hours = Math.floor((durationSeconds + 1) / 3600);
        const mins = Math.floor(((durationSeconds + 1) % 3600) / 60);
        const secs = (durationSeconds + 1) % 60;
        const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        document.title = `⏱️ ${timeStr} - ${task || "Active Session"}`;
      }, 1000);
    } else {
      document.title = "Smart Time Tracker Dashboard";
    }
    return () => clearInterval(timerInterval);
  }, [isTracking, durationSeconds, task]);

  // Serialise changes into cache databases
  useEffect(() => {
    localStorage.setItem("timetracker_entries", JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem("timetracker_projects", JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem("timetracker_categories", JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem("timetracker_associations", JSON.stringify(associations));
  }, [associations]);

  useEffect(() => {
    localStorage.setItem("timetracker_monday_boards", JSON.stringify(mondayBoards));
  }, [mondayBoards]);

  useEffect(() => {
    localStorage.setItem("timetracker_settings", JSON.stringify(settings));
  }, [settings]);

  // 10-second countdown tick for the SwitchConfirmDialog (auto-declines / keeps current when it hits zero in Python)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pendingSwitchData && switchCountdown > 0) {
      interval = setInterval(() => {
        setSwitchCountdown((prev) => {
          if (prev <= 1) {
            handleDeclineSwitch();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pendingSwitchData, switchCountdown]);

  // 15-second background polling loop checking active window (matches Python 15s thread loop sleep)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      triggerActiveWindowPoll();
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [simActiveWindow, simActiveUrl, lastKey, pendingKey, pendingSince, mondayBoards, associations, pendingSwitchData, isDesktopMode]);

  // Simple trigger for EOD alert when simulated hour matches settings
  useEffect(() => {
    if (settings.eodEnabled) {
      const checkEod = () => {
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        if (timeNow === settings.eodTime) {
          setShowEODPrompt(true);
        }
      };
      
      const interval = setInterval(checkEod, 60000); // Check once a min
      return () => clearInterval(interval);
    }
  }, [settings.eodEnabled, settings.eodTime]);

  // Audio utility wrapper checking user parameters
  const triggerAudioPing = () => {
    if (settings.pingSound) {
      playWebAudioPing();
    }
  };

  const showToast = (message: string, isWarningOrType: boolean | "success" | "monday" | "warn" = "success") => {
    setToastMessage(message);
    let color = "bg-[#7cc821]"; // success default
    if (isWarningOrType === true || isWarningOrType === "warn") {
      color = "bg-[#e3ac44]"; // warning color
    } else if (isWarningOrType === "monday") {
      color = "bg-[#f6ae2d]"; // Monday amber Orange
    }
    setToastColor(color);
    triggerAudioPing();
    
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Primary active timer control models
  const handleStartTimer = () => {
    const trimmedTask = task.trim();
    if (!trimmedTask) {
      showToast("Please enter a valid task description first.", true);
      return;
    }

    const newId = `session-${Date.now()}`;
    const newEntry: TimeEntry = {
      id: newId,
      project: project || "General",
      category: category || "Unclassified",
      task: trimmedTask,
      notes: notes.trim(),
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      appName: simActiveWindow === "Manual Management Mode" ? "Manual Tracker" : simActiveWindow,
      urlContext: simActiveUrl || undefined,
    };

    setEntries((prev) => [newEntry, ...prev]);
    setCurrentId(newId);
    setDurationSeconds(0);
    setIsTracking(true);
    showToast(`Started active focus sequence: "${trimmedTask}"`);
  };

  const handleStopTimer = () => {
    if (!isTracking || !currentId) return;

    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === currentId) {
          return {
            ...e,
            endTime: new Date().toISOString(),
            durationSeconds: durationSeconds,
          };
        }
        return e;
      })
    );

    setIsTracking(false);
    setCurrentId(null);
    showToast(`Session completed: Tracked ${Math.round(durationSeconds / 60)} minutes effort.`);
  };

  // Trigs simulation switches & background polling (similar to Python _check_active_window and _debounce)
  const checkActiveWindow = (forceCheckWindowName?: string, forceCheckUrlName?: string) => {
    const appName = forceCheckWindowName !== undefined ? forceCheckWindowName : simActiveWindow;
    const url = forceCheckUrlName !== undefined ? forceCheckUrlName : simActiveUrl;

    if (!appName || appName === "Manual Management Mode") {
      setPendingKey(null);
      setPendingSince(null);
      setPendingLabel(null);
      setPendingActionPayload(null);
      return;
    }

    const appLower = appName.toLowerCase();

    // SKIP_APPS check
    if (SKIP_APPS.has(appLower)) {
      console.log(`[Active Monitor] Skipped active window: ${appName}`);
      return;
    }

    let key = "";
    let label = "";
    let switchPayload: any = null;

    // Check if browser
    if (BROWSER_APPS.has(appLower)) {
      if (url && url.includes("monday.com")) {
        const { boardId, itemId } = parseMondayUrl(url);
        if (boardId) {
          key = `monday:${boardId}:${itemId || ""}`;
          label = `monday.com / board ${boardId}` + (itemId ? ` item ${itemId}` : "");

          const assoc = mondayBoards.find((b) => b.boardId === boardId);
          const boardName = assoc ? assoc.boardName : `Board ${boardId}`;
          const taskName = itemId 
            ? `Resolve ticket item #${itemId}` 
            : `Reviewing Monday board: ${boardName}`;

          switchPayload = {
            project: assoc ? assoc.project : "General",
            category: assoc ? assoc.category : "Research",
            task: taskName,
            notes: `Automatically parsed Monday task via Active Monitor. Board #${boardId}`,
            appName: "monday.com",
            urlContext: url,
            mondayBoardId: boardId,
            mondayItemId: itemId || undefined,
            mondayBoardName: boardName,
            mondayTaskName: taskName,
          };
        }
      }

      if (!key) {
        const host = hostnameFromUrl(url);
        key = host ? `browser:${appLower}:${host}` : `browser:${appLower}:${cleanBrowserTitle(appName)}`;
        label = host || cleanBrowserTitle(appName) || appName;

        const foundAppRule = associations.find(
          (a) => a.appName.toLowerCase() === appLower
        );

        switchPayload = {
          project: foundAppRule ? foundAppRule.project : "General",
          category: foundAppRule ? foundAppRule.category : "Communication",
          task: browserTaskLabel(url, appName),
          notes: "Automatically parsed browser context via Active Monitor.",
          appName,
          urlContext: url,
        };
      }
    } else {
      key = `app:${appLower}`;
      label = appName.charAt(0).toUpperCase() + appName.slice(1);

      const foundAppRule = associations.find(
        (a) => a.appName.toLowerCase() === appLower
      );

      switchPayload = {
        project: foundAppRule ? foundAppRule.project : "General",
        category: foundAppRule ? foundAppRule.category : "Unclassified",
        task: foundAppRule?.taskHint || appName,
        notes: "Automatically parsed desktop application context via Active Monitor.",
        appName,
        urlContext: undefined,
      };
    }

    if (!key) return;

    if (key === lastKey) {
      setPendingKey(null);
      setPendingSince(null);
      setPendingLabel(null);
      setPendingActionPayload(null);
      return;
    }

    if (pendingKey !== key) {
      setPendingKey(key);
      setPendingSince(Date.now());
      setPendingLabel(label);
      setPendingActionPayload(switchPayload);
      return;
    }

    // Checking 20-second dwell time threshold
    const elapsedSecs = Math.floor((Date.now() - (pendingSince || Date.now())) / 1000);
    console.log(`[Active Monitor] Dwelling on candidate: ${key} (${elapsedSecs}s / 20s)`);

    if (elapsedSecs < 20) {
      return;
    }

    // Grace period threshold reached! Prompt switch
    setPendingKey(null);
    setPendingSince(null);
    setPendingLabel(null);
    setPendingActionPayload(null);

    // If a switch dialog is already open, do not prompt again (Python behavior)
    if (pendingSwitchData) return;

    setPendingSwitchData(switchPayload);
    setSwitchCountdown(10);
    triggerAudioPing();
  };

  const triggerActiveWindowPoll = (forceCheckWindowName?: string, forceCheckUrlName?: string) => {
    if (window.electronAPI) {
      window.electronAPI.getActiveWindowProcess()
        .then((res) => {
          if (res) {
            setDetectedActiveWindow(res.appName || "Idle/Unknown App");
            setDetectedActiveUrl(res.urlContext || "");
            checkActiveWindow(res.appName, res.urlContext || "");
          }
        })
        .catch((err) => {
          console.error("Failed to poll native active window:", err);
        });
    } else {
      checkActiveWindow(forceCheckWindowName, forceCheckUrlName);
    }
  };

  const handleSimulateAppSwitch = (appName: string, url: string) => {
    setSimActiveWindow(appName);
    setSimActiveUrl(url);
    setPendingKey(null);
    setPendingSince(null);
    setPendingLabel(null);
    setPendingActionPayload(null);

    // Run active monitor immediately
    setTimeout(() => {
      triggerActiveWindowPoll(appName, url);
    }, 100);
  };

  const forcePollActiveWindow = () => {
    triggerActiveWindowPoll();
  };

  const handleAcceptSwitch = () => {
    if (!pendingSwitchData) return;

    // Stop and save any running timer
    if (isTracking && currentId) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === currentId) {
            return {
              ...e,
              endTime: new Date().toISOString(),
              durationSeconds: durationSeconds,
            };
          }
          return e;
        })
      );
    }

    // Start a new timer with our association parameters!
    const newId = `session-${Date.now()}`;
    const newEntry: TimeEntry = {
      id: newId,
      project: pendingSwitchData.project,
      category: pendingSwitchData.category || "Unclassified",
      task: pendingSwitchData.task,
      notes: pendingSwitchData.notes,
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      appName: pendingSwitchData.appName,
      urlContext: pendingSwitchData.urlContext || undefined,
      ...pendingSwitchData,
    };

    // Update active input forms matching tracking
    setTask(pendingSwitchData.task);
    setProject(pendingSwitchData.project);
    setCategory(pendingSwitchData.category);
    setNotes(pendingSwitchData.notes);

    setEntries((prev) => [newEntry, ...prev]);
    setCurrentId(newId);
    setDurationSeconds(0);
    setIsTracking(true);

    const isMonday = pendingSwitchData.appName === "monday.com" || (pendingSwitchData.urlContext && pendingSwitchData.urlContext.includes("monday.com"));
    const toastType = isMonday ? "monday" : "success";

    // Set last tracked context key
    let mappedKey = "";
    if (isMonday && pendingSwitchData.mondayBoardId) {
      mappedKey = `monday:${pendingSwitchData.mondayBoardId}:${pendingSwitchData.mondayItemId || ""}`;
    } else if (pendingSwitchData.appName) {
      mappedKey = `app:${pendingSwitchData.appName.toLowerCase()}`;
    }
    if (mappedKey) setLastKey(mappedKey);

    // Check if there is a mapped rule with autoTrack enabled
    let autoTrackActive = false;
    if (isMonday && pendingSwitchData.mondayBoardId) {
      const match = mondayBoards.find(b => b.boardId === pendingSwitchData.mondayBoardId);
      if (match && match.autoTrack) autoTrackActive = true;
    } else if (pendingSwitchData.appName) {
      const match = associations.find(a => a.appName.toLowerCase() === pendingSwitchData.appName.toLowerCase());
      if (match && match.autoTrack) autoTrackActive = true;
    }

    const modeLabel = autoTrackActive ? "Auto-tracking" : "Tracking";
    showToast(`${modeLabel}\n${pendingSwitchData.project}  ${pendingSwitchData.task}`, toastType);

    setPendingSwitchData(null);
  };

  const handleDeclineSwitch = () => {
    // Reset pending candidate so re-focus doesn't immediately re-trigger (Copying Python keep current behavior)
    setPendingKey(null);
    setPendingSince(null);
    setPendingSwitchData(null);
  };

  // Activity Monitor Simulated Idle warnings
  const handleSimulateIdle = (seconds: number) => {
    if (isTracking) {
      setPendingAwaySeconds(seconds);
      triggerAudioPing();
    }
  };

  const handleDiscardIdle = () => {
    if (!pendingAwaySeconds || !currentId) return;

    // Trim the idle time off the current timer
    setDurationSeconds((prev) => Math.max(0, prev - pendingAwaySeconds));
    showToast(`Trimmed ${Math.round(pendingAwaySeconds / 60)} minutes of idle block intervals.`, true);
    setPendingAwaySeconds(null);
  };

  const handleKeepIdle = () => {
    showToast("Idle duration retained on active session.");
    setPendingAwaySeconds(null);
  };

  // HTTP post mock simulation
  const handlePostHttpServer = (payload: { task: string; project?: string; category?: string; notes?: string }) => {
    // If tracking is active, stop it first
    if (isTracking && currentId) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === currentId) {
            return {
              ...e,
              endTime: new Date().toISOString(),
              durationSeconds: durationSeconds,
            };
          }
          return e;
        })
      );
    }

    // Create a new entry corresponding to API dispatch
    const newId = `session-${Date.now()}`;
    const externalEntry: TimeEntry = {
      id: newId,
      project: payload.project || "General",
      category: payload.category || "Unclassified",
      task: payload.task,
      notes: payload.notes || "Recorded via external HTTP post simulation.",
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      appName: "Chrome Extension API",
    };

    setTask(payload.task);
    setProject(payload.project || "General");
    setCategory(payload.category || "Unclassified");
    setNotes(payload.notes || "");

    setEntries((prev) => [externalEntry, ...prev]);
    setCurrentId(newId);
    setDurationSeconds(0);
    setIsTracking(true);

    showToast(`Synchronized extension signal: "${payload.task}"`);
  };

  // Add Project/Category
  const handleAddProject = (p: string) => {
    if (!projects.includes(p)) {
      setProjects((prev) => [...prev, p]);
      showToast(`Added client project: ${p}`);
    }
  };

  const handleAddCategory = (c: string) => {
    if (!categories.includes(c)) {
      setCategories((prev) => [...prev, c]);
      showToast(`Added category index: ${c}`);
    }
  };

  // Helper actions for log management
  const handleDeleteEntry = (id: string) => {
    if (id === currentId) {
      setIsTracking(false);
      setCurrentId(null);
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    showToast("Time record deleted permanently from data log.", true);
  };

  const handleUpdateEntry = (updated: TimeEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    showToast("Time session parameters updated successfully.");
  };

  // Remove rules configurations
  const handleRemoveAssociation = (appName: string) => {
    setAssociations((prev) => prev.filter((a) => a.appName !== appName));
    showToast("App association rule deleted.", true);
  };

  const handleRemoveMondayBoard = (boardId: string) => {
    setMondayBoards((prev) => prev.filter((b) => b.boardId !== boardId));
    showToast("Monday.com board association rule deleted.", true);
  };

  const handleLoadTaskToTimer = (taskName: string, projName: string, catName: string, itemNotes: string, boardId?: string, itemId?: string) => {
    setTask(taskName);
    setProject(projName || "General");
    setCategory(catName || "Unclassified");
    setNotes(itemNotes || "Fetched via Monday.com API");
    
    // Stop current tracking session if active
    if (isTracking && currentId) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === currentId) {
            return {
              ...e,
              endTime: new Date().toISOString(),
              durationSeconds: durationSeconds,
            };
          }
          return e;
        })
      );
    }

    // Allocate brand-new tracking record matching imported state
    const newId = `session-${Date.now()}`;
    const newEntry: TimeEntry = {
      id: newId,
      project: projName || "General",
      category: catName || "Unclassified",
      task: taskName,
      notes: itemNotes || "Fetched via Monday.com API",
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      appName: "Monday.com API Integrator",
      mondayBoardId: boardId,
      mondayItemId: itemId
    };

    setEntries((prev) => [newEntry, ...prev]);
    setCurrentId(newId);
    setDurationSeconds(0);
    setIsTracking(true);
    setActiveTab("timer");

    showToast(`Successfully synchronized Monday.com task item! Starting focus loop.`);
  };

  return (
    <div className="min-h-screen bg-[#111625] text-slate-100 flex flex-col font-sans relative antialiased" id="app-root">
      
      {/* GLOW DECORATIONS */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] rounded-full bg-[#f4673b]/5 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-12 right-10 w-[300px] h-[300px] rounded-full bg-[#15ade2]/5 blur-3xl pointer-events-none"></div>

      {/* GLOBAL TOAST BANNER */}
      {toastMessage && (
        <div 
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border border-white/10 text-white font-medium text-xs animate-slide-in ${toastColor}`}
          id="global-toast-element"
        >
          <Sparkles className="w-4 h-4 text-white animate-spin shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* OVERLAY DIALOG 1: SWITCH CONFIRM COUNTDOWN */}
      {pendingSwitchData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" id="switch-confirm-overlay">
          <div className="bg-[#1b2238] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-4 animate-scale-in">
            <div className="flex gap-3.5 items-start">
              <div className="bg-[#15ade2]/15 text-[#15ade2] p-2.5 rounded-xl shrink-0 border border-[#15ade2]/20">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Switch tracking project?</h3>
                <p className="text-slate-400 text-xs font-sans">The activity assistant recommends switching your active project:</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-2">
              <div className="flex gap-1.5 items-center">
                <span className="text-[10px] font-mono font-bold bg-[#15ade2] text-slate-950 px-2 py-0.5 rounded uppercase">
                  PROJECT
                </span>
                <span className="text-white font-bold text-xs">{pendingSwitchData.project}</span>
              </div>
              <p className="font-semibold text-slate-300">
                Task: {pendingSwitchData.task}
              </p>
              {pendingSwitchData.appName && (
                <p className="text-[10px] text-slate-500 font-mono">Detected application: {pendingSwitchData.appName}</p>
              )}
            </div>

            <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-lg border border-slate-800 text-[11px]">
              <span className="text-slate-400">Auto-switching in:</span>
              <span className="font-mono text-[#f4673b] font-bold text-xs">{switchCountdown}s</span>
            </div>

            <div className="flex gap-2.5 justify-end pt-1">
              <button
                id="modal-decline-switch"
                onClick={handleDeclineSwitch}
                className="bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs px-5 py-2.5 rounded-xl border border-slate-800 transition cursor-pointer"
              >
                Keep current timer
              </button>
              <button
                id="modal-accept-switch"
                onClick={handleAcceptSwitch}
                className="bg-[#15ade2] hover:bg-cyan-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition"
              >
                Yes, switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DIALOG 2: AWAY IDLE ALERT */}
      {pendingAwaySeconds && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" id="away-idle-overlay">
          <div className="bg-[#1b2238] border border-slate-850 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-start gap-3.5">
              <div className="bg-[#f4673b]/10 text-[#f4673b] p-2.5 rounded-xl shrink-0 border border-[#f4673b]/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Away from Desk Detected</h3>
                <p className="text-slate-400 text-xs font-sans">
                  We noticed you were away for about <strong>{Math.round(pendingAwaySeconds / 60)} minutes</strong>.
                </p>
              </div>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Would you like to remove this away time from your current task, or keep the timer as is?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                id="modal-discard-idle"
                onClick={handleDiscardIdle}
                className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-red-500/10 cursor-pointer transition text-center"
              >
                Remove away time
              </button>
              <button
                id="modal-keep-idle"
                onClick={handleKeepIdle}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-3 rounded-xl cursor-pointer transition text-center"
              >
                Keep full time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DIALOG 3: EOD BANNER */}
      {showEODPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" id="eod-overlay">
          <div className="bg-[#1b2238] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 animate-scale-in">
            <div className="mx-auto bg-green-500/10 text-green-400 p-3 h-12 w-12 rounded-full flex items-center justify-center border border-green-500/20">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-sans">End of Day Review</h3>
              <p className="text-slate-400 text-xs mt-1 font-sans">
                Great job today! Let's review your final time summary.
              </p>
            </div>

            <button
              id="close-eod-dialog"
              onClick={() => {
                setShowEODPrompt(false);
                setActiveTab("summary");
              }}
              className="w-full bg-[#15ade2] hover:bg-cyan-500 text-white font-bold text-xs py-3 rounded-xl shadow-md transition"
            >
              Open Daily Report
            </button>
          </div>
        </div>
      )}

      {/* MAIN SYSTEM CONTAINER: PERSISTS ELEVATED GRID OF THE TEMPLATE */}
      <div className="flex-1 flex overflow-hidden font-sans text-gray-200 bg-[#1b2238]" id="app-viewport-wrapper">
        
        {/* SIDEBAR NAVIGATION PANEL */}
        <aside className="w-64 flex-shrink-0 bg-[#151b2d] border-r border-[#3f4a78] flex flex-col hidden md:flex" id="sidebar-panel">
          <div className="p-6">
            <h1 className="text-[#f4673b] font-bold text-xl tracking-wider uppercase font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#f4673b]" />
              Time Tracker
            </h1>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{isDesktopMode ? "v1.2.4 (Desktop Mode)" : "v1.2.4 (Build Mode)"}</p>
          </div>

          <nav className="flex-1 px-4 space-y-2">
            {[
              { id: "timer", label: "Timer", icon: "⏱" },
              { id: "dashboard", label: "Dashboard", icon: "📊" },
              { id: "log", label: "Activity Log", icon: "📋" },
              { id: "summary", label: "Report", icon: "📈" },
              { id: "associations", label: "Rules & Settings", icon: "⚙️" }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`sidebar-tab-btn-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                    isActive
                      ? "bg-[#36406a] text-white font-bold border-l-4 border-[#f4673b]"
                      : "text-slate-400 hover:bg-[#36406a] hover:text-white"
                  }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ACTIVE OS WINDOW MONITOR/SIMULATOR PANEL */}
          {isDesktopMode && (
            <div className="mx-4 my-2.5 p-3.5 bg-slate-900/90 border border-[#3f4a78]/60 rounded-xl space-y-2.5 shrink-0" id="desktop-monitor-panel">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#15ade2] font-mono">Active Application</span>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Background tracker active"></span>
                  <span className="text-[9px] font-mono text-emerald-400">Active</span>
                </div>
              </div>
              
              <div className="space-y-1 bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <div className="text-[9px] text-slate-400 font-mono">CURRENT WINDOW:</div>
                <div className="text-[11px] text-white font-bold truncate" title={detectedActiveWindow}>
                  {detectedActiveWindow || "Reading..."}
                </div>
                {detectedActiveUrl && (
                  <>
                    <div className="text-[9px] text-slate-400 font-mono mt-1">LINK:</div>
                    <div className="text-[10px] text-slate-300 truncate" title={detectedActiveUrl}>
                      {detectedActiveUrl}
                    </div>
                  </>
                )}
              </div>
              
              <div className="text-[9px] space-y-1 font-mono text-slate-400 border-t border-slate-850 pt-2 p-1.5 bg-slate-950/40 rounded border">
                <div className="flex justify-between">
                  <span>Current Task:</span>
                  <span className="text-slate-300 truncate max-w-[110px] font-bold" title={lastKey || "None"}>{lastKey || "None"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Task:</span>
                  <span className="text-amber-400 truncate max-w-[110px]" title={pendingKey || "None"}>{pendingKey || "None"}</span>
                </div>
              </div>

              <button
                id="desktop-force-poll-btn"
                type="button"
                onClick={forcePollActiveWindow}
                className="w-full bg-[#36406a] hover:bg-[#3f4a78] text-white border border-[#3f4a78]/50 rounded py-1 font-sans font-bold text-[9px] cursor-pointer transition flex items-center justify-center gap-1"
              >
                Refresh Active Window
              </button>
            </div>
          )}

          <div className="p-5 bg-[#111625] border-t border-[#3f4a78] space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#7cc821] shadow-[0_0_8px_#7cc821] shrink-0"></div>
              <span className="text-xs font-mono uppercase text-[#9aa6c7]">Local Database Ready</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#15ade2] shadow-[0_0_8px_#15ade2] shrink-0"></div>
              <span className="text-xs font-mono uppercase text-[#9aa6c7]">Monday Integration Active</span>
            </div>
          </div>
        </aside>

        {/* MAIN VIEWPANE OF APPLET REPRESENTATION */}
        <main className="flex-1 flex flex-col overflow-hidden" id="app-main-content-area">
          
          {/* TOP HEADER STATUS LINE BAR */}
          <header className="h-20 border-b border-[#3f4a78] bg-[#151b2d] flex items-center justify-between px-6 sm:px-10 shrink-0" id="top-header-bar">
            <div className="flex items-center space-x-4">
              <div className="text-xs text-[#9aa6c7]">
                Watching:{" "}
                <span className="text-white italic underline font-mono">
                  {isDesktopMode
                    ? `${detectedActiveWindow}${detectedActiveUrl ? ` - ${detectedActiveUrl}` : ""}`
                    : "Activity Assistant - Active"
                  }
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="text-right">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">Total Today</div>
                <div className="text-base sm:text-lg font-mono font-bold text-[#15ade2]">
                  {Math.floor(entries.reduce((v, e) => v + e.durationSeconds, 0) / 3600)}h{" "}
                  {Math.floor((entries.reduce((v, e) => v + e.durationSeconds, 0) % 3600) / 60)}m
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#36406a] border-2 border-[#f4673b] flex items-center justify-center text-[#f4673b] font-bold text-sm shadow-md cursor-pointer hover:scale-105 transition-transform" title="Ian Read (ianread07@gmail.com)">
                IR
              </div>
            </div>
          </header>

          {/* APP WORKSPACE */}
          <div className="flex-1 flex overflow-hidden" id="workspace-layout-split">
            
            {/* Main Content Column (Scrollable tab pages) */}
            <div className="flex-1 flex flex-col p-6 space-y-5 overflow-y-auto bg-[#1b2238]" id="tab-outlet-box">
              
              {/* Mobile Tab Fallback navigation helper block */}
              <div className="md:hidden flex bg-slate-900 border border-slate-800 p-1 rounded-xl shrink-0" id="mobile-navigation-bar">
                {(["timer", "dashboard", "log", "summary", "associations"] as const).map((tab) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      id={`mobile-tab-btn-${tab}`}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 text-center py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                        isActive
                          ? "bg-[#f4673b] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {tab === "summary" ? "Report" : tab}
                    </button>
                  );
                })}
              </div>

              {/* ACTIVE STATE RENDERING PAGES */}
              <div className="flex-1" id="rendered-tab-viewport">
                {activeTab === "timer" && (
                  <TimerTab
                    task={task}
                    setTask={setTask}
                    project={project}
                    setProject={setProject}
                    category={category}
                    setCategory={setCategory}
                    notes={notes}
                    setNotes={setNotes}
                    isTracking={isTracking}
                    onStart={handleStartTimer}
                    onStop={handleStopTimer}
                    durationSeconds={durationSeconds}
                    projects={projects}
                    categories={categories}
                    onAddProject={handleAddProject}
                    onAddCategory={handleAddCategory}
                  />
                )}

                {activeTab === "dashboard" && (
                  <DashboardTab
                    entries={entries}
                    projects={projects}
                  />
                )}

                {activeTab === "log" && (
                  <LogTab
                    entries={entries}
                    projects={projects}
                    categories={categories}
                    onDeleteEntry={handleDeleteEntry}
                    onUpdateEntry={handleUpdateEntry}
                  />
                )}

                {activeTab === "summary" && (
                  <SummaryTab
                    entries={entries}
                  />
                )}

                {activeTab === "associations" && (
                  <AssociationsTab
                    associations={associations}
                    onAddAssociation={(assoc) => setAssociations((prev) => [assoc, ...prev])}
                    onRemoveAssociation={handleRemoveAssociation}
                    mondayBoards={mondayBoards}
                    onAddMondayBoard={(assoc) => setMondayBoards((prev) => [assoc, ...prev])}
                    onRemoveMondayBoard={handleRemoveMondayBoard}
                    settings={settings}
                    onUpdateSettings={setSettings}
                    projects={projects}
                    categories={categories}
                    onLoadTaskToTimer={handleLoadTaskToTimer}
                  />
                )}
              </div>
            </div>

          </div>

        </main>

      </div>

    </div>
  );
}
