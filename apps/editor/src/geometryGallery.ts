import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import catalogData from "./geometryGallery.json";
import {
  assetDefinitions,
  ResourceRegistry,
  type MeshKey,
} from "./rendering/registry";
import {
  createMaterialSet,
  rgbFromHex,
  setMaterialStateForMaterial,
  type MaterialSet,
  type MaterialState,
} from "./components/views/highway/materials";
import {
  primitiveRolesForModel,
  type PrimitiveMaterialRole,
} from "./components/views/highway/instances";
import {
  farBoardZ,
  laneColors,
  nearBoardZ,
} from "./components/views/highway/constants";
import "./geometryGallery.css";

type GalleryVariantState =
  "tinted" | "grayscale" | "ghostTinted" | "ghostGrayscale";

interface GalleryVariant {
  name: string;
  state: GalleryVariantState;
  laneColorIndex: number;
}

interface AssetSample {
  meshKey: string;
  row: number;
  use: string;
  variants: GalleryVariant[];
}

interface GalleryLabel {
  title: string;
  detail: string;
}

interface CatalogMaterial {
  type: "basic" | "line" | "highway";
  color?: string;
  opacity?: number;
  depthWrite?: boolean;
  key?: keyof MaterialSet;
  state?: Record<string, number | boolean | string | number[]>;
}

interface ProceduralSample {
  id: string;
  shape: "box" | "plane" | "line" | "lineLoop";
  dimensions?: Array<number | string>;
  points?: [number, number, number][];
  material: CatalogMaterial;
  position?: [number, number, number];
  rotation?: [number, number, number];
  grid: [number, number];
  label: GalleryLabel | null;
}

interface GalleryCatalog {
  layout: {
    columns: number;
    columnSpacing: number;
    rowSpacing: number;
  };
  assets: AssetSample[];
  procedural: ProceduralSample[];
}

const catalog = catalogData as unknown as GalleryCatalog;
const viewport = document.querySelector<HTMLDivElement>("#viewport")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const errorPanel = document.querySelector<HTMLPreElement>("#error")!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);
scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x334155, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-8, 14, 10);
scene.add(keyLight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.append(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "label-layer";
labelRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.append(labelRenderer.domElement);

const camera = new THREE.PerspectiveCamera(
  25,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  1000,
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = true;
controls.target.set(0, 0, 0);

const galleryObjects: THREE.Object3D[] = [];
let registry: ResourceRegistry | undefined;
let materialSet: MaterialSet | undefined;
let animationFrame = 0;

function gridPosition(row: number, column: number): THREE.Vector3 {
  return new THREE.Vector3(
    (column - (catalog.layout.columns - 1) / 2) * catalog.layout.columnSpacing,
    0,
    row * catalog.layout.rowSpacing,
  );
}

function addLabel(object: THREE.Object3D, label: GalleryLabel): void {
  const element = document.createElement("div");
  element.className = "sample-label";
  const title = document.createElement("strong");
  title.textContent = label.title;
  element.append(title, document.createTextNode(label.detail));

  const labelObject = new CSS2DObject(element);
  labelObject.position.set(0, -1.5, 0);
  object.add(labelObject);
}

function placeSample(
  object: THREE.Object3D,
  row: number,
  column: number,
  label?: GalleryLabel,
): void {
  object.position.copy(gridPosition(row, column));
  if (label) {
    addLabel(object, label);
  }
  scene.add(object);
  galleryObjects.push(object);
}

function variantMaterial(
  meshKey: MeshKey,
  state: GalleryVariantState,
  role: PrimitiveMaterialRole,
): THREE.Material {
  const tintEnabled = state === "tinted" || state === "ghostTinted";
  const tinted = role === "tinted" && tintEnabled;
  const ghost = state.startsWith("ghost");
  const materials = materialSet!;

  if (meshKey === "fret") {
    return (tinted ? materials.fretTinted : materials.fretGrayscale).clone();
  }

  const variants =
    meshKey === "roundNote"
      ? materials
      : materials.drum[meshKey === "kickNote" ? "kick" : "cymbal"];
  if (ghost) {
    return (
      tinted ? variants.noteGhostTinted : variants.noteGhostGrayscale
    ).clone();
  }
  return (tinted ? variants.noteTinted : variants.noteGrayscale).clone();
}

function createAssetSample(sample: AssetSample): void {
  const meshKey = sample.meshKey as MeshKey;
  const resource = registry!.getMesh(meshKey);
  const template = resource.value;
  const definition = assetDefinitions.meshes[meshKey];
  if (!template || !definition) {
    throw new Error(`Gallery asset "${sample.meshKey}" was not loaded.`);
  }

  const roles = primitiveRolesForModel(template, definition);
  for (const [column, variant] of sample.variants.entries()) {
    const model = template.clone(true);
    let primitiveIndex = 0;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const slots = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const assigned = slots.map(() => {
        const role = roles[primitiveIndex++] ?? "neutral";
        const material = variantMaterial(meshKey, variant.state, role);
        const laneColor = rgbFromHex(
          laneColors[variant.laneColorIndex % laneColors.length],
        );
        setMaterialStateForMaterial(material, {
          baseColor: laneColor,
          emissionColor: role === "neutral" ? [1, 1, 1] : laneColor,
          alpha: variant.state.startsWith("ghost") ? 0.38 : 1,
          ghost: variant.state.startsWith("ghost"),
          tint:
            role === "tinted" &&
            (variant.state === "tinted" || variant.state === "ghostTinted"),
        });
        return material;
      });
      child.material = assigned.length === 1 ? assigned[0] : assigned;
    });

    const group = new THREE.Group();
    group.add(model);
    placeSample(group, sample.row, column);
  }
}

function geometryArguments(sample: ProceduralSample): number[] {
  const boardDepth = nearBoardZ - farBoardZ;
  return (sample.dimensions ?? []).map((value) =>
    value === "$boardDepth" ? boardDepth : Number(value),
  );
}

function createProceduralGeometry(
  sample: ProceduralSample,
): THREE.BufferGeometry {
  if (sample.shape === "box") {
    return new THREE.BoxGeometry(
      ...(geometryArguments(sample) as [number, number, number]),
    );
  }
  if (sample.shape === "plane") {
    return new THREE.PlaneGeometry(
      ...(geometryArguments(sample) as [number, number]),
    );
  }
  if (!sample.points) {
    throw new Error(`Procedural sample "${sample.id}" needs points.`);
  }
  const points = sample.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createCatalogMaterial(sample: ProceduralSample): THREE.Material {
  const definition = sample.material;
  if (definition.type === "highway") {
    const key = definition.key;
    if (!key || !materialSet || !(key in materialSet)) {
      throw new Error(
        `Procedural sample "${sample.id}" has an invalid highway material.`,
      );
    }
    const material = materialSet[key as keyof MaterialSet];
    if (!(material instanceof THREE.Material)) {
      throw new Error(
        `Procedural sample "${sample.id}" references a non-material resource.`,
      );
    }
    const state = Object.fromEntries(
      Object.entries(definition.state ?? {}).map(([name, value]) => [
        name,
        typeof value === "string" && value.startsWith("laneColor:")
          ? rgbFromHex(
              laneColors[Number(value.split(":")[1]) % laneColors.length],
            )
          : value,
      ]),
    ) as Partial<MaterialState>;
    const instance = material.clone();
    setMaterialStateForMaterial(instance, state);
    return instance;
  }

  const color = new THREE.Color(definition.color ?? "#ffffff");
  if (definition.type === "line") return new THREE.LineBasicMaterial({ color });
  const opacity = definition.opacity ?? 1;
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: definition.depthWrite ?? opacity === 1,
  });
}

