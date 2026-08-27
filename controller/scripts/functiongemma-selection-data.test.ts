import assert from "node:assert/strict";
import test from "node:test";
import { generateSelectionExamples, validateSelectionSets } from "./functiongemma/selection-training-data.js";
test("selector corpus is deterministic, grounded and isolated",()=>{const train=generateSelectionExamples("train",320),development=generateSelectionExamples("development",80),checked=validateSelectionSets(train,development);assert.deepEqual(train,generateSelectionExamples("train",320));for(const family of ["exact-id","same-artist","recent-rotation","strict-playlist","strict-show-filter","host-over-guest","quiet-continuity","deliberate-contrast"])assert.ok(checked.families[family]>0);for(const item of [...train,...development])assert.deepEqual(item.tools.map(tool=>tool.function.name),["done"]);});
