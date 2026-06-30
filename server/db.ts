import fs from "fs";
import path from "path";
import { TimeEntry, AppAssociation, MondayBoard, SystemSettings } from "../src/types.js";

const DB_FILE = path.join(process.cwd(), "data/db.json");

interface DBStructure {
  entries: TimeEntry[];
  projects: string[];
  categories: string[];
  app_associations: AppAssociation[];
  monday_boards: MondayBoard[];
  settings: SystemSettings;
}

const DEFAULT_PROJECTS = ["Acme Corp Web Redesign", "Globex Mobile App", "Admin", "Internal", "Personal"];
const DEFAULT_CATEGORIES = [
  "Deep Work", "Meetings", "Admin", "Research",
  "Creative", "Communication", "Learning", "Other"
];

const DEFAULT_DB: DBStructure = {
  entries: [],
  projects: DEFAULT_PROJECTS,
  categories: DEFAULT_CATEGORIES,
  app_associations: [
    {
      app_name: "claude.ai",
      project: "Internal",
      category: "Research",
      task_hint: "Researching AI models",
      auto_track: 1
    },
    {
      app_name: "github.com",
      project: "Acme Corp Web Redesign",
      category: "Deep Work",
      task_hint: "Pushing code to main",
      auto_track: 1
    },
    {
      app_name: "figma.com",
      project: "Globex Mobile App",
      category: "Creative",
      task_hint: "Designing UI Mockups",
      auto_track: 1
    },
    {
      app_name: "monday.com",
      project: "Acme Corp Web Redesign",
      category: "Admin",
      task_hint: "Checking Monday board",
      auto_track: 1
    }
  ],
  monday_boards: [
    {
      board_id: "18418713154",
      board_name: "Dezigner Lane Board",
      project: "Acme Corp Web Redesign",
      category: "Admin",
      auto_track: 1
    }
  ],
  settings: {
    MONDAY_API_TOKEN: "",
    REVIEW_BOARD_ID: "18418713154",
    REVIEW_HOUR: "18",
    REVIEW_PERIOD: "today"
  }
};

class JSONDatabase {
  private data: DBStructure;

