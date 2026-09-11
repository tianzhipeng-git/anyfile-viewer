import { defineFormat } from "./define-format";

const alternatives = [{ name: "CloudCompare", url: "https://www.cloudcompare.org/", reason: { en: "Inspect the full cloud and point attributes beyond this sampled geometry preview.", "zh-CN": "查看完整点云及点属性，补足本页抽样几何预览的范围。" } }];

export const pointFormats = [
  defineFormat("pcd", "3d-models", 2, {
    name: "PCD point cloud", title: "Preview ASCII PCD Point Clouds Online",
    description: "Open ASCII PCD files with x, y and z fields and inspect a sampled 3D view of the captured shape.",
    introduction: "PCD is the Point Cloud Library format. Its header names the fields and declares how the point data is encoded. Anyfile reads DATA ascii records and locates coordinates by their x, y and z field names, so coordinate columns need not be the first three fields.",
    canShow: ["A geometric sample from ASCII PCD records containing scalar x, y and z fields", "Progressive point display with orbit, zoom and standard views"],
    limitations: ["Binary and binary_compressed PCD are unsupported; COUNT entries other than 1 are rejected", "Color, normals and other fields are not visualized; this is not a PCD property inspector", "Input up to 2 GiB, with at most 200,000 sampled points; WebGL 2 required"],
    faq: [
      { question: "Why does a PCD from PCL fail to open?", answer: "Check its DATA header. This viewer supports ascii, while PCL can also write binary and binary_compressed files. Export an ASCII copy from the producing tool; editing the header alone does not change the encoding." },
      { question: "Does the PCD preview preserve every measured point?", answer: "Large clouds are reduced to a representative reservoir sample. Use the original data in a point-cloud tool when individual points or attributes matter." },
    ],
  }, {
    name: "PCD 点云", title: "在线预览 ASCII PCD 点云",
    description: "打开包含 x、y、z 字段的 ASCII Point Cloud Data 文件，以三维抽样视图检查采集形状。",
    introduction: "PCD 是 Point Cloud Library 使用的点云格式，文件头声明字段及数据编码。Anyfile 读取 DATA ascii 记录，按 x、y、z 字段名寻找坐标，因此坐标列不必恰好位于前三列。",
    canShow: ["包含标量 x、y、z 字段的 ASCII PCD 几何抽样", "渐进显示点，并提供旋转、缩放和标准视图"],
    limitations: ["不支持 binary 或 binary_compressed 编码；COUNT 中存在非 1 项会被拒绝", "不显示颜色、法线及其他字段，本页不是 PCD 属性检查器", "输入最大 2 GiB，最多抽样 20 万个点；需要 WebGL 2"],
    faq: [
      { question: "为什么从 PCL 导出的 PCD 打不开？", answer: "请检查文件头的 DATA 项。这里支持 ascii，而 PCL 也能输出 binary 和 binary_compressed。需要在生成工具中导出 ASCII 副本，仅修改文件头不会转换数据编码。" },
      { question: "PCD 预览保留每个测量点吗？", answer: "大点云会使用蓄水池算法生成代表性抽样。需要检查单个点或属性时，应在点云工具中读取原始数据。" },
    ],
  }, { verification: "pending" }, alternatives),
  defineFormat("xyz", "3d-models", 2, {
    name: "XYZ coordinate text", title: "View XYZ Coordinate Point Clouds Online",
    description: "Preview XYZ point clouds stored as whitespace-separated coordinate rows and check their overall shape.",
    introduction: "XYZ point-cloud text stores one coordinate triplet per line without a required PCD-style field header. This reader interprets the first three whitespace-separated columns as X, Y and Z. The extension is also used by unrelated data, so this page specifically covers numeric point-cloud rows.",
    canShow: ["Positions from the first three numeric columns, including space- or tab-separated rows", "A rotating point preview built as the text is read; blank lines and # comments are skipped"],
    limitations: ["Comma-separated CSV, column headings and molecular XYZ records are not supported by this parser", "Extra columns are not shown; coordinate units and reference systems are not inferred", "A maximum of 200,000 points is retained from inputs up to 2 GiB; requires WebGL 2"],
    faq: [
      { question: "How should an XYZ point row be written?", answer: "Use a numeric row such as 12.5 8.0 -3.2, followed by a newline. Separate coordinates with spaces or tabs; remove column headings before exporting a compatible copy." },
      { question: "Can this XYZ viewer open a molecular structure file?", answer: "No. Molecular XYZ commonly includes an atom count and element labels, while this reader expects numeric X Y Z point coordinates. The shared extension does not imply the same format." },
    ],
  }, {
    name: "XYZ 坐标文本", title: "在线查看 XYZ 坐标点云",
    description: "预览以空白分隔 X Y Z 行保存的点坐标，检查纯文本点云的整体外形。",
    introduction: "XYZ 点云文本每行保存一组坐标，不要求 PCD 那样的字段头。此读取器将前三个空白分隔列解释为 X、Y、Z。其他数据也可能使用 xyz 扩展名，本页只处理数字坐标行组成的点云。",
    canShow: ["前三个数字列表示的位置，支持空格或制表符分隔", "随文本读取生成可旋转的点预览；跳过空行与 # 注释"],
    limitations: ["不支持逗号分隔 CSV、列标题或分子 XYZ 记录", "额外列不展示，不自动推断坐标单位与参考系统", "输入最多 2 GiB，保留最多 20 万个抽样点；需要 WebGL 2"],
    faq: [
      { question: "XYZ 点坐标行应如何编写？", answer: "例如 12.5 8.0 -3.2，之后换行。坐标间使用空格或制表符，导出兼容副本时应去掉列标题。" },
      { question: "这个 XYZ 查看器能打开分子结构文件吗？", answer: "不能。分子 XYZ 常含原子数量和元素标签，而这里要求数字形式的 X Y Z 点坐标。扩展名相同不代表文件结构相同。" },
    ],
  }, { verification: "pending" }, alternatives),
  defineFormat("las", "3d-models", 2, {
    name: "LAS LiDAR data", title: "Preview LAS LiDAR Geometry Online",
    description: "Explore a sampled preview of LAS geometry, with coordinates restored using the file scale and offset.",
    introduction: "LAS is a binary exchange format for LiDAR point clouds. Its header describes the point layout and the scale and offset used to reconstruct coordinates. Anyfile reads supported LAS 1.0–1.4 records in chunks and displays their positions, making it useful for a quick check of a survey's overall shape.",
    canShow: ["X, Y and Z positions reconstructed from supported LAS point records", "A progressive reservoir sample of up to 200,000 points with interactive rotation"],
    limitations: ["Classification, return numbers, intensity, RGB and waveform information are not displayed", "No coordinate-system reprojection, map overlay or survey measurement", "Uncompressed input up to 2 GiB; LAS 1.5 is outside this reader's version range; WebGL 2 required"],
    faq: [
      { question: "Why is my LAS cloud missing classification colors?", answer: "The current preview uses positions only. A LAS file can store additional attributes, but this viewport does not color or filter points by ground class, intensity or return." },
      { question: "Should I use the LAS or LAZ page?", answer: "LAS is uncompressed; LAZ adds point-data compression. Use the matching file directly. The LAZ reader has a smaller compressed-input limit because it loads that input into memory." },
    ],
  }, {
    name: "LAS 激光雷达数据", title: "在线预览 LAS 激光雷达几何",
    description: "抽样查看未压缩 LAS 点记录，按文件中的比例与偏移还原坐标。",
    introduction: "LAS 是激光雷达点云的二进制交换格式，头部描述点布局及还原坐标所需的比例与偏移。Anyfile 分块读取受支持的 LAS 1.0–1.4 记录并显示位置，适合快速检查测区的整体外形。",
    canShow: ["由受支持 LAS 点记录还原的 X、Y、Z 位置", "渐进生成最多 20 万点的蓄水池抽样，支持交互旋转"],
    limitations: ["不显示分类、回波编号、强度、RGB 或波形信息", "不提供坐标系重投影、地图叠加或测绘量测", "未压缩输入最大 2 GiB；不在当前版本范围内的 LAS 1.5 无法读取；需要 WebGL 2"],
    faq: [
      { question: "为什么 LAS 点云没有按分类着色？", answer: "当前预览只使用点位置。LAS 可以存储更多属性，但本视口不会按地面分类、强度或回波对点着色和筛选。" },
      { question: "应使用 LAS 还是 LAZ 页面？", answer: "LAS 保存未压缩记录，LAZ 增加了点数据压缩。直接使用匹配的文件即可。LAZ 读取器需要将压缩输入载入内存，因此输入上限更低。" },
    ],
  }, { verification: "pending" }, alternatives),
  defineFormat("laz", "3d-models", 2, {
    name: "LAZ compressed point cloud", title: "Preview Compressed LAZ Point Clouds Online",
    description: "Decode supported LAZ files locally and preview their point geometry without exporting LAS first.",
    introduction: "LAZ compresses LAS point records for storage and transfer. Anyfile loads the compressed file into a local WebAssembly decoder, then samples decoded coordinates as they become available. Decompression and preview sampling are separate: a reduced display does not mean the LAZ compression discarded points.",
    canShow: ["Positions from supported compressed LAS layouts after local LAZ decoding", "Up to 200,000 representative points, with progressive updates after decompression begins"],
    limitations: ["Compressed input is limited to 64 MiB and is loaded in full before decoding", "Point attributes, classification filters and full-resolution cloud navigation are not available", "Requires WebAssembly and WebGL 2; specialized point-cloud containers are not supported merely by renaming them .laz"],
    faq: [
      { question: "Why can a LAZ file hit a limit when a larger LAS file opens?", answer: "The LAZ decoder keeps the compressed input in memory, whereas LAS records can be read directly in chunks. The two readers therefore have different input budgets: 64 MiB for LAZ and 2 GiB for LAS." },
      { question: "Does the LAZ preview need an extracted LAS file?", answer: "No. The decoder supplies point records directly to the sampler. This viewer neither exports an uncompressed LAS copy nor replaces a full point-cloud analysis tool." },
    ],
  }, {
    name: "LAZ 压缩点云", title: "在线预览压缩 LAZ 点云",
    description: "在本地解码受支持的 LAZ 文件并浏览有限数量的几何抽样，无需预先导出 LAS。",
    introduction: "LAZ 对 LAS 点记录进行压缩，方便存储与传输。Anyfile 将压缩文件加载到本地 WebAssembly 解码器，再随坐标解码进行抽样。解压与预览抽样是两个步骤，显示点变少不代表 LAZ 压缩丢弃了这些点。",
    canShow: ["本地 LAZ 解码后，受支持压缩 LAS 布局中的点位置", "最多 20 万个代表性点，在开始解压后渐进更新预览"],
    limitations: ["压缩输入上限 64 MiB，解码前需完整加载", "不提供点属性、分类筛选或全分辨率点云导航", "需要 WebAssembly 与 WebGL 2；其他专用点云容器不能仅靠改名为 .laz 获得支持"],
    faq: [
      { question: "为什么较小的 LAZ 达到限制，而更大的 LAS 能打开？", answer: "LAZ 解码器把压缩输入保留在内存中，LAS 则可以直接分块读取记录。因此两个读取器的输入预算不同：LAZ 为 64 MiB，LAS 为 2 GiB。" },
      { question: "LAZ 预览需要先解出 LAS 文件吗？", answer: "不需要。解码器直接向抽样器提供点记录。此查看器不导出未压缩 LAS 副本，也不能替代完整点云分析工具。" },
    ],
  }, { verification: "pending" }, alternatives),
];
