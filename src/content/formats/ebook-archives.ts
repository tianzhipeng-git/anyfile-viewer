import { calibreAlternative, archiveToolAlternative } from "./archive-shared";
import { defineFormat } from "./define-format";

export const mobiFormats = [
  defineFormat("mobi", "ebooks", 3, {
    name: "Mobipocket ebook", title: "Read MOBI and Mobipocket PRC Books Online",
    description: "Read unprotected MOBI and Mobipocket PRC books with chapters, images and adjustable text.",
    introduction: "MOBI packages an ebook in Palm database records. Mobipocket books may use either .mobi or .prc, so both ebook variants share this guide. Older MOBI7 and newer KF8 content differ internally; a joint file can contain both, and Anyfile selects its KF8 reading content when present.",
    canShow: ["Supported MOBI7 text or the KF8 part of a joint book", "Reconstructed chapter order, local links and common embedded images", "Book metadata and adjustable text with basic styles"],
    limitations: ["DRM-protected books, dictionaries, Print Replica and KFX are not supported", "Input and reconstructed resources up to 256 MiB, expanded text up to 32 MiB, and individual chapters up to 2 MiB", "Complex layout is simplified; .prc applications or arbitrary Palm databases are not ebooks this reader can open"],
    faq: [
      { question: "Can a Mobipocket PRC book open here?", answer: "Yes. Mobipocket ebooks can use .prc as well as .mobi. The reader checks the database signature rather than trusting the extension. A Palm application with the same suffix is outside its scope." },
      { question: "Which part of a joint MOBI book is displayed?", answer: "When a book contains both older MOBI7 and KF8 representations, the decoder selects KF8. This is one reading view, not a comparison of the two editions." },
      { question: "Can changing a MOBI extension remove protection?", answer: "No. Renaming the file does not alter encryption or the internal format. Protected content cannot be read by Anyfile." },
    ],
  }, {
    name: "Mobipocket 电子书", title: "在线阅读 MOBI 与 Mobipocket PRC 图书",
    description: "阅读未加密的 Mobipocket 图书，包括电子书类型的 .prc 文件，浏览重建章节、图片并调整文字。",
    introduction: "MOBI 通过 Palm 数据库记录保存电子书。Mobipocket 图书可能使用 .mobi 或 .prc，因此两种电子书写法共用本页。旧 MOBI7 与较新的 KF8 内部结构不同，联合文件还可同时包含两者；存在 KF8 正文时，Anyfile 优先读取该部分。",
    canShow: ["受支持的 MOBI7 正文，或联合图书中的 KF8 部分", "重建的章节顺序、书内链接与常见内嵌图片", "图书元数据，以及带基本样式的可调文字"],
    limitations: ["不支持 DRM 保护图书、词典、Print Replica 或 KFX", "输入与重建资源最大 256 MiB，展开正文最大 32 MiB，单章最大 2 MiB", "复杂排版会简化；使用 .prc 后缀的应用程序或任意 Palm 数据库不属于本页支持的电子书"],
    faq: [
      { question: "Mobipocket PRC 图书可以在这里打开吗？", answer: "可以。Mobipocket 电子书既可能使用 .prc，也可能使用 .mobi。读取器检查数据库签名，不只判断后缀；同后缀的 Palm 应用程序不在支持范围内。" },
      { question: "联合 MOBI 图书显示哪一部分？", answer: "当图书同时包含旧 MOBI7 与 KF8 表示时，解码器选择 KF8。这里提供一个阅读视图，不对照展示两份正文。" },
      { question: "修改 MOBI 扩展名能移除保护吗？", answer: "不能。重命名不会改变加密状态或内部格式，Anyfile 无法阅读受保护的内容。" },
    ],
  }, { possibleLevels: [3], verification: "verified" }, calibreAlternative, ["prc"]),
  defineFormat("azw", "ebooks", 3, {
    name: "Kindle AZW ebook", title: "Open Unprotected AZW Kindle Books Online",
    description: "Read supported, unprotected AZW Kindle books and inspect their available chapters and images.",
    introduction: "AZW is associated with Kindle ebooks, but the filename alone does not establish the internal version or protection status. Anyfile inspects the Palm database and MOBI header, then reconstructs supported book content. This is useful for an unprotected local copy; it does not connect to a Kindle account or retrieve purchases.",
    canShow: ["Readable chapters from supported MOBI-family AZW databases", "Available author and title metadata, images and book navigation", "Basic text styling in a reflowable reading view"],
    limitations: ["DRM is not removed; protected purchases require an authorized reading application", "KFX and Print Replica content are outside this AZW reader", "The 256 MiB file/resource, 32 MiB text and 2 MiB chapter limits also apply; exact Kindle layout is not reproduced"],
    faq: [
      { question: "Why does an AZW copied from my Kindle fail to open?", answer: "It may be protected or use an unsupported internal layout. Copying a file off a device does not make it unprotected. Use the authorized reader for that book rather than changing its suffix." },
      { question: "Is every AZW file an AZW3 book?", answer: "No. Do not infer a precise format generation from AZW alone. This reader checks the content; AZW3 specifically points to the KF8 family described on its own page." },
    ],
  }, {
    name: "Kindle AZW 电子书", title: "在线打开未加密的 AZW Kindle 图书",
    description: "检查本地 AZW 是否包含受支持且未加密的 MOBI 家族内容，并阅读其中可用的章节。",
    introduction: "AZW 与 Kindle 电子书相关，但文件名本身不能确定内部版本或保护状态。Anyfile 检查 Palm 数据库与 MOBI 头部，再重建受支持的图书内容。此入口适用于未加密的本地副本，不连接 Kindle 账户，也不获取已购图书。",
    canShow: ["受支持 MOBI 家族 AZW 数据库中的可读章节", "可用的作者、书名、图片与书内导航", "在可重排阅读视图中展示基本文字样式"],
    limitations: ["不移除 DRM，受保护的已购图书需使用获授权的阅读应用", "此 AZW 读取器不处理 KFX 与 Print Replica 内容", "文件及资源上限 256 MiB、正文 32 MiB、单章 2 MiB；不精确复现 Kindle 排版"],
    faq: [
      { question: "为什么从 Kindle 复制出的 AZW 打不开？", answer: "文件可能受保护，或使用了不受支持的内部布局。从设备复制文件不会解除保护，应使用该图书的授权阅读器，而不是修改后缀。" },
      { question: "所有 AZW 都是 AZW3 图书吗？", answer: "不是。不能仅凭 AZW 判断具体格式代际，读取器会检查内容；AZW3 则指向另有专页说明的 KF8 家族。" },
    ],
  }, { possibleLevels: [3], verification: "verified" }, calibreAlternative),
  defineFormat("azw3", "ebooks", 3, {
    name: "AZW3 / Kindle Format 8", title: "Read AZW3 KF8 Ebooks Online",
    description: "Read unprotected KF8 chapters with reconstructed images, internal links and basic text styling.",
    introduction: "AZW3 is used for Kindle Format 8, which supports richer ebook markup than older MOBI7. The decoder reconstructs chapter resources and references before the shared reader displays them. Anyfile focuses on readable reflowable content rather than reproducing every Kindle presentation feature.",
    canShow: ["Reconstructed KF8 chapter text and referenced images", "Contents navigation and local chapter links when they can be recovered", "Basic CSS with reader-controlled text size and layout"],
    limitations: ["Advanced typography and complex layouts can differ from a Kindle device", "No DRM, dictionaries, fixed Print Replica reading or KFX decoding", "Maximum 256 MiB input/resources, 32 MiB expanded text and 2 MiB per chapter"],
    faq: [
      { question: "Why does AZW3 look different from the Kindle version?", answer: "The local reader sanitizes reconstructed markup and applies its own reading styles. Basic CSS is supported, but device-specific typography and complex page composition may be simplified." },
      { question: "Is AZW3 just an EPUB with another extension?", answer: "No. Both can contain ebook markup, but AZW3 uses the KF8/MOBI record structure rather than an EPUB ZIP package. Renaming between them does not convert the book." },
    ],
  }, {
    name: "AZW3 / Kindle Format 8", title: "在线阅读 AZW3 KF8 电子书",
    description: "阅读未加密的 Kindle Format 8 章节，展示重建图片、内部链接和基本 CSS 样式。",
    introduction: "AZW3 用于 Kindle Format 8，支持比旧 MOBI7 更丰富的电子书标记。解码器先重建章节资源与引用，再由共享阅读器显示。Anyfile 侧重可重排正文的可读性，不逐项复现 Kindle 的全部呈现特性。",
    canShow: ["重建的 KF8 章节正文及引用图片", "可恢复的目录导航与本地章节链接", "基本 CSS，以及由阅读器控制的字号和排版"],
    limitations: ["高级字体效果与复杂布局可能不同于 Kindle 设备", "不提供 DRM、词典、Print Replica 固定版式阅读或 KFX 解码", "输入及资源最多 256 MiB，展开正文 32 MiB，单章 2 MiB"],
    faq: [
      { question: "为什么 AZW3 看起来与 Kindle 版本不同？", answer: "本地阅读器会清理重建标记并应用自己的阅读样式。它支持基本 CSS，但设备专属字体效果与复杂页面组合可能被简化。" },
      { question: "AZW3 只是改了扩展名的 EPUB 吗？", answer: "不是。两者都可以包含电子书标记，但 AZW3 使用 KF8/MOBI 记录结构，而非 EPUB 的 ZIP 包。相互重命名并不会转换图书。" },
    ],
  }, { possibleLevels: [3], verification: "verified" }, calibreAlternative),
  defineFormat("pdb", "ebooks", 3, {
    name: "PalmDOC PDB ebook", title: "Read Supported PalmDOC PDB Text Online",
    description: "Read supported PalmDOC PDB ebook text. Not for arbitrary databases or molecular structures.",
    introduction: "PDB is a broad database suffix, not a guarantee of ebook content. This reader accepts supported PalmDOC TEXt/REAd and Mobipocket BOOK/MOBI databases. Plain PalmDOC content is displayed as text, which is useful for reading older handheld book collections without a Palm device.",
    canShow: ["Supported PalmDOC text records reconstructed in reading order", "Book title and available reading sections; MOBI-backed databases may also supply images and metadata"],
    limitations: ["Protein Data Bank coordinates, Palm address books, applications and other database types are not supported", "A plain PalmDOC document does not acquire rich layout or images merely by opening in the ebook reader", "256 MiB file/resource and 32 MiB expanded-text budgets; no protection removal"],
    faq: [
      { question: "Why is my PDB file not recognized as a book?", answer: "The extension is ambiguous. The reader requires a supported ebook type/creator signature inside the Palm database. A protein structure or another application's records need a different tool." },
      { question: "Why does my PalmDOC book have numbered reading sections?", answer: "When no recoverable table of contents exists, the reader creates navigation from reconstructed text sections. Those section labels are not necessarily the original author's chapter names." },
    ],
  }, {
    name: "PalmDOC PDB 电子书", title: "在线阅读受支持的 PalmDOC PDB 文本",
    description: "从受支持的 PalmDOC 电子书数据库恢复可读文字，本页不处理任意 PDB 数据或分子结构。",
    introduction: "PDB 是用途广泛的数据库后缀，并不保证文件是电子书。此读取器接受受支持的 PalmDOC TEXt/REAd 与 Mobipocket BOOK/MOBI 数据库。纯 PalmDOC 内容按文本显示，便于在没有 Palm 设备时阅读旧掌上电脑图书收藏。",
    canShow: ["按阅读顺序重建的受支持 PalmDOC 文本记录", "书名与可用阅读分段；MOBI 类型的数据库还可能提供图片和元数据"],
    limitations: ["不支持 Protein Data Bank 坐标、Palm 通讯录、应用程序或其他数据库类型", "纯 PalmDOC 文档不会因为在电子书阅读器中打开就获得丰富排版或图片", "文件及资源预算 256 MiB，展开正文 32 MiB；不解除保护"],
    faq: [
      { question: "为什么我的 PDB 没有被识别为图书？", answer: "这个扩展名存在多义性。读取器要求 Palm 数据库内部有受支持的电子书类型与创建者签名，蛋白质结构或其他应用记录需要使用对应工具。" },
      { question: "为什么 PalmDOC 图书的阅读分段只有编号？", answer: "没有可恢复的目录时，阅读器会根据重建文本分段创建导航。这些分段标签不一定是作者原本的章节名称。" },
    ],
  }, { possibleLevels: [3], verification: "verified" }, calibreAlternative),
];

