import { defineFormat } from "./define-format";

export const dicomFormat = defineFormat("dcm", "images-video", 3,
  {
    name: "DICOM medical image", title: "Open DICOM DCM Files Online",
    description: "View uncompressed DICOM frames, adjust window settings and inspect image metadata locally in your browser.",
    introduction: "DICOM stores medical images with examination and encoding information. Anyfile reads Part 10 files locally, decoding supported native pixel frames on demand without uploading the file.",
    canShow: ["8/16-bit grayscale and 8-bit RGB native images", "Multi-frame navigation, window center/width, zoom and rotation", "Modality, study date, transfer syntax and image properties"],
    limitations: ["Compressed pixels, LUTs and enhanced per-frame transformations are metadata-only", "No cross-file series, 3D reconstruction or extensionless file detection", "Headers are limited to 8 MiB and frames to 16 Mi pixels"],
    faq: [{ question: "Why do some DICOM files show only metadata?", answer: "DICOM supports many encodings and image transformations. This viewer currently decodes native uncompressed grayscale and RGB pixels; unsupported encodings remain available for metadata inspection." }],
  },
  {
    name: "DICOM 医学影像", title: "在线打开 DICOM DCM 文件",
    description: "在浏览器本地查看未压缩 DICOM 影像帧，调整窗宽窗位并检查影像元数据。",
    introduction: "DICOM 同时保存医学影像、检查信息和编码信息。Anyfile 在本地读取 Part 10 文件，按需解码受支持的原生像素帧，全程不上传文件。",
    canShow: ["8/16 位灰度与 8 位 RGB 原生影像", "多帧切换、窗宽窗位、缩放和旋转", "检查类型、日期、传输语法与影像属性"],
    limitations: ["压缩像素、LUT 与增强逐帧变换仅显示元数据", "不提供跨文件序列、三维重建或无扩展名文件识别", "文件头上限 8 MiB，单帧上限约 1677 万像素"],
    faq: [{ question: "为什么有些 DICOM 文件只能显示元数据？", answer: "DICOM 支持多种编码和影像变换。当前查看器解码原生未压缩灰度与 RGB 像素，暂不支持的编码仍可查看元数据。" }],
  },
  { possibleLevels: [1, 3], verification: "pending" }, undefined, ["dicom"],
);
