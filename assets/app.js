const config = window.FIRE_APP_CONFIG || {};
const byId = id => document.getElementById(id);

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const statusBadge = (value = "") => {
  const v = String(value).toLowerCase();
  let cls = "info";
  if (v.includes("pass") || v.includes("ok") || v.includes("completed")) cls = "ok";
  else if (v.includes("fail")) cls = "danger";
  else if (v.includes("pending") || v.includes("attention")) cls = "warn";
  return `<span class="badge ${cls}">${value || "-"}</span>`;
};

const api = {
  async post(action, payload = {}) {
    if (!config.APPS_SCRIPT_URL || config.APPS_SCRIPT_URL.includes("PASTE_")) {
      throw new Error("Apps Script URL is missing in assets/config.js");
    }

    const res = await fetch(config.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      cache: "no-store",
      body: JSON.stringify({ action, ...payload })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Request failed");
    return json;
  }
};

async function loadEquipmentMap() {
  const res = await fetch("data/equipment.json", { cache: "no-store" });
  const list = await res.json();
  const map = {};
  list.forEach(row => map[row.equipmentId] = row);
  return { list, map };
}

async function loadFormQuestions() {
  const url = config.APPS_SCRIPT_URL + "?action=formQuestions";
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || "Unable to load form questions");
  return json.questions || [];
}

function renderDynamicQuestions(questions) {
  const area = byId("dynamicQuestionArea");
  if (!area) return;

  area.innerHTML = questions.map(q => {
    if (q.fieldType === "select") {
      return `
        <div class="field">
          <label>${q.label}</label>
          <select name="${q.fieldKey}" ${q.required ? "required" : ""}>
            <option value="">Select</option>
            ${(q.options || []).map(opt => `<option>${opt}</option>`).join("")}
          </select>
        </div>
      `;
    }

    if (q.fieldType === "textarea") {
      return `
        <div class="field" style="grid-column:1 / -1">
          <label>${q.label}</label>
          <textarea name="${q.fieldKey}" ${q.required ? "required" : ""}></textarea>
        </div>
      `;
    }

    return `
      <div class="field">
        <label>${q.label}</label>
        <input name="${q.fieldKey}" type="text" ${q.required ? "required" : ""}>
      </div>
    `;
  }).join("");
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem("fireInspectorSession") || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem("fireInspectorSession", JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem("fireInspectorSession");
}

function sessionValid(session) {
  return !!(session && session.expiresAt && Date.now() < Number(session.expiresAt));
}

async function requireLogin() {
  const session = getSession();
  if (sessionValid(session)) return session;
  location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
  return null;
}

function fillTopUserBar() {
  const el = byId("userChip");
  if (!el) return;
  const session = getSession();
  if (sessionValid(session)) {
    el.innerHTML = `${session.name} <span class="small">(${session.inspectorId})</span>`;
  } else {
    el.textContent = "Not logged in";
  }
}

function setupLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach(btn => {
    btn.addEventListener("click", () => {
      clearSession();
      location.href = "login.html";
    });
  });
}

async function initLoginPage() {
  const form = byId("loginForm");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const notice = byId("loginNotice");
    if (notice) notice.className = "notice hidden";

    try {
      const out = await api.post("login", {
        inspectorId: form.inspectorId.value.trim(),
        pin: form.pin.value.trim()
      });

      saveSession({
        inspectorId: out.inspector.inspectorId,
        name: out.inspector.fullName,
        department: out.inspector.department,
        expiresAt: Date.now() + (Number(config.SESSION_HOURS || 8) * 60 * 60 * 1000)
      });

      location.href = new URLSearchParams(location.search).get("next") || "index.html";
    } catch (err) {
      if (notice) {
        notice.className = "notice error";
        notice.textContent = err.message;
      }
    }
  });
}

