const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { readConfig } = require("./config");
const { ping } = require("./db/mysql");
const { ensureAppSchema } = require("./db/schema");
const {
  getApplications,
  getOpenTasks,
  getTodaySummary,
} = require("./repositories/dashboardRepository");
const { updateApplicationManual } = require("./repositories/applicationRepository");
const { updateTaskStatus } = require("./repositories/taskRepository");
const { STAGE_OPTIONS } = require("./services/jobClassifier");

let mainWindow;
const EXPANDED_MIN_WIDTH = 360;
const EXPANDED_MIN_HEIGHT = 540;

function createWindow() {
  const config = readConfig();
  const windowConfig = config.app.window;

  mainWindow = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: EXPANDED_MIN_WIDTH,
    minHeight: EXPANDED_MIN_HEIGHT,
    frame: false,
    transparent: false,
    alwaysOnTop: Boolean(windowConfig.alwaysOnTop),
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ensureAppSchema()
    .catch(() => {})
    .finally(() => {
      createWindow();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("app:get-bootstrap-data", async () => {
  try {
    await ping();

    const [summary, tasks, applications] = await Promise.all([
      getTodaySummary(),
      getOpenTasks(),
      getApplications(),
    ]);

    return {
      summary,
      tasks,
      applications,
      stageOptions: STAGE_OPTIONS,
    };
  } catch (error) {
    return {
      summary: {
        newJobMailsToday: 0,
        openTasks: 0,
        updatedApplications: 0,
        urgentText: `数据库不可用：${error.message}`,
      },
      tasks: [],
      applications: [],
      stageOptions: STAGE_OPTIONS,
    };
  }
});

ipcMain.handle("mail:sync", async () => {
  try {
    await ping();
    const { syncRecentEmails } = require("./services/mailSyncService");
    return await withTimeout(syncRecentEmails(), 180000, "邮件同步超时。");
  } catch (error) {
    return {
      synced: 0,
      skipped: 0,
      createdTasks: 0,
      message: `邮件同步失败：${error.message}`,
    };
  }
});

ipcMain.handle("task:update-status", async (_, payload) => {
  await ping();
  await updateTaskStatus(payload.taskId, payload.status);
  return { ok: true };
});

ipcMain.handle("application:update", async (_, payload) => {
  await ping();
  await updateApplicationManual(payload.applicationId, payload);
  return { ok: true };
});

function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    }),
  ]);
}
