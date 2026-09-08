import { expect, it } from "vitest";
import { lasHeader } from "./las";
function header() {
  const bytes = new ArrayBuffer(375); const view = new DataView(bytes);
  view.setUint32(0, 0x4653414c, true); view.setUint8(24,1); view.setUint8(25,4);
  view.setUint16(94,375,true); view.setUint32(96,375,true); view.setUint8(104,6); view.setUint16(105,30,true); view.setBigUint64(247,BigInt(2),true);
  for (const at of [131,139,147]) view.setFloat64(at,0.001,true);
  return bytes;
}
it("reads LAS 1.4 extended counts and preserves scale", () => expect(lasHeader(header(),435)).toMatchObject({count:2,format:6,scales:[0.001,0.001,0.001]}));
it("rejects compressed, truncated and invalid layouts", () => {
  expect(() => lasHeader(header(),434)).toThrow();
  const bytes=header();new DataView(bytes).setUint8(104,134);expect(()=>lasHeader(bytes,435)).toThrow();
});
