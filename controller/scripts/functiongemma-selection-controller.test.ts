import assert from "node:assert/strict";
import test from "node:test";
import { CONTROLLER_SELECTION_TRANSITION, resolveControllerSelection } from "./functiongemma/selection-controller.js";
test("controller accepts only a surfaced selector id and owns the transition default",()=>{assert.deepEqual(resolveControllerSelection([{name:"done",arguments:{id:"candidate-2",reason:"ignored",transition:"invented"}}],["candidate-1","candidate-2"]),{id:"candidate-2",transition:CONTROLLER_SELECTION_TRANSITION});assert.equal(resolveControllerSelection([{name:"done",arguments:{id:"invented"}}],["candidate-1"]),null);});
