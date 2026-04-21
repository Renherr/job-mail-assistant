const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jobAssistantApi", {
  getBootstrapData: () => ipcRenderer.invoke("app:get-bootstrap-data"),
  syncMailbox: () => ipcRenderer.invoke("mail:sync"),
  updateTaskStatus: (taskId, status) => ipcRenderer.invoke("task:update-status", { taskId, status }),
  updateApplication: (payload) => ipcRenderer.invoke("application:update", payload),
});
