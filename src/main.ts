import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { generateAssetPath } from "./util";

/* -------------------------------
   POINTER / TOUCH PARALLAX FIX
-------------------------------- */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
const mouse = { x: 0, y: 0 };
const targetMouse = { x: 0, y: 0 };

function updatePointer(x: number, y: number) {
  targetMouse.x = (x / window.innerWidth) * 2 - 1;
  targetMouse.y = -(y / window.innerHeight) * 2 + 1;
}
window.addEventListener(
  "pointermove",
  (e) => updatePointer(e.clientX, e.clientY),
  { passive: true }
);

function createSweepTexture() {
  const size = 512;
  const canvas = document.createElement("canvas") as HTMLCanvasElement;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;

  ctx.clearRect(0, 0, size, size);

  // How much of the circle is visible (20%)
  const visibleArc = Math.PI * 2 * 0.4;

  // Draw the sweep
  for (let i = 0; i < 360; i++) {
    const angle = (i / 360) * Math.PI * 2;

    let alpha = 0;

    if (angle <= visibleArc) {
      // fade from white → transparent
      alpha = 1 - angle / visibleArc;
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + 0.02);
    ctx.closePath();

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return texture;
}

/* -------------------------------
   GSAP + SCROLLTRIGGER
-------------------------------- */
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
ScrollTrigger.normalizeScroll({ allowNestedScroll: true, lockAxis: false });

const gui = new GUI();
// gui.hide();

async function main() {
  const loaderElement = document.getElementById("loader");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-percentage");
  const loadingStatus = { progress: 0 };

  const updateUI = () => {
    const rounded = Math.round(loadingStatus.progress);
    if (progressBar) progressBar.style.width = `${rounded}%`;
    if (progressText)
      progressText.innerText = `${rounded.toString().padStart(2, "0")}%`;
  };

  const loadingManager = new THREE.LoadingManager(
    () => {
      gsap.to(loadingStatus, {
        progress: 100,
        duration: 0.8,
        onUpdate: updateUI,
        onComplete: () => {
          gsap.to(loaderElement, {
            opacity: 0,
            duration: 1,
            pointerEvents: "none",
            onComplete: () => {
              if (loaderElement) loaderElement.style.display = "none";
            },
          });
        },
      });
    },
    (_url, itemsLoaded, itemsTotal) => {
      const targetPercent = (itemsLoaded / itemsTotal) * 100;
      gsap.to(loadingStatus, {
        progress: targetPercent,
        duration: 1,
        ease: "power2.out",
        onUpdate: updateUI,
      });
    }
  );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#29264f");
  const params = {
    backgroundColor: "#29264f",
  };

  gui
    .addColor(params, "backgroundColor")
    .name("Background")
    .onChange((value: any) => {
      if (scene.background instanceof THREE.Color) {
        scene.background.set(value);
      } else {
        scene.background = new THREE.Color(value);
      }
    });
  const mainGroup = new THREE.Object3D();
  scene.add(mainGroup);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  scene.add(camera);

  const cameraBase = new THREE.Vector3();
  const lookAtTarget = new THREE.Vector3();
  const canvas = document.getElementById("c") as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  function resizeRendererToCanvasSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  const gltfLoader = new GLTFLoader(loadingManager);
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const texture = textureLoader.load(generateAssetPath("/images/plane.png"));
  const cloud1 = textureLoader.load(generateAssetPath("/images/cloud.png"));

  // --- STARS ---
  const starCount = 100;
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starVelocities = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 20;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    starPositions[i * 3 + 2] = -Math.random() * 20;
    starVelocities[i] = 0.002 + Math.random() * 0.005;
  }
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    map: textureLoader.load(
      "https://threejs.org/examples/textures/sprites/disc.png"
    ),
    transparent: true,
    opacity: 0.8,
    alphaTest: 0.5,
  });
  const starPoints = new THREE.Points(starGeometry, starMaterial);
  mainGroup.add(starPoints);

  function updateStars() {
    const positionAttribute = starGeometry.getAttribute("position");
    const positions = positionAttribute.array as any;
    for (let i = 0; i < starCount; i++) {
      positions[i * 3 + 1] -= starVelocities[i];
      if (positions[i * 3 + 1] < -10) positions[i * 3 + 1] = 10;
    }
    positionAttribute.needsUpdate = true;
  }

  function addClouds() {
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloud1,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cloudGeo = new THREE.PlaneGeometry(2, 2);
    const c1 = new THREE.Mesh(cloudGeo, cloudMat);
    c1.scale.set(3, 3, 1);
    c1.position.set(-3, 1, -1);
    mainGroup.add(c1);
    const c2 = new THREE.Mesh(cloudGeo, cloudMat);
    c2.scale.set(3, 3, 1);
    c2.position.set(3, -2, -1);
    mainGroup.add(c2);
  }

  gltfLoader.load(generateAssetPath("/model/plane2.glb"), (root) => {
    const model = root.scene;
    model.name = "aeroplane";

    model.scale.set(0.2, 0.2, 0.2);
    model.rotateX(THREE.MathUtils.degToRad(10));
    model.rotateY(THREE.MathUtils.degToRad(-140));
    // model.position.y -= 0.3;

    const box = new THREE.Box3().setFromObject(model);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const center = sphere.center;
    const radius = sphere.radius;
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const aspect = camera.aspect;

    const distY = radius / Math.sin(fovY / 2);
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    const distX = radius / Math.sin(fovX / 2);

    let finalDistance = Math.max(distY, distX);
    finalDistance = finalDistance / 2 + 1;
    camera.position.set(center.x, center.y, finalDistance);

    cameraBase.copy(camera.position);
    lookAtTarget.copy(center);

    camera.near = radius * 0.1;
    camera.far = radius * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAtTarget);
    mainGroup.add(model);
    addClouds();

    // RINGS
    const obj3dWrapper = new THREE.Object3D();
    const obj3d = new THREE.Object3D();
    obj3d.position.z = model.position.z - 0.05;
    obj3dWrapper.add(obj3d);

    mainGroup.add(obj3dWrapper);

    [0.2, 0.3, 0.4].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.002, 64),
        new THREE.MeshBasicMaterial({
          color: "#ffffff",
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ring.position.z = i * 0.001;
      obj3d.add(ring);
    });

    {
      //adding rotating ring
      const geometry = new THREE.RingGeometry(
        0.1, // inner radius
        0.19999, // outer radius
        64, // theta segments
        1
      );
      const gradientTexture = createSweepTexture();

      const material = new THREE.MeshBasicMaterial({
        map: gradientTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
      });

      const ring = new THREE.Mesh(geometry, material);
      gsap.to(ring.rotation, {
        z: "+=" + Math.PI * 2,
        duration: 6,
        repeat: -1,
        ease: "linear",
      });
      obj3d.add(ring);
    }

    // --- SUB-PLANES (SPACING FIX) ---
    function poissonDiscInRing(
      minR: number,
      maxR: number,
      minDistance: number
    ) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 15; i++) {
        // Target 15 planes
        for (let j = 0; j < 50; j++) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(
            Math.random() * (maxR * maxR - minR * minR) + minR * minR
          );
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (
            !pts.some(
              (p) => Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < minDistance
            )
          ) {
            pts.push({ x, y });
            break;
          }
        }
      }
      return pts;
    }

    const subPlaneGeo = new THREE.PlaneGeometry(0.02, 0.02);
    const subPlaneMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    poissonDiscInRing(0.18, 0.402, 0.12).forEach((pos) => {
      const p = new THREE.Mesh(subPlaneGeo, subPlaneMat);
      p.position.set(pos.x, pos.y, 0.005);
      p.rotation.z = Math.atan2(pos.y, pos.x);
      obj3d.add(p);
    });

    obj3dWrapper.rotateX(THREE.MathUtils.degToRad(-90));

    gsap.to(obj3dWrapper.rotation, {
      x: THREE.MathUtils.degToRad(-45),
      z: THREE.MathUtils.degToRad(20),
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
      },
      ease: "sine.inOut",
    });
    gsap.to(obj3d.rotation, {
      z: "+=" + Math.PI * 2,
      duration: 100,
      repeat: -1,
      ease: "linear",
    });
    obj3d.scale.set(0, 0, 0);
    gsap.to(obj3d.scale, {
      x: 10,
      y: 10,
      z: 10,
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
      },
    });
    gsap.to(model.rotation, {
      z: "+=0.2",
      repeat: -1,
      duration: 3,
      yoyo: true,
      ease: "sine.inOut",
    });
    gsap.to(model.rotation, {
      x: "+=0.4",
      y: "+=0.7",
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
      },
    });

    const light = new THREE.DirectionalLight(0xffffff, 6);
    light.position.copy(camera.position);
    mainGroup.add(light);
    mainGroup.add(new THREE.AmbientLight("#ffffff", 0.4));

    function parallax() {
      // Smoothing the mouse input
      mouse.x += (targetMouse.x - mouse.x) * 0.12;
      mouse.y += (targetMouse.y - mouse.y) * 0.12;
      const px = clamp(mouse.x, -1, 1);
      const py = clamp(mouse.y, -1, 1);
      camera.position.x = cameraBase.x + px * 0.6;
      camera.position.y = cameraBase.y + py * 0.6;
      camera.lookAt(lookAtTarget);
    }
    const render = () => {
      resizeRendererToCanvasSize();
      parallax();
      updateStars(); // Animating stars every frame
      renderer.render(scene, camera);
      window.requestAnimationFrame(render);
    };
    window.requestAnimationFrame(render);
  });
}

main();
