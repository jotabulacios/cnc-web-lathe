import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ToolId } from './contract';
import { TOOL_CATALOGUE } from './tools';
import { createToolObject } from './toolObject';
import type { DisplayAssembly } from './toolAssemblies';
import { orthographicFrame } from './orthographic';

export type ToolPreviewScene = ReturnType<typeof createToolPreviewScene>;
export type PreviewView = 'iso' | 'front' | 'top';
// Three axes: x=Z, y=R, z=tangential. Front looks along −tangential, like the SVG silhouette.
const directions: Record<PreviewView, THREE.Vector3> = {
  iso: new THREE.Vector3(0.75, 0.55, 1).normalize(),
  front: new THREE.Vector3(0, 0, 1),
  top: new THREE.Vector3(0, 1, 1e-4).normalize(),
};

/** Isolated orthographic viewer for one assembly in mm. No stock, no machine position. */
export function createToolPreviewScene(host: HTMLElement, onFailure: (message: string) => void, onCustomView: () => void = () => {}) {
  const resources: (() => void)[] = [];
  let disposed = false;
  let failed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of resources.toReversed()) cleanup();
  };
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    resources.push(() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
    renderer.setClearColor('#e6eaee');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.dataset.camera = 'orthographic';
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }).texture;
    scene.environment = environment;
    resources.push(() => { environment.dispose(); pmrem.dispose(); });
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    resources.push(() => controls.dispose());
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8f2, 0.5);
    fill.position.set(-3, -1, -2);
    scene.add(fill);
    // 10 mm axes at the ideal corner: red Z+, green R+, blue tangential+.
    const axes = new THREE.AxesHelper(10);
    scene.add(axes);
    resources.push(() => axes.dispose());

    let tool: ReturnType<typeof createToolObject> | null = null;
    let toolKey = '';
    let view: PreviewView = 'iso';
    let sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    let zoom = 1;
    resources.push(() => tool?.dispose());

    function render() {
      if (disposed || failed) return;
      try { renderer.render(scene, camera); }
      catch { failed = true; onFailure('No se pudo dibujar la vista previa 3D. Las medidas y la silueta siguen disponibles.'); }
    }
    function frame() {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const { halfWidth, halfHeight } = orthographicFrame(sphere.radius, width / height);
      camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.zoom = zoom;
      camera.near = 0.01;
      camera.far = sphere.radius * 8;
      camera.updateProjectionMatrix();
    }
    function look(next: PreviewView) {
      view = next;
      zoom = 1;
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(directions[view], sphere.radius * 4);
      camera.up.set(0, 1, 0);
      controls.update();
      frame();
      renderer.domElement.dataset.view = view;
      render();
    }
    controls.addEventListener('change', render);
    resources.push(() => controls.removeEventListener('change', render));
    // A user drag leaves the named views; mark it so the buttons do not go stale.
    const custom = () => { renderer.domElement.dataset.view = 'custom'; onCustomView(); };
    controls.addEventListener('start', custom);
    resources.push(() => controls.removeEventListener('start', custom));
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (disposed || failed) return;
      failed = true;
      onFailure('Se perdió el contexto gráfico de la vista previa. Podés reintentar.');
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    resources.push(() => renderer.domElement.removeEventListener('webglcontextlost', contextLost));
    function resize() {
      if (disposed) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
      frame();
      render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resources.push(() => observer.disconnect());
    resize();

    return {
      dispose,
      setTool(id: ToolId, assembly?: DisplayAssembly) {
        if (disposed || failed) return false;
        const key = `${id}|${assembly?.dimensions ?? ''}`;
        if (toolKey !== key) {
          tool?.dispose();
          const definition = TOOL_CATALOGUE[id];
          tool = createToolObject(definition, assembly);
          toolKey = key;
          scene.add(tool.group);
          tool.group.updateMatrixWorld(true);
          const body = new THREE.Box3();
          for (const part of tool.group.children) if (part.name !== 'reference-marker') body.expandByObject(part);
          // Frame body, ideal corner and the 10 mm axis tips so the reference never leaves the view.
          const framed = body.clone();
          for (const p of [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]] as const) framed.expandByPoint(new THREE.Vector3(...p));
          sphere = framed.getBoundingSphere(new THREE.Sphere());
          const canvas = renderer.domElement;
          canvas.dataset.toolId = id;
          canvas.dataset.toolBodyBounds = JSON.stringify([body.min.x, body.max.x, body.min.y, body.max.y, body.min.z, body.max.z]);
          canvas.setAttribute('aria-label', `Vista previa 3D aislada de T${definition.station} · ${definition.name}`);
          look(view);
        }
        return !failed;
      },
      view: look,
      rotate(angle: number) {
        renderer.domElement.dataset.view = 'custom';
        camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target);
        controls.update();
        render();
      },
      zoom(factor: number) {
        zoom = THREE.MathUtils.clamp(zoom * factor, 0.5, 8);
        frame();
        render();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