export const comicArchiveFormats = [
  defineFormat("cbr", "ebooks", 4, {
    name: "CBR RAR comic", title: "Read CBR RAR Comics Online",
    description: "Read supported RAR4 or RAR5 CBR comics in single-page, spread or continuous mode.",
    introduction: "CBR stores comic pages inside a RAR archive. Anyfile decodes supported RAR4/RAR5 entries locally, then orders recognized page images for reading. Unlike CBZ's ZIP path, compressed RAR comics are extracted once within a fixed budget before page navigation begins.",
    canShow: ["JPEG, PNG, GIF, WebP and static AVIF pages from supported RAR archives", "Natural filename ordering and available ComicInfo cover or spread hints", "Single pages, two-page spreads, right-to-left reading and zoom"],
    limitations: ["Encrypted or multipart RAR comics cannot be read; unsupported compression variants may fail", "64 MiB compressed input and 128 MiB cumulative extraction", "Up to 5,000 pages, 16 MiB encoded bytes and 8 million pixels per image"],
    faq: [
      { question: "Why does a CBR pause before showing its first page?", answer: "RAR content must be decoded before the reader can jump between extracted images. This initial step is separate from image decoding, which remains limited to visible pages and their neighbors." },
      { question: "Can I rename CBR to CBZ to make it open?", answer: "No. Changing the suffix does not turn a RAR archive into ZIP. A real conversion requires extracting the page images and creating a new archive in a separate archive tool." },
    ],
  }, {
    name: "CBR RAR 漫画", title: "在线阅读 CBR RAR 漫画",
    description: "打开受支持的 RAR4 或 RAR5 漫画归档，以单页、双页或连续模式阅读图片页。",
    introduction: "CBR 将漫画图片保存在 RAR 归档中。Anyfile 在本地解码受支持的 RAR4/RAR5 条目，再对识别出的图片排序阅读。它与 CBZ 的 ZIP 读取路径不同：压缩 RAR 漫画需先在固定预算内解压一次，之后才能进行页面导航。",
    canShow: ["受支持 RAR 归档内的 JPEG、PNG、GIF、WebP 与静态 AVIF 页", "文件名自然排序，以及可用的 ComicInfo 封面和跨页提示", "单页、双页、从右向左阅读及缩放"],
    limitations: ["不能阅读加密或分卷 RAR 漫画，不支持的压缩变体可能失败", "压缩输入最大 64 MiB，累计展开最大 128 MiB", "最多 5,000 页，单张图片编码数据最多 16 MiB、像素最多 800 万"],
    faq: [
      { question: "为什么 CBR 显示第一页前需要等待？", answer: "RAR 内容需先解码，阅读器才能在解出的图片间跳转。此准备步骤与图片解码不同，图片本身仍只对可见页及邻页进行解码。" },
      { question: "把 CBR 改名为 CBZ 能解决打不开吗？", answer: "不能。修改后缀不会把 RAR 变成 ZIP。真正的转换需要在其他归档工具中提取图片，并创建新的归档。" },
    ],
  }, { possibleLevels: [2, 4], verification: "verified" }, archiveToolAlternative),
  defineFormat("cb7", "ebooks", 4, {
    name: "CB7 7z comic", title: "Read CB7 7z Comic Archives Online",
    description: "Read CB7 comics stored with supported 7z Copy, LZMA or LZMA2 compression within local size limits.",
    introduction: "CB7 uses the 7z container for a sequence of comic images. Solid archives can share compression across several entries, so reading an arbitrary later page may depend on decoding earlier data. Anyfile performs bounded sequential extraction once and then reads pages from the local extracted source.",
    canShow: ["Image entries using supported 7z Copy, LZMA or LZMA2 methods", "Naturally sorted comic pages with keyboard navigation, fit modes and manga direction", "Common JPEG/PNG/GIF/WebP/static AVIF images and ComicInfo reading hints"],
    limitations: ["No encrypted or split 7z input; other codec/filter combinations are not promised", "A small solid archive can exceed the 128 MiB expansion budget; compressed input is limited to 64 MiB", "At most 5,000 pages, each within 16 MiB and 8 million pixels"],
    faq: [
      { question: "Why can a small CB7 archive exceed the size limit?", answer: "Compressed size and expanded image bytes are different. The reader limits cumulative extraction to 128 MiB even when the 7z file itself is below the 64 MiB input limit." },
      { question: "Does every CB7 page jump decompress the solid archive again?", answer: "No. After the initial extraction, navigation reads locally stored encoded images. The reader decodes only the active image neighborhood rather than all pages at once." },
    ],
  }, {
    name: "CB7 7z 漫画", title: "在线阅读 CB7 7z 漫画归档",
    description: "在本地展开预算内阅读受支持 7z 归档中的漫画图片，包括 Copy、LZMA 与 LZMA2 条目。",
    introduction: "CB7 使用 7z 容器保存漫画图片序列。固实归档可能让多个条目共享压缩，因此读取后面的某页可能依赖前面的数据解码。Anyfile 先进行一次有界顺序解压，之后从本地解出的数据源读取页面。",
    canShow: ["使用受支持 7z Copy、LZMA 或 LZMA2 方法保存的图片条目", "自然排序的漫画页，以及键盘导航、适配模式和漫画阅读方向", "常见 JPEG、PNG、GIF、WebP、静态 AVIF 图片及 ComicInfo 阅读提示"],
    limitations: ["不支持加密或分卷 7z，不保证其他编码与过滤器组合可用", "较小的固实归档也可能超过 128 MiB 展开预算；压缩输入最多 64 MiB", "最多 5,000 页，每页不超过 16 MiB 和 800 万像素"],
    faq: [
      { question: "为什么很小的 CB7 也会超过大小限制？", answer: "压缩大小与展开图片字节数不同。即使 7z 文件低于 64 MiB 输入上限，读取器仍会限制累计展开量不超过 128 MiB。" },
      { question: "CB7 每次跳页都要重新解压固实归档吗？", answer: "不需要。首次解压完成后，导航读取本地存放的编码图片。阅读器只解码当前图片及邻页，不一次性解码所有页面。" },
    ],
  }, { possibleLevels: [4], verification: "verified" }, archiveToolAlternative),
  defineFormat("cbt", "ebooks", 4, {
    name: "CBT TAR comic", title: "Read Uncompressed CBT TAR Comics Online",
    description: "Browse ordinary CBT TAR comics using local file ranges, without extracting the entire archive.",
    introduction: "CBT packages comic images in TAR. Ordinary TAR entries are stored at known byte offsets rather than compressed together, so Anyfile first scans entry headers and then reads image ranges as needed. This differs from the sequential decompression used for CBR and CB7.",
    canShow: ["Regular image files in ordinary USTAR-style archives, ordered naturally by name", "Page jumps, continuous scrolling and two-page spreads from a range-based source", "ComicInfo hints and supported JPEG, PNG, GIF, WebP or static AVIF pages"],
    limitations: ["Input up to 2 GiB; no gzip-wrapped TAR, links, PAX/GNU special entries or split archives", "At most 5,000 readable image pages; each image must fit 16 MiB and 8 million pixels", "The reader does not extract files to disk or repair malformed TAR headers"],
    faq: [
      { question: "Does CBT need the same full decompression as CB7?", answer: "No. For ordinary TAR the reader indexes headers, records image offsets and reads the required byte ranges. It does not decompress a solid archive before reading." },
      { question: "Can a tar.gz comic be renamed to CBT?", answer: "No. Gzip adds an outer compression layer that this CBT reader does not handle. Export an ordinary, uncompressed TAR with regular image entries in a separate archive tool." },
    ],
  }, {
    name: "CBT TAR 漫画", title: "在线阅读未压缩的 CBT TAR 漫画",
    description: "通过本地文件片段浏览普通 TAR 归档中的漫画图片，无需先完整解压归档。",
    introduction: "CBT 将漫画图片打包到 TAR。普通 TAR 条目保存在明确的字节偏移处，不是一起压缩的数据块，因此 Anyfile 先扫描条目头，再按需读取图片片段。这与 CBR、CB7 使用的顺序解压流程不同。",
    canShow: ["普通 USTAR 类型归档中的常规图片文件，按名称自然排序", "基于分段读取数据源的跳页、连续滚动与双页显示", "ComicInfo 提示，以及受支持的 JPEG、PNG、GIF、WebP 或静态 AVIF 页"],
    limitations: ["输入最多 2 GiB；不支持 gzip 包裹的 TAR、链接、PAX/GNU 特殊条目或分卷", "最多 5,000 个可读图片页，单图须在 16 MiB 与 800 万像素以内", "阅读器不把文件解出到磁盘，也不修复损坏的 TAR 头部"],
    faq: [
      { question: "CBT 需要像 CB7 那样完整解压吗？", answer: "不需要。普通 TAR 的读取过程是索引条目头、记录图片偏移并读取所需字节范围，不用先解压固实归档。" },
      { question: "tar.gz 漫画能改名为 CBT 吗？", answer: "不能。Gzip 增加了当前 CBT 读取器不处理的外层压缩。请在其他归档工具中导出只含常规图片条目的普通未压缩 TAR。" },
    ],
  }, { possibleLevels: [2, 4], verification: "verified" }, archiveToolAlternative),
];
