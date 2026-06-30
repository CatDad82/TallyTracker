import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./server/db.js";
import { MondayClient } from "./server/monday.js";
import { TimeEntry, AppAssociation, MondayBoard } from "./src/types.js";

const PORT = process.env.PORT === "5610" ? 5610 : 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- API Routes ---

  // Get active tracking timer
  app.get("/api/active", (req, res) => {
    try {
      const active = db.getActiveEntry();
      res.json(active);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get time entries with filters
  app.get("/api/entries", (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const category = req.query.category as string;
      const project = req.query.project as string;
      const fromDate = req.query.from as string;
      const toDate = req.query.to as string;

      let entries = db.getEntries().filter(e => e.end_time); // Completed ones only for general logs

      // Date filtering
      if (fromDate && toDate) {
        const dFrom = new Date(fromDate);
        const dTo = new Date(toDate);
        dTo.setHours(23, 59, 59, 999);
        entries = entries.filter(e => {
          const t = new Date(e.start_time);
          return t >= dFrom && t <= dTo;
        });
      } else {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        entries = entries.filter(e => new Date(e.start_time) >= cutoff);
      }

      // Project/Category filtering
      if (category && category !== "All") {
        entries = entries.filter(e => e.category === category);
      }
      if (project && project !== "All") {
        entries = entries.filter(e => e.project === project);
      }

      // Sort DESC by start_time
      entries.sort((a, b) => b.start_time.localeCompare(a.start_time));

      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Start tracking
  app.post("/api/entries/start", (req, res) => {
    try {
      const {
        task,
        project,
        category,
        notes,
        app_name,
        url_context,
        ns_project,
        ns_task,
        ns_service_item,
        monday_board_id,
        monday_item_id,
        board_name,
        task_name,
        status,
        assignee,
        due_date
      } = req.body;

      if (!task) {
        return res.status(400).json({ error: "Task description is required" });
      }

      // 1. Stop any currently active timer
      const active = db.getActiveEntry();
      if (active) {
        const now = new Date();
        const start = new Date(active.start_time);
        const duration = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
        db.updateEntry(active.id, {
          end_time: now.toISOString(),
          duration_seconds: duration
        });
      }

      // 2. Start new timer
      const newEntry = db.addEntry({
        project: project || "No Project",
        category: category || "",
        task,
        notes: notes || "",
        start_time: new Date().toISOString(),
        app_name: app_name || "",
        url_context: url_context || "",
        monday_board_id: monday_board_id || "",
        monday_item_id: monday_item_id || "",
        task_name: task_name || "",
        board_name: board_name || "",
        status: status || "",
        assignee: assignee || "",
        due_date: due_date || "",
        ns_project: ns_project || "",
        ns_task: ns_task || "",
        ns_service_item: ns_service_item || ""
      });

      res.json(newEntry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stop active timer
  app.post("/api/entries/stop", (req, res) => {
    try {
      const active = db.getActiveEntry();
      if (!active) {
        return res.status(400).json({ error: "No active timer found" });
      }

      const now = new Date();
      const start = new Date(active.start_time);
      const duration = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));

      const updated = db.updateEntry(active.id, {
        end_time: now.toISOString(),
        duration_seconds: duration
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Edit / update an entry
  app.put("/api/entries/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const fields = req.body;

      // Re-calculate duration if times are modified
      if (fields.start_time) {
        const start = new Date(fields.start_time);
        const end = fields.end_time ? new Date(fields.end_time) : null;
        if (end) {
          fields.duration_seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
        }
      }

      const updated = db.updateEntry(id, fields);
      if (!updated) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete entries
  app.post("/api/entries/delete", (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No IDs provided" });
      }
      db.deleteEntries(ids);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Bulk update category/project
  app.post("/api/entries/bulk-update", (req, res) => {
    try {
      const { ids, project, category } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No IDs provided" });
      }

      const updates: Partial<TimeEntry> = {};
      if (project && project !== "All") updates.project = project;
      if (category && category !== "All") updates.category = category;

      if (Object.keys(updates).length > 0) {
        ids.forEach(id => {
          db.updateEntry(id, updates);
        });
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Bulk update NetSuite fields
  app.post("/api/entries/bulk-netsuite", (req, res) => {
    try {
      const { ids, ns_project, ns_task, ns_service_item } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No IDs provided" });
      }

      const updates: Partial<TimeEntry> = {};
      if (ns_project) updates.ns_project = ns_project;
      if (ns_task) updates.ns_task = ns_task;
      if (ns_service_item) updates.ns_service_item = ns_service_item;

      if (Object.keys(updates).length > 0) {
        ids.forEach(id => {
          db.updateEntry(id, updates);
        });
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Summary aggregation
  app.get("/api/summary", (req, res) => {
    try {
      const period = (req.query.period || "Today").toString();
      const fromStr = req.query.from ? req.query.from.toString() : null;
      const toStr = req.query.to ? req.query.to.toString() : null;

      const today = new Date();
      let fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      if (period === "This Week") {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        fromDate = new Date(today.setDate(diff));
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
      } else if (period === "This Month") {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
      } else if (period === "Custom" && fromStr && toStr) {
        fromDate = new Date(fromStr);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(toStr);
        toDate.setHours(23, 59, 59, 999);
      }

      const completed = db.getEntries().filter(e => {
        if (!e.end_time || !e.duration_seconds) return false;
        const t = new Date(e.start_time);
        return t >= fromDate && t <= toDate;
      });

      // Total seconds
      const total_seconds = completed.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

      // By Project
      const projectMap: Record<string, { secs: number; count: number }> = {};
      completed.forEach(e => {
        const p = e.project || "No Project";
        if (!projectMap[p]) projectMap[p] = { secs: 0, count: 0 };
        projectMap[p].secs += e.duration_seconds || 0;
        projectMap[p].count += 1;
      });
      const by_project = Object.entries(projectMap).map(([project, item]) => ({
        project,
        secs: item.secs,
        count: item.count
      })).sort((a, b) => b.secs - a.secs);

      // By Category
      const catMap: Record<string, { secs: number; count: number }> = {};
      completed.forEach(e => {
        const c = e.category || "Uncategorized";
        if (!catMap[c]) catMap[c] = { secs: 0, count: 0 };
        catMap[c].secs += e.duration_seconds || 0;
        catMap[c].count += 1;
      });
      const by_category = Object.entries(catMap).map(([category, item]) => ({
        category,
        secs: item.secs,
        count: item.count
      })).sort((a, b) => b.secs - a.secs);

      res.json({
        total_seconds,
        by_project,
        by_category
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reports aggregation
  app.get("/api/reports", (req, res) => {
    try {
      const groupBy = (req.query.group_by || "Task").toString().toLowerCase();
      const days = parseInt(req.query.days as string) || 7;
      const fromStr = req.query.from as string;
      const toStr = req.query.to as string;

      const today = new Date();
      let fromDate = new Date();
      fromDate.setDate(today.getDate() - days);
      let toDate = new Date();

      if (fromStr && toStr) {
        fromDate = new Date(fromStr);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(toStr);
        toDate.setHours(23, 59, 59, 999);
      }

      const completed = db.getEntries().filter(e => {
        if (!e.end_time || !e.duration_seconds) return false;
        const t = new Date(e.start_time);
        return t >= fromDate && t <= toDate;
      });

      const groups: Record<string, { grp: string; n: number; secs: number; extra: string }> = {};

      completed.forEach(e => {
        let key = "";
        let grp = "";
        let extra = "";

        if (groupBy === "task") {
          grp = e.task_name || e.task || "Unknown Task";
          extra = e.board_name || e.monday_board_id || e.project || "";
          key = `${grp}::${extra}`;
        } else if (groupBy === "board") {
          if (!e.monday_board_id && !e.board_name) return; // Skip non-board entries
          grp = e.board_name || e.monday_board_id || "Unknown Board";
          extra = e.project || "";
          key = grp;
        } else if (groupBy === "project") {
          grp = e.project || "No Project";
          extra = e.category || "";
          key = grp;
        } else { // day
          grp = e.start_time.split("T")[0];
          extra = e.project || "";
          key = grp;
        }

        if (!groups[key]) {
          groups[key] = { grp, n: 0, secs: 0, extra };
        }
        groups[key].n += 1;
        groups[key].secs += e.duration_seconds || 0;
        // Aggregate extras if needed (comma-separated distinct values)
        if (groupBy === "project" || groupBy === "day" || groupBy === "board") {
          const existingExtras = groups[key].extra.split(", ").filter(Boolean);
          if (extra && !existingExtras.includes(extra)) {
            existingExtras.push(extra);
            groups[key].extra = existingExtras.join(", ");
          }
        }
      });

      const reportRows = Object.values(groups).map(g => ({
        grp: g.grp,
        n: g.n,
        secs: g.secs,
        extra: g.extra
      }));

      // Sort by seconds DESC, or day DESC
      if (groupBy === "day") {
        reportRows.sort((a, b) => b.grp.localeCompare(a.grp));
      } else {
        reportRows.sort((a, b) => b.secs - a.secs);
      }

      res.json(reportRows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get metadata lists
  app.get("/api/meta", (req, res) => {
    try {
      res.json({
        projects: db.getProjects(),
        categories: db.getCategories()
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add project
  app.post("/api/meta/project", (req, res) => {
    try {
      const { name } = req.body;
      db.addProject(name);
      res.json(db.getProjects());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add category
  app.post("/api/meta/category", (req, res) => {
    try {
      const { name } = req.body;
      db.addCategory(name);
      res.json(db.getCategories());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Associations & Rules ---
  app.get("/api/associations", (req, res) => {
    try {
      res.json({
        rules: db.getAppAssociations(),
        boards: db.getMondayBoards()
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/associations/rule", (req, res) => {
    try {
      const assoc = req.body;
      db.saveAppAssociation(assoc);
      res.json(db.getAppAssociations());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/associations/rule/:appName", (req, res) => {
    try {
      db.deleteAppAssociation(req.params.appName);
      res.json(db.getAppAssociations());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/associations/board", (req, res) => {
    try {
      const board = req.body;
      db.saveMondayBoard(board);
      res.json(db.getMondayBoards());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/associations/board/:boardId", (req, res) => {
    try {
      db.deleteMondayBoard(req.params.boardId);
      res.json(db.getMondayBoards());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Settings ---
  app.get("/api/settings", (req, res) => {
    try {
      res.json(db.getSettings());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      db.saveSettings(req.body);
      res.json(db.getSettings());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Chrome Extension Loopback & Monday enrichment ---
  app.post("/task", async (req, res) => {
    try {
      const { task_id, board_id, page_title, page_url } = req.body;
      const active = db.getActiveEntry();

      if (!active) {
        return res.json({ ok: false, error: "No active timer found" });
      }

      // If no task_id, update context based on general page
      if (!task_id) {
        if (page_title || page_url) {
          db.updateEntry(active.id, {
            app_name: page_title || active.app_name,
            url_context: page_url || active.url_context
          });
        }
        return res.json({ ok: true });
      }

      // Enrich metadata from Monday.com
      const token = db.getSettings().MONDAY_API_TOKEN || process.env.MONDAY_API_TOKEN || "";
      if (token) {
        const meta = await MondayClient.getItem(token, task_id);
        if (meta) {
          db.updateEntry(active.id, {
            monday_board_id: board_id || active.monday_board_id,
            monday_item_id: task_id,
            task_name: meta.name || active.task_name,
            board_name: meta.board_name || active.board_name,
            status: meta.status || active.status,
            assignee: meta.assignee || active.assignee,
            due_date: meta.due_date || active.due_date
          });

          // Also save board mapping
          if (board_id && meta.board_name) {
            db.saveMondayBoard({
              board_id,
              board_name: meta.board_name,
              project: active.project,
              category: active.category,
              auto_track: 1
            });
          }
        }
      }

      res.json({ ok: true });
    } catch (e: any) {
      console.error("Extension loopback error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Run Daily Review manually or scheduled
  app.post("/api/monday/run-review", async (req, res) => {
    try {
      const { dateStr, boardId } = req.body;
      const token = db.getSettings().MONDAY_API_TOKEN || process.env.MONDAY_API_TOKEN || "";

      if (!token) {
        return res.status(400).json({ error: "Monday.com API Token not configured" });
      }

      const targetDate = dateStr ? new Date(dateStr) : new Date();
      const dStr = targetDate.toISOString().split("T")[0];

      // Query daily summary (identical query to python _query_daily_summary)
      const completed = db.getEntries().filter(e => {
        if (!e.end_time || !e.duration_seconds) return false;
        return e.start_time.startsWith(dStr);
      });

      if (completed.length === 0) {
        return res.json({ success: true, posted: 0, updated: 0, msg: `No entries found for ${dStr}.` });
      }

      // Aggregate task summaries
      const taskGroups: Record<string, {
        task: string;
        secs: number;
        entriesCount: number;
        project: string;
        category: string;
        notes: string;
        ns_project: string;
        ns_task: string;
        ns_service_item: string;
      }> = {};

      completed.forEach(e => {
        const taskName = e.task_name || e.task || "Unknown Task";
        if (!taskGroups[taskName]) {
          taskGroups[taskName] = {
            task: taskName,
            secs: 0,
            entriesCount: 0,
            project: e.project || "",
            category: e.category || "",
            notes: e.notes || "",
            ns_project: e.ns_project || "",
            ns_task: e.ns_task || "",
            ns_service_item: e.ns_service_item || ""
          };
        }
        taskGroups[taskName].secs += e.duration_seconds || 0;
        taskGroups[taskName].entriesCount += 1;
        if (e.notes && !taskGroups[taskName].notes.includes(e.notes)) {
          taskGroups[taskName].notes = taskGroups[taskName].notes
            ? `${taskGroups[taskName].notes}, ${e.notes}`
            : e.notes;
        }
      });

      // Get columns needed
      const wantedCols = [
        { title: "Date", type: "date" },
        { title: "Duration", type: "numbers" },
        { title: "Project", type: "text" },
        { title: "Category", type: "text" },
        { title: "Notes", type: "text" },
        { title: "NS Project", type: "text" },
        { title: "NS Task", type: "text" },
        { title: "NS Service Item", type: "text" },
        { title: "Entries", type: "numbers" },
        { title: "Status", type: "status" },
        { title: "Logged By", type: "people" }
      ];

      const colIds = await MondayClient.getOrCreateColumns(token, boardId, wantedCols);
      const mondayUserId = await MondayClient.getMe(token);

      // Create/find Group based on date e.g. "Monday 29 June"
      const weekday = targetDate.toLocaleDateString("en-US", { weekday: "long" });
      const month = targetDate.toLocaleDateString("en-US", { month: "long" });
      const groupName = `${weekday} ${targetDate.getDate()} ${month}`;
      const groupId = await MondayClient.getOrCreateGroup(token, boardId, groupName);

      // Fetch existing items in group to upsert
      const existingItems = await MondayClient.getItemsInGroup(token, boardId, groupId);

      let posted = 0;
      let updated = 0;

      for (const row of Object.values(taskGroups)) {
        const hours = Math.round((row.secs / 3600) * 100) / 100;
        const colVals: Record<string, any> = {};

        if (colIds["date"]) colVals[colIds["date"]] = { date: dStr };
        if (colIds["duration"]) colVals[colIds["duration"]] = hours;
        if (colIds["project"]) colVals[colIds["project"]] = row.project;
        if (colIds["category"]) colVals[colIds["category"]] = row.category;
        if (colIds["notes"]) colVals[colIds["notes"]] = row.notes;
        if (colIds["ns project"]) colVals[colIds["ns project"]] = row.ns_project;
        if (colIds["ns task"]) colVals[colIds["ns task"]] = row.ns_task;
        if (colIds["ns service item"]) colVals[colIds["ns service item"]] = row.ns_service_item;
        if (colIds["entries"]) colVals[colIds["entries"]] = row.entriesCount;
        if (colIds["status"]) colVals[colIds["status"]] = { label: "Done" };
        if (colIds["logged by"] && mondayUserId) {
          colVals[colIds["logged by"]] = {
            personsAndTeams: [{ id: parseInt(mondayUserId), kind: "person" }]
          };
        }

        const existingId = existingItems[row.task.trim().toLowerCase()];
        if (existingId) {
          await MondayClient.updateItem(token, boardId, existingId, colVals);
          updated += 1;
        } else {
          await MondayClient.createItem(token, boardId, row.task, colVals, groupId);
          posted += 1;
        }
      }

      res.json({
        success: true,
        posted,
        updated,
        msg: `Successfully posted ${posted} new and updated ${updated} tasks to Monday Board (${dStr}).`
      });
    } catch (e: any) {
      console.error("Daily review execution error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Monday get user ID validation
  app.post("/api/monday/validate", async (req, res) => {
    try {
      const { token } = req.body;
      const meId = await MondayClient.getMe(token);
      res.json({ ok: !!meId, meId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Start listening on port 3000 first, so the server is instantly online and reachable
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  // --- Mount Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.PORT === "5610"
      ? __dirname
      : path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
