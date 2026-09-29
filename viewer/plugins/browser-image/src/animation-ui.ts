import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function animationCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      tools: "Animation controls", speed: "Speed", play: "Play", pause: "Pause", previous: "Previous frame", next: "Next frame", frame: "Frame", duration: "Decoded frame duration", unknown: "Unknown", loops: "Total plays", forever: "Infinite", unavailable: "This browser cannot control frames for this format. Native image preview is shown; animation behavior depends on the browser.",
      invalid: "The animation could not be decoded.", limit: "Controlled animation supports files up to 128 MiB, 8192 pixels per edge, 16 Mi pixels per frame and 64 Mi pixels across all frames (at most 10,000 frames).", dimensions: "Animation dimensions could not be read safely.", timing: "Frame duration is unavailable. Use the frame buttons to inspect this animation.",
    },
    "zh-CN": {
      tools: "动画控制", speed: "速度", play: "播放", pause: "暂停", previous: "上一帧", next: "下一帧", frame: "帧", duration: "解码帧时长", unknown: "未知", loops: "总播放次数", forever: "无限", unavailable: "当前浏览器无法控制此格式的动画帧，已使用原生图片预览；动画表现取决于浏览器。",
      invalid: "无法解码此动画。", limit: "可控动画支持最大 128 MiB 文件、单边 8192 像素、单帧 16 Mi 像素、所有帧合计 64 Mi 像素（最多 10,000 帧）。", dimensions: "无法安全读取动画尺寸。", timing: "无法读取帧时长，请使用逐帧按钮查看动画。",
    },
  });
}

export function createAnimationControls(locale: Locale) {
  const copy = animationCopy(locale);
  const root = document.createElement("div");
  root.className = "anyfile-browser-image-viewer__animation";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", copy.tools);
  const button = (label: string) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    return element;
  };
  const play = button(copy.play);
  const previous = button(copy.previous);
  const next = button(copy.next);
  const speedLabel = document.createElement("label");
  speedLabel.textContent = copy.speed;
  const speed = document.createElement("select");
  speed.setAttribute("aria-label", copy.speed);
  for (const rate of [0.25, 0.5, 1, 1.5, 2, 4]) {
    const option = document.createElement("option");
    option.value = String(rate);
    option.textContent = `${rate}×`;
    speed.append(option);
  }
  speed.value = "1";
  speedLabel.append(speed);
  // No live region: frame updates must not interrupt screen readers during playback.
  const status = document.createElement("span");
  const error = document.createElement("div");
  error.setAttribute("role", "alert");
  error.hidden = true;
  root.append(previous, play, next, speedLabel, status, error);
  return { root, play, previous, next, speed, status, error, copy };
}
