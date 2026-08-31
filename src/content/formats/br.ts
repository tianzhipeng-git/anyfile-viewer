import { defineFormat } from "./define-format";

export const brFormat = defineFormat(
  "br",
  "developer-artifacts",
  2,
  {"name":"Brotli stream","title":"Inspect Brotli stream Online","description":"Inspect Brotli stream metadata locally without uploading or executing its payload.","introduction":"Brotli is a compact compressed bitstream widely used for web transfer and packaged assets. Anyfile provides local structural inspection; it does not fetch an origin or infer HTTP content encoding.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Will opening BR contact the website it came from?","answer":"No. Anyfile reads only the selected local bytes and makes no request to a recorded or guessed origin."}]},
  {"name":"Brotli 压缩流","title":"在线检查Brotli 压缩流","description":"无需上传或执行载荷，在本地检查Brotli 压缩流元数据。","introduction":"Brotli 是广泛用于 Web 传输与打包资产的紧凑压缩位流。Anyfile 在本地提供结构检查，不访问来源站点，也不推断 HTTP Content-Encoding。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"打开 BR 会联系它原来的网站吗？","answer":"不会。Anyfile 只读取所选本地字节，不请求记录或猜测出的来源站点。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  [],
);

