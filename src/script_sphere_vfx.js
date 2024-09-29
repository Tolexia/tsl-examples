import GUI from 'lil-gui'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { dot, cos, float, min, timerLocal, atan2, uniform, pass, bloom, PI, PI2, color, positionLocal, rangeFog, sin, texture, tslFn, uv, vec2, vec3, vec4 } from 'three/webgpu'
import gridMaterial from './GridMaterial'

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 400 })

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()
scene.fogNode = rangeFog(color('#171617'), 2, 15)

// Loaders
const textureLoader = new THREE.TextureLoader()

// Texture
const perlinTexture = textureLoader.load('./perlinTexture.png')
perlinTexture.wrapS = THREE.RepeatWrapping
perlinTexture.wrapT = THREE.RepeatWrapping

const uvCheckerTexture = textureLoader.load('./uvCheckerByValle.jpg')
uvCheckerTexture.colorSpace = THREE.SRGBColorSpace
uvCheckerTexture.wrapS = THREE.RepeatWrapping
uvCheckerTexture.wrapT = THREE.RepeatWrapping

/**
 * TSL functions
 */
const toRadialUv = tslFn(([uv, multiplier, rotation, offset]) => {
    const centeredUv = uv.sub(0.5).toVar();
    const distanceToCenter = centeredUv.length()
    const angle = atan2(centeredUv.y, centeredUv.x);
    const radialUv = vec2(angle.add(PI).div(PI2), distanceToCenter).toVar()
    radialUv.mulAssign(multiplier)
    radialUv.x.addAssign(rotation)
    radialUv.y.addAssign(offset)

    return radialUv
})

const toSkewedUv = tslFn(([uv, skew]) => {
    return vec2(
        uv.x.add(uv.y.mul(skew.x)),
        uv.y.add(uv.x.mul(skew.y))
    )
})

const twistedSphere = tslFn(([position, time]) => {

    const newPosition = vec3(
        position.x,
        position.y,
        position.z,
    )

    return newPosition
})

const luminance = tslFn(([color]) => {
    return dot(color, vec3(0.2126, 0.7152, 0.0722))
})

/**
 * Global
 */
const emissiveColor = uniform(color('#ffac4d'))
const timeScale = uniform(0.05)

// Geometry
const sphereGeometry = new THREE.SphereGeometry(0.5, 64, 64)
sphereGeometry.translate(0, 0.5, 0)

/**
 * Sphere floor
 */

// Material
const floorMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, wireframe: false })

// Output
floorMaterial.outputNode = tslFn(() => {
    const time = timerLocal().mul(timeScale)

    // Noise 1
    const noise1Uv = toRadialUv(
        uv(),
        vec2(0.5, 0.5),
        time,
        time
    )
    noise1Uv.assign(toSkewedUv(
        noise1Uv,
        vec2(-1, 0)
    ))
    noise1Uv.mulAssign(vec2(4, 1))
    const noise1 = texture(perlinTexture, noise1Uv, 1).r.remap(0.45, 0.7)

    // Noise 2
    const noise2Uv = toRadialUv(
        uv(),
        vec2(2, 8),
        time.mul(2),
        time.mul(8)
    )
    noise2Uv.assign(toSkewedUv(
        noise2Uv,
        vec2(-0.25, 0)
    ))
    noise2Uv.mulAssign(vec2(2, 0.25))
    const noise2 = texture(perlinTexture, noise2Uv, 1).b.remap(0.45, 0.7)

    // Outer fade
    const distanceToCenter = uv().sub(0.5).toVar()
    const outerFade = min(
        distanceToCenter.length().smoothstep(0.5, 0.1),
        distanceToCenter.length().smoothstep(0, 0.2)
    )

    // Effect
    const effect = noise1.mul(noise2).mul(outerFade).toVar()

    // Output
    return vec4(
        emissiveColor.mul(float(0.2).step(effect)).mul(3), // Emissive
        effect.smoothstep(0, 0.01) // Alpha
    )
})()

// Geometry
const floorGeometry = new THREE.PlaneGeometry(1, 1, 1, 1)

// Mesh
const floor = new THREE.Mesh(floorGeometry, floorMaterial)
floor.scale.setScalar(2)
floor.position.y = 0.01
floor.rotation.x = - Math.PI * 0.5
// scene.add(floor)

/**
 * Emissive layer
 */

// Material
const emissiveMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, wireframe: false })
emissiveMaterial.positionNode = twistedSphere(positionLocal, timerLocal().mul(timeScale))

