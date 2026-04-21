import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "config.json");
const DEFAULT_DATA_DIR = path.join(__dirname, "data");

let currentDataDir = DEFAULT_DATA_DIR;

function getFiles() {
  return {
    tasks: path.join(currentDataDir, "tasks.csv"),
    holidays: path.join(currentDataDir, "holidays.csv"),
    templates: path.join(currentDataDir, "templates.csv"),
    statusSets: path.join(currentDataDir, "status_sets.json"),
    users: path.join(currentDataDir, "users.json"),
  };
}

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    if (config.dataDir) currentDataDir = config.dataDir;
  } catch {
    // use default
  }
}

async function saveConfig(dataDir: string) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ dataDir }, null, 2), "utf-8");
  currentDataDir = dataDir;
}

async function ensureDataDir() {
  try {
    await fs.access(currentDataDir);
  } catch {
    await fs.mkdir(currentDataDir, { recursive: true });
  }
}

// CSV Conversion Helpers
function parseJsonField(s: string): any {
  if (!s) return undefined;
  try { return JSON.parse(s); } catch { return undefined; }
}

function tasksToCsv(tasks: any[]): string {
  const header = "id,title,parentId,leadTime,recurrenceType,weeklyDays,monthlyDays,isCompleted,color,createdAt,baseDate,statusId,statusSetId,offsetDays,offsetDirection,parentPoint,isIndefinite,description,baseType,overrides,exclusions,recurrenceInterval,recurrenceMonths,recurrenceHolidayAdjustment,assigneeId\n";
  const rows = tasks.map(t => {
    return [
      t.id,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.parentId || "",
      t.leadTime ?? 0,
      t.recurrence?.type || "none",
      `"${(t.recurrence?.weeklyDays || []).join('|')}"`,
      `"${(t.recurrence?.monthlyDays || []).join('|')}"`,
      t.isCompleted ?? false,
      t.color || "",
      t.createdAt || Date.now(),
      t.baseDate || "",
      t.statusId || "",
      t.statusSetId || "",
      t.offsetDays ?? "",
      t.offsetDirection || "",
      t.parentPoint || "",
      t.isIndefinite ?? false,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.baseType || "",
      `"${JSON.stringify(t.overrides || {}).replace(/"/g, '""')}"`,
      `"${(t.exclusions || []).join('|')}"`,
      t.recurrence?.interval ?? "",
      `"${(t.recurrence?.months || []).join('|')}"`,
      t.recurrence?.holidayAdjustment || "",
      t.assigneeId || ""
    ].join(",");
  });
  return header + rows.join("\n");
}

function csvToTasks(csv: string): any[] {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(row => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (row[i] === ',' && !inQuotes) {
        values.push(current); current = "";
      } else current += row[i];
    }
    values.push(current);

    const overridesRaw = parseJsonField(values[19]);
    const exclusionsRaw = values[20] ? values[20].split('|').filter(Boolean) : [];
    const recurrenceInterval = values[21] !== undefined && values[21] !== '' ? parseInt(values[21]) : undefined;
    const recurrenceMonths = values[22] ? values[22].split('|').filter(Boolean).map(Number) : undefined;
    const recurrenceHolidayAdjustment = values[23] || undefined;

    return {
      id: values[0],
      title: values[1],
      parentId: values[2] || null,
      leadTime: parseInt(values[3]) || 0,
      recurrence: {
        type: values[4] || 'none',
        weeklyDays: values[5] ? values[5].split('|').filter(Boolean).map(Number) : [],
        monthlyDays: values[6] ? values[6].split('|').filter(Boolean).map((v: string) => isNaN(Number(v)) ? v : Number(v)) : [],
        ...(recurrenceInterval !== undefined && { interval: recurrenceInterval }),
        ...(recurrenceMonths && recurrenceMonths.length > 0 && { months: recurrenceMonths }),
        ...(recurrenceHolidayAdjustment && { holidayAdjustment: recurrenceHolidayAdjustment })
      },
      isCompleted: values[7] === 'true',
      color: values[8] || undefined,
      createdAt: parseInt(values[9]) || Date.now(),
      baseDate: values[10] || undefined,
      statusId: values[11] || undefined,
      statusSetId: values[12] || undefined,
      offsetDays: values[13] !== undefined && values[13] !== '' ? parseInt(values[13]) : undefined,
      offsetDirection: values[14] || undefined,
      parentPoint: values[15] || undefined,
      isIndefinite: values[16] === 'true',
      description: values[17] || undefined,
      baseType: values[18] || undefined,
      overrides: overridesRaw && Object.keys(overridesRaw).length > 0 ? overridesRaw : undefined,
      exclusions: exclusionsRaw.length > 0 ? exclusionsRaw : undefined,
      assigneeId: values[24] || undefined
    };
  });
}

