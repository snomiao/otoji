import { listWebLlmModels, type WebLlmModelOption } from "../translate/webllm";

export type ModelSourceProvider = "huggingface" | "civitai" | "webllm" | "url";

export interface ModelFileRef {
  name: string;
  url: string;
  sizeKb?: number;
  format?: string;
  type?: string;
  primary?: boolean;
}

export interface ModelSourceMsg {
  provider: ModelSourceProvider;
  id: string;
  model: string;
  url?: string;
  title?: string;
  kind?: string;
  baseModel?: string;
  files?: ModelFileRef[];
  triggerWords?: string[];
  compatibility?: ModelCompatibility;
  metadata?: unknown;
}

export type ModelFormat = "onnx" | "gguf" | "safetensors" | "diffusers" | "mlx" | "mlc";
export type ModelRuntime = "browser" | "mlx" | "llama.cpp" | "diffusers" | "remote";
export type ModelTaskGroup =
  | "text"
  | "asr"
  | "tts"
  | "image"
  | "vision"
  | "text-to-image"
  | "image-to-image"
  | "image-to-text";

export interface ModelCompatibility {
  formats: ModelFormat[];
  runtimes: ModelRuntime[];
  tasks: ModelTaskGroup[];
  basis: "inferred";
  issues?: string[];
}

export interface ModelSearchFilters {
  format?: ModelFormat | "any";
  runtime?: ModelRuntime | "any";
  task?: ModelTaskGroup | "any";
}

export interface ModelSearchResult {
  provider: Exclude<ModelSourceProvider, "url">;
  id: string;
  ref: string;
  title: string;
  detail?: string;
  compatibility: ModelCompatibility;
}

const HUGGING_FACE_MODEL_EXPAND = new URLSearchParams([
  ["expand[]", "config"],
  ["expand[]", "siblings"],
  ["expand[]", "pipeline_tag"],
  ["expand[]", "tags"],
  ["expand[]", "downloads"],
  ["expand[]", "likes"],
  ["expand[]", "library_name"],
]).toString();

export async function searchModelSources(
  provider: ModelSourceProvider,
  query: string,
  options: { signal?: AbortSignal; limit?: number; filters?: ModelSearchFilters } = {},
): Promise<ModelSearchResult[]> {
  const q = query.trim();
  if (!q || provider === "url") return [];
  const limit = Math.max(1, Math.min(20, options.limit ?? 8));
  if (provider === "webllm") {
    const catalog = await listWebLlmModels();
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return searchWebLlmCatalog(catalog, q, limit, options.filters);
  }
  if (provider === "civitai") return searchCivitai(q, limit, options.signal, options.filters);
  return searchHuggingFace(q, limit, options.signal, options.filters);
}

export async function resolveModelSource(cfg: Record<string, unknown>): Promise<ModelSourceMsg> {
  const provider = ((cfg.provider as string | undefined) ?? "huggingface") as ModelSourceProvider;
  const ref = ((cfg.ref as string | undefined) ?? (cfg.model as string | undefined) ?? "").trim();
  if (!ref) throw new Error("model-source: reference is empty");
  if (provider === "webllm") return resolveWebLlm(ref);
  if (provider === "civitai") return resolveCivitai(ref);
  if (provider === "url") return resolveUrl(ref);
  return resolveHuggingFace(ref);
}

const WEBLLM_COMPATIBILITY: ModelCompatibility = {
  formats: ["mlc"],
  runtimes: ["browser"],
  tasks: ["text"],
  basis: "inferred",
};

export function webLlmModelSource(option: WebLlmModelOption): ModelSourceMsg {
  return {
    provider: "webllm",
    id: option.id,
    model: option.id,
    title: option.id,
    kind: "text-generation",
    compatibility: WEBLLM_COMPATIBILITY,
    metadata: { label: option.label, keywords: option.keywords },
  };
}