  constructor() {
    this.data = { ...DEFAULT_DB };
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(fileContent);
        // Fallback for fields in case of migration
        if (!this.data.entries) this.data.entries = [];
        if (!this.data.projects) this.data.projects = DEFAULT_PROJECTS;
        if (!this.data.categories) this.data.categories = DEFAULT_CATEGORIES;
        if (!this.data.app_associations) this.data.app_associations = [];
        if (!this.data.monday_boards) this.data.monday_boards = [];
        if (!this.data.settings) this.data.settings = DEFAULT_DB.settings;
      } else {
        // Pre-populate with mock entries for the last 2 days so the dashboard looks beautiful
        this.generateMockEntries();
        this.save();
      }
    } catch (e) {
      console.error("Database initialization failed", e);
    }
  }

  private generateMockEntries() {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const formatISO = (d: Date, hour: number, minute: number, second = 0) => {
      const copy = new Date(d);
      copy.setHours(hour, minute, second, 0);
      return copy.toISOString();
    };

    const mock = [
      // Yesterday Logs
      {
        project: "Acme Corp Web Redesign",
        category: "Deep Work",
        task: "Figma.com - Login Page Mockup",
        notes: "Revised spacing and color contrast for accessibility",
        start_time: formatISO(yesterday, 9, 0),
        end_time: formatISO(yesterday, 11, 15),
        duration_seconds: 8100,
        app_name: "chrome",
        url_context: "https://figma.com/file/login_page"
      },
      {
        project: "Internal",
        category: "Meetings",
        task: "Sprint Planning",
        notes: "Discussed roadmap and deliverables",
        start_time: formatISO(yesterday, 11, 30),
        end_time: formatISO(yesterday, 12, 30),
        duration_seconds: 3600,
        app_name: "zoom"
      },
      {
        project: "Acme Corp Web Redesign",
        category: "Deep Work",
        task: "github.com - Implementing Auth middleware",
        notes: "Hooked up token validation routes",
        start_time: formatISO(yesterday, 13, 30),
        end_time: formatISO(yesterday, 16, 45),
        duration_seconds: 11700,
        app_name: "chrome",
        url_context: "https://github.com/acme/auth"
      },
      {
        project: "Admin",
        category: "Admin",
        task: "Timesheet Submission & Review",
        notes: "Submitted billing details",
        start_time: formatISO(yesterday, 17, 0),
        end_time: formatISO(yesterday, 17, 30),
        duration_seconds: 1800,
        app_name: "chrome"
      },

      // Today Logs
      {
        project: "Globex Mobile App",
        category: "Research",
        task: "claude.ai - Researching Push Notifications on iOS",
        notes: "Analyzing APNs silent push payload behaviors",
        start_time: formatISO(today, 9, 30),
        end_time: formatISO(today, 11, 15),
        duration_seconds: 6300,
        app_name: "chrome",
        url_context: "https://claude.ai/chat/apns"
      },
      {
        project: "Acme Corp Web Redesign",
        category: "Admin",
        task: "Monday.com Board Review",
        notes: "Syncing task status to Done",
        start_time: formatISO(today, 11, 20),
        end_time: formatISO(today, 12, 0),
        duration_seconds: 2400,
        app_name: "chrome",
        url_context: "https://company.monday.com/boards/18418713154/pulses/20384",
        monday_board_id: "18418713154",
        monday_item_id: "20384",
        task_name: "Database migrations hookup",
        board_name: "Dezigner Lane Board"
      },
      {
        project: "Globex Mobile App",
        category: "Creative",
        task: "Designing App Store screenshots",
        notes: "Using high-res device frames",
        start_time: formatISO(today, 13, 0),
        end_time: formatISO(today, 15, 30),
        duration_seconds: 9000,
        app_name: "figma"
      }
    ];

    mock.forEach((m, index) => {
      this.data.entries.push({
        id: index + 1,
        ...m
      });
    });
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Database save failed", e);
    }
  }

  // --- Entries Methods ---
  public getEntries(): TimeEntry[] {
    return this.data.entries;
  }

  public getActiveEntry(): TimeEntry | null {
    return this.data.entries.find(e => !e.end_time) || null;
  }

  public addEntry(entry: Omit<TimeEntry, "id">): TimeEntry {
    const id = this.data.entries.length > 0 ? Math.max(...this.data.entries.map(e => e.id)) + 1 : 1;
    const newEntry: TimeEntry = { id, ...entry };
    this.data.entries.push(newEntry);

    // Auto-learn new project/category
    if (newEntry.project && !this.data.projects.includes(newEntry.project)) {
      this.data.projects.push(newEntry.project);
    }
    if (newEntry.category && !this.data.categories.includes(newEntry.category)) {
      this.data.categories.push(newEntry.category);
    }

    this.save();
    return newEntry;
  }

  public updateEntry(id: number, fields: Partial<TimeEntry>): TimeEntry | null {
    const idx = this.data.entries.findIndex(e => e.id === id);
    if (idx === -1) return null;

    const updated = { ...this.data.entries[idx], ...fields };
    this.data.entries[idx] = updated;

    if (updated.project && !this.data.projects.includes(updated.project)) {
      this.data.projects.push(updated.project);
    }
    if (updated.category && !this.data.categories.includes(updated.category)) {
      this.data.categories.push(updated.category);
    }

    this.save();
    return updated;
  }

  public deleteEntries(ids: number[]) {
    this.data.entries = this.data.entries.filter(e => !ids.includes(e.id));
    this.save();
  }

  // --- Projects & Categories ---
  public getProjects(): string[] {
    return this.data.projects;
  }

  public addProject(name: string) {
    if (name && !this.data.projects.includes(name)) {
      this.data.projects.push(name);
      this.save();
    }
  }

  public getCategories(): string[] {
    return this.data.categories;
  }

  public addCategory(name: string) {
    if (name && !this.data.categories.includes(name)) {
      this.data.categories.push(name);
      this.save();
    }
  }

  // --- Associations ---
  public getAppAssociations(): AppAssociation[] {
    return this.data.app_associations;
  }

  public saveAppAssociation(assoc: AppAssociation) {
    const key = assoc.app_name.toLowerCase();
    const idx = this.data.app_associations.findIndex(a => a.app_name === key);
    if (idx !== -1) {
      this.data.app_associations[idx] = { ...assoc, app_name: key };
    } else {
      this.data.app_associations.push({ ...assoc, app_name: key });
    }
    this.save();
  }

  public deleteAppAssociation(appName: string) {
    this.data.app_associations = this.data.app_associations.filter(
      a => a.app_name !== appName.toLowerCase()
    );
    this.save();
  }

  // --- Monday Boards ---
  public getMondayBoards(): MondayBoard[] {
    return this.data.monday_boards;
  }

  public saveMondayBoard(board: MondayBoard) {
    const idx = this.data.monday_boards.findIndex(b => b.board_id === board.board_id);
    if (idx !== -1) {
      this.data.monday_boards[idx] = board;
    } else {
      this.data.monday_boards.push(board);
    }
    this.save();
  }

  public deleteMondayBoard(boardId: string) {
    this.data.monday_boards = this.data.monday_boards.filter(b => b.board_id !== boardId);
    this.save();
  }

  // --- Settings ---
  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public saveSettings(settings: Partial<SystemSettings>) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }
}

export const db = new JSONDatabase();
export default db;
