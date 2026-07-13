import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface SpatialObjectDescriptor {
  kind: "model-3d";
  primitive?: "suzanne" | "cube" | "sphere";
  url?: string | null;
  scale?: number;
}

export interface CalibratedSpace {
  finger: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  landmarks: Array<{ x: number; y: number; z?: number }>;
  intrinsics: { fovDegrees: number };
  depthMeters: number;
}

export interface DepthField {
  width: number;
  height: number;
  values: number[];
}

export interface RgbdPointCloud {
  kind: "rgbd-point-cloud";
  points: number[];
  colors: number[];
  count: number;
}

function monkeyGeometry(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x55e6b5, roughness: .28, metalness: .18 });
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
  };
  add(new THREE.SphereGeometry(.5, 28, 20), 0, 0, 0, 1, 1.12, .9);
  add(new THREE.SphereGeometry(.32, 22, 16), 0, -.23, .38, 1.08, .68, .7);
  add(new THREE.SphereGeometry(.25, 20, 14), -.48, .02, 0, .72, 1.15, .55);
  add(new THREE.SphereGeometry(.25, 20, 14), .48, .02, 0, .72, 1.15, .55);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xf0fff8, roughness: .2 });
  for (const x of [-.19, .19]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), eyeMaterial);
    eye.position.set(x, .16, .43);
    group.add(eye);
  }
  return group;
}

export class SpatialSceneRenderer {
  private canvas = document.createElement("canvas");
  private renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, .01, 20);
  private object: THREE.Object3D = monkeyGeometry();
  private descriptorKey = "suzanne";
  private loader = new GLTFLoader();
  private cloud: THREE.Points | null = null;

  constructor() {
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x203040, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-2, 3, 2);
    this.scene.add(key, this.object);
  }

  setPointCloud(cloud: RgbdPointCloud | null): void {
    if (this.cloud) {
      this.scene.remove(this.cloud);
      this.cloud.geometry.dispose();
      (this.cloud.material as THREE.Material).dispose();
      this.cloud = null;
    }
    if (!cloud?.points?.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(cloud.points, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(cloud.colors, 3));
    const material = new THREE.PointsMaterial({ size: .012, vertexColors: true, transparent: true, opacity: .32, depthWrite: false });
    this.cloud = new THREE.Points(geometry, material);
    this.scene.add(this.cloud);
  }

  private async setObject(desc: SpatialObjectDescriptor): Promise<void> {
    const key = desc.url || desc.primitive || "suzanne";
    if (key === this.descriptorKey) return;
    let next: THREE.Object3D;
    if (desc.url) next = (await this.loader.loadAsync(desc.url)).scene;
    else if (desc.primitive === "cube") next = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x55e6b5 }));
    else if (desc.primitive === "sphere") next = new THREE.Mesh(new THREE.SphereGeometry(.6, 32, 20), new THREE.MeshStandardMaterial({ color: 0x55e6b5 }));
    else next = monkeyGeometry();
    this.scene.remove(this.object);
    this.object = next;
    this.scene.add(next);
    this.descriptorKey = key;
  }

  async render(frame: ImageBitmap, space: CalibratedSpace, desc: SpatialObjectDescriptor, depth?: DepthField | null): Promise<ImageBitmap> {
    await this.setObject(desc);
    const width = frame.width;
    const height = frame.height;
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    this.camera.aspect = width / height;
    this.camera.fov = space.intrinsics?.fovDegrees || 60;
    this.camera.updateProjectionMatrix();
    // Three's camera looks down -Z; calibrated camera space uses +Z forward.
    this.object.position.set(space.finger.x, space.finger.y, -space.finger.z);
    const scale = Math.max(.025, Math.min(.3, .09 * (desc.scale ?? 1)));
    this.object.scale.setScalar(scale);
    this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(space.direction.x, space.direction.y, -space.direction.z).normalize());
    this.object.rotateY(performance.now() * .00035);
    this.renderer.render(this.scene, this.camera);

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d", { willReadFrequently: !!depth })!;
    ctx.drawImage(frame, 0, 0);
    ctx.drawImage(this.canvas, 0, 0, width, height);
    if (depth?.values?.length) {
      // Depth-aware hand occlusion: restore camera pixels estimated closer than
      // the object's anchor. This is approximate for monocular normalized depth.
      const original = document.createElement("canvas");
      original.width = width; original.height = height;
      original.getContext("2d")!.drawImage(frame, 0, 0);
      const mask = document.createElement("canvas");
      mask.width = width; mask.height = height;
      const mctx = mask.getContext("2d")!;
      const image = mctx.createImageData(depth.width, depth.height);
      const anchor = 1 - Math.max(0, Math.min(1, (space.depthMeters - .2) / 2.3));
      for (let i = 0; i < depth.values.length; i++) image.data[i * 4 + 3] = depth.values[i] / 255 > anchor + .04 ? 255 : 0;
      mctx.putImageData(image, 0, 0);
      const foreground = document.createElement("canvas");
      foreground.width = width; foreground.height = height;
      const fctx = foreground.getContext("2d")!;
      fctx.drawImage(original, 0, 0);
      fctx.globalCompositeOperation = "destination-in";
      fctx.drawImage(mask, 0, 0, width, height);
      ctx.drawImage(foreground, 0, 0);
    }
    return createImageBitmap(out);
  }

  dispose(): void {
    this.renderer.dispose();
    if (this.cloud) {
      this.cloud.geometry.dispose();
      (this.cloud.material as THREE.Material).dispose();
    }
  }
}
