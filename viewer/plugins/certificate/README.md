# X.509 证书查看器 (`x509-certificate`)

## 基本介绍

- **插件 ID**：`x509-certificate`
- **格式入口**：`.pem`、`.crt`、`.cer`、`.der`

在浏览器本地解析 X.509 v1–v3 证书，展示使用者与颁发者、有效期、序列号、签名与公钥算法、扩展以及 DER 指纹。PEM 包中的多张证书以标签页切换。

## 实现原理

- `src/asn1.ts`：有界 DER 读取器（单字节 tag、定长长度、节点预算），不依赖第三方 ASN.1 库。
- `src/certificate.ts`：映射 `TBSCertificate`、可分辨名称、有效期（UTCTime/GeneralizedTime）与标准扩展（基本约束、密钥用途、扩展密钥用途、使用者可选名称、SKI/AKI、CRL 分发点、AIA、证书策略），并用 `crypto.subtle` 计算 SHA-256/SHA-1 指纹。
- `src/probe.ts`：只读取前 16 KiB，按 PEM 标签或 DER 外层序列确定等级 4；私钥、CSR 与其他 PEM 块返回 0。
- UI 全部通过 `textContent` 构建，不插入证书内容以外的 HTML，也不请求证书中的任何地址。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享 Inspector UI Kit 原语与宿主主题变量 |

没有第三方解析器、Worker、WASM 或网络请求。

## 已知限制

- 只做只读结构检查：不验证签名、信任链、吊销状态，也不评估证书策略。
- 仅支持证书本身；私钥、CSR、PKCS#7（`.p7b`）与 PKCS#12（`.p12`）容器不在范围内。
- 单文件上限 8 MiB，单个包最多解析 40 张证书。
- 浏览器缺少 `crypto.subtle` 时不显示指纹，其他字段照常展示。

## 开发与验证

- [格式声明](src/manifest.ts)、[探测](src/probe.ts)、[DER 读取器](src/asn1.ts)、[证书解析](src/certificate.ts)、[界面](src/ui.ts)。
- [样例目录](examples/)：包含下载的公开根证书、用 OpenSSL 生成的证书链与 DER 文件，以及负样例。
- 手工复核可用 `openssl x509 -in <file> -noout -text` 对照字段。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/certificate
```
