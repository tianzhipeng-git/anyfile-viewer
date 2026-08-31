import { defineFormat } from "./define-format";

export const jmodFormat = defineFormat(
  "jmod",
  "developer-artifacts",
  2,
  {"name":"Java JMOD package","title":"Inspect Java JMOD package Online","description":"Inspect Java JMOD package metadata locally without uploading or executing its payload.","introduction":"JMOD packages Java modules for the JDK toolchain and uses a ZIP-derived structure with a format header. Anyfile exposes bounded entry metadata without linking or executing the module.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Does inspecting JMOD load Java classes?","answer":"No. The viewer only reads package structure and never starts a JVM."}]},
  {"name":"Java JMOD 软件包","title":"在线检查Java JMOD 软件包","description":"无需上传或执行载荷，在本地检查Java JMOD 软件包元数据。","introduction":"JMOD 为 JDK 工具链打包 Java 模块，使用带格式文件头的 ZIP 派生结构。Anyfile 展示有界条目元数据，不链接也不执行模块。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"检查 JMOD 会加载 Java 类吗？","answer":"不会。查看器只读取软件包结构，绝不启动 JVM。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  [],
);

