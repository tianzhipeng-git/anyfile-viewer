import { defineFormat } from "./define-format";
export const pointFormats = ["pcd", "xyz", "las", "laz"].map(extension => defineFormat(extension, "engineering", 2, {
  name: extension.toUpperCase(), title: `Preview ${extension.toUpperCase()} Point Clouds Online`, description: `View a representative ${extension.toUpperCase()} point sample without uploading the file.`,
  introduction: `${extension.toUpperCase()} Point records are streamed into a bounded local preview. Points appear progressively during decoding; LAZ first loads the compressed input.`,
  canShow: ["Progressive point sampling", "Orbit, standard views and zoom"], limitations: [extension === "laz" ? "200,000 sampled points; 64 MiB compressed input" : "200,000 sampled points; 2 GiB input", "Point attributes and binary PCD are not shown"],
  faq: [{ question: `Does ${extension.toUpperCase()} preview show every point?`, answer: "No. Large files use a representative reservoir sample." }],
}, {
  name: extension.toUpperCase(), title: `在线预览 ${extension.toUpperCase()} 点云`, description: `不上传文件，查看 ${extension.toUpperCase()} 点云的代表性抽样。`,
  introduction: `${extension.toUpperCase()} 点记录通过流式读取生成有界的本地预览。解码期间渐进显示点；LAZ 先读取压缩输入。`,
  canShow: ["渐进点抽样", "旋转、标准视图与缩放"], limitations: [extension === "laz" ? "最多抽样 20 万个点；压缩输入最大 64 MiB" : "最多抽样 20 万个点；输入最大 2 GiB", "不显示点属性与二进制 PCD"],
  faq: [{ question: `${extension.toUpperCase()} 预览显示每一个点吗？`, answer: "不会。大文件使用代表性蓄水池抽样。" }],
}, { verification: "pending" }, [{ name: "CloudCompare", url: "https://www.cloudcompare.org/", reason: { en: "Full point cloud inspection", "zh-CN": "完整点云查看" } } ]));
