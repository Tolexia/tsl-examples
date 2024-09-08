import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, controls;
let particleSystem, particleUniforms, particleGeometry;
const PARTICLE_COUNT = 1000;
const ATTRACTOR_COUNT = 3;

const attractors = [];
const attractorHelpers = [];

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
}

// Vertex Shader
const vertexShader = `
  attribute vec3 velocity;
  attribute float particleMass;
  
  uniform float scale;
  
  varying vec3 vVelocity;
  varying float vParticleMass;
  
  void main() {
    vVelocity = velocity;
    vParticleMass = particleMass;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = scale * particleMass * (0.35 / length(mvPosition.xyz));
  }
`;

// Fragment Shader
const fragmentShader = `
  uniform vec3 colorA;
  uniform vec3 colorB;
  uniform float maxSpeed;
  
  varying vec3 vVelocity;
  varying float vParticleMass;
  
  void main() {
    float speed = length(vVelocity);
    float colorMix = smoothstep(0.0, 0.125, speed / maxSpeed);
    vec3 color = mix(colorA, colorB, colorMix);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const uniforms = {
  attractorMass: { value: 1e7 },
  particleGlobalMass: { value: 1e4 },
  timeScale: { value: 0.01 },
  spinningStrength: { value: 4 },
  maxSpeed: { value: 2 },
  gravityConstant: { value: 6.67e-11 },
  velocityDamping: { value: 0.7 },
  scale: { value: 0.008 },
  boundHalfExtent: { value: 8 },
  colorA: { value: new THREE.Color('#5900ff') },
  colorB: { value: new THREE.Color('#ffa575') },
  attractorPositions: { value: [] },
  attractorRotationAxes: { value: [] }
};

function init() {
  camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(3, 5, 8);

  scene = new THREE.Scene();

  // Ambient light
  const ambientLight = new THREE.AmbientLight('#ffffff', 0.5);
  scene.add(ambientLight);

  // Directional light
  const directionalLight = new THREE.DirectionalLight('#ffffff', 1.5);
  directionalLight.position.set(4, 2, 0);
  scene.add(directionalLight);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor('#000000');
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  window.addEventListener('resize', onWindowResize);

  // Attractors
  setupAttractors();

  // Particles
  createParticles();

  // GUI
  setupGUI();
}
const attractorPositions = [
    new THREE.Vector3(-0.5, 0.5, 0),
    new THREE.Vector3(0.5, 0, -0.5),
    new THREE.Vector3(0, -0.5, 0.5)
];
const attractorRotationAxes = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, -0.5).normalize()
];

function setupAttractors() {

    uniforms.attractorPositions.value = attractorPositions;
    uniforms.attractorRotationAxes.value = attractorRotationAxes;

    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const SphereMaterial = new THREE.PointsMaterial({color: 0x0055DD, size: 0.025})

    for (let i = 0; i < ATTRACTOR_COUNT; i++) 
    {
        const attractor = new THREE.Object3D();
        attractor.position.copy(attractorPositions[i]);
        attractor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), attractorRotationAxes[i]);
        scene.add(attractor);

        const center = new THREE.Points(sphereGeometry, SphereMaterial);
        attractor.add(center)

        attractors.push(attractor);
        attractorHelpers.push(center);
    }
}

function createParticles() {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const particleMasses = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 5;
    positions[i3 + 1] = (Math.random() - 0.5) * 0.2;
    positions[i3 + 2] = (Math.random() - 0.5) * 5;

    const phi = Math.random() * Math.PI * 2;
    const theta = Math.random() * Math.PI;
    const r = 0.05;
    velocities[i3] = r * Math.sin(phi) * Math.sin(theta);
    velocities[i3 + 1] = r * Math.cos(phi);
    velocities[i3 + 2] = r * Math.sin(phi) * Math.cos(theta);

    particleMasses[i] = (Math.random() * 0.75 + 0.25) * uniforms.particleGlobalMass.value;
  }

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  particleGeometry.setAttribute('particleMass', new THREE.BufferAttribute(particleMasses, 1));

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);
}

function updateParticles() {
  const positions = particleGeometry.attributes.position.array;
  const velocities = particleGeometry.attributes.velocity.array;
  const particleMasses = particleGeometry.attributes.particleMass.array;

  const attractorPositions = uniforms.attractorPositions.value;
  const attractorRotationAxes = uniforms.attractorRotationAxes.value;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;

    // Calculate forces
    let fx = 0, fy = 0, fz = 0;
    for (let j = 0; j < ATTRACTOR_COUNT; j++) {
      const dx = attractorPositions[j].x - positions[i3];
      const dy = attractorPositions[j].y - positions[i3 + 1];
      const dz = attractorPositions[j].z - positions[i3 + 2];
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);

      // Gravity
      const gravityStrength = uniforms.attractorMass.value * particleMasses[i] * uniforms.gravityConstant.value / distSq;
      const forceMag = gravityStrength / dist;
      fx += forceMag * dx;
      fy += forceMag * dy;
      fz += forceMag * dz;

      // Spinning
      const spinningStrength = gravityStrength * uniforms.spinningStrength.value;
      const spinX = attractorRotationAxes[j].y * dz - attractorRotationAxes[j].z * dy;
      const spinY = attractorRotationAxes[j].z * dx - attractorRotationAxes[j].x * dz;
      const spinZ = attractorRotationAxes[j].x * dy - attractorRotationAxes[j].y * dx;
      fx += spinningStrength * spinX;
      fy += spinningStrength * spinY;
      fz += spinningStrength * spinZ;
    }

    // Update velocity
    velocities[i3] += fx * uniforms.timeScale.value;
    velocities[i3 + 1] += fy * uniforms.timeScale.value;
    velocities[i3 + 2] += fz * uniforms.timeScale.value;

    // Apply speed limit
    const speedSq = velocities[i3] * velocities[i3] + velocities[i3 + 1] * velocities[i3 + 1] + velocities[i3 + 2] * velocities[i3 + 2];
    if (speedSq > uniforms.maxSpeed.value * uniforms.maxSpeed.value) {
      const speedFactor = uniforms.maxSpeed.value / Math.sqrt(speedSq);
      velocities[i3] *= speedFactor;
      velocities[i3 + 1] *= speedFactor;
      velocities[i3 + 2] *= speedFactor;
    }

    // Apply damping
    const damping = 1 - uniforms.velocityDamping.value;
    velocities[i3] *= damping;
    velocities[i3 + 1] *= damping;
    velocities[i3 + 2] *= damping;

    // Update position
    positions[i3] += velocities[i3] * uniforms.timeScale.value;
    positions[i3 + 1] += velocities[i3 + 1] * uniforms.timeScale.value;
    positions[i3 + 2] += velocities[i3 + 2] * uniforms.timeScale.value;

    // Box loop
    const halfExtent = uniforms.boundHalfExtent.value;
    positions[i3] = (positions[i3] + halfExtent) % (2 * halfExtent) - halfExtent;
    positions[i3 + 1] = (positions[i3 + 1] + halfExtent) % (2 * halfExtent) - halfExtent;
    positions[i3 + 2] = (positions[i3 + 2] + halfExtent) % (2 * halfExtent) - halfExtent;
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.velocity.needsUpdate = true;
}

function setupGUI() {
  const gui = new GUI();

  gui.add({ attractorMassExponent: Math.log10(uniforms.attractorMass.value) }, 'attractorMassExponent', 1, 10, 1)
    .onChange(value => uniforms.attractorMass.value = Math.pow(10, value));
  gui.add({ particleGlobalMassExponent: Math.log10(uniforms.particleGlobalMass.value) }, 'particleGlobalMassExponent', 1, 10, 1)
    .onChange(value => uniforms.particleGlobalMass.value = Math.pow(10, value));
  gui.add(uniforms.maxSpeed, 'value', 0, 10, 0.01).name('maxSpeed');
  gui.add(uniforms.velocityDamping, 'value', 0, 0.1, 0.001).name('velocityDamping');
  gui.add(uniforms.spinningStrength, 'value', 0, 10, 0.01).name('spinningStrength');
  gui.add(uniforms.scale, 'value', 0, 0.1, 0.001).name('scale');
  gui.add(uniforms.boundHalfExtent, 'value', 0, 20, 0.01).name('boundHalfExtent');
  gui.addColor(uniforms.colorA, 'value').name('colorA');
  gui.addColor(uniforms.colorB, 'value').name('colorB');
  gui
    .add({ controlsMode: 'rotate' }, 'controlsMode')
    .options(['translate', 'rotate', 'none'])
    .onChange(value => {
      attractors.forEach((attractor, index) => {
        const controls = scene.getObjectByName(`AttractorControls${index}`);
        if (value === 'none') {
          controls.visible = false;
          controls.enabled = false;
        } else {
          controls.visible = true;
          controls.enabled = true;
          controls.mode = value;
        }
      });
    });


  gui.add({ reset: resetParticles }, 'reset');
}

function resetParticles() {
  const positions = particleGeometry.attributes.position.array;
  const velocities = particleGeometry.attributes.velocity.array;
  const particleMasses = particleGeometry.attributes.particleMass.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 5;
    positions[i3 + 1] = (Math.random() - 0.5) * 0.2;
    positions[i3 + 2] = (Math.random() - 0.5) * 5;

    const phi = Math.random() * Math.PI * 2;
    const theta = Math.random() * Math.PI;
    const r = 0.05;
    velocities[i3] = r * Math.sin(phi) * Math.sin(theta);
    velocities[i3 + 1] = r * Math.cos(phi);
    velocities[i3 + 2] = r * Math.sin(phi) * Math.cos(theta);

    particleMasses[i] = (Math.random() * 0.75 + 0.25) * uniforms.particleGlobalMass.value;
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.velocity.needsUpdate = true;
  particleGeometry.attributes.particleMass.needsUpdate = true;
}

function onWindowResize() {
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateParticles();
  renderer.render(scene, camera);
}

init();
animate();