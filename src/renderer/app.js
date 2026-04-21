const state = {
  applications: [],
  tasks: [],
  stageOptions: [],
};

function renderTasks(tasks) {
  const container = document.getElementById("tasks-list");

  if (!tasks.length) {
    container.className = "empty-state";
    container.textContent = "暂无待办";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "list";

  tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = `list-item task-item${task.completed ? " is-completed" : ""}`;
    item.innerHTML = `
      <label class="task-check">
        <input type="checkbox" data-task-id="${task.id}" ${task.completed ? "checked" : ""} />
      </label>
      <div class="task-content">
        <div class="task-top-row">
          <div class="list-item-title">${escapeHtml(task.title)}</div>
          <span class="tag ${task.completed ? "tag-muted" : ""}">${escapeHtml(task.priority || "中")}</span>
        </div>
        <div class="list-item-meta">
          ${escapeHtml(task.companyName)} / ${escapeHtml(task.roleName)}
          ${task.dueAt ? ` · 截止 ${escapeHtml(task.dueAt)}` : ""}
          ${task.completedAt ? ` · 完成于 ${escapeHtml(task.completedAt)}` : ""}
        </div>
      </div>
    `;
    wrapper.appendChild(item);
  });

  container.className = "";
  container.textContent = "";
  container.appendChild(wrapper);
}

