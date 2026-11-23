import { defineFormat } from "./define-format";

export const pstFormat = defineFormat("pst", "documents", 3,
  {
    name: "Outlook data file",
    title: "Open PST Files Online Without Outlook",
    description: "Browse an Outlook .pst mailbox in your browser: folders, emails, recipients and attachments, nothing uploaded.",
    introduction: "A .pst Personal Folders file is how Outlook exports or archives a mailbox, often several gigabytes of mail kept after a job change, an old PC backup or a legal hold. Anyfile reads the archive's own index on demand, so even a huge mailbox opens in seconds: pick a folder, page through its items and read any message with its attachments, all locally in the browser.",
    canShow: [
      "The complete folder tree with item counts",
      "Paged message lists with subject, sender, date and size",
      "HTML, RTF and plain-text bodies, recipients and Internet headers",
      "Attachments, saved one by one to your device",
    ],
    limitations: [
      "Read-only: nothing is edited, exported in bulk or written back",
      "Calendar, contact and task items show only common message fields; embedded message attachments are listed but not opened",
    ],
    faq: [
      { question: "Is my mailbox uploaded anywhere?", answer: "No. The PST file is read inside your browser tab; mail, contacts and attachments never leave your device." },
      { question: "Can it open a password-protected PST?", answer: "Yes. Outlook's PST password is only checked by Outlook itself, so the mailbox content is still readable here. Archives using the rare high (cyclic) encryption are not supported." },
    ],
  },
  {
    name: "Outlook 数据文件",
    title: "无需 Outlook 在线打开 PST 文件",
    description: "在浏览器中浏览 Outlook .pst 邮箱归档：文件夹、邮件、收件人与附件，全程不上传。",
    introduction: ".pst 个人文件夹是 Outlook 导出或归档邮箱的文件，常见于离职交接、旧电脑备份或法务留存，体积动辄数 GB。Anyfile 按需读取归档自身的索引，超大邮箱也能数秒打开：选择文件夹、分页浏览邮件，并在浏览器本地阅读任意一封邮件及其附件。",
    canShow: [
      "完整文件夹树与各文件夹项目数",
      "分页邮件列表，含主题、发件人、日期与大小",
      "HTML、RTF 与纯文本正文、收件人及邮件头",
      "可逐个保存到本地的附件",
    ],
    limitations: [
      "只读，不编辑、不批量导出、不写回",
      "日历、联系人与任务项目只显示通用邮件字段；内嵌邮件附件只列出不展开",
    ],
    faq: [
      { question: "我的邮箱会被上传吗？", answer: "不会。PST 文件只在浏览器标签页中读取，邮件、联系人和附件都不会离开你的设备。" },
      { question: "能打开设有密码的 PST 吗？", answer: "可以。PST 密码只由 Outlook 自身校验，邮箱内容在这里仍可读取。不支持极少见的高强度（循环）加密归档。" },
    ],
  });

export const ostFormat = defineFormat("ost", "documents", 3,
  {
    name: "Outlook offline folder file",
    title: "Open OST Files Online",
    description: "Read an orphaned Outlook .ost cache from Exchange, Microsoft 365 or Outlook.com locally, no account needed.",
    introduction: "Outlook keeps an .ost offline copy of Exchange, Microsoft 365, Outlook.com and IMAP accounts. Once the account is removed or the profile is gone, Outlook refuses to open that cache, yet the mail is still inside. Anyfile reads the OST directly, including the compressed 4K-page layout used since Outlook 2013, and lets you browse folders and read messages locally.",
    canShow: [
      "Mailbox folders, including IMAP and Exchange folder trees",
      "Messages with sender, recipients, date and body",
      "Attachments and inline images stored in the cache",
      "Compressed Outlook 2013+ caches as well as older layouts",
    ],
    limitations: [
      "Only what was synchronized into the cache is available; headers-only items have no body",
      "Read-only: the cache is never repaired, converted or synchronized",
    ],
    faq: [
      { question: "Do I need the original Outlook account?", answer: "No. The OST is read as a plain file in your browser; no sign-in, Exchange server or Outlook profile is required." },
      { question: "Why do some messages show no body?", answer: "Outlook can be set to download headers only. Those items exist in the cache without their content, so only their header fields are shown." },
    ],
  },
  {
    name: "Outlook 脱机文件夹文件",
    title: "在线打开 OST 文件",
    description: "在浏览器中读取 Exchange、Microsoft 365 或 Outlook.com 遗留的 Outlook .ost 脱机缓存，无需原账户。",
    introduction: "Outlook 会为 Exchange、Microsoft 365、Outlook.com 与 IMAP 账户保存一份 .ost 脱机副本。账户被删除或配置文件丢失后，Outlook 便拒绝打开这份缓存，但邮件仍在其中。Anyfile 直接读取 OST，包括 Outlook 2013 起使用的压缩 4K 页布局，让你在本地浏览文件夹并阅读邮件。",
    canShow: [
      "邮箱文件夹，包括 IMAP 与 Exchange 文件夹树",
      "邮件的发件人、收件人、日期与正文",
      "缓存中保存的附件与内嵌图片",
      "Outlook 2013 及以后的压缩缓存与更早的布局",
    ],
    limitations: [
      "只能读取已同步进缓存的内容；仅下载邮件头的项目没有正文",
      "只读，不修复、不转换、不同步缓存",
    ],
    faq: [
      { question: "需要原来的 Outlook 账户吗？", answer: "不需要。OST 在浏览器中作为普通文件读取，无需登录、Exchange 服务器或 Outlook 配置文件。" },
      { question: "为什么有些邮件没有正文？", answer: "Outlook 可以设置为只下载邮件头。这类项目在缓存中没有正文内容，因此只显示邮件头字段。" },
    ],
  });
