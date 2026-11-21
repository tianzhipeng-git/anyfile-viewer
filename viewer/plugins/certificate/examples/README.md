# 样例

| 文件 | 来源 | 用途 |
|---|---|---|
| `isrg-root-x1.pem` | Let's Encrypt 公开根证书（https://letsencrypt.org/certs/isrgrootx1.pem） | 真实 4096 位 RSA 根证书，验证真实字段与有效期 |
| `sample-chain.pem` | 用 OpenSSL 3.2.1 生成的原创样例（根 CA + 服务器证书） | 验证 PEM 多证书切换、SAN、EKU、AIA、CRL 与策略扩展 |
| `sample-leaf.der` | 上述服务器证书的 DER 编码（`openssl x509 -outform der`） | 验证 DER 输入 |
| `sample-ec.pem` | 用 OpenSSL 生成的 P-256 证书 | 验证椭圆曲线公钥与曲线名称 |
| `disguised-private-key.pem` | 上述样例配套的一次性私钥 | 负样例：私钥文件必须被拒绝（`.pem` 扩展名但不含证书） |
| `truncated-cert.der` | `sample-leaf.der` 的前 120 字节 | 负样例：截断的 DER |
| `corrupt-cert.crt` | 纯文本文件改名为 `.crt` | 负样例：伪装扩展名 |

公开根证书按其发布方条款分发，用于互操作验证；其余文件由本仓库用 OpenSSL 生成，不含任何真实密钥材料之外的秘密，私钥仅用于负样例。
