import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
export function copyFor(locale: Locale) {
  return selectMessages(locale, {
    en: {
      reading: "Reading project plan…", rendering: "Preparing tasks…", invalid: "The file is damaged or is not a valid MPP project.",
      limit: "The project exceeds the viewer's size or parsing limits.", unsupported: "The MPP browser runtime could not be initialized.",
      password: "Password-protected MPP files are not supported.", version: "Only MPP14 files saved by Project 2010 or later are supported.",
      limitations: "Preview limits", tasks: "Tasks", resources: "Resources", filter: "Search names or WBS", previous: "Previous", next: "Next", empty: "No matching records",
      id: "ID", name: "Name", wbs: "WBS", start: "Start", finish: "Finish", duration: "Duration", complete: "Complete", predecessors: "Predecessors",
      resourceType: "Type", work: "Work", material: "Material", cost: "Cost", gantt: "Gantt overview", group: "Group", units: "Max units", notes: "Notes", baselineStart: "Baseline start", baselineFinish: "Baseline finish",
      inactive: "Inactive", milestone: "Milestone", summary: "Summary", warning: "Read-only schedule preview. Calendars, costs, custom fields and dependency arrows are not displayed; no schedule is recalculated.",
    },
    "zh-CN": {
      reading: "正在读取项目计划…", rendering: "正在整理任务…", invalid: "文件已损坏，或不是有效的 MPP 项目。",
      limit: "项目超出查看器的大小或解析限制。", unsupported: "无法初始化 MPP 浏览器解析引擎。",
      password: "暂不支持受密码保护的 MPP 文件。", version: "仅支持由 Project 2010 或更高版本保存的 MPP14 文件。",
      limitations: "预览限制", tasks: "任务", resources: "资源", filter: "搜索名称或 WBS", previous: "上一页", next: "下一页", empty: "没有匹配的记录",
      id: "编号", name: "名称", wbs: "WBS", start: "开始", finish: "完成", duration: "工期", complete: "完成率", predecessors: "前置任务",
      resourceType: "类型", work: "工时", material: "材料", cost: "成本", gantt: "甘特概览", group: "组", units: "最大单位", notes: "备注", baselineStart: "基准开始", baselineFinish: "基准完成",
      inactive: "非活动", milestone: "里程碑", summary: "摘要", warning: "只读计划预览。暂不显示日历、成本、自定义字段和依赖箭头；不会重新计算计划。",
    },
  });
}
export type Copy = ReturnType<typeof copyFor>;
