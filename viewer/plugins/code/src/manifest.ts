import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const codeManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ace-code-text",
  name: { en: "Code and text viewer", "zh-CN": "代码与文本查看器" },
  formats: [{
    name: { en: "Code and text file", "zh-CN": "代码与文本文件" },
    extensions: [
      ".abap", ".abc", ".as", ".asm", ".astro", ".au3", ".awk", ".bat", ".bas", ".c", ".cc", ".clj", ".coffee", ".cpp", ".cs", ".css", ".csv", ".dart", ".diff", ".dockerfile", ".dtd", ".ejs", ".elm", ".erb", ".erl", ".ex", ".exs", ".fs", ".fsx", ".gcode", ".gherkin", ".gitignore", ".glsl", ".go", ".graphql", ".groovy", ".h", ".handlebars", ".hbs", ".hcl", ".hh", ".hpp", ".hs", ".htm", ".html", ".hxml", ".ini", ".ino", ".ion", ".jade", ".java", ".jl", ".js", ".json", ".json5", ".jsx", ".kt", ".kts", ".less", ".liquid", ".lisp", ".log", ".lua", ".make", ".mak", ".md", ".markdown", ".m", ".mm", ".matlab", ".mk", ".nim", ".nix", ".njk", ".php", ".pl", ".pm", ".prisma", ".proto", ".ps1", ".py", ".r", ".raku", ".rb", ".rhtml", ".rs", ".sass", ".scala", ".scss", ".sh", ".sql", ".styl", ".svg", ".swift", ".tcl", ".tex", ".textile", ".toml", ".ts", ".tsx", ".twig", ".txt", ".v", ".vbs", ".vhd", ".vhdl", ".vue", ".xml", ".xq", ".xquery", ".yaml", ".yml", ".zig",
    ],
    fileNames: ["Dockerfile", "Makefile", "Gemfile", "Rakefile", "Vagrantfile", "Procfile", ".env", ".editorconfig", ".prettierrc", ".eslintrc", ".babelrc"],
    mimeTypes: ["text/plain", "text/*", "application/json", "application/xml", "application/javascript"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
