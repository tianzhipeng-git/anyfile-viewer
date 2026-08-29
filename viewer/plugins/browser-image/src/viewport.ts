import { InteractiveViewport } from "@anyfile/viewer-rendering";

import type { ImageViewerElements } from "./ui";

export class ImageViewport {
  private readonly viewport: InteractiveViewport;

  constructor(elements: ImageViewerElements, imageWidth: number, imageHeight: number) {
    this.viewport = new InteractiveViewport(elements, imageWidth, imageHeight, ({ scale, rotation, panX, panY }) => {
      elements.image.style.transform = `translate(-50%, -50%) translate3d(${panX}px, ${panY}px, 0) rotate(${rotation}deg) scale(${scale})`;
    });
  }

  dispose() {
    this.viewport.dispose();
  }
}
