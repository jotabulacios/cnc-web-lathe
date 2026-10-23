import * as THREE from 'three';
import type { ToolDefinition } from './tools.ts';
import { TOOL_ASSEMBLIES, type DisplayAssembly } from './toolAssemblies.ts';

/** Local axes match the stock projection: x=Z, y=R, z=tangential. Units mm. */
export function createToolObject(tool: ToolDefinition, assembly: DisplayAssembly = TOOL_ASSEMBLIES[tool.id]) {
  const group = new THREE.Group();
  const resources: Array<THREE.BufferGeometry | THREE.Material> = [];
  for (const part of assembly.parts) {
    let geometry: THREE.BufferGeometry;
    if (part.kind === 'prism') {
      const shape = new THREE.Shape();
      part.outline.forEach(([z, r], i) => { if (i === 0) shape.moveTo(z, r); else shape.lineTo(z, r); });
      shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape, { depth: part.thicknessMm, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, part.tangentialCenterMm - part.thicknessMm / 2);
    } else {
      geometry = new THREE.CylinderGeometry(part.diameterMm / 2, part.diameterMm / 2, part.lengthMm, 24);
      geometry.rotateZ(-Math.PI / 2);
      geometry.translate(part.zStartMm + part.lengthMm / 2, part.centerRadiusMm, part.tangentialCenterMm);
    }
    // Dark holder, saturated insert: the cutting part stands out against the stock.
    const material = new THREE.MeshStandardMaterial({
      color: part.role === 'insert' ? tool.geometry.color : part.role === 'clamp' ? '#36404a' : '#4a5561',
      roughness: part.role === 'insert' ? 0.35 : 0.45, metalness: part.role === 'insert' ? 0.2 : 0.6,
    });
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 30);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#141a20', transparent: true, opacity: 0.6 });
    resources.push(geometry, material, edgeGeometry, edgeMaterial);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.role;
    mesh.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
    group.add(mesh);
  }
  const tipGeometry = new THREE.SphereGeometry(0.4, 12, 8);
  const tipMaterial = new THREE.MeshBasicMaterial({ color: '#fff5df' });
  const tip = new THREE.Mesh(tipGeometry, tipMaterial);
  tip.name = 'reference-marker';
  group.add(tip);
  resources.push(tipGeometry, tipMaterial);
  group.userData.assemblyId = tool.id;
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    for (const resource of resources) resource.dispose();
    group.removeFromParent();
  } };
}
