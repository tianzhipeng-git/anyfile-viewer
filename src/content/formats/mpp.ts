import { defineFormat } from "./define-format";

export const mppFormat = defineFormat("mpp", "documents", 3,
  {
    name: "Microsoft Project", title: "Open MPP Project Plans Online", description: "View Microsoft Project tasks, dates, dependencies and resources directly in your browser.",
    introduction: "MPP stores Microsoft Project schedules in a binary compound file. Anyfile reads MPP14 plans saved by Project 2010 or later locally and presents task hierarchy, schedule dates and a Gantt overview without recalculating the plan.",
    canShow: ["Task names, hierarchy, WBS, dates, durations and completion", "Predecessor IDs, relation types and lag", "Gantt overview, resource names, notes and primary baseline dates"],
    limitations: ["Legacy MPP8, MPP9, MPP12 and password-protected files are unsupported", "Calendars, costs, custom fields and dependency arrows are not displayed; unread dates stay blank", "128 MiB input, 100,000 tasks/resources, 200,000 assignments, 32 MiB preview data and a 30-second parsing budget"],
    faq: [{ question: "Does opening an MPP file change the project schedule?", answer: "No. Anyfile displays the saved schedule locally, without editing tasks, recalculating dates or uploading your project." }],
  },
  {
    name: "Microsoft Project", title: "在线打开 MPP 项目计划", description: "在浏览器中查看 Microsoft Project 任务、计划日期、前置关系和资源，无需安装 Project。",
    introduction: "MPP 使用二进制复合文件保存 Microsoft Project 计划。Anyfile 在本地读取由 Project 2010 或更高版本保存的 MPP14，展示任务层级、计划日期与甘特概览，不重新计算计划。",
    canShow: ["任务名称、层级、WBS、日期、工期和完成率", "前置任务编号、关系类型与延迟", "甘特概览、资源名称、备注与主基准日期"],
    limitations: ["不支持旧版 MPP8、MPP9、MPP12 和受密码保护的文件", "暂不显示日历、成本、自定义字段与依赖箭头；解析器未读到的日期留空", "输入上限 128 MiB、任务及资源各 10 万、分配 20 万、预览数据 32 MiB，解析预算 30 秒"],
    faq: [{ question: "打开 MPP 会改变项目计划吗？", answer: "不会。Anyfile 在本地展示保存的计划，不编辑任务、不重新计算日期，也不上传项目。" }],
  });
