import { defineFormat } from "./define-format";

export const bz2Format = defineFormat(
  "bz2",
  "developer-artifacts",
  2,
  {"name":"bzip2 stream","title":"Inspect bzip2 stream Online","description":"Inspect bzip2 stream metadata locally without uploading or executing its payload.","introduction":"bzip2 compresses one stream in independently checkable blocks and is often placed around TAR archives. Anyfile validates recognizable header metadata and reports the container relationship locally.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Does TBZ mean the same thing as BZ2?","answer":"TBZ usually signals a bzip2-compressed TAR archive, while a plain .bz2 can wrap any single payload."}]},
  {"name":"bzip2 压缩流","title":"在线检查bzip2 压缩流","description":"无需上传或执行载荷，在本地检查bzip2 压缩流元数据。","introduction":"bzip2 以可独立校验的块压缩单个流，常用于包裹 TAR 归档。Anyfile 校验可识别的文件头元数据，并在本地报告容器关系。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"TBZ 与 BZ2 含义相同吗？","answer":"TBZ 通常表示 bzip2 压缩的 TAR，而普通 .bz2 可以包裹任意单个载荷。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["bzip2","tbz","tbz2","tar.bz2"],
);

