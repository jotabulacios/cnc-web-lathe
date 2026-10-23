import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toolPose } from './revolution';
import { profileMesh, type MeshSpans } from './sectionMesh';
import type { Position } from './contract';
import { getToolDefinition } from './tools';
import { orthographicFrame } from './orthographic';
import { createToolObject } from './toolObject';
import type { DisplayAssembly } from './toolAssemblies';
import { jawZone, type ChuckJaws } from './chuck';

type Stock = { lengthMm: number; diameterMm: number };
export type ThreeScene = ReturnType<typeof createThreeScene>;
export type Projection = 'perspective' | 'orthographic';

/** No controller state: only project the already confirmed material profile. */
export function createThreeScene(host: HTMLElement, stock: Stock, onFailure: (message: string) => void) {
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
    renderer.setClearColor('#dde3e8');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('aria-label', 'Pieza de torno en 3D');
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // Generated studio environment (no external assets) so steel reads as metal.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }).texture;
    scene.environment = environment;
    resources.push(() => { environment.dispose(); pmrem.dispose(); });
    const perspective = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
    perspective.position.set(0.9, 0.75, 1.65);
    // Same pose and framing sphere; only the projection differs. Zoom scales the frustum.
    const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
    let aspect = 1;
    const controls = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(camera, renderer.domElement);
    resources.push(() => controls.dispose());
    controls.enableDamping = false;
    controls.enablePan = false;
    // Buttons provide zoom without trapping page scrolling on the canvas.
    controls.enableZoom = false;
    controls.minDistance = 0.8;
    controls.maxDistance = 5;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8f2, 0.5);
    fill.position.set(-2, 0.5, -1);
    scene.add(fill);
    const material = new THREE.MeshStandardMaterial({ color: 0xc9d1d8, roughness: 0.3, metalness: 0.75 });
    // Cut-plane caps of the section view: matte, distinct from turned surfaces.
    const sectionMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a06a, roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [material, sectionMaterial]);
    scene.add(mesh);
    // Feature edges (shoulders, faces, section outline); smooth facets stay unlined.
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x2f3c49, transparent: true, opacity: 0.55 });
    const edges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMaterial);
    mesh.add(edges);
    resources.push(() => { mesh.geometry.dispose(); edges.geometry.dispose(); edgeMaterial.dispose(); material.dispose(); sectionMaterial.dispose(); });
    // Nominal chuck jaws: three boxes at 120° over the gripped stock (obstacle only).
    const jawGroup = new THREE.Group();
    jawGroup.name = 'chuck-jaws';
    scene.add(jawGroup);
    const jawMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8995, roughness: 0.55, metalness: 0.5 });
    resources.push(() => { for (const child of jawGroup.children) (child as THREE.Mesh).geometry.dispose(); jawMaterial.dispose(); });
    let toolObject: ReturnType<typeof createToolObject> | null = null;
    let activeToolId = '';
    const scaleMm = Math.max(stock.lengthMm, stock.diameterMm);
    resources.push(() => toolObject?.dispose());
    let framing: THREE.Sphere | null = null;
    // Presentation-only travel override (block animation); null = resolved block tip.
    let resolvedTool: Position | null = null;
    let toolOverride: Position | null = null;
    function placeTool() {
      const position = toolOverride ?? resolvedTool;
      if (!toolObject || !position) return;
      const pose = toolPose(position, stock);
      if (pose.inMaterialFrame) toolObject.group.position.set(pose.x, pose.y, pose.z);
      toolObject.group.visible = pose.inMaterialFrame;
      toolObject.group.updateMatrixWorld(true);
    }
    function fitCamera(sphere: THREE.Sphere) {
      const angle = Math.atan(Math.tan(perspective.fov * Math.PI / 360) * Math.min(1, aspect));
      const distance = sphere.radius / Math.sin(angle) * 1.12;
      const direction = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(direction, distance);
      for (const c of [perspective, orthographic]) {
        c.near = Math.max(sphere.radius / 1000, 1e-6);
        c.far = distance * 4 + sphere.radius * 30;
      }
      const { halfWidth, halfHeight } = orthographicFrame(sphere.radius, aspect);
      orthographic.left = -halfWidth; orthographic.right = halfWidth;
      orthographic.top = halfHeight; orthographic.bottom = -halfHeight;
      controls.minDistance = sphere.radius * 1.5;
      controls.maxDistance = distance * 4;
      perspective.updateProjectionMatrix();
      orthographic.updateProjectionMatrix();
      controls.update();
    }
    function render() {
      if (disposed || failed) return;
      const direction = camera.position.clone().sub(controls.target).normalize();
      renderer.domElement.dataset.cameraDirection = direction.toArray().map(v => Math.round(v * 1000) / 1000).join(',');
      try { renderer.render(scene, camera); }
      catch { failed = true; onFailure('No se pudo dibujar la vista 3D. Podés continuar en 2D.'); }
    }
    controls.addEventListener('change', render);
    resources.push(() => controls.removeEventListener('change', render));
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (disposed || failed) return;
      failed = true;
      onFailure('Se perdió el contexto gráfico. Volvé a 2D o reintentá la vista 3D.');
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    resources.push(() => renderer.domElement.removeEventListener('webglcontextlost', contextLost));
    function resize() {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      aspect = width / height;
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
      if (framing) fitCamera(framing);
      render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resources.push(() => observer.disconnect());
    window.addEventListener('resize', resize);
    resources.push(() => window.removeEventListener('resize', resize));
    resize();
    return {
      dispose,
      /** `section` is presentation only: the tool stays whole and the reported volume stays physical. */
      update(spans: MeshSpans, completedBlocks: number, position: Position, toolId?: string, section = false, assembly?: DisplayAssembly) {
        if (disposed || failed) return;
        const toolDef = getToolDefinition(toolId);
        const toolKey = `${toolDef.id}|${assembly?.dimensions ?? ''}`;
        if (activeToolId !== toolKey) {
          toolObject?.dispose();
          toolObject = createToolObject(toolDef, assembly);
          activeToolId = toolKey;
          scene.add(toolObject.group);
          toolObject.group.scale.setScalar(1 / scaleMm);
        }
        const tool = toolObject!.group;
        const data = profileMesh(spans, stock, section);
        const sectionStart = data.sectionIndexStart ?? data.indices.length;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        geometry.addGroup(0, sectionStart, 0);
        if (sectionStart < data.indices.length) geometry.addGroup(sectionStart, data.indices.length - sectionStart, 1);
        geometry.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        edges.geometry.dispose();
        edges.geometry = new THREE.EdgesGeometry(geometry, 30);
        const pose = toolPose(position, stock);
        resolvedTool = position;
        placeTool();
        mesh.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(mesh);
        if (tool.visible) bounds.expandByObject(tool);
        if (jawGroup.children.length) bounds.expandByObject(jawGroup);
        if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        sphere.radius = Math.max(sphere.radius, 0.5);
        if (!framing || framing.center.distanceTo(sphere.center) + sphere.radius > framing.radius * 1.01) {
          framing = framing ? framing.clone().union(sphere) : sphere;
          fitCamera(framing);
        }
        render();
        if (failed) return false;
        renderer.domElement.dataset.animating = String(toolOverride !== null);
        renderer.domElement.dataset.profileBlocks = String(completedBlocks);
        renderer.domElement.dataset.profileVolume = String(data.volumeMm3);
        renderer.domElement.dataset.profileSpans = String(spans.length);
        renderer.domElement.dataset.section = String(section);
        renderer.domElement.dataset.sectionTriangles = String((data.indices.length - sectionStart) / 3);
        renderer.domElement.dataset.toolX = String(position.rMm * 2);
        renderer.domElement.dataset.toolZ = String(position.zMm);
        renderer.domElement.dataset.toolVisible = String(pose.inMaterialFrame);
        renderer.domElement.dataset.toolId = toolDef.id;
        renderer.domElement.dataset.toolAssembly = toolDef.id;
        renderer.domElement.dataset.toolScaleMm = String(scaleMm);
        const bodyBounds = new THREE.Box3();
        for (const part of tool.children) if (part.name !== 'reference-marker') bodyBounds.expandByObject(part);
        renderer.domElement.dataset.camera = camera === orthographic ? 'orthographic' : 'perspective';
        renderer.domElement.dataset.toolBodyBounds = JSON.stringify([
          bodyBounds.min.x, bodyBounds.max.x, bodyBounds.min.y, bodyBounds.max.y,
        ]);
        renderer.domElement.setAttribute('aria-description', `Punta ideal en X diámetro ${position.rMm * 2} y Z ${position.zMm} mm.`);
        return true;
      },
      /** Rebuild the nominal jaws; they also hold a short seat inside the chuck (as in 2D). */
      setJaws(jaws: ChuckJaws) {
        if (disposed || failed) return;
        for (const child of [...jawGroup.children]) { (child as THREE.Mesh).geometry.dispose(); jawGroup.remove(child); }
        const zone = jawZone(stock, jaws);
        const seat = Math.max(stock.lengthMm * 0.05, 3);
        const length = (zone.faceZ - zone.chuckZ + seat) / scaleMm;
        const height = jaws.jawHeightMm / scaleMm;
        const width = Math.max(stock.diameterMm * 0.35, 6) / scaleMm;
        const centerX = ((zone.chuckZ - seat + zone.faceZ) / 2 + stock.lengthMm / 2) / scaleMm;
        const radial = (zone.innerR + jaws.jawHeightMm / 2) / scaleMm;
        for (let i = 0; i < 3; i++) {
          const angle = Math.PI / 2 + i * 2 * Math.PI / 3;
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), jawMaterial);
          jaw.position.set(centerX, radial * Math.sin(angle), radial * Math.cos(angle));
          jaw.rotation.x = -(angle - Math.PI / 2);
          jawGroup.add(jaw);
        }
        renderer.domElement.dataset.jawGripMm = String(jaws.gripLengthMm);
        renderer.domElement.dataset.jawHeightMm = String(jaws.jawHeightMm);
        render();
      },
      /** Move only the tool (no mesh rebuild); `null` returns it to the resolved block tip. */
      setToolPosition(position: Position | null) {
        if (disposed || failed) return;
        toolOverride = position;
        placeTool();
        renderer.domElement.dataset.animating = String(position !== null);
        render();
      },
      /** Switch projection keeping the current pose; the orthographic zoom restarts at 1. */
      setProjection(projection: Projection) {
        const next = projection === 'orthographic' ? orthographic : perspective;
        if (next === camera || disposed) return;
        next.position.copy(camera.position);
        next.quaternion.copy(camera.quaternion);
        camera = next;
        orthographic.zoom = 1;
        controls.object = camera;
        if (framing) fitCamera(framing);
        renderer.domElement.dataset.camera = projection;
        render();
      },
      /** Look along −tangential: screen x = Z, screen y = R, as in the 2D view. */
      front() {
        const distance = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(0, 0, distance));
        controls.update();
        render();
      },
      reset() {
        camera.position.set(0.9, 0.75, 1.65);
        controls.target.set(0, 0, 0);
        orthographic.zoom = 1;
        orthographic.updateProjectionMatrix();
        if (framing) fitCamera(framing);
        controls.update();
        render();
      },
      rotate(angle: number) {
        camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target);
        controls.update();
        render();
      },
      zoom(factor: number) {
        if (camera === orthographic) {
          orthographic.zoom = THREE.MathUtils.clamp(orthographic.zoom / factor, 0.25, 6);
          orthographic.updateProjectionMatrix();
          renderer.domElement.dataset.orthoZoom = String(orthographic.zoom);
          render();
          return;
        }
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset);
        controls.update();
        render();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