async function initInspectionPage() {
  const form = byId("inspectionForm");
  if (!form) return;

  const session = await requireLogin();
  fillTopUserBar();
  setupLogoutButtons();

  const { map } = await loadEquipmentMap();
  const equipmentId = new URLSearchParams(location.search).get("id") || "";
  const equipment = map[equipmentId];

  if (!equipment) {
    byId("pageError").className = "notice error";
    byId("pageError").textContent = "Equipment ID not found in equipment.json. Please check your QR link.";
    return;
  }

  const questions = await loadFormQuestions();
  renderDynamicQuestions(questions);

  byId("equipmentSummary").innerHTML = `
    <div class="stat-line"><strong>Equipment ID</strong><span>${equipment.equipmentId}</span></div>
    <div class="stat-line"><strong>Location</strong><span>${equipment.location || "-"}</span></div>
    <div class="stat-line"><strong>Department</strong><span>${equipment.department || "-"}</span></div>
    <div class="stat-line"><strong>Type / Capacity</strong><span>${equipment.type || "-"}${equipment.capacity ? " / " + equipment.capacity : ""}</span></div>
    <div class="stat-line"><strong>Service Due</strong><span>${equipment.nextServiceDueDate || "-"}</span></div>
  `;

  form.equipmentId.value = equipment.equipmentId;
  form.location.value = equipment.location || "";
  form.department.value = equipment.department || "";
  form.inspectorName.value = session.name || "";
  form.inspectorId.value = session.inspectorId || "";
  form.inspectionDate.valueAsDate = new Date();

  let photoBase64 = "";

  form.photo.addEventListener("change", () => {
    const file = form.photo.files?.[0];
    if (!file) {
      photoBase64 = "";
      byId("photoPreview").innerHTML = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      photoBase64 = String(reader.result || "");
      byId("photoPreview").innerHTML = `
        <div class="preview">
          <img src="${photoBase64}" alt="preview">
          <div class="small">${file.name}<br>${Math.round(file.size / 1024)} KB</div>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const notice = byId("formNotice");
    notice.className = "notice hidden";

    const submitBtn = form.querySelector("button[type='submit']");
    const oldText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const fd = Object.fromEntries(new FormData(form).entries());

    const payload = {
      inspectorId: session.inspectorId,
      inspectorName: session.name,
      equipmentId: fd.equipmentId,
      location: fd.location,
      department: fd.department,
      inspectionDate: fd.inspectionDate,
      remarks: fd.remarks || "",
      photoBase64
    };

    questions.forEach(q => {
      payload[q.fieldKey] = fd[q.fieldKey] || "";
    });

    const criticalFail =
      payload.extinguisherPresent === "No" ||
      payload.pressureGaugeNormal === "No" ||
      payload.safetyPinPresent === "No" ||
      payload.sealIntact === "No" ||
      payload.hoseNozzleOk === "No" ||
      payload.bodyConditionOk === "No" ||
      payload.refillRequired === "Yes" ||
      payload.leakOrDamageFound === "Yes";

    payload.finalStatus = criticalFail ? "Fail" : "Pass";

    try {
      const out = await api.post("submitInspection", payload);
      notice.className = "notice success";
      notice.innerHTML = `Inspection saved successfully.<br><span class="small">Reference: ${out.reference || "-"}</span>`;

      form.reset();
      photoBase64 = "";
      byId("photoPreview").innerHTML = "";

      form.equipmentId.value = equipment.equipmentId;
      form.location.value = equipment.location || "";
      form.department.value = equipment.department || "";
      form.inspectorName.value = session.name || "";
      form.inspectorId.value = session.inspectorId || "";
      form.inspectionDate.valueAsDate = new Date();

      renderDynamicQuestions(questions);
    } catch (err) {
      notice.className = "notice error";
      notice.textContent = "Submit failed: " + err.message;
      alert("Submit failed: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = oldText;
    }
  });
}

let dashboardData = {
  allItems: [],
  pending: [],
  completed: [],
  recent: [],
  byDepartment: []
};

function renderEquipmentTable(items) {
  const tbody = byId("equipmentTableBody");
  if (!tbody) return;

  tbody.innerHTML = items.length
    ? items.map(x => `
      <tr>
        <td>${x.equipmentId || "-"}</td>
        <td>${x.location || "-"}</td>
        <td>${x.department || "-"}</td>
        <td>${x.type || "-"}</td>
        <td>${statusBadge(x.status || "-")}</td>
        <td>${x.inspectionDate || "-"}</td>
        <td>${x.inspectorName || "-"}</td>
        <td>${x.finalStatus ? statusBadge(x.finalStatus) : "-"}</td>
        <td>${x.remarks || "-"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="9">No records found.</td></tr>`;
}

function applyDashboardFilters() {
  const statusEl = byId("statusFilter");
  const deptEl = byId("departmentFilter");
  const searchEl = byId("searchFilter");
  if (!statusEl || !deptEl || !searchEl) return;

  const mode = statusEl.value || "all";
  const dept = (deptEl.value || "").toLowerCase();
  const search = (searchEl.value || "").toLowerCase();

  let source = dashboardData.allItems;

  if (mode === "pending") source = dashboardData.pending;
  if (mode === "completed") source = dashboardData.completed;
  if (mode === "failed") source = dashboardData.completed.filter(x => String(x.finalStatus || "").toLowerCase() === "fail");

  const filtered = source.filter(x => {
    const deptMatch = !dept || String(x.department || "").toLowerCase() === dept;
    const text = `${x.equipmentId} ${x.location} ${x.department} ${x.type} ${x.inspectorName} ${x.remarks}`.toLowerCase();
    const searchMatch = !search || text.includes(search);
    return deptMatch && searchMatch;
  });

  if (byId("recordCount")) byId("recordCount").textContent = filtered.length;
  renderEquipmentTable(filtered);
}

async function initDashboardPage() {
  if (!byId("dashboardPage")) return;

  await requireLogin();
  fillTopUserBar();
  setupLogoutButtons();

  const monthFilter = byId("monthFilter");
  monthFilter.value = currentMonthKey();

  byId("refreshBtn").addEventListener("click", loadDashboard);
  byId("statusFilter").addEventListener("change", applyDashboardFilters);
  byId("departmentFilter").addEventListener("change", applyDashboardFilters);
  byId("searchFilter").addEventListener("input", applyDashboardFilters);

  byId("exportBtn").addEventListener("click", async () => {
    try {
      const out = await api.post("exportCsv", { month: monthFilter.value });
      const blob = new Blob([out.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fire-inspections-${monthFilter.value}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  });

  await loadDashboard();
}

async function loadDashboard() {
  const month = byId("monthFilter").value || currentMonthKey();
  const notice = byId("dashNotice");
  if (notice) notice.className = "notice hidden";

  const refreshBtn = byId("refreshBtn");
  if (!refreshBtn) return;
  const oldText = refreshBtn.textContent;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    const out = await api.post("dashboard", { month });

    dashboardData = {
      allItems: out.allItems || [],
      pending: out.pending || [],
      completed: out.completed || [],
      recent: out.recent || [],
      byDepartment: out.byDepartment || []
    };

    if (byId("kpiTotal")) byId("kpiTotal").textContent = out.summary.totalEquipment ?? "-";
    if (byId("kpiChecked")) byId("kpiChecked").textContent = out.summary.checkedThisMonth ?? "-";
    if (byId("kpiPending")) byId("kpiPending").textContent = out.summary.pendingThisMonth ?? "-";
    if (byId("kpiFailed")) byId("kpiFailed").textContent = out.summary.failedThisMonth ?? "-";

    const deptSelect = byId("departmentFilter");
    const selectedDept = deptSelect.value;
    const depts = [...new Set((dashboardData.allItems || []).map(x => x.department).filter(Boolean))].sort();

    deptSelect.innerHTML = `<option value="">All Departments</option>` +
      depts.map(d => `<option value="${String(d).toLowerCase()}">${d}</option>`).join("");

    deptSelect.value = selectedDept;

    if (byId("deptTable")) {
      byId("deptTable").innerHTML = (out.byDepartment || []).map(x => `
        <tr>
          <td>${x.department || "-"}</td>
          <td>${x.total}</td>
          <td>${x.checked}</td>
          <td>${x.pending}</td>
          <td>${statusBadge(x.failed ? x.failed + " Fail" : "0 Fail")}</td>
        </tr>
      `).join("") || `<tr><td colspan="5">No department summary.</td></tr>`;
    }

    if (byId("recentTable")) {
      byId("recentTable").innerHTML = (out.recent || []).map(x => `
        <tr>
          <td>${x.inspectionDate || "-"}</td>
          <td>${x.equipmentId || "-"}</td>
          <td>${x.location || "-"}</td>
          <td>${x.department || "-"}</td>
          <td>${x.inspectorName || "-"}</td>
          <td>${statusBadge(x.finalStatus || "-")}</td>
          <td>${x.remarks || "-"}</td>
        </tr>
      `).join("") || `<tr><td colspan="7">No recent inspections found.</td></tr>`;
    }

    applyDashboardFilters();
  } catch (err) {
    if (notice) {
      notice.className = "notice error";
      notice.textContent = err.message;
    }
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = oldText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initLoginPage();
  initInspectionPage();
  initDashboardPage();
});
