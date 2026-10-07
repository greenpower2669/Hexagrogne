import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const u32 = (value) => {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
};

const section = (id, payload) => [id, ...u32(payload.length), ...payload];
const ascii = (value) => [...value].map((character) => character.charCodeAt(0));

const FEATURE_COUNT = 14;
const parameterTypes = Array.from({ length: FEATURE_COUNT * 2 }, () => 0x7d); // f32
const typeSection = section(1, [
  1, // one signature
  0x60, // function type
  ...u32(parameterTypes.length),
  ...parameterTypes,
  1,
  0x7d, // one f32 result
]);
const functionSection = section(3, [1, 0]);
const exportName = ascii("score");
const exportSection = section(7, [
  1,
  ...u32(exportName.length),
  ...exportName,
  0,
  0,
]);

const instructions = [];
for (let index = 0; index < FEATURE_COUNT; index += 1) {
  instructions.push(0x20, ...u32(index)); // local.get weight
  instructions.push(0x20, ...u32(index + FEATURE_COUNT)); // local.get feature
  instructions.push(0x94); // f32.mul
  if (index > 0) instructions.push(0x92); // f32.add
}
instructions.push(0x0b); // end
const body = [0, ...instructions]; // zero local declarations
const codeSection = section(10, [1, ...u32(body.length), ...body]);

const binary = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
  ...typeSection,
  ...functionSection,
  ...exportSection,
  ...codeSection,
]);

const output = fileURLToPath(new URL("../public/ai-score.wasm", import.meta.url));
writeFileSync(output, binary);
const { instance } = await WebAssembly.instantiate(binary);
const check = instance.exports.score(
  ...Array.from({ length: FEATURE_COUNT }, () => 1),
  ...Array.from({ length: FEATURE_COUNT }, (_, index) => index + 1),
);
if (check !== 105) throw new Error(`Unexpected WASM evaluator result: ${check}`);
console.log(`Generated ${output} (${binary.byteLength} bytes, self-test=${check})`);
