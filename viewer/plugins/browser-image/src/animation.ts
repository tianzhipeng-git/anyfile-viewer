import { ViewerError, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { ResourceScope } from "@anyfile/viewer-rendering";
import { openAnimationDecoder } from "./animation-decoder";
import { AnimationPlayer } from "./animation-player";
import { createAnimationControls } from "./animation-ui";
import { createImageViewerElements } from "./ui";
import { ImageViewport } from "./viewport";
import { abortError } from "./read-blob";

export async function openAnimation(context: OpenViewerContext, type: string): Promise<ViewerController | null> {
  const resources = new ResourceScope();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    resources.dispose();
  };
  resources.listen(context.signal, "abort", dispose);
  const controls = createAnimationControls(context.locale);
  try {
    const source = await openAnimationDecoder(context.file, type, context.signal, context.locale);
    resources.add(source.close);
    if (context.signal.aborted) throw abortError();
    if (!source.track.animated) { dispose(); return null; }
    const canvas = document.createElement("canvas");
    canvas.width = source.info.width!;
    canvas.height = source.info.height!;
    resources.add(() => { canvas.width = 0; canvas.height = 0; });
    const drawing = canvas.getContext("2d");
    if (!drawing) throw new ViewerError("unsupported-environment", controls.copy.unavailable);
    const elements = createImageViewerElements(context.file.name, { ...source.info, animated: true, frameCount: source.track.frameCount }, canvas.width, canvas.height, context.locale, canvas);
    resources.add(() => elements.root.remove());
    elements.root.insertBefore(controls.root, elements.viewport);
    const { copy } = controls;
    let failed = false;
    const player = new AnimationPlayer(source.decoder, source.track.frameCount, source.track.repetitionCount, (frame) => {
      if (frame.displayWidth !== canvas.width || frame.displayHeight !== canvas.height) throw new ViewerError("invalid-file", copy.invalid);
      // Native ImageDecoder returns the fully composed frame; clear so transparent pixels replace old ones.
      drawing.clearRect(0, 0, canvas.width, canvas.height);
      drawing.drawImage(frame, 0, 0);
    }, (state) => {
      controls.speed.value = String(state.rate);
      controls.speed.disabled = failed || state.duration === null;
      controls.play.textContent = state.playing ? copy.pause : copy.play;
      controls.play.disabled = failed || (!state.playing && (state.busy || state.duration === null || source.track.frameCount < 2));
      controls.previous.disabled = failed || state.busy || state.index === 0;
      controls.next.disabled = failed || state.busy || state.index === source.track.frameCount - 1;
      const repeats = source.track.repetitionCount;
      const loops = repeats === Infinity ? copy.forever : Number.isFinite(repeats) && repeats >= 0 ? String(repeats + 1) : copy.unknown;
      const duration = state.duration === null ? copy.unknown : `${new Intl.NumberFormat(context.locale, { maximumFractionDigits: 3 }).format(state.duration)} ms`;
      controls.status.textContent = `${copy.frame} ${state.index + 1} / ${source.track.frameCount} · ${copy.duration}: ${duration} · ${copy.loops}: ${loops}`;
    }, () => {
      failed = true;
      source.close();
      controls.error.textContent = copy.invalid;
      controls.error.hidden = false;
      controls.play.disabled = controls.previous.disabled = controls.next.disabled = controls.speed.disabled = true;
      context.reportPreview?.({ outcome: "failure", reason: "invalid-file" });
    });
    resources.add(() => player.dispose());
    await player.initialize();
    if (context.signal.aborted) throw abortError();
    context.container.append(elements.root);
    const viewport = new ImageViewport(elements, canvas.width, canvas.height);
    resources.add(() => viewport.dispose());
    resources.listen(controls.play, "click", () => {
      const action = player.state.playing ? "pause" : "play";
      if (player.state.playing) player.pause(); else player.play();
      context.reportInteraction?.({ kind: "animation_control", action });
    });
    for (const [button, delta, action] of [[controls.previous, -1, "previous_frame"], [controls.next, 1, "next_frame"]] as const) {
      resources.listen(button, "click", () => {
        player.step(delta);
        context.reportInteraction?.({ kind: "animation_control", action });
      });
    }
    resources.listen(controls.speed, "change", () => {
      player.setRate(Number(controls.speed.value));
      context.reportInteraction?.({ kind: "animation_control", action: "speed_change" });
    });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    resources.listen(motion, "change", () => { if (motion.matches) player.pause(); });
    // Returning to the tab leaves playback paused rather than unexpectedly restarting it.
    resources.listen(document, "visibilitychange", () => { if (document.hidden) player.pause(); });
    if (!motion.matches && !document.hidden) player.play();
    if (player.state.duration === null) {
      controls.error.textContent = copy.timing;
      controls.error.hidden = false;
    }
    context.reportPreview?.({ outcome: "success", kind: "animation" });
    return { dispose };
  } catch (error) {
    dispose();
    if (context.signal.aborted) throw abortError();
    if (error instanceof ViewerError) throw error;
    throw new ViewerError("invalid-file", controls.copy.invalid, { cause: error });
  }
}
