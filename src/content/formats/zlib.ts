import { defineFormat } from "./define-format";

export const zlibFormat = defineFormat(
  "zlib",
  "developer-artifacts",
  2,
  {"name":"zlib stream","title":"Inspect zlib stream Online","description":"Inspect zlib stream metadata locally without uploading or executing its payload.","introduction":"zlib wraps DEFLATE data with a small header and Adler-32 checksum. Anyfile distinguishes that wrapper from raw DEFLATE and reports bounded stream metadata locally.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Is zlib the same as gzip?","answer":"Both can carry DEFLATE data, but their headers, trailers and intended metadata differ."}]},
  {"name":"zlib 压缩流","title":"在线检查zlib 压缩流","description":"无需上传或执行载荷，在本地检查zlib 压缩流元数据。","introduction":"zlib 用简短文件头与 Adler-32 校验和封装 DEFLATE 数据。Anyfile 将它与裸 DEFLATE 区分，并在本地报告有界流元数据。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"zlib 与 gzip 相同吗？","answer":"两者都可承载 DEFLATE 数据，但文件头、尾部与目标元数据不同。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["zz"],
);

