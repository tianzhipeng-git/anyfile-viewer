import { defineFormat } from "./define-format";

export const pptFormat = defineFormat("ppt", "documents", 3,
  {
    name: "Legacy PowerPoint presentation",
    title: "Open PPT Presentations Online Locally",
    description: "View binary PowerPoint 97–2003 (.ppt) slides, text, images and speaker notes in your browser.",
    introduction: "PPT stores slides, OfficeArt shapes, text runs and notes inside a binary CFBF PowerPoint Document stream. Anyfile parses the slide records locally in the browser for static read-only inspection.",
    canShow: ["Slide text, titles, bullets, colors and hyperlinks", "Positioned shape frames, embedded raster images and speaker notes", "All-slides scroll view and single-slide navigation"],
    limitations: ["Encrypted or password-protected PPT decks are rejected", "Animations, transitions, audio/video playback and macros are not supported"],
    faq: [{ question: "Can I read speaker notes inside a .ppt file?", answer: "Yes. Speaker notes stored in the presentation are extracted and shown below each slide." }],
  },
  {
    name: "旧版 PowerPoint 演示文稿",
    title: "本地在线打开 PPT 演示文稿",
    description: "无需安装 PowerPoint，在浏览器本地查看二进制 PPT 幻灯片、文字、图片与演讲者备注。",
    introduction: "PPT 将幻灯片、OfficeArt 形状、文本样式与备注存储在 CFBF 二进制 PowerPoint Document 流中。Anyfile 在浏览器本地解析记录并静态展示。",
    canShow: ["幻灯片标题、正文、项目符号、颜色与超链接", "按坐标定位的文本框、内嵌图片与演讲者备注", "全部幻灯片浏览与单页切换视图"],
    limitations: ["不支持加密或受密码保护的 PPT 文件", "不支持动画、切换效果、音视频播放与宏"],
    faq: [{ question: "可以查看 .ppt 文件里的演讲者备注吗？", answer: "可以。查看器会提取每页关联的演讲者备注并在幻灯片下方展示。" }],
  },
);
