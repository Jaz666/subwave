import assert from "node:assert/strict";
import test from "node:test";
import { generateSelectionV3Examples } from "./functiongemma/selection-v3-training-data.js";
test("V3 selector examples cover concise candidate prompts and transition vocabulary",()=>{const examples=generateSelectionV3Examples("development",36),direct=examples.filter(example=>(example.messages[1].content as string).includes("Candidates: ["));assert.ok(direct.length>0);for(const example of direct){const content=example.messages[1].content as string,id=example.messages[2].tool_calls[0].function.arguments.id;assert.match(content,/Return only the exact candidate id in/);assert.ok(content.includes(id));}});
