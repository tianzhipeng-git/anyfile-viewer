import { defineFormat } from "./define-format";

export const tarFormat = defineFormat(
  "tar",
  "developer-artifacts",
  2,
  {"name":"TAR archive","title":"Inspect TAR archive Online","description":"Inspect TAR archive metadata locally without uploading or executing its payload.","introduction":"TAR stores a sequential series of file headers and payloads, usually before an outer compression step. Anyfile walks bounded headers to summarize member names, sizes and types without writing extracted files.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Is TAR itself compressed?","answer":"Usually not. Extensions such as .tar.gz add a separate compression layer around the TAR stream."}]},
  {"name":"TAR 归档","title":"在线检查TAR 归档","description":"无需上传或执行载荷，在本地检查TAR 归档元数据。","introduction":"TAR 顺序保存文件头与载荷，通常再由外层压缩。Anyfile 有界遍历文件头，汇总成员名称、大小与类型，不写出解压文件。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"TAR 本身会压缩吗？","answer":"通常不会。.tar.gz 等扩展名是在 TAR 流外再增加独立压缩层。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  [],
);

