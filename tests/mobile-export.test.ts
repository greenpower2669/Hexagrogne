import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadJson } from '../mobile/platform';
test('web export preserves JSON and downloads with its filename', async()=>{
 let clicked=false; let revoked=false; const anchor={href:'',download:'',click(){clicked=true;}};
 Object.assign(globalThis,{document:{createElement:()=>anchor}});
 URL.createObjectURL=(blob)=>{assert.ok(blob instanceof Blob);assert.equal(blob.type,'application/json');return 'blob:test';};
 URL.revokeObjectURL=()=>{revoked=true;};
 await downloadJson('test.json',{score:42});
 assert.equal(anchor.download,'test.json');assert.ok(clicked);
 await new Promise(r=>setTimeout(r,1100));assert.ok(revoked);
});
