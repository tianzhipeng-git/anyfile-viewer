import { describe, expect, it, vi } from "vitest";
import { InteractiveViewport, ResourceScope } from "./index";

function controls() {
  const button = () => document.createElement("button");
  return { viewport: document.createElement("div"), zoomValue: document.createElement("output"), rotateLeft: button(), rotateRight: button(), zoomIn: button(), zoomOut: button(), fit: button(), actual: button() };
}

describe("viewer rendering primitives", () => {
  it("updates transforms and removes interaction listeners", () => {
    const elements = controls();
    const render = vi.fn();
    const viewport = new InteractiveViewport(elements, 100, 50, render);
    elements.zoomIn.click();
    expect(elements.zoomValue.value).toBe("125%");
    viewport.dispose();
    const calls = render.mock.calls.length;
    elements.zoomIn.click();
    expect(render).toHaveBeenCalledTimes(calls);
  });

  it("disposes registered resources once in reverse order", () => {
    const scope = new ResourceScope();
    const calls: number[] = [];
    scope.add(() => calls.push(1));
    scope.add(() => calls.push(2));
    scope.dispose();
    scope.dispose();
    expect(calls).toEqual([2, 1]);
  });
});
