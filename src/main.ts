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
  (e) => {
    updatePointer(e.clientX, e.clientY);
  },
  { passive: true }
);

/* -------------------------------
   GSAP + SCROLLTRIGGER
-------------------------------- */
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

ScrollTrigger.normalizeScroll({
  allowNestedScroll: true,
  lockAxis: false,
});

const gui = new GUI();
gui.hide();

async function main() {
  // --- LOADER MANAGER LOGIC ---
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
    (url, itemsLoaded, itemsTotal) => {
      void url;
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
  scene.background = new THREE.Color("#111827");
  const mainGroup = new THREE.Object3D();
  scene.add(mainGroup);
  mainGroup.position.y = 0;

  const bgParams = { background: "#202020" };

  gui
    .addColor(bgParams, "background")
    .name("Scene Background")
    .onChange((value: any) => {
      scene.background = new THREE.Color(value);
    });

  const fov = 45;
  const near = 0.1;
  const far = 100;
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
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
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    return needResize;
  }

  // --- LOADERS ---
  const gltfLoader = new GLTFLoader(loadingManager);
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const texture = textureLoader.load(generateAssetPath("/images/plane.png"));
  const cloud1 = textureLoader.load(generateAssetPath("/images/cloud.png"));

  /* -------------------------------
     STARS SYSTEM (NEW)
  -------------------------------- */
  const starCount = 1500;
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starVelocities = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 40; // X
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 40; // Y
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 40; // Z
    starVelocities[i] = 0.002 + Math.random() * 0.005; // Speed
  }

  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });

  const starPoints = new THREE.Points(starGeometry, starMaterial);
  mainGroup.add(starPoints);

  function updateStars() {
    const positions = starGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < starCount; i++) {
      // Move Y down
      positions[i * 3 + 1] -= starVelocities[i];
      // Reset to top if it falls below -20
      if (positions[i * 3 + 1] < -20) {
        positions[i * 3 + 1] = 20;
      }
    }
    starGeometry.attributes.position.needsUpdate = true;
  }

  function addClouds() {
    const cloud1Geometry = new THREE.PlaneGeometry(4, 4);
    const cloud1Material = new THREE.MeshBasicMaterial({
      map: cloud1,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const cloud1mesh = new THREE.Mesh(cloud1Geometry, cloud1Material);
    cloud1mesh.scale.set(3, 3, 1);
    cloud1mesh.position.set(-5, 1, -1);
    mainGroup.add(cloud1mesh);

    const cloud2mesh = new THREE.Mesh(cloud1Geometry, cloud1Material);
    cloud2mesh.scale.set(3, 3, 1);
    cloud2mesh.position.set(5, 1, -1);
    mainGroup.add(cloud2mesh);
  }

  gltfLoader.load(generateAssetPath("/model/plane2.glb"), (root) => {
    const model = root.scene;
    model.scale.set(0.2, 0.2, 0.2);
    model.rotateX(THREE.MathUtils.degToRad(10));
    model.rotateY(THREE.MathUtils.degToRad(-140));
    model.position.y -= 0.3;

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
    finalDistance = finalDistance / 2 + 2;
    camera.position.set(center.x, center.y, finalDistance);

    cameraBase.copy(camera.position);
    lookAtTarget.copy(center);

    camera.near = radius * 0.1;
    camera.far = radius * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAtTarget);

    mainGroup.add(model);
    addClouds();

    /* -------------------------------
       RING / GSAP LOGIC
    -------------------------------- */
    const obj3dWrapper = new THREE.Object3D();
    const obj3d = new THREE.Object3D();
    obj3d.position.z = model.position.z - 0.05;
    obj3dWrapper.add(obj3d);
    mainGroup.add(obj3dWrapper);

    const ringRadiuss = [0.2, 0.3, 0.4];
    const width = 0.002;
    const minRadius = 0.18;
    const maxRadius = ringRadiuss[ringRadiuss.length - 1] + width;

    ringRadiuss.forEach((innerRadius, index) => {
      const ringGeometry = new THREE.RingGeometry(
        innerRadius,
        innerRadius + width,
        64
      );
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeometry, ringMaterial);
      mesh.position.z = index * 0.001;
      obj3d.add(mesh);
    });

    // Sub-planes inside rings logic
    const geometry = new THREE.PlaneGeometry(0.02, 0.02);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    function poissonDiscInRing(
      minR: number,
      maxR: number,
      minDistance: number
    ) {
      void minDistance;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(
          Math.random() * (maxR * maxR - minR * minR) + minR * minR
        );
        points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
      return points;
    }

    const planePositions = poissonDiscInRing(minRadius, maxRadius, 0.1);
    planePositions.forEach((pos) => {
      const _2dPlane = new THREE.Mesh(geometry, material);
      _2dPlane.position.set(pos.x, pos.y, 0.005);
      _2dPlane.rotation.z = Math.atan2(pos.y, pos.x);
      obj3d.add(_2dPlane);
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

    const directionalLight = new THREE.DirectionalLight("#ffffff", 5);
    directionalLight.position.copy(camera.position);
    mainGroup.add(directionalLight);
    mainGroup.add(directionalLight.target);
    mainGroup.add(new THREE.AmbientLight("#ffffff", 0.2));
  });

  function parallax() {
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
}

main();
