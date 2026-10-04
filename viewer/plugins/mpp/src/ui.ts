import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { copyFor } from "./messages";
import type { Duration, ProjectDocument, Resource, Task } from "./types";

const PAGE_SIZE = 100;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function timestamp(value: string | null) { return value ? Date.parse(`${value}Z`) : NaN; }

export function createProjectView(fileName: string, project: ProjectDocument, locale: Locale) {
  const copy = copyFor(locale);
  const units = selectMessages(locale, {
    en: { m: "min", h: "h", d: "d", w: "wk", mo: "mo", y: "yr", em: "elapsed min", eh: "elapsed h", ed: "elapsed d", ew: "elapsed wk", emo: "elapsed mo", ey: "elapsed yr", "e%": "elapsed %" },
    "zh-CN": { m: "分钟", h: "小时", d: "天", w: "周", mo: "月", y: "年", em: "历时分钟", eh: "历时小时", ed: "历时天", ew: "历时周", emo: "历时月", ey: "历时年", "e%": "历时百分比" },
  });
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const duration = (value: Duration) => `${number(value.amount)} ${units[value.unit as keyof typeof units] ?? value.unit}`;
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const date = (value: string | null) => value && Number.isFinite(timestamp(value)) ? dateFormat.format(timestamp(value)) : "—";
  let min = Infinity, max = -Infinity;
  for (const task of project.tasks) {
    if (task.inactive) continue;
    const start = timestamp(task.start), finish = timestamp(task.finish);
    if (Number.isFinite(start) && Number.isFinite(finish) && finish >= start) { min = Math.min(min, start); max = Math.max(max, finish); }
  }
  const range = Math.max(max - min, 86400000);
  const root = node("section");
  root.className = "anyfile-mpp-viewer";
  const style = node("style");
  style.textContent = `
.anyfile-mpp-viewer{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#222);font-family:var(--viewer-font-family,system-ui);font-size:13px}
.anyfile-mpp-viewer *{box-sizing:border-box}
.anyfile-mpp-viewer header{flex:none;padding:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--viewer-border,#ddd)}
.anyfile-mpp-viewer h2{font-size:15px;margin:0;overflow-wrap:anywhere;width:100%}
.anyfile-mpp-viewer p{margin:0;overflow-wrap:anywhere;width:100%}
.anyfile-mpp-viewer input,.anyfile-mpp-viewer select,.anyfile-mpp-viewer button{font:inherit;color:inherit;background:var(--viewer-background,#fff);border:1px solid var(--viewer-border,#ddd);border-radius:4px;padding:6px;max-width:100%}
.anyfile-mpp-viewer input{min-width:80px;flex:1}
.anyfile-mpp-viewer header details{padding:0;border:0}
.anyfile-mpp-viewer header details[open]{width:100%}
.anyfile-mpp-viewer button:disabled{opacity:.45}
.anyfile-mpp-viewer__viewport{flex:1;min-width:0;min-height:0;overflow:auto}
.anyfile-mpp-viewer table{border-collapse:separate;border-spacing:0;width:100%;white-space:nowrap}
.anyfile-mpp-viewer th,.anyfile-mpp-viewer td{padding:8px;text-align:left;border-bottom:1px solid var(--viewer-border,#ddd)}
.anyfile-mpp-viewer th{position:sticky;top:0;background:var(--viewer-background,#fff);z-index:1}
.anyfile-mpp-viewer td:nth-child(3){white-space:normal;min-width:240px;max-width:400px;overflow-wrap:anywhere}
.anyfile-mpp-viewer tr[data-summary=true]{font-weight:600}
.anyfile-mpp-viewer tr[data-inactive=true]{opacity:.55}
.anyfile-mpp-viewer__timeline{position:relative;width:300px;height:18px;background:color-mix(in srgb,var(--viewer-border,#ddd) 30%,transparent)}
.anyfile-mpp-viewer__bar{position:absolute;top:4px;height:10px;min-width:2px;background:var(--viewer-accent,#2563eb)}
.anyfile-mpp-viewer__milestone{width:8px;height:8px;transform:translateX(-4px) rotate(45deg)}
.anyfile-mpp-viewer details{padding:12px;border-bottom:1px solid var(--viewer-border,#ddd)}
.anyfile-mpp-viewer pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
`;
  const toolbar = node("header");
  const limits = node("details"); limits.append(node("summary", copy.limitations), node("p", copy.warning));
  toolbar.append(node("h2", project.name || fileName), limits);
  const mode = node("select");
  mode.setAttribute("aria-label", `${copy.tasks} / ${copy.resources}`);
  for (const [value, label] of [["tasks", `${copy.tasks} (${project.tasks.length})`], ["resources", `${copy.resources} (${project.resources.length})`]]) {
    const option = node("option", label); option.value = value; mode.append(option);
  }
  const filter = node("input");
  filter.type = "search"; filter.placeholder = copy.filter; filter.setAttribute("aria-label", copy.filter);
  const previous = node("button", copy.previous), next = node("button", copy.next), status = node("span");
  previous.type = next.type = "button";
  status.setAttribute("role", "status");
  toolbar.append(mode, filter, previous, status, next);
  const viewport = node("div"); viewport.className = "anyfile-mpp-viewer__viewport";
  root.append(style, toolbar, viewport);
  let page = 0;
  let rows: (Task | Resource)[] = project.tasks;
  function render() {
    viewport.replaceChildren();
    const tasks = mode.value === "tasks";
    const table = node("table"); table.setAttribute("aria-label", tasks ? copy.tasks : copy.resources);
    const head = node("thead"), headings = node("tr");
    const labels = tasks ? [copy.id, copy.wbs, copy.name, copy.start, copy.finish, copy.duration, copy.complete, copy.predecessors, copy.resources, copy.gantt] : [copy.id, copy.name, copy.group, copy.resourceType, copy.units];
    for (const label of labels) { const th = node("th", label); th.scope = "col"; headings.append(th); }
    if (tasks && Number.isFinite(min)) headings.lastElementChild!.append(node("div", `${dateFormat.format(min)} – ${dateFormat.format(max)}`));
    head.append(headings); table.append(head);
    const body = node("tbody");
    for (const record of rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const tr = node("tr");
      if (tasks) {
        const task = record as Task;
        tr.dataset.summary = String(task.summary); tr.dataset.inactive = String(task.inactive);
        const flags = [task.inactive && copy.inactive, task.milestone && copy.milestone, task.summary && copy.summary].filter(Boolean).join(", ");
        const values = [String(task.id), task.wbs, `${task.name}${flags ? ` (${flags})` : ""}`, date(task.start), date(task.finish), duration(task.duration), `${number(task.complete)}%`, task.predecessors.map(p => `${p.id}${p.type}${p.lag.amount ? ` ${duration(p.lag)}` : ""}`).join(", "), task.resources.join(", ")];
        values.forEach((value, index) => { const td = node("td", value); if (index === 2) td.style.paddingLeft = `${8 + Math.min(Math.max(0, task.level - 1), 12) * 14}px`; tr.append(td); });
        const td = node("td"), timeline = node("div"); timeline.className = "anyfile-mpp-viewer__timeline";
        timeline.setAttribute("role", "img"); timeline.setAttribute("aria-label", `${task.name}: ${date(task.start)} – ${date(task.finish)}`);
        const start = timestamp(task.start), finish = timestamp(task.finish);
        if (!task.inactive && Number.isFinite(start) && Number.isFinite(finish) && finish >= start) {
          const bar = node("span"); bar.className = `anyfile-mpp-viewer__bar${task.milestone ? " anyfile-mpp-viewer__milestone" : ""}`;
          bar.style.left = `${100 * (start - min) / range}%`;
          if (!task.milestone) bar.style.width = `${100 * (finish - start) / range}%`;
          timeline.append(bar);
        }
        td.append(timeline); tr.append(td);
      } else {
        const resource = record as Resource;
        for (const value of [String(resource.id), resource.name, resource.group, ({ Work: copy.work, Material: copy.material, Cost: copy.cost } as Record<string, string>)[resource.type] ?? resource.type, resource.type === "Work" ? `${number(resource.maxUnits)}%` : "—"]) tr.append(node("td", value));
      }
      body.append(tr);
      const task = tasks ? record as Task : undefined;
      if (record.notes || task?.baselineStart || task?.baselineFinish) {
        const detailRow = node("tr"), td = node("td"); td.colSpan = labels.length;
        const details = node("details"); details.append(node("summary", `${copy.notes} · ${record.name}`));
        if (task?.baselineStart || task?.baselineFinish) details.append(node("p", `${copy.baselineStart}: ${date(task.baselineStart)} · ${copy.baselineFinish}: ${date(task.baselineFinish)}`));
        if (record.notes) details.append(node("pre", record.notes));
        td.append(details); detailRow.append(td); body.append(detailRow);
      }
    }
    table.append(body); viewport.append(table);
    if (!rows.length) viewport.append(node("p", copy.empty));
    status.textContent = rows.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, rows.length)} / ${rows.length}` : "0 / 0";
    previous.disabled = page === 0; next.disabled = (page + 1) * PAGE_SIZE >= rows.length;
    viewport.scrollTop = 0;
  }
  function update() {
    page = 0;
    const query = filter.value.trim().toLocaleLowerCase(locale);
    const source = mode.value === "tasks" ? project.tasks : project.resources;
    rows = source.filter(record => `${record.name} ${"wbs" in record ? record.wbs : record.group}`.toLocaleLowerCase(locale).includes(query));
    render();
  }
  filter.addEventListener("input", update); mode.addEventListener("change", update);
  previous.addEventListener("click", () => { if (page > 0) { page--; render(); } });
  next.addEventListener("click", () => { if ((page + 1) * PAGE_SIZE < rows.length) { page++; render(); } });
  render();
  return root;
}
