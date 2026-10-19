import { test } from "node:test";
import assert from "node:assert/strict";
import { correctedVocabulary, replacePhrase } from "../src/text.js";

test("same-length shifted edit adds vocabulary without mapping unrelated words", () => {
  assert.deepEqual(correctedVocabulary("I want tea now", "I really want tea", []), ["really"]);
});
test("vocabulary deduplicates names case-insensitively", () => {
  assert.deepEqual(correctedVocabulary("hello", "Tauri tauri Vihan", [{ word: "vihan" }]), ["Tauri"]);
});
test("replacement supports Unicode and literal replacement tokens", () => {
  assert.equal(replacePhrase("say வணக்கம் now", "வணக்கம்", "$1 $&"), "say $1 $& now");
  assert.equal(replacePhrase("names name", "name", "X"), "names X");
});