export function searchWebLlmCatalog(
  catalog: WebLlmModelOption[],
  query: string,
  limit = 8,
  filters?: ModelSearchFilters,
): ModelSearchResult[] {
  if (!matchesFilters(WEBLLM_COMPATIBILITY, filters)) return [];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((option) => {
    const haystack = `${option.id} ${option.label} ${option.keywords ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, limit).map((option) => ({
    provider: "webllm",
    id: option.id,
    ref: option.id,
    title: option.id,
    detail: option.label === option.id ? "MLC · WebGPU · browser" : `${option.label} · WebGPU`,
    compatibility: WEBLLM_COMPATIBILITY,
  }));
}

async function resolveWebLlm(ref: string): Promise<ModelSourceMsg> {
  const option = (await listWebLlmModels()).find((candidate) => candidate.id === ref);
  if (!option) throw new Error(`model-source: ${ref} is not in the WebLLM prebuilt model catalog`);
  return webLlmModelSource(option);
}

export function modelSourceToText(m: ModelSourceMsg): string {
  const parts = [
    `${m.provider}: ${m.title || m.id}`,
    `model=${m.model}`,
    m.url ? `url=${m.url}` : "",
    m.kind ? `kind=${m.kind}` : "",
    m.baseModel ? `base=${m.baseModel}` : "",
    m.triggerWords?.length ? `triggers=${m.triggerWords.join(", ")}` : "",
    m.compatibility?.formats.length ? `formats=${m.compatibility.formats.join(",")}` : "",
    m.compatibility?.runtimes.length ? `runtimes=${m.compatibility.runtimes.join(",")}` : "",
    m.compatibility?.issues?.length ? `issues=${m.compatibility.issues.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

async function resolveHuggingFace(ref: string): Promise<ModelSourceMsg> {
  const id = parseHuggingFaceId(ref);
  const encodedId = id.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://huggingface.co/api/models/${encodedId}?${HUGGING_FACE_MODEL_EXPAND}`);
  if (!res.ok) throw new Error(`model-source: Hugging Face returned ${res.status}`);
  const json = await res.json() as any;
  const siblings = Array.isArray(json.siblings) ? json.siblings : [];
  const files: ModelFileRef[] = siblings
    .map((s: any) => String(s.rfilename ?? s.path ?? ""))
    .filter(Boolean)
    .map((name: string) => ({
      name,
      url: `https://huggingface.co/${id}/resolve/main/${name}`,
      primary: /\.(safetensors|gguf|onnx|bin)$/i.test(name),
      format: name.split(".").pop(),
    }));
  const primary = choosePrimary(files);
  const compatibility = inferHuggingFaceCompatibility(json, files.map((file) => file.name));
  return {
    provider: "huggingface",
    id,
    model: id,
    url: primary?.url ?? `https://huggingface.co/${id}`,
    title: json.cardData?.pretty_name ?? json.modelId ?? id,
    kind: Array.isArray(json.pipeline_tag) ? json.pipeline_tag.join(",") : json.pipeline_tag,
    files,
    compatibility,
    metadata: {
      downloads: json.downloads,
      likes: json.likes,
      tags: json.tags,
      library_name: json.library_name,
    },
  };
}

async function searchHuggingFace(query: string, limit: number, signal?: AbortSignal, filters?: ModelSearchFilters): Promise<ModelSearchResult[]> {
  const requestLimit = Math.min(50, Math.max(20, limit * 4));
  const params = new URLSearchParams({
    search: query,
    sort: "downloads",
    direction: "-1",
    limit: String(requestLimit),
    full: "true",
  });
  const serverFilter = filters?.format && filters.format !== "any"
    ? filters.format
    : filters?.runtime === "browser"
      ? "onnx"
      : filters?.runtime === "llama.cpp"
        ? "gguf"
        : filters?.runtime === "diffusers"
          ? "diffusers"
          : filters?.runtime === "mlx"
            ? "mlx"
            : filters?.runtime === "remote"
              ? "endpoints_compatible"
              : undefined;
  if (serverFilter) params.set("filter", serverFilter);
  const res = await fetch(`https://huggingface.co/api/models?${params}`, { signal });
  if (!res.ok) throw new Error(`model-source: Hugging Face search returned ${res.status}`);
  const json = await res.json() as any;
  if (!Array.isArray(json)) return [];
  let candidates = json.filter((model: any) => {
    const id = String(model.modelId ?? model.id ?? "").trim();
    if (!id) return false;
    const compatibility = inferHuggingFaceCompatibility(model, (model.siblings ?? []).map((file: any) => String(file.rfilename ?? file.path ?? "")));
    return matchesFilters(compatibility, { ...filters, runtime: "any" });
  });
  if (filters?.runtime === "browser") {
    candidates = await enrichHuggingFaceConfigs(candidates.slice(0, Math.min(20, Math.max(12, limit * 2))), signal);
  }
  return candidates.map((model: any) => {
    const id = String(model.modelId ?? model.id ?? "").trim();
    const compatibility = inferHuggingFaceCompatibility(model, (model.siblings ?? []).map((file: any) => String(file.rfilename ?? file.path ?? "")));
    const detail = [
      model.pipeline_tag,
      compatibility.formats.join(", "),
      compatibility.runtimes.join(", "),
      typeof model.downloads === "number" ? `${formatCount(model.downloads)} downloads` : "",
      typeof model.likes === "number" ? `${formatCount(model.likes)} likes` : "",
    ].filter(Boolean).join(" · ");
    return { provider: "huggingface" as const, id, ref: id, title: id, detail, compatibility };
  }).filter((model: ModelSearchResult) => model.id && matchesFilters(model.compatibility, filters)).slice(0, limit);
}

async function enrichHuggingFaceConfigs(models: any[], signal?: AbortSignal): Promise<any[]> {
  return Promise.all(models.map(async (model) => {
    const id = String(model.modelId ?? model.id ?? "").trim();
    const encodedId = id.split("/").map(encodeURIComponent).join("/");
    try {
      const res = await fetch(`https://huggingface.co/api/models/${encodedId}?${HUGGING_FACE_MODEL_EXPAND}`, { signal });
      if (!res.ok) return model;
      const detail = await res.json() as any;
      return { ...model, config: detail.config, siblings: detail.siblings ?? model.siblings };
    } catch (error) {
      if (signal?.aborted) throw error;
      return model;
    }
  }));
}

async function resolveCivitai(ref: string): Promise<ModelSourceMsg> {
  const parsed = parseCivitaiRef(ref);
  const endpoint = parsed.versionId
    ? `https://civitai.com/api/v1/model-versions/${parsed.versionId}`
    : `https://civitai.com/api/v1/models/${parsed.modelId}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`model-source: Civitai returned ${res.status}`);
  const json = await res.json() as any;
  const version = parsed.versionId ? json : latestModelVersion(json);
  const parent = parsed.versionId ? (json.model ?? {}) : json;
  const files: ModelFileRef[] = (Array.isArray(version?.files) ? version.files : [])
    .map((file: any) => civitaiFileRef(file, version?.downloadUrl))
    .filter((f: ModelFileRef) => f.url);
  const primary = choosePrimary(files);
  const compatibility = inferCivitaiCompatibility(parent, version, files);
  const id = parsed.versionId ? String(version.id) : String(json.id);
  return {
    provider: "civitai",
    id,
    model: primary?.url ?? version?.downloadUrl ?? `civitai:${id}`,
    url: primary?.url ?? version?.downloadUrl,
    title: [parent.name, version?.name].filter(Boolean).join(" / ") || `Civitai ${id}`,
    kind: parent.type,
    baseModel: version?.baseModel,
    files,
    triggerWords: Array.isArray(version?.trainedWords) ? version.trainedWords : undefined,
    compatibility,
    metadata: {
      modelId: parsed.versionId ? (json.modelId ?? parent.id) : json.id,
      versionId: version?.id,
      nsfw: parent.nsfw ?? version?.nsfwLevel,
      stats: parent.stats ?? version?.stats,
    },
  };
}

async function searchCivitai(query: string, limit: number, signal?: AbortSignal, filters?: ModelSearchFilters): Promise<ModelSearchResult[]> {
  const requestLimit = Math.min(50, Math.max(20, limit * 4));
  const params = new URLSearchParams({
    query,
    limit: String(requestLimit),
    sort: "Most Downloaded",
    period: "AllTime",
  });
  const res = await fetch(`https://civitai.com/api/v1/models?${params}`, { signal });
  if (!res.ok) throw new Error(`model-source: Civitai search returned ${res.status}`);
  const json = await res.json() as any;
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((model: any) => {
    const id = String(model.id ?? "").trim();
    const version = latestModelVersion(model);
    const versionId = version?.id == null ? "" : String(version.id);
    const ref = versionId
      ? `https://civitai.com/models/${id}?modelVersionId=${versionId}`
      : `https://civitai.com/models/${id}`;
    const downloads = model.stats?.downloadCount ?? version?.stats?.downloadCount;
    const files = (Array.isArray(version?.files) ? version.files : [])
      .map((file: any) => civitaiFileRef(file, version?.downloadUrl))
      .filter((file: ModelFileRef) => file.url);
    const compatibility = inferCivitaiCompatibility(model, version, files);
    const detail = [
      model.type,
      version?.baseModel,
      compatibility.formats.join(", "),
      compatibility.runtimes.join(", "),
      typeof downloads === "number" ? `${formatCount(downloads)} downloads` : "",
    ].filter(Boolean).join(" · ");
    return { provider: "civitai" as const, id, ref, title: String(model.name ?? `Civitai ${id}`), detail, compatibility };
  }).filter((model: ModelSearchResult) => model.id && matchesFilters(model.compatibility, filters)).slice(0, limit);
}

function resolveUrl(ref: string): ModelSourceMsg {
  const name = ref.split("/").pop() || "model";
  const files = [{ name, url: ref, primary: true, format: name.split(".").pop() }];
  return {
    provider: "url",
    id: ref,
    model: ref,
    url: ref,
    title: name || ref,
    files,
    compatibility: inferArtifactCompatibility(files, []),
  };
}

function parseHuggingFaceId(ref: string): string {
  try {
    const u = new URL(ref);
    if (u.hostname === "huggingface.co") return u.pathname.replace(/^\/+/, "").split("/resolve/")[0]!.replace(/\/+$/, "");
  } catch {}
  return ref.replace(/^hf:/, "").replace(/^\/+|\/+$/g, "");
}

function parseCivitaiRef(ref: string): { modelId?: string; versionId?: string } {
  if (/^\d+$/.test(ref)) return { modelId: ref };
  const version = ref.match(/(?:modelVersionId=|\/model-versions\/|versions\/)(\d+)/i)?.[1];
  const model = ref.match(/(?:models\/|modelId=)(\d+)/i)?.[1];
  if (version) return { versionId: version };
  if (model) return { modelId: model };
  throw new Error("model-source: Civitai reference must contain a model or version id");
}

function latestModelVersion(model: any): any {
  const versions = Array.isArray(model?.modelVersions) ? model.modelVersions : [];
  return versions[0] ?? null;
}

function civitaiFileRef(file: any, fallbackUrl?: string): ModelFileRef {
  return {
    name: String(file.name ?? file.id ?? "model"),
    url: String(file.downloadUrl ?? fallbackUrl ?? ""),
    sizeKb: typeof file.sizeKB === "number" ? file.sizeKB : typeof file.sizeKb === "number" ? file.sizeKb : undefined,
    format: String(file.metadata?.format ?? file.format ?? "") || undefined,
    type: file.type,
    primary: file.primary === true || /model/i.test(String(file.type ?? "")),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function taskGroups(values: unknown[]): ModelTaskGroup[] {
  const text = values.filter((value) => typeof value === "string").join(" ").toLowerCase();
  const tasks: ModelTaskGroup[] = [];
  if (/automatic-speech-recognition|speech.to.text|\basr\b|whisper|sensevoice/.test(text)) tasks.push("asr");
  if (/text-to-speech|speech-synthesis|\btts\b/.test(text)) tasks.push("tts");
  if (/text-to-image|image-generation/.test(text)) tasks.push("text-to-image");
  if (/image-to-image|image-edit|img2img|instructpix2pix/.test(text)) tasks.push("image-to-image");
  if (/image-to-text|image-text-to-text|image-caption/.test(text)) tasks.push("image-to-text");
  if (/text-to-image|image-to-image|image-generation|image-edit|img2img|checkpoint|lora|stable.diffusion|flux|sdxl/.test(text)) tasks.push("image");
  if (/image-to-text|image-text-to-text|any-to-any|object-detection|image-classification|depth|segmentation|vision/.test(text)) tasks.push("vision");
  if (/text-generation|text2text|image-text-to-text|any-to-any|conversational|translation|summarization|question-answering|fill-mask/.test(text)) tasks.push("text");
  return unique(tasks);
}

function inferArtifactCompatibility(files: ModelFileRef[], descriptors: unknown[]): ModelCompatibility {
  const names = files.map((file) => file.name.toLowerCase());
  const labels = [...descriptors, ...files.map((file) => file.format), ...files.map((file) => file.type)]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const formats: ModelFormat[] = [];
  if (names.some((name) => name.endsWith(".onnx")) || /\bonnx\b/.test(labels)) formats.push("onnx");
  if (names.some((name) => name.endsWith(".gguf")) || /\bgguf\b/.test(labels)) formats.push("gguf");
  if (names.some((name) => name.endsWith(".safetensors")) || /safetensor/.test(labels)) formats.push("safetensors");
  if (names.some((name) => name.endsWith("model_index.json")) || /\bdiffusers\b/.test(labels)) formats.push("diffusers");
  if (/\bmlx\b|mlx-community/.test(labels)) formats.push("mlx");
  const tasks = taskGroups(descriptors);
  const runtimes: ModelRuntime[] = [];
  if (formats.includes("onnx")) runtimes.push("browser");
  if (formats.includes("mlx")) runtimes.push("mlx");
  if (formats.includes("gguf")) runtimes.push("llama.cpp");
  if (formats.includes("diffusers") || (formats.includes("safetensors") && tasks.includes("image"))) runtimes.push("diffusers");
  if (/endpoints.compatible|inference.api|remote/.test(labels)) runtimes.push("remote");
  return { formats: unique(formats), runtimes: unique(runtimes), tasks, basis: "inferred" };
}

export function inferHuggingFaceCompatibility(model: any, filenames: string[] = []): ModelCompatibility {
  const files = filenames.filter(Boolean).map((name) => ({ name, url: "" }));
  const compatibility = inferArtifactCompatibility(files, [model.id, model.modelId, model.pipeline_tag, model.library_name, ...(Array.isArray(model.tags) ? model.tags : [])]);
  const modelType = String(model.config?.model_type ?? "").trim().toLowerCase();
  if (compatibility.runtimes.includes("browser") && /^gemma4(?:_|$)/.test(modelType)) {
    compatibility.runtimes = compatibility.runtimes.filter((runtime) => runtime !== "browser");
    compatibility.issues = [`Transformers.js 4.2 does not support model type ${modelType}`];
  }
  return compatibility;
}

export function inferCivitaiCompatibility(model: any, version: any, files: ModelFileRef[] = []): ModelCompatibility {
  return inferArtifactCompatibility(files, [model?.type, model?.name, ...(Array.isArray(model?.tags) ? model.tags : []), version?.baseModel, version?.baseModelType]);
}

function matchesFilters(compatibility: ModelCompatibility, filters?: ModelSearchFilters): boolean {
  if (!filters) return true;
  if (filters.format && filters.format !== "any" && !compatibility.formats.includes(filters.format)) return false;
  if (filters.runtime && filters.runtime !== "any" && !compatibility.runtimes.includes(filters.runtime)) return false;
  if (filters.task && filters.task !== "any" && !compatibility.tasks.includes(filters.task)) return false;
  return true;
}

function choosePrimary(files: ModelFileRef[]): ModelFileRef | undefined {
  return files.find((f) => f.primary && /\.(safetensors|gguf|onnx|bin)$/i.test(f.name))
    ?? files.find((f) => /\.(safetensors|gguf|onnx|bin)$/i.test(f.name))
    ?? files.find((f) => f.primary)
    ?? files[0];
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