function renderApplications(applications) {
  const container = document.getElementById("applications-list");

  if (!applications.length) {
    container.className = "empty-state";
    container.textContent = "暂无岗位记录";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "list";

  applications.forEach((application) => {
    const hasLink = Boolean(application.importantLink);
    const summary = application.summary ? `<div class="application-summary">${escapeHtml(application.summary)}</div>` : "";
    const deadline = application.actionDeadline
      ? `<div class="list-item-meta application-deadline">关键时间：${escapeHtml(application.actionDeadline)}</div>`
      : "";
    const action = application.suggestedAction
      ? `<div class="list-item-meta">建议动作：${escapeHtml(application.suggestedAction)}</div>`
      : "";
    const linkLine = hasLink
      ? `<div class="list-item-meta"><a class="inline-link" href="${escapeAttribute(application.importantLink)}" target="_blank" rel="noreferrer">打开笔试 / 面试链接</a></div>`
      : "";

    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="application-row">
        <div class="application-main">
          <div class="list-item-title">${escapeHtml(application.companyName)} - ${escapeHtml(application.roleName)}</div>
          <div class="list-item-meta">
            <span class="tag">${escapeHtml(application.currentStage)}</span>
            ${escapeHtml(application.lastActivityAt || "暂无最近活动")}
            ${application.isManuallyEdited ? '<span class="tag tag-muted">已手动修改</span>' : ""}
          </div>
          ${summary}
          ${deadline}
          ${action}
          ${linkLine}
        </div>
        <div class="application-actions">
          ${hasLink ? `<button class="ghost-button small-button" type="button" data-open-link="${application.id}">打开链接</button>` : ""}
          <button class="ghost-button small-button" type="button" data-edit-application="${application.id}">编辑</button>
        </div>
      </div>
    `;
    wrapper.appendChild(item);
  });

  container.className = "";
  container.textContent = "";
  container.appendChild(wrapper);
}

async function loadDashboard() {
  const data = await window.jobAssistantApi.getBootstrapData();
  state.tasks = data.tasks || [];
  state.applications = data.applications || [];
  state.stageOptions = data.stageOptions || [];

  document.getElementById("new-mails-count").textContent = data.summary.newJobMailsToday;
  document.getElementById("open-tasks-count").textContent = data.summary.openTasks;
  document.getElementById("updated-apps-count").textContent = data.summary.updatedApplications;
  document.getElementById("urgent-text").textContent = data.summary.urgentText;

  renderTasks(state.tasks);
  renderApplications(state.applications);
  populateStageOptions();
}

function populateStageOptions() {
  const select = document.getElementById("application-current-stage");
  const currentValue = select.value;
  select.innerHTML = "";

  state.stageOptions.forEach((option) => {
    const element = document.createElement("option");
    element.value = option;
    element.textContent = option;
    select.appendChild(element);
  });

  if (currentValue) {
    select.value = currentValue;
  }
}

function bindEvents() {
  const refreshButton = document.getElementById("refresh-button");
  const syncButton = document.getElementById("sync-button");
  const statusText = document.getElementById("status-text");
  const taskContainer = document.getElementById("tasks-list");
  const applicationContainer = document.getElementById("applications-list");
  const modalBackdrop = document.getElementById("application-modal-backdrop");
  const modalClose = document.getElementById("application-modal-close");
  const modalCancel = document.getElementById("application-modal-cancel");
  const form = document.getElementById("application-form");

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "刷新中...";

    try {
      await loadDashboard();
      statusText.textContent = "仪表盘已刷新。";
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "刷新";
    }
  });

  syncButton.addEventListener("click", async () => {
    syncButton.disabled = true;
    refreshButton.disabled = true;
    syncButton.textContent = "同步中...";
    statusText.textContent = "邮箱同步进行中...";

    try {
      const result = await window.jobAssistantApi.syncMailbox();
      await loadDashboard();
      statusText.textContent = `${result.message} 已同步 ${result.synced} 封，跳过 ${result.skipped} 封，生成待办 ${result.createdTasks} 条。`;
    } finally {
      syncButton.disabled = false;
      refreshButton.disabled = false;
      syncButton.textContent = "同步邮件";
    }
  });

  taskContainer.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
      return;
    }

    const taskId = Number(target.dataset.taskId);
    const status = target.checked ? "done" : "todo";
    statusText.textContent = target.checked ? "正在将待办标记为已完成..." : "正在恢复待办为未完成...";

    try {
      await window.jobAssistantApi.updateTaskStatus(taskId, status);
      await loadDashboard();
      statusText.textContent = target.checked
        ? "待办已完成，并已沉到列表下方。"
        : "待办已恢复为未完成。";
    } catch (error) {
      target.checked = !target.checked;
      statusText.textContent = `更新待办失败：${error.message}`;
    }
  });

  applicationContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const openLinkButton = target.closest("[data-open-link]");
    if (openLinkButton) {
      const applicationId = Number(openLinkButton.getAttribute("data-open-link"));
      const application = state.applications.find((item) => item.id === applicationId);
      if (application?.importantLink) {
        window.open(application.importantLink, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const editButton = target.closest("[data-edit-application]");
    if (!editButton) {
      return;
    }

    const applicationId = Number(editButton.getAttribute("data-edit-application"));
    const application = state.applications.find((item) => item.id === applicationId);
    if (application) {
      openApplicationModal(application);
    }
  });

  modalClose.addEventListener("click", closeApplicationModal);
  modalCancel.addEventListener("click", closeApplicationModal);
  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) {
      closeApplicationModal();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      applicationId: Number(document.getElementById("application-id").value),
      companyName: document.getElementById("application-company-name").value.trim(),
      roleName: document.getElementById("application-role-name").value.trim(),
      currentStage: document.getElementById("application-current-stage").value,
      importantLink: document.getElementById("application-important-link").value.trim() || null,
    };

    statusText.textContent = "正在保存岗位修改...";

    try {
      await window.jobAssistantApi.updateApplication(payload);
      closeApplicationModal();
      await loadDashboard();
      statusText.textContent = "岗位信息已更新。";
    } catch (error) {
      statusText.textContent = `保存岗位失败：${error.message}`;
    }
  });
}

function openApplicationModal(application) {
  document.getElementById("application-id").value = application.id;
  document.getElementById("application-company-name").value = application.companyName;
  document.getElementById("application-role-name").value = application.roleName;
  document.getElementById("application-current-stage").value = application.currentStage;
  document.getElementById("application-important-link").value = application.importantLink || "";
  document.getElementById("application-modal-backdrop").classList.remove("hidden");
}

function closeApplicationModal() {
  document.getElementById("application-modal-backdrop").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

bindEvents();
loadDashboard();
