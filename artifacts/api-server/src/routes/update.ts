import { Router } from "express";
import { logger } from "../lib/logger";
import multer from "multer";
import AdmZip from "adm-zip";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const WORKSPACE_ROOT = path.resolve(process.cwd(), "../..");
const HISTORY_FILE = path.join(WORKSPACE_ROOT, ".update-history.json");

type UpdateState = "idle" | "extracting" | "building" | "done" | "error";

interface UpdateStatus {
  state: UpdateState;
  message: string;
  log: string[];
  updatedAt: string | null;
  extractedFiles: number;
  currentVersion: string | null;
}

export interface VersionEntry {
  id: string;
  version: string;
  notes: string;
  filename: string;
  extractedFiles: number;
  appliedAt: string;
  status: "success" | "failed";
}

let updateStatus: UpdateStatus = {
  state: "idle",
  message: "Tidak ada update berjalan",
  log: [],
  updatedAt: null,
  extractedFiles: 0,
  currentVersion: null,
};

function loadHistory(): VersionEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveHistory(entries: VersionEntry[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    logger.error(err, "Gagal menyimpan history");
  }
}

function getCurrentVersion(): string | null {
  const history = loadHistory();
  const last = history.filter((e) => e.status === "success").at(-1);
  return last?.version ?? null;
}

updateStatus.currentVersion = getCurrentVersion();

function appendLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  updateStatus.log.push(line);
  logger.info(msg);
  if (updateStatus.log.length > 200) updateStatus.log = updateStatus.log.slice(-200);
}

router.get("/status", (_req, res) => {
  res.json({ ...updateStatus, currentVersion: getCurrentVersion() });
});

router.get("/history", (_req, res) => {
  const history = loadHistory();
  res.json({ history: history.slice().reverse() });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File zip tidak ditemukan dalam request" });
  }

  if (!req.file.originalname.endsWith(".zip") && req.file.mimetype !== "application/zip") {
    return res.status(400).json({ error: "Hanya file .zip yang diperbolehkan" });
  }

  if (updateStatus.state === "extracting" || updateStatus.state === "building") {
    return res.status(409).json({ error: "Update sedang berjalan, tunggu hingga selesai" });
  }

  const version = (typeof req.body.version === "string" && req.body.version.trim()) || "v" + Date.now();
  const notes = (typeof req.body.notes === "string" && req.body.notes.trim()) || "";

  updateStatus = {
    state: "extracting",
    message: "Mengekstrak file update...",
    log: [],
    updatedAt: new Date().toISOString(),
    extractedFiles: 0,
    currentVersion: getCurrentVersion(),
  };

  res.json({ success: true, message: "Upload berhasil, proses update dimulai", statusUrl: "/api/update/status" });

  const historyEntry: VersionEntry = {
    id: Date.now().toString(),
    version,
    notes,
    filename: req.file.originalname,
    extractedFiles: 0,
    appliedAt: new Date().toISOString(),
    status: "failed",
  };

  try {
    appendLog(`Versi: ${version}`);
    if (notes) appendLog(`Catatan: ${notes}`);
    appendLog(`Menerima file: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
    appendLog(`Workspace root: ${WORKSPACE_ROOT}`);

    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    appendLog(`File dalam zip: ${entries.length} item`);

    const SKIP_PATTERNS = [
      /node_modules\//,
      /\.git\//,
      /dist\//,
      /\.cache\//,
      /pnpm-lock\.yaml$/,
    ];

    let extracted = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const entryName = entry.entryName;
      const shouldSkip = SKIP_PATTERNS.some((p) => p.test(entryName));
      if (shouldSkip) {
        appendLog(`Lewati: ${entryName}`);
        continue;
      }

      const targetPath = path.join(WORKSPACE_ROOT, entryName);
      const targetDir = path.dirname(targetPath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, entry.getData());
      extracted++;

      if (extracted <= 20 || extracted % 50 === 0) {
        appendLog(`Ekstrak: ${entryName}`);
      }
    }

    updateStatus.extractedFiles = extracted;
    historyEntry.extractedFiles = extracted;
    appendLog(`Selesai ekstrak ${extracted} file`);

    updateStatus.state = "building";
    updateStatus.message = "Membangun ulang aplikasi...";
    appendLog("Memulai rebuild aplikasi...");

    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@workspace/api-server",
        "--filter",
        "@workspace/x-automation",
        "--if-present",
        "run",
        "build",
      ],
      {
      cwd: WORKSPACE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      },
    );

    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());
      lines.forEach((l) => appendLog(`BUILD: ${l}`));
    });

    child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());
      lines.forEach((l) => appendLog(`BUILD ERR: ${l}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        historyEntry.status = "success";
        const history = loadHistory();
        history.push(historyEntry);
        saveHistory(history);

        updateStatus.state = "done";
        updateStatus.message = `Update ${version} berhasil! Klik Restart Server untuk menerapkan.`;
        updateStatus.currentVersion = version;
        appendLog(`Build selesai! Versi ${version} berhasil diterapkan.`);
      } else {
        const history = loadHistory();
        history.push(historyEntry);
        saveHistory(history);

        updateStatus.state = "error";
        updateStatus.message = `Build gagal dengan kode ${code}. Periksa log untuk detail.`;
        appendLog(`Build gagal dengan exit code: ${code}`);
      }
    });

    child.on("error", (err) => {
      updateStatus.state = "error";
      updateStatus.message = `Gagal menjalankan build: ${err.message}`;
      appendLog(`Error menjalankan build: ${err.message}`);
    });
  } catch (err: unknown) {
    const e = err as Error;
    const history = loadHistory();
    history.push(historyEntry);
    saveHistory(history);

    updateStatus.state = "error";
    updateStatus.message = `Update gagal: ${e.message}`;
    appendLog(`Error: ${e.message}`);
    logger.error(err, "Update upload error");
  }
});