// Output
emissiveMaterial.outputNode = tslFn(() => {
    const time = timerLocal().mul(timeScale)

    // Noise 1
    const noise1Uv = uv().add(vec2(time, time.negate())).toVar()
    noise1Uv.assign(toSkewedUv(
        noise1Uv,
        vec2(-1, 0)
    ))
    noise1Uv.mulAssign(vec2(2, 0.25))
    const noise1 = texture(perlinTexture, noise1Uv, 1).r.remap(0.45, 0.7)

    // Noise 2
    const noise2Uv = uv().add(vec2(time.mul(0.5), time.negate())).toVar()
    noise2Uv.assign(toSkewedUv(
        noise2Uv,
        vec2(-1, 0)
    ))
    noise2Uv.mulAssign(vec2(5, 1))
    const noise2 = texture(perlinTexture, noise2Uv, 1).g.remap(0.45, 0.7)

    // Outer fade
    const outerFade = min(
        uv().y.smoothstep(0, 0.1),
        uv().y.smoothstep(0, 1)
    )

    // Effect
    const effect = noise1.mul(noise2).mul(outerFade)

    const emissiveColorLuminance = luminance(emissiveColor)

    // Output
    return vec4(
        emissiveColor.mul(1.2).div(emissiveColorLuminance), // Emissive
        effect.smoothstep(0, 0.075) // Alpha
    )
})()

// Mesh
const emissive = new THREE.Mesh(sphereGeometry, emissiveMaterial)
emissive.scale.set(1, 1, 1)
scene.add(emissive)

/**
 * Dark layer
 */
 
// Material
const darkMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, wireframe: false })
darkMaterial.positionNode = twistedSphere(positionLocal, timerLocal().mul(timeScale))

// Output
darkMaterial.outputNode = tslFn(() => {
    const time = timerLocal().mul(timeScale).add(123.4)

    // Noise 1
    const noise1Uv = uv().add(vec2(time, time.negate())).toVar()
    noise1Uv.assign(toSkewedUv(
        noise1Uv,
        vec2(-1, 0)
    ))
    noise1Uv.mulAssign(vec2(2, 0.25))
    const noise1 = texture(perlinTexture, noise1Uv, 1).g.remap(0.45, 0.7)

    // Noise 2
    const noise2Uv = uv().add(vec2(time.mul(0.5), time.negate())).toVar()
    noise2Uv.assign(toSkewedUv(
        noise2Uv,
        vec2(-1, 0)
    ))
    noise2Uv.mulAssign(vec2(5, 1))
    const noise2 = texture(perlinTexture, noise2Uv, 1).b.remap(0.45, 0.7)

    // Outer fade
    const outerFade = min(
        uv().y.smoothstep(0, 0.1),
        uv().y.smoothstep(0.1, 1)
    )

    // Effect
    const effect = noise1.mul(noise2).mul(outerFade)

    return vec4(
        vec3(0),
        effect.smoothstep(0, 0.1)
    )
})()

// Mesh
const dark = new THREE.Mesh(sphereGeometry, darkMaterial)
dark.scale.set(1, 1, 1)
scene.add(dark)

/**
 * Debug
 */

gui.addColor({ color: emissiveColor.value.getHexString(THREE.SRGBColorSpace) }, 'color').onChange(value => emissiveColor.value.set(value)).name('emissiveColor')
gui.add(timeScale, 'value', -1, 1, 0.01).name('timeScale')

/**
 * Grid
 */
const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    gridMaterial
)
grid.rotation.x = - Math.PI * 0.5
grid.position.y = 0
// scene.add(grid)

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () => {
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
camera.position.set(1, 1, 3)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.y = 0.4
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    antialias: true
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor('#171617')

/**
 * Post processing
 */
const postProcessing = new THREE.PostProcessing(renderer)

const scenePass = pass(scene, camera)
const scenePassColor = scenePass.getTextureNode('output')

const bloomPass = bloom(scenePassColor, 1, 0.1, 1)

const bloomGui = gui.addFolder('bloom')
bloomGui.add(bloomPass.strength, 'value', 0, 10, 0.01).name('strength')
bloomGui.add(bloomPass.radius, 'value', 0, 1, 0.01).name('radius')
bloomGui.add(bloomPass.threshold, 'value', 0, 1, 0.01).name('threshold')

gui.close()

postProcessing.outputNode = scenePassColor.add(bloomPass)

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () => {
    const elapsedTime = clock.getElapsedTime()

    // Update controls
    controls.update()

    // Render
    postProcessing.renderAsync()
    // renderer.renderAsync(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()