function holidaysToCsv(holidays: any[]): string {
  const header = "id,date,name\n";
  const rows = holidays.map(h => `${h.id},${h.date},"${h.name.replace(/"/g, '""')}"`);
  return header + rows.join("\n");
}

function csvToHolidays(csv: string): any[] {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(row => {
    const values = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    return {
      id: values[0],
      date: values[1],
      name: values[2]?.replace(/^"|"$/g, '').replace(/""/g, '"') || ""
    };
  });
}

function templatesToCsv(templates: any[]): string {
  const header = "id,name,items,statusEnabled,statusSetId,baseType\n";
  const rows = templates.map(t => {
    return [
      t.id,
      `"${(t.name || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(t.items || []).replace(/"/g, '""')}"`,
      t.statusEnabled ?? false,
      t.statusSetId || "",
      t.baseType || "deadline"
    ].join(",");
  });
  return header + rows.join("\n");
}

function csvToTemplates(csv: string): any[] {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(row => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (row[i] === ',' && !inQuotes) {
        values.push(current); current = "";
      } else current += row[i];
    }
    values.push(current);

    return {
      id: values[0],
      name: values[1],
      items: JSON.parse(values[2] || "[]"),
      statusEnabled: values[3] === 'true',
      statusSetId: values[4] || null,
      baseType: values[5] || "deadline"
    };
  });
}

async function startServer() {
  await loadConfig();
  await ensureDataDir();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Config API
  app.get("/api/config", (req, res) => {
    res.json({ dataDir: currentDataDir, defaultDataDir: DEFAULT_DATA_DIR });
  });

  app.post("/api/config", async (req, res) => {
    const { dataDir } = req.body;
    if (!dataDir || typeof dataDir !== "string") {
      res.status(400).json({ error: "dataDir is required" });
      return;
    }
    await saveConfig(dataDir);
    await ensureDataDir();
    res.json({ success: true, dataDir: currentDataDir });
  });

  // API Routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const data = await fs.readFile(getFiles().tasks, "utf-8");
      res.json(csvToTasks(data));
    } catch {
      res.json([]);
    }
  });

  app.post("/api/tasks", async (req, res) => {
    await fs.writeFile(getFiles().tasks, tasksToCsv(req.body), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/holidays", async (req, res) => {
    try {
      const data = await fs.readFile(getFiles().holidays, "utf-8");
      res.json(csvToHolidays(data));
    } catch {
      res.json([
        { id: "1", date: "2026-01-01", name: "元旦" },
        { id: "2", date: "2026-05-01", name: "メイデー" }
      ]);
    }
  });

  app.post("/api/holidays", async (req, res) => {
    await fs.writeFile(getFiles().holidays, holidaysToCsv(req.body), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/templates", async (req, res) => {
    try {
      const data = await fs.readFile(getFiles().templates, "utf-8");
      res.json(csvToTemplates(data));
    } catch {
      res.json([]);
    }
  });

  app.post("/api/templates", async (req, res) => {
    await fs.writeFile(getFiles().templates, templatesToCsv(req.body), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/users", async (req, res) => {
    try {
      const data = await fs.readFile(getFiles().users, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.json([]);
    }
  });

  app.post("/api/users", async (req, res) => {
    await fs.writeFile(getFiles().users, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/status-sets", async (req, res) => {
    try {
      const data = await fs.readFile(getFiles().statusSets, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.json([{
        id: "1",
        name: "標準ステータス",
        statuses: [
          { id: "s1", name: "未着手", color: "#94a3b8" },
          { id: "s2", name: "進行中", color: "#3b82f6" },
          { id: "s3", name: "確認中", color: "#f59e0b" },
          { id: "s4", name: "完了", color: "#10b981" }
        ]
      }]);
    }
  });

  app.post("/api/status-sets", async (req, res) => {
    await fs.writeFile(getFiles().statusSets, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ success: true });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data directory: ${currentDataDir}`);
  });
}

startServer();