router.post("/reset", (_req, res) => {
  if (updateStatus.state === "extracting" || updateStatus.state === "building") {
    return res.status(409).json({ error: "Tidak bisa reset saat proses update berjalan" });
  }
  updateStatus = {
    state: "idle",
    message: "Status direset",
    log: [],
    updatedAt: null,
    extractedFiles: 0,
    currentVersion: getCurrentVersion(),
  };
  res.json({ success: true });
});

router.post("/restart", (_req, res) => {
  res.json({ success: true, message: "Server akan restart dalam 1 detik..." });
  setTimeout(() => {
    logger.info("Restart dipicu dari dashboard, menghentikan proses...");
    process.exit(0);
  }, 1000);
});

router.delete("/history/:id", (req, res) => {
  const { id } = req.params;
  const history = loadHistory();
  const updated = history.filter((e) => e.id !== id);
  if (updated.length === history.length) {
    return res.status(404).json({ error: "Entry tidak ditemukan" });
  }
  saveHistory(updated);
  res.json({ success: true });
});

const DOWNLOAD_SKIP = [
  "node_modules",
  ".git",
  "dist",
  ".cache",
  ".local",
  ".agents",
  "zipFile.zip",
  ".update-history.json",
  "pnpm-lock.yaml",
  "uv.lock",
  "main.py",
  "pyproject.toml",
  "index.html",
  ".replit",
  "replit.nix",
];

function walkDir(dir: string, root: string, zip: AdmZip) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (DOWNLOAD_SKIP.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const zipPath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      walkDir(fullPath, root, zip);
    } else {
      try {
        const content = fs.readFileSync(fullPath);
        zip.addFile(zipPath, content);
      } catch {}
    }
  }
}

router.get("/download", (_req, res) => {
  try {
    const version = getCurrentVersion() || "latest";
    const filename = `x-automation-${version}-${new Date().toISOString().slice(0, 10)}.zip`;

    logger.info(`Membuat zip download: ${filename}`);

    const zip = new AdmZip();
    walkDir(WORKSPACE_ROOT, WORKSPACE_ROOT, zip);

    const buffer = zip.toBuffer();

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);

    logger.info(`Download zip selesai: ${buffer.length} bytes`);
  } catch (err) {
    logger.error(err, "Gagal membuat zip download");
    res.status(500).json({ error: "Gagal membuat file zip" });
  }
});

export default router;
