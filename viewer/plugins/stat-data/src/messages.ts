import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

const number = (locale: Locale, value: number) => value.toLocaleString(locale);
export const messages = (locale: Locale) => selectMessages(locale, {
  en: {
    reading: "Reading data file header…", engine: "Loading ReadStat engine…", parsing: "Reading variables and labels…", ready: "Data file opened",
    invalid: "This is not a valid or supported SPSS, Stata or SAS data file.", limit: "The data file exceeds the browser's size or processing limits.",
    unsupported: "Unable to initialize the ReadStat WebAssembly Worker.", queryFailed: "Unable to read these rows.",
    view: "Choose view", previous: "Previous", next: "Next", empty: "No rows to display.",
    data: "Data", dataColumns: (first: number, last: number) => `Data · columns ${first}–${last}`,
    variables: (count: number) => `Variables (${number("en", count)})`, labels: "Value labels", info: "File information",
    rows: (first: number, last: number, total: number, more: boolean) => `Rows ${number("en", first)}–${number("en", last)}${total >= 0 ? ` of ${number("en", total)}` : more ? " · more available" : ""}`,
    items: (first: number, last: number, total: number) => `${number("en", first)}–${number("en", last)} of ${number("en", total)}`,
    incomplete: "Some metadata after the data could not be read",
    headers: { name: "Name", label: "Label", type: "Type", format: "Format", valueLabels: "Value labels", missing: "Missing values", measure: "Measure", set: "Label set", value: "Value", property: "Property" },
    string: "String", numeric: "Numeric", measures: ["", "Nominal", "Ordinal", "Scale"],
    properties: { format: "Format", version: "Format version", rows: "Rows", variables: "Variables", encoding: "Character encoding", created: "Created", modified: "Modified", compression: "Compression", fileLabel: "File label", table: "Table name", note: "Note", warning: "Warning" },
    formats: { sav: "SPSS data file (.sav/.zsav)", por: "SPSS portable file (.por)", dta: "Stata dataset (.dta)", sas7bdat: "SAS dataset (.sas7bdat)", xpt: "SAS transport file (.xpt)" },
    compression: ["None", "Row compression", "Binary compression"], unknown: "Unknown",
  },
  "zh-CN": {
    reading: "正在读取数据文件头…", engine: "正在加载 ReadStat 引擎…", parsing: "正在读取变量与标签…", ready: "数据文件已打开",
    invalid: "文件不是有效或受支持的 SPSS、Stata 或 SAS 数据文件。", limit: "数据文件超过浏览器的大小或处理上限。",
    unsupported: "无法初始化 ReadStat WebAssembly Worker。", queryFailed: "无法读取这些行。",
    view: "选择视图", previous: "上一页", next: "下一页", empty: "没有可显示的行。",
    data: "数据", dataColumns: (first: number, last: number) => `数据 · 第 ${first}–${last} 列`,
    variables: (count: number) => `变量（${number("zh-CN", count)}）`, labels: "值标签", info: "文件信息",
    rows: (first: number, last: number, total: number, more: boolean) => `第 ${number("zh-CN", first)}–${number("zh-CN", last)} 行${total >= 0 ? `，共 ${number("zh-CN", total)} 行` : more ? " · 还有更多行" : ""}`,
    items: (first: number, last: number, total: number) => `${number("zh-CN", first)}–${number("zh-CN", last)}，共 ${number("zh-CN", total)}`,
    incomplete: "数据之后的部分元数据无法读取",
    headers: { name: "名称", label: "标签", type: "类型", format: "格式", valueLabels: "值标签", missing: "缺失值", measure: "测量级别", set: "标签集", value: "值", property: "属性" },
    string: "字符串", numeric: "数值", measures: ["", "名义", "有序", "尺度"],
    properties: { format: "格式", version: "格式版本", rows: "行数", variables: "变量数", encoding: "字符编码", created: "创建时间", modified: "修改时间", compression: "压缩", fileLabel: "文件标签", table: "表名", note: "备注", warning: "警告" },
    formats: { sav: "SPSS 数据文件（.sav/.zsav）", por: "SPSS 可移植文件（.por）", dta: "Stata 数据集（.dta）", sas7bdat: "SAS 数据集（.sas7bdat）", xpt: "SAS 传输文件（.xpt）" },
    compression: ["无", "行压缩", "二进制压缩"], unknown: "未知",
  },
});
export type Copy = ReturnType<typeof messages>;
