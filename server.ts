import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.csv");
const HOLIDAYS_FILE = path.join(DATA_DIR, "holidays.csv");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.csv");

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR);
  }
}

// CSV Conversion Helpers
function tasksToCsv(tasks: any[]): string {
  const header = "id,title,parentId,leadTime,recurrenceType,weeklyDays,monthlyDays,isCompleted,color,createdAt,baseDate\n";
  const rows = tasks.map(t => {
    return [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.parentId || "",
      t.leadTime,
      t.recurrence.type,
      `"${(t.recurrence.weeklyDays || []).join('|')}"`,
      `"${(t.recurrence.monthlyDays || []).join('|')}"`,
      t.isCompleted,
      t.color || "",
      t.createdAt,
      t.baseDate || ""
    ].join(",");
  });
  return header + rows.join("\n");
}

function csvToTasks(csv: string): any[] {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(row => {
    // Simple CSV parser supporting quotes
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        if (row[i] === '"') inQuotes = !inQuotes;
        else if (row[i] === ',' && !inQuotes) {
            values.push(current);
            current = "";
        } else current += row[i];
    }
    values.push(current);

    return {
      id: values[0],
      title: values[1],
      parentId: values[2] || null,
      leadTime: parseInt(values[3]),
      recurrence: {
        type: values[4],
        weeklyDays: values[5] ? values[5].split('|').map(Number) : [],
        monthlyDays: values[6] ? values[6].split('|').map(v => isNaN(Number(v)) ? v : Number(v)) : []
      },
      isCompleted: values[7] === 'true',
      color: values[8],
      createdAt: parseInt(values[9]),
      baseDate: values[10] || undefined
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
  const header = "id,name,items\n";
  const rows = templates.map(t => {
    return [
      t.id,
      `"${t.name.replace(/"/g, '""')}"`,
      `"${JSON.stringify(t.items).replace(/"/g, '""')}"`
    ].join(",");
  });
  return header + rows.join("\n");
}

function csvToTemplates(csv: string): any[] {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(row => {
    // Parser for templates (handles nested JSON with escaped quotes)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        if (row[i] === '"') {
            if (inQuotes && row[i+1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (row[i] === ',' && !inQuotes) {
            values.push(current);
            current = "";
        } else current += row[i];
    }
    values.push(current);

    return {
      id: values[0],
      name: values[1],
      items: JSON.parse(values[2] || "[]")
    };
  });
}

async function startServer() {
  await ensureDataDir();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const data = await fs.readFile(TASKS_FILE, "utf-8");
      res.json(csvToTasks(data));
    } catch {
      res.json([]);
    }
  });

  app.post("/api/tasks", async (req, res) => {
    await fs.writeFile(TASKS_FILE, tasksToCsv(req.body), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/holidays", async (req, res) => {
    try {
      const data = await fs.readFile(HOLIDAYS_FILE, "utf-8");
      res.json(csvToHolidays(data));
    } catch {
      res.json([
        { id: "1", date: "2026-01-01", name: "元旦" },
        { id: "2", date: "2026-05-01", name: "メイデー" }
      ]);
    }
  });

  app.post("/api/holidays", async (req, res) => {
    await fs.writeFile(HOLIDAYS_FILE, holidaysToCsv(req.body), "utf-8");
    res.json({ success: true });
  });

  app.get("/api/templates", async (req, res) => {
    try {
      const data = await fs.readFile(TEMPLATES_FILE, "utf-8");
      res.json(csvToTemplates(data));
    } catch {
      res.json([]);
    }
  });

  app.post("/api/templates", async (req, res) => {
    await fs.writeFile(TEMPLATES_FILE, templatesToCsv(req.body), "utf-8");
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
    console.log(`Data directory: ${DATA_DIR}`);
  });
}

startServer();
