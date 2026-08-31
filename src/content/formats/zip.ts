import { defineFormat } from "./define-format";

export const zipFormat = defineFormat(
  "zip",
  "developer-artifacts",
  2,
  {"name":"ZIP archive","title":"Inspect ZIP archive Online","description":"Inspect ZIP archive metadata locally without uploading or executing its payload.","introduction":"ZIP combines a central directory with independently compressed entries and underlies many package formats. Anyfile reads that directory locally to show paths, sizes and compression without extracting files to disk.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Can Anyfile extract or modify a ZIP?","answer":"No. This viewer is for bounded structural inspection; use an archive utility when you need extraction or changes."}]},
  {"name":"ZIP 归档","title":"在线检查ZIP 归档","description":"无需上传或执行载荷，在本地检查ZIP 归档元数据。","introduction":"ZIP 通过中央目录组织独立压缩的条目，也是许多软件包格式的基础。Anyfile 在本地读取目录，展示路径、大小与压缩方式，不把文件解压到磁盘。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"Anyfile 会解压或修改 ZIP 吗？","answer":"不会。该查看器只做有界结构检查；需要解压或修改时请使用归档工具。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["zip64"],
);

