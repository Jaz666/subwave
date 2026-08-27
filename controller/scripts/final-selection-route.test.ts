import assert from "node:assert/strict";
import test from "node:test";
import { routeFinalSelection } from "../src/llm/internal/producer/final-selection-route.js";
test("routes clear FunctionGemma choices fast and deadlocks to Persona",()=>{assert.deepEqual(routeFinalSelection({proposedId:"a",surfacedIds:new Set(["a"]),alternativeArtistCount:1}),{kind:"functiongemma",id:"a"});assert.deepEqual(routeFinalSelection({proposedId:"a",surfacedIds:new Set(["a","b"]),proposedArtist:"A",currentArtist:"A",alternativeArtistCount:2}),{kind:"persona-final-call",reasons:["artist-variety-conflict"]});});
