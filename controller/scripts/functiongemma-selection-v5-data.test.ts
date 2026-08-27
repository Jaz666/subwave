import assert from "node:assert/strict";
import test from "node:test";
import { generateSelectionV5Examples } from "./functiongemma/selection-v5-training-data.js";
test("V5 upweights concise editorial traps without losing support families",()=>{const rows=generateSelectionV5Examples("development",90);const counts:Record<string,number>={};for(const row of rows){counts[row.family]=(counts[row.family]??0)+1;if(["same-artist","recent-rotation","strict-show-filter"].includes(row.family))assert.match(row.messages[1].content,/Candidates: \[/)}assert.equal(rows.length,90);assert.ok(counts["same-artist"]+counts["recent-rotation"]+counts["strict-show-filter"]>=60);assert.ok(counts["strict-playlist"]>0);});
