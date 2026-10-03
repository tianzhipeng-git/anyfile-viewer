import { describe, expect, it } from "vitest";
import { createProjectView } from "./ui";
import type { ProjectDocument, Task } from "./types";
const task = (id: number): Task => ({ id, uid: id, name: `Task ${id}`, wbs: `${id}`, level: 1, start: "2026-10-01T08:00:00", finish: "2026-10-02T17:00:00", duration: { amount: 2, unit: "d" }, complete: 50, summary: false, milestone: false, inactive: false, baselineStart: null, baselineFinish: null, predecessors: [], resources: [], notes: "" });
function fixture(): ProjectDocument { return { name: "Plan", tasks: Array.from({ length: 105 }, (_, i) => task(i + 1)), resources: [{ id: 1, name: "Designer", group: "Design", type: "Work", maxUnits: 75, notes: "" }] }; }
describe("MPP view", () => {
  it("paginates and filters all tasks while keeping a common Gantt scale", () => {
    const root = createProjectView("plan.mpp", fixture(), "en");
    expect(root.querySelectorAll("tbody tr")).toHaveLength(100);
    expect(root.textContent).toContain("1–100 / 105");
    root.querySelectorAll<HTMLButtonElement>("button")[1].click();
    expect(root.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(root.textContent).toContain("101–105 / 105");
    const filter = root.querySelector<HTMLInputElement>("input")!;
    filter.value = "Task 105"; filter.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(root.textContent).toContain("1–1 / 1");
    expect(root.querySelector(".anyfile-mpp-viewer__bar")).not.toBeNull();
  });
  it("localizes resource viewing and leaves non-work capacity blank", () => {
    const project = fixture(); project.resources[0].type = "Cost";
    const root = createProjectView("plan.mpp", project, "zh-CN");
    const mode = root.querySelector<HTMLSelectElement>("select")!;
    mode.value = "resources"; mode.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("成本");
    expect(root.textContent).toContain("Designer");
    expect(root.textContent).not.toContain("75%");
  });
  it("renders untrusted names and notes as text, and preserves missing dates", () => {
    const project = fixture(); project.tasks = [task(1)];
    Object.assign(project.tasks[0], { name: "<img src=x onerror=alert(1)>", notes: "<script>alert(1)</script>", start: null, finish: null, inactive: true });
    const root = createProjectView("plan.mpp", project, "en");
    expect(root.querySelector("img, script")).toBeNull();
    expect(root.textContent).toContain("<script>alert(1)</script>");
    expect(root.querySelector(".anyfile-mpp-viewer__bar")).toBeNull();
    expect(root.querySelector("tbody tr")?.getAttribute("data-inactive")).toBe("true");
  });
});
