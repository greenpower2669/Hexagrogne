import assert from "node:assert/strict";
import test from "node:test";
import {FAB_EXPORT_FILES, loadBundledFabExport, validateFabExport} from "../app/fab-exports.ts";
import {ensureAiImportBackup} from "../app/ai-import-backup.ts";

test("Fab V3 exports require compatible formats, and use embedded paths", async () => {
  const samples = {
    ai: {schema:"fabhexagrogne-ai-pack",version:9,gameVersion:"3.1.1-t3",architectureId:"fabhexabrain-v3-hybrid-r15-hexconv32-32-48",selfPlayLeague:{cycle:1341},modules:{core:{}}},
    corpus: {schema:"fabhexabrain",version:2,rulesVersion:15,architectureId:"fabhexabrain-v2-policy-value6-hex11-r15",samples:[]},
    human: {schema:"fabhexagrogne-human-victories",version:1,encoding:{boardRadius:5},games:[]},
  } as const;
  for (const kind of ["ai","corpus","human"] as const) {
    let seenUrl = "";
    const fakeFetch = async (request: RequestInfo | URL) => {
      seenUrl = String(request);
      return new Response(JSON.stringify(samples[kind]), {status:200});
    };
    assert.deepEqual(await loadBundledFabExport(kind, fakeFetch as typeof fetch), samples[kind]);
    assert.equal(seenUrl, "/fab-exports/" + FAB_EXPORT_FILES[kind]);
    assert.throws(() => validateFabExport(kind, {schema:"wrong"}));
  }
  await assert.rejects(() => loadBundledFabExport("corpus", (async () => new Response("", {status:404})) as typeof fetch));
});

test("AI snapshot is durable, not overwritten, and rejects low storage", () => {
  const entries = new Map<string,string>();
  const store = {getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)}};
  const snapshot = {schema:"fabhexagrogne-ai-import-backup",version:2,memory:{},league:{},hybridBrain:{}};
  assert.equal(ensureAiImportBackup(store,"backup",snapshot),true);
  const original = entries.get("backup");
  assert.equal(ensureAiImportBackup(store,"backup",{...snapshot,createdAt:"later"}),true);
  assert.equal(entries.get("backup"),original,"existing rollback state is preserved");
  entries.set("backup",JSON.stringify({...snapshot,version:1}));
  assert.equal(ensureAiImportBackup(store,"backup",snapshot),false,"legacy backup without T3 cannot guarantee recovery");
  entries.delete("backup");
  const full={getItem:()=>null,setItem:()=>{throw new Error("QuotaExceededError")}};
  assert.equal(ensureAiImportBackup(full,"backup",snapshot),false);
});
