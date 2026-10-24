// Render or check a scene in a headless, muted Chrome (no sound on this machine).
//
//   bun refs/render.ts check <civ:activity> [--score cultures/scores/x.js] [--secs 20] [--port 9341]
//       loads the scene (with the score file evaluated fresh, so no build is needed), reports
//       line errors, page errors, each line's level (dB, L+R) and which lines sound in each section
//   (instead of <civ:activity>, @file.otoji renders a patch file)
//   bun refs/render.ts wav <civ:activity> <out.wav> [--secs 40] [--score …] [--port …]
//       records the master to a mono 22.05 kHz WAV, for refs/analyse.py
//
// Each --port gets its own Chrome and profile (~/.cache/otoji/chrome-<port>), so several can run at once.
// The page comes from --base (default: the local lab server).
import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const port = Number(opt("port", "9341")), secs = Number(opt("secs", "")) || 0, scoreFile = opt("score", "");
const base = opt("base", "http://127.0.0.1:8840/otoji/editor/");
const [mode, key, outWav] = argv;
if (!mode || !key) { console.log("usage: bun refs/render.ts check|wav <civ:activity> [out.wav] [--secs N] [--score file] [--port N]"); process.exit(1); }

// ── a Chrome of our own ──
const up = async () => { try { return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { return null; } };
if (!(await up())) {
  const prof = `${homedir()}/.cache/otoji/chrome-${port}`; mkdirSync(prof, { recursive: true });
  Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--mute-audio", `--remote-debugging-port=${port}`,
    `--user-data-dir=${prof}`, "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--window-size=1400,900", "about:blank"], { stdout: "ignore", stderr: "ignore" }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await Bun.sleep(200);
}
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
let page = list.find((t: any) => t.type === "page");
if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(), pageErrs: string[] = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data as string); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") pageErrs.push(d.params.exceptionDetails.exception?.description?.split("\n")[0] || d.params.exceptionDetails.text);
};
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e: string) => { const r = (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: base });
for (let i = 0; i < 60; i++) { await Bun.sleep(250); try { if (await ev("typeof compose === 'function' && typeof CIVS === 'object' && CIVS.length > 0")) break; } catch {} }
await Bun.sleep(500);

// ── the scene, with the score file evaluated fresh ──
const [civId, act] = key.split(":");
const scoreSrc = scoreFile ? await Bun.file(scoreFile).text() : "";
const text: string = key.startsWith("@") ? await Bun.file(key.slice(1)).text() : await ev(`(()=>{ ${scoreSrc ? `eval(${JSON.stringify(scoreSrc)});` : ""}
  const civ = CIVS.find(c => c.id === ${JSON.stringify(civId)}); if (!civ) throw new Error("no civ ${civId}");
  return compose(civ, ${JSON.stringify(act)}); })()`);
await ev(`(()=>{ ui.setText(${JSON.stringify(text)}); applyText(${JSON.stringify(text)}); return 1 })()`);
const lineErrs: string[] = await ev(`[...[...live.values()].filter(r=>r.error).map(r=>r.node.id+': '+r.error), ...patch.lines.filter(l=>l.type==='invalid').map(l=>'line: '+l.error)]`);
console.log(`${key}${scoreFile ? " (score " + scoreFile + ")" : ""}`);
if (lineErrs.length) { console.log("LINE ERRORS:\n  " + lineErrs.join("\n  ")); }

if (mode === "check") {
  // per-section presence (which sources sound in each section), then levels over the whole run
  const res = await ev(`(async()=>{
    const v=document.getElementById('vol'); v.value=30; v.dispatchEvent(new Event('input'));
    await start(); await new Promise(r=>setTimeout(r,300));
    const mk=(n)=>{const sp=ctx.createChannelSplitter(2), l=ctx.createAnalyser(), r=ctx.createAnalyser(); l.fftSize=r.fftSize=2048; n.connect(sp); sp.connect(l,0); sp.connect(r,1); return [l,r]};
    const an={master:mk(master)}; for(const r of live.values()) if(r.out && KINDS[r.node.kind]?.source) an[r.node.id]=mk(r.out);
    const acc={}; let n=0; const iv=setInterval(()=>{const b=new Float32Array(2048); n++; for(const [k,p] of Object.entries(an)){let s=0; for(const a of p){a.getFloatTimeDomainData(b); for(const x of b) s+=x*x;} acc[k]=(acc[k]||0)+s/b.length}},50);
    const arr=[...live.values()].find(r=>r.node.kind==='arrange'), c=clocks.get([...clocks.keys()][0]);
    const secs=[]; const nsec=arr?arr.cfg.sections.length:0;
    for(let s=0;s<nsec;s++){ const bs=4*c.sig, step=arr.cfg.sections[s].start*bs; c.step=step; c.nextTime=ctx.currentTime+0.05; startedAt=c.nextTime-step*60/c.bpm/4; for(const r of live.values()) r.busy=[];
      await new Promise(r=>setTimeout(r, Math.max(600, Math.min(12000, 60/c.bpm*c.sig*1000*arr.cfg.sections[s].bars)) - 150));
      secs.push((arr.cfg.sections[s].name||('§'+(s+1)))+': '+[...live.values()].filter(r=>r.busy.length && KINDS[r.node.kind]?.source && r.node.kind!=='clock').map(r=>r.node.id).join(' ')); }
    ${secs ? `await new Promise(r=>setTimeout(r,${secs * 1000}));` : ""}
    clearInterval(iv); stop();
    return {secs, levels:Object.entries(acc).map(([k,v])=>[k,10*Math.log10(v/n+1e-12)])};
  })()`);
  console.log("sections:\n  " + res.secs.join("\n  "));
  console.log("levels (dB, mean over the run; silent lines omitted):\n  " + res.levels.filter(([, v]: any) => v > -80).map(([k, v]: any) => `${k} ${v.toFixed(1)}`).join(" · "));
} else if (mode === "wav") {
  if (!outWav) throw new Error("wav needs an output path");
  const b64: string = await ev(`(async()=>{
    const v=document.getElementById('vol'); v.value=60; v.dispatchEvent(new Event('input')); await start();
    const dst=ctx.createMediaStreamDestination(); master.connect(dst); const rec=new MediaRecorder(dst.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:256000}); const parts=[];
    rec.ondataavailable=e=>parts.push(e.data); rec.start(); await new Promise(r=>setTimeout(r,${(secs || 40) * 1000})); rec.stop(); await new Promise(r=>rec.onstop=r); stop();
    const buf=new Uint8Array(await new Blob(parts).arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=0x8000) s+=String.fromCharCode(...buf.subarray(i,i+0x8000)); return btoa(s)})()`);
  const webm = outWav.replace(/\.wav$/, "") + ".webm"; await Bun.write(webm, Buffer.from(b64, "base64"));
  const ff = (await $`uvx --from imageio-ffmpeg python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`.text()).trim();
  await $`${ff} -loglevel error -y -i ${webm} -ac 1 -ar 22050 ${outWav}`;
  console.log("wrote " + outWav);
}
console.log(pageErrs.length ? "PAGE ERRORS:\n  " + [...new Set(pageErrs)].slice(0, 5).join("\n  ") : "page errors: none");
ws.close(); process.exit(lineErrs.length || pageErrs.length ? 2 : 0);
