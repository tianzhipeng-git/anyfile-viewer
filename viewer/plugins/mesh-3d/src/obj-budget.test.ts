import { expect,it } from "vitest";
import { checkObjBudget } from "./obj-budget";
it("counts polygon expansion before allocating unindexed geometry",()=>{
  expect(()=>checkObjBudget("v 0 0 0\nf 1 1 1\n")).not.toThrow();
  expect(()=>checkObjBudget(("f "+"1 ".repeat(1000)+"\n").repeat(1003))).toThrow(RangeError);
});
it("bounds records and draw group expansion",()=>{
  expect(()=>checkObjBudget("g x\n".repeat(4097))).toThrow(RangeError);
  expect(()=>checkObjBudget("f "+"1 ".repeat(40000))).toThrow(RangeError);
  expect(()=>checkObjBudget("f " + ("1 ".repeat(1000) + "\\\n").repeat(40))).toThrow(RangeError);
});
