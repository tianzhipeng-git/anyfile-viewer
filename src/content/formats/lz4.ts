import { defineFormat } from "./define-format";

export const lz4Format = defineFormat(
  "lz4",
  "developer-artifacts",
  2,
  {"name":"LZ4 frame","title":"Inspect LZ4 frame Online","description":"Inspect LZ4 frame metadata locally without uploading or executing its payload.","introduction":"The LZ4 frame format adds block sizes, checksums and optional content size around fast LZ4-compressed data. Anyfile exposes recognized frame metadata without expanding the payload into local files.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Is an LZ4 frame the same as raw LZ4 blocks?","answer":"No. This page covers the framed format identified by its header; raw blocks lack that self-describing wrapper."}]},
  {"name":"LZ4 帧","title":"在线检查LZ4 帧","description":"无需上传或执行载荷，在本地检查LZ4 帧元数据。","introduction":"LZ4 帧格式在高速 LZ4 压缩数据外加入块大小、校验和与可选内容大小。Anyfile 展示可识别帧元数据，不把载荷展开为本地文件。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"LZ4 帧与裸 LZ4 块相同吗？","answer":"不同。本页描述由文件头识别的帧格式；裸块没有这种自描述封装。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["tar.lz4"],
);

