import { defineFormat } from "./define-format";

export const npzFormat = defineFormat(
  "npz",
  "developer-artifacts",
  5,
  { name: "NumPy NPZ archive", title: "Open NumPy NPZ Archives Online", description: "Inspect arrays stored in an NPZ package without Python.", introduction: "NPZ is a ZIP container whose entries are NPY arrays. Anyfile validates the archive, lists safe array members and opens selected numeric or structured values without unpickling Python objects.", canShow: ["Array names, shapes and dtypes","Paged values for supported NPY members"], limitations: ["Object arrays are rejected rather than unpickled","Archive and array safety limits bound resource use"], faq: [{ question: "Does Anyfile execute pickle data in NPZ files?", answer: "No. Object deserialization is intentionally disabled; only safe supported array layouts are inspected." }] },
  { name: "NumPy NPZ 归档", title: "在线打开 NumPy NPZ 归档", description: "无需 Python，检查 NPZ 软件包中保存的数组。", introduction: "NPZ 是以 NPY 数组作为条目的 ZIP 容器。Anyfile 校验归档、列出安全数组成员，并在不反序列化 Python 对象的前提下打开数值或结构化值。", canShow: ["数组名称、形状与 dtype","受支持 NPY 成员的分页值"], limitations: ["对象数组会被拒绝而不是 unpickle","归档与数组安全限制会约束资源使用"], faq: [{ question: "Anyfile 会执行 NPZ 中的 pickle 数据吗？", answer: "不会。对象反序列化被明确禁用，只检查安全且受支持的数组布局。" }] },
  {},
  undefined,
  [],
);