function createProceduralSample(sample: ProceduralSample): void {
  const geometry = createProceduralGeometry(sample);
  const material = createCatalogMaterial(sample);
  const object =
    sample.shape === "line"
      ? new THREE.Line(geometry, material as THREE.LineBasicMaterial)
      : sample.shape === "lineLoop"
        ? new THREE.LineLoop(geometry, material as THREE.LineBasicMaterial)
        : new THREE.Mesh(geometry, material);
  if (sample.position) object.position.fromArray(sample.position);
  if (sample.rotation) {
    const [x, y, z] = sample.rotation.map(THREE.MathUtils.degToRad) as [
      number,
      number,
      number,
    ];
    object.rotation.set(x, y, z);
  }
  placeSample(object, sample.grid[0], sample.grid[1]);
}

function frameGallery(): void {
  const lastRow = Math.max(
    ...catalog.assets.map((sample) => sample.row),
    ...catalog.procedural.map((sample) => sample.grid[0]),
  );
  const centerZ = (lastRow * catalog.layout.rowSpacing) / 2;
  controls.target.set(0, 0, centerZ);

  const width =
    catalog.layout.columnSpacing * (catalog.layout.columns - 1) + 10;
  const height = (lastRow + 1) * catalog.layout.rowSpacing + 10;
  const distance = Math.max(
    width / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))),
    height * 0.9,
  );
  camera.position.set(0, distance * 0.65, centerZ + distance * 0.8);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

function resize(): void {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function animate(): void {
  animationFrame = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

async function start(): Promise<void> {
  try {
    registry = new ResourceRegistry();
    await registry.loadResources();
    materialSet = createMaterialSet(registry);
    catalog.assets.forEach(createAssetSample);
    catalog.procedural.forEach(createProceduralSample);
    frameGallery();
    status.textContent = `${catalog.assets.length} mesh entries · ${catalog.procedural.length} procedural samples`;
    animate();
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    console.error("Highway geometry gallery failed to load", error);
    status.textContent = "Gallery failed to load";
    errorPanel.hidden = false;
    errorPanel.textContent = message;
  }
}

function dispose(): void {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener("resize", resize);
  controls.dispose();
  galleryObjects.forEach((object) => {
    object.traverse((child) => {
      if (!(
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.LineLoop
      )) {
        return;
      }
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    });
  });
  materialSet?.destroy();
  registry?.dispose();
  labelRenderer.domElement.remove();
  renderer.dispose();
}

window.addEventListener("resize", resize);
window.addEventListener("pagehide", dispose, { once: true });
void start();
