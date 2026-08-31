import { defineFormat } from "./define-format";

export const deflateFormat = defineFormat(
  "deflate",
  "developer-artifacts",
  2,
  {"name":"raw DEFLATE stream","title":"Inspect raw DEFLATE stream Online","description":"Inspect raw DEFLATE stream metadata locally without uploading or executing its payload.","introduction":"Raw DEFLATE contains compressed blocks without the zlib or gzip wrapper that normally supplies identifying metadata. Anyfile inspects recognized streams conservatively because the extension alone provides little context.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Why is raw DEFLATE harder to identify?","answer":"It has no strong outer magic header, so unrelated bytes can resemble a possible stream until decoding validates them."}]},
  {"name":"裸 DEFLATE 流","title":"在线检查裸 DEFLATE 流","description":"无需上传或执行载荷，在本地检查裸 DEFLATE 流元数据。","introduction":"裸 DEFLATE 只包含压缩块，没有通常用于提供识别元数据的 zlib 或 gzip 封装。Anyfile 会保守检查可识别流，因为仅凭扩展名上下文很少。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"为什么裸 DEFLATE 更难识别？","answer":"它没有强外层魔数，因此无关字节在解码验证前也可能看起来像有效流。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["dfl"],
);

