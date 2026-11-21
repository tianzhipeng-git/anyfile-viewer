import { defineFormat } from "./define-format";

export const certificateFormat = defineFormat(
  "crt",
  "developer-artifacts",
  4,
  {
    name: "X.509 certificate",
    title: "Open CRT, PEM, CER and DER Certificates Online",
    description:
      "Read X.509 certificates locally: subject, issuer, validity, key usage, alternative names and fingerprints.",
    introduction:
      "Inspect a TLS, code-signing or private CA certificate before trusting or installing it. Anyfile parses the DER structure in your browser, decodes the standard extensions and computes fingerprints locally, so the certificate never leaves your device.",
    canShow: [
      "Subject and issuer distinguished names, serial number, version and validity window with an expiry status",
      "Signature and public key algorithms, RSA key size or elliptic curve name",
      "Key usage, extended key usage, subject alternative names, basic constraints and path length",
      "Subject and authority key identifiers, CRL, OCSP and CA issuer addresses, certificate policies",
      "SHA-256 and SHA-1 fingerprints of the DER encoding",
      "Every certificate in a PEM bundle, switchable from a certificate list",
    ],
    limitations: [
      "Chains are listed but not verified: signatures, trust stores and revocation status are not evaluated",
      "PKCS#7 (.p7b/.p12) containers, private keys and certificate signing requests are not supported",
      "Files above 8 MiB and bundles above 40 certificates are rejected",
    ],
    faq: [
      {
        question: "Does opening a certificate upload it or expose its private key?",
        answer:
          "No. The certificate is parsed inside the browser and nothing is uploaded; private-key PEM files are refused instead of displayed.",
      },
      {
        question: "Are PEM and DER files both supported?",
        answer:
          "Yes. PEM text blocks and raw DER bytes are detected from the file content, so a certificate still opens when its extension does not match the encoding.",
      },
      {
        question: "Does the viewer tell me whether a certificate is trusted?",
        answer:
          "No. It reports the certificate's own fields and whether the current date is inside the validity window; trust paths and revocation are not evaluated.",
      },
    ],
  },
  {
    name: "X.509 证书",
    title: "在线打开 CRT、PEM、CER 与 DER 证书",
    description: "在本地读取 X.509 证书：使用者、颁发者、有效期、密钥用途、可选名称、扩展与指纹。",
    introduction:
      "在信任或安装 TLS、代码签名或私有 CA 证书前先检查它。Anyfile 直接在浏览器中解析 DER 结构，解码标准扩展并在本地计算指纹，证书不会离开当前设备。",
    canShow: [
      "使用者与颁发者的可分辨名称、序列号、版本与有效期，并标注是否过期",
      "签名算法与公钥算法，RSA 密钥长度或椭圆曲线名称",
      "密钥用途、扩展密钥用途、使用者可选名称、基本约束与路径长度",
      "使用者与颁发者密钥标识、CRL、OCSP 与 CA 证书地址、证书策略",
      "DER 编码的 SHA-256 与 SHA-1 指纹",
      "PEM 包中的全部证书，可在证书列表中切换",
    ],
    limitations: [
      "只列出证书链，不验证签名、信任库或吊销状态",
      "不支持 PKCS#7（.p7b/.p12）容器、私钥与证书签名请求",
      "超过 8 MiB 的文件与超过 40 张证书的包会被拒绝",
    ],
    faq: [
      {
        question: "打开证书会上传文件或泄露私钥吗？",
        answer: "不会。证书在浏览器内解析，不会上传；私钥 PEM 文件会被拒绝，而不是展示出来。",
      },
      {
        question: "PEM 与 DER 文件都支持吗？",
        answer: "都支持。PEM 文本块与原始 DER 字节按文件内容识别，所以扩展名与实际编码不一致时仍可打开证书。",
      },
      {
        question: "查看器能告诉我证书是否受信任吗？",
        answer: "不能。它只展示证书自身的字段，以及当前时间是否在有效期内，不评估信任链与吊销状态。",
      },
    ],
  },
  {},
  undefined,
  ["pem", "cer", "der"],
);
