import { startPeerEngine } from "./peer-engine";
import { sttRecognize, warmSenseVoice } from "../src/providers/stt/sensevoice";

const form = document.querySelector<HTMLFormElement>("#host-form")!;
const roomInput = document.querySelector<HTMLInputElement>("#host-room")!;
const peerInput = document.querySelector<HTMLInputElement>("#host-peer")!;
const startButton = document.querySelector<HTMLButtonElement>("#host-start")!;
const stopButton = document.querySelector<HTMLButtonElement>("#host-stop")!;
const status = document.querySelector<HTMLElement>("#host-status")!;
const requests = document.querySelector<HTMLElement>("#host-requests")!;
const approvedPeers = new Set<string>();
const approvals = new Map<string, { promise: Promise<boolean>; deny: () => void }>();
let engine: ReturnType<typeof startPeerEngine> | undefined;
let generation = 0;
let starting = false;

peerInput.value = `mic-node-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

function setStatus(message: string) {
  status.textContent = message;
}

function stop() {
  generation++;
  engine?.close();
  engine = undefined;
  starting = false;
  for (const approval of [...approvals.values()]) approval.deny();
  approvals.clear();
  approvedPeers.clear();
  requests.replaceChildren();
  startButton.disabled = false;
  stopButton.disabled = true;
  roomInput.disabled = false;
  peerInput.disabled = false;
  setStatus("Stopped. Peer approvals have been cleared.");
}

function requestApproval(peerId: string): Promise<boolean> {
  if (!engine) return Promise.resolve(false);
  if (approvedPeers.has(peerId)) return Promise.resolve(true);
  const existing = approvals.get(peerId);
  if (existing) return existing.promise;
  const row = document.createElement("div");
  row.className = "peer-request";
  const description = document.createElement("p");
  description.textContent = `Peer ${peerId} requests permission to send audio to this device for recognition.`;
  const allow = document.createElement("button");
  allow.type = "button";
  allow.textContent = "Allow this peer";
  const deny = document.createElement("button");
  deny.type = "button";
  deny.className = "secondary";
  deny.textContent = "Deny";
  row.append(description, allow, deny);
  requests.append(row);
  let answer!: (approved: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    answer = resolve;
  });
  let timeout: ReturnType<typeof setTimeout>;
  const settle = (approved: boolean) => {
    if (approvals.get(peerId)?.promise !== promise) return;
    clearTimeout(timeout);
    approvals.delete(peerId);
    if (approved) approvedPeers.add(peerId);
    row.remove();
    answer(approved);
    setStatus(approved ? `Approved ${peerId} for this session.` : `Denied ${peerId}.`);
  };
  approvals.set(peerId, { promise, deny: () => settle(false) });
  timeout = setTimeout(() => settle(false), 40_000);
  allow.addEventListener("click", () => settle(true), { once: true });
  deny.addEventListener("click", () => settle(false), { once: true });
  return promise;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (starting || engine || !form.reportValidity()) return;
  const room = roomInput.value.trim();
  const peerId = peerInput.value.trim();
  if (!room || !peerId) {
    setStatus("Enter a room and peer ID first.");
    return;
  }
  const attempt = ++generation;
  starting = true;
  startButton.disabled = true;
  stopButton.disabled = false;
  roomInput.disabled = true;
  peerInput.disabled = true;
  setStatus("Loading the local recognition model. No peers have been approved.");
  void warmSenseVoice(undefined, (progress) => {
    if (attempt !== generation) return;
    const size = progress.received ? ` (${Math.round(progress.received / 1024 / 1024)} MB)` : "";
    setStatus(
      progress.stage === "ready"
        ? "Model ready. Connecting…"
        : `Loading local recognition: ${progress.stage}${size}`,
    );
  })
    .then(() => {
      if (attempt !== generation) return;
      engine = startPeerEngine({
        room,
        peerId,
        signalingUrl: "https://otoji.org/signal",
        approvedPeers,
        recognize: (samples) => sttRecognize(samples),
        onPeerRequest: requestApproval,
        onStatus: (message) => {
          if (attempt === generation) setStatus(message);
        },
      });
      starting = false;
    })
    .catch(() => {
      if (attempt !== generation) return;
      stop();
      setStatus("Could not start recognition. Check your connection and try again.");
    });
});

stopButton.addEventListener("click", stop);
window.addEventListener("pagehide", stop);
