import { defineFormat } from "./define-format";

export const icsFormat = defineFormat(
  "ics",
  "code-data",
  4,
  {
    name: "iCalendar calendar",
    title: "Open ICS Calendar Files Online",
    description: "Read an .ics calendar locally: events, dates, places, attendees and reminders, with search.",
    introduction:
      "Check a meeting invitation or exported calendar before importing it. Anyfile reads the calendar structure in your browser, keeps the original local times and time zones, and lists events with their place, participants and reminder settings without uploading the file.",
    canShow: [
      "Events sorted by start time with dates, times, time zones and all-day ranges",
      "Location, description, status, categories and links for each event",
      "Organizer and attendee lists with the mail addresses stored in the file",
      "Recurrence rules, reminder counts and pending tasks (VTODO) with their due dates",
      "Type-ahead filtering across titles, places, descriptions and categories",
    ],
    limitations: [
      "Recurring events are listed once with their rule; individual instances are not expanded",
      "Time zones are shown as written and are not converted into your local zone",
      "Attachments, inline images, free/busy blocks and alarms without a display action are not rendered",
      "Files above 32 MiB and calendars above 5,000 events are truncated or rejected",
    ],
    faq: [
      {
        question: "Does opening an ICS file import it into my calendar?",
        answer:
          "No. The file is parsed in the browser for reading only, so nothing is added to your calendar app and the file is never uploaded.",
      },
      {
        question: "Why does an event show a different time than my calendar app?",
        answer:
          "The viewer shows the time and time zone exactly as stored in the file and does not convert between zones, so a calendar app that displays events in your local zone can show a different clock time.",
      },
      {
        question: "Can I copy an invitation from a calendar file?",
        answer:
          "You can read the organizer, attendees and description for each event and copy their text from the page, but the viewer does not send replies or accept invitations.",
      },
    ],
  },
  {
    name: "iCalendar 日历",
    title: "在线打开 ICS 日历文件",
    description: "在本地读取 .ics 日历：日程、时间、地点、参与者与提醒，并支持搜索。",
    introduction:
      "在导入会议邀请或导出的日历前先检查内容。Anyfile 在浏览器中读取日历结构，保留文件里的原始时间与时区，并列出每个日程的地点、参与者与提醒设置，文件不会上传。",
    canShow: [
      "按开始时间排序的日程，包含日期、时间、时区与全天范围",
      "每个日程的地点、描述、状态、分类与链接",
      "组织者与参与者列表，以及文件中保存的邮件地址",
      "重复规则、提醒数量，以及带截止时间的待办任务（VTODO）",
      "按标题、地点、描述与分类即时筛选",
    ],
    limitations: [
      "重复日程只列出一次并展示规则，不展开每个实例",
      "时区按文件中的写法展示，不会转换成本地时区",
      "不渲染附件、内嵌图片、空闲/忙碌块以及没有显示动作的提醒",
      "超过 32 MiB 的文件与超过 5,000 条日程的日历会被截断或拒绝",
    ],
    faq: [
      {
        question: "打开 ICS 文件会把它导入我的日历吗？",
        answer: "不会。文件只在浏览器中解析用于阅读，不会加入你的日历应用，也不会上传到服务器。",
      },
      {
        question: "为什么日程时间和我日历应用里看到的不一样？",
        answer:
          "查看器按文件里保存的时间与时区原样展示，不在时区之间换算；按本地时区显示日程的日历应用可能出现不同的时钟时间。",
      },
      {
        question: "能从日历文件里复制会议邀请吗？",
        answer: "可以阅读每个日程的组织者、参与者与描述并从页面复制文字，但查看器不会发送回复或接受邀请。",
      },
    ],
  },
);

export const vcfFormat = defineFormat(
  "vcf",
  "code-data",
  4,
  {
    name: "vCard contact",
    title: "Open VCF Contact Cards Online",
    description: "Read .vcf contact cards locally: names, phones, emails, addresses and notes, with search.",
    introduction:
      "Inspect an exported contact card or address book before importing it. Anyfile decodes vCard 2.1, 3.0 and 4.0 property lines in your browser, including quoted-printable names and folded fields, and lists each card's details without uploading the file.",
    canShow: [
      "Formatted and structured names, organization and job title for every card",
      "Phone numbers, email addresses and postal addresses with their stored type labels",
      "Website links, notes, nicknames, birthdays and categories",
      "Files that contain many cards, such as an address book export",
      "Type-ahead filtering across names, organizations, phones and emails",
    ],
    limitations: [
      "Photos and other binary properties are reported but not rendered",
      "Only the card fields listed above are shown; custom X- properties stay hidden",
      "The file is read as UTF-8 text, so legacy files without a charset declaration may show wrong characters",
      "Files above 32 MiB and address books above 2,000 cards are truncated or rejected",
    ],
    faq: [
      {
        question: "Does opening a VCF file add the contact to my address book?",
        answer:
          "No. The card is parsed for reading in the browser, so it is not imported into any address book and the file is never uploaded.",
      },
      {
        question: "Are vCard 2.1, 3.0 and 4.0 files all supported?",
        answer:
          "Yes. The viewer reads the plain property lines of all three versions, including quoted-printable values and folded continuation lines used by older phone exports.",
      },
      {
        question: "Why is a contact photo missing?",
        answer:
          "Embedded photos are usually Base64 payloads that would dominate the page. The viewer marks that a card contains a photo instead of rendering it.",
      },
    ],
  },
  {
    name: "vCard 联系人",
    title: "在线打开 VCF 联系人名片",
    description: "在本地读取 .vcf 联系人名片：姓名、电话、邮箱、地址与备注，并支持搜索。",
    introduction:
      "在导入导出的联系人名片或通讯录前先检查内容。Anyfile 在浏览器中解码 vCard 2.1、3.0 与 4.0 的属性行，包括 quoted-printable 编码的姓名与折行字段，并列出每张名片的详细信息，文件不会上传。",
    canShow: [
      "每张名片的格式化姓名与结构化姓名、组织与职位",
      "电话号码、邮箱与邮政地址，并保留文件中的类型标签",
      "网址、备注、昵称、生日与分类",
      "包含多张名片的文件，例如通讯录导出",
      "按姓名、组织、电话与邮箱即时筛选",
    ],
    limitations: [
      "照片等二进制属性只会标注存在，不会渲染",
      "只展示上面列出的字段，自定义 X- 属性不显示",
      "文件按 UTF-8 文本读取，缺少字符集声明的旧文件可能出现乱码",
      "超过 32 MiB 的文件与超过 2,000 张名片的通讯录会被截断或拒绝",
    ],
    faq: [
      {
        question: "打开 VCF 文件会把联系人加入通讯录吗？",
        answer: "不会。名片只在浏览器中解析用于阅读，不会导入任何通讯录，也不会上传到服务器。",
      },
      {
        question: "vCard 2.1、3.0 与 4.0 都支持吗？",
        answer: "都支持。查看器读取三个版本的纯属性行，包括旧手机导出常用的 quoted-printable 值与折行续行。",
      },
      {
        question: "为什么看不到联系人照片？",
        answer: "内嵌照片通常是 Base64 数据，会显著拖慢页面。查看器只标注该名片包含照片，而不渲染图片。",
      },
    ],
  },
);
