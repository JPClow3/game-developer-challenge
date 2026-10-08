// Offline art direction. This module is used only by render-harbor.mjs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(1800, 900);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbce7ed, 0x54626a, 2.2));
const sun = new THREE.DirectionalLight(0xffe5b5, 3.2);
sun.position.set(-3, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.1, far: 30 });
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.0001;
sun.shadow.radius = 3;
scene.add(sun);

const harbor = new THREE.Group();
scene.add(harbor);
const loader = new GLTFLoader();
async function place(name, extent, x, y, z, rotation = 0) {
  const model = (await loader.loadAsync(`/assets/pirate-kit/${name}.glb`)).scene;
  let bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(extent / Math.max(size.x, size.z));
  model.rotation.y = rotation;
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(x - center.x, y - bounds.min.y, z - center.z);
  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  harbor.add(model);
  return model;
}

// A quiet departure scene: one moored ship, a working dock, and a small shore.
await place('patch-sand', 3.1, 1.9, -0.02, -0.75, 0.1);
await place('structure-platform-dock', 1.5, 0.6, 0.02, -0.1, Math.PI / 2);
await place('ship-pirate-medium', 3.8, -1.1, -0.2, 0.8, -0.2);
await place('palm-detailed-bend', 1.4, 2.15, 0.16, -1.1, -0.7);
await place('rocks-sand-a', 1.1, 2.65, 0.08, -0.15, 0.6);
await place('barrel', 0.3, 0.65, 0.8, -0.4);
await place('barrel', 0.26, 0.95, 0.8, -0.25);

const water = new THREE.Mesh(new THREE.CircleGeometry(4.7, 96), new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { color: { value: new THREE.Color('#247783') } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform vec3 color; varying vec2 vUv; void main(){float d=length(vUv-.5)*2.;float a=(1.-smoothstep(.35,1.,d))*.65;gl_FragColor=vec4(color,a);}',
}));
water.rotation.x = -Math.PI / 2;
water.position.set(0.5, -0.06, 0.1);
water.scale.y = 0.78;
scene.add(water);

const shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -0.055;
shadow.receiveShadow = true;
scene.add(shadow);

// Thin wake rings tie the model into the sea without animated decoration.
for (const [x, z, width, length] of [[-1.1, 0.7, 1.5, 3.55], [-1.1, 0.7, 1.9, 3.9]]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 80), new THREE.MeshBasicMaterial({ color: 0x9bccc4, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, -0.045, z);
  ring.scale.set(width / 2, length / 2, 1);
  scene.add(ring);
}

const bounds = new THREE.Box3().setFromObject(harbor);
const target = bounds.getCenter(new THREE.Vector3());
const camera = new THREE.OrthographicCamera(-5, 5, 2.5, -2.5, 0.1, 100);
camera.position.copy(target).add(new THREE.Vector3(-7, 6.5, 10));
camera.lookAt(target);
camera.updateMatrixWorld();
// Fit the authored objects with a little breathing room for the shoreline.
const projected = [];
for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
  projected.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
}
const minX = Math.min(...projected.map((p) => p.x)), maxX = Math.max(...projected.map((p) => p.x));
const minY = Math.min(...projected.map((p) => p.y)), maxY = Math.max(...projected.map((p) => p.y));
const halfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / 4) * 1.08;
const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
camera.left = centerX - halfHeight * 2;
camera.right = centerX + halfHeight * 2;
camera.bottom = centerY - halfHeight;
camera.top = centerY + halfHeight;
camera.updateProjectionMatrix();
renderer.render(scene, camera);
window.harborReady = true;
