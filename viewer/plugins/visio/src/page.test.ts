import { expect, it } from "vitest";
import { pageSize } from "./page";
import { messages } from "./messages";
const copy = messages("en");
it("checks physical page sizes before decoding an SVG image", () => {
  expect(pageSize('<svg xmlns="http://www.w3.org/2000/svg" width="10.0000in" height="7.5000in"/>', copy)).toEqual({ width: 960, height: 720 });
  expect(() => pageSize('<svg xmlns="http://www.w3.org/2000/svg" width="999999in" height="1in"/>', copy)).toThrow(expect.objectContaining({ code: "resource-limit" }));
  expect(() => pageSize('<svg xmlns="http://www.w3.org/2000/svg" width="0in" height="0in"/>', copy)).toThrow(expect.objectContaining({ code: "invalid-file" }));
  expect(() => pageSize("<html/>", copy)).toThrow(expect.objectContaining({ code: "invalid-file" }));
});
