import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { syntheticPcm } from "./synthetic.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    model: { type: "string" },
    reference: { type: "string" },
  },
});
if (!values.model) throw new Error("Pass --model /path/to/the/official/campp.onnx.");
const root = fileURLToPath(new URL("../", import.meta.url));
const model = Bun.file(values.model);
if (model.size !== 28281164) throw new Error("Expected the documented fp32 CAM++ artifact.");
const build = await Bun.build({
  entrypoints: [root + "bench/worker.ts"],
  target: "browser",
  format: "esm",
  write: false,
});
if (!build.success) throw new Error("Benchmark worker build failed.");
const worker = await build.outputs[0].text();
const html = `<!doctype html><meta charset="utf-8"><title>Local voiceprint SDK spike</title>
<h1>Local synthetic voiceprint check</h1><p>No microphone, recording, upload or playback.</p><pre id="result">Running…</pre>
<script type="module">
import {createVoiceprintWorkerClient} from '/sdk.js';
const client=createVoiceprintWorkerClient(new Worker('/worker.js',{type:'module'}));
try {
 const pcm=new Float32Array(await (await fetch('/synthetic.f32')).arrayBuffer());
 const reference=await (await fetch('/reference.json')).json();
 if(reference && (reference.modelSha256!=='aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2' || !Array.isArray(reference.native) || reference.native.length!==192 || reference.native.some(x=>!Number.isFinite(x))))throw new Error('Invalid native reference');
 const before=performance.now();
 await client.warm({model:{id:'campp-zh-en-fp32-v1',url:location.origin+'/model.onnx',bytes:28281164,sha256:'aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2',precision:'fp32'},wasmBaseUrl:location.origin+'/ort/'},true);
 const warmMs=performance.now()-before,first=performance.now();
 const result=await client.extract(pcm),firstMs=performance.now()-first;
 const second=performance.now();await client.extract(pcm);const secondMs=performance.now()-second;
 const vector=[...result.embedding];
 const cosine=reference?.native ? vector.reduce((n,x,i)=>n+x*reference.native[i],0)/Math.hypot(...vector)/Math.hypot(...reference.native) : null;
 window.__voiceprintBench={ok:true,dimension:vector.length,trust:result.trust,norm:Math.hypot(...vector),audioMs:result.audioMs,callerBytes:pcm.byteLength,warmMs,firstMs,secondMs,nativeCosine:cosine};
} catch(error) {window.__voiceprintBench={ok:false,error:String(error)};} finally {client.dispose();}
document.querySelector('#result').textContent=JSON.stringify(window.__voiceprintBench,null,2);
</script>`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    if (req.method !== "GET") return new Response(null, { status: 405 });
    const path = new URL(req.url).pathname;
    if (path === "/") return new Response(html, { headers: { "content-type": "text/html" } });
    if (path === "/worker.js")
      return new Response(worker, { headers: { "content-type": "text/javascript" } });
    if (path === "/sdk.js")
      return new Response(Bun.file(root + "dist/index.js"), {
        headers: { "content-type": "text/javascript" },
      });
    if (path === "/model.onnx") return new Response(model);
    if (path === "/synthetic.f32") return new Response(syntheticPcm().buffer);
    if (path === "/reference.json")
      return values.reference
        ? new Response(Bun.file(values.reference), {
            headers: { "content-type": "application/json" },
          })
        : Response.json(null);
    if (/^\/ort\/[a-zA-Z0-9._-]+$/.test(path))
      return new Response(Bun.file(root + "node_modules/onnxruntime-web/dist/" + path.slice(5)), {
        headers: {
          "content-type": path.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        },
      });
    return new Response(null, { status: 404 });
  },
});
console.log(`Local synthetic benchmark: http://127.0.0.1:${server.port}`);
