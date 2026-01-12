import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { generateAssetPath } from "./util";

/* -------------------------------
   POINTER / TOUCH PARALLAX FIX
-------------------------------- */

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

window.addEventListener(
  "touchmove",
  (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    updatePointer(t.clientX, t.clientY);
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
  const mainGroup = new THREE.Object3D();
  scene.add(mainGroup);
  // Reset mainGroup position (handled by camera now)
  mainGroup.position.y = 0;

  const bgParams = { background: "#202020" };
  scene.background = new THREE.Color(bgParams.background);

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

  // Variables to store framing data for parallax
  const cameraBase = new THREE.Vector3();
  const lookAtTarget = new THREE.Vector3();

  const canvas = document.getElementById("c") as HTMLCanvasElement;

  const createContrailTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.7)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  };
  void createContrailTexture;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
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
  const loader = new THREE.TextureLoader(loadingManager);
  const texture = loader.load(generateAssetPath("/images/plane.png"));

  gltfLoader.load(generateAssetPath("/model/plane2.glb"), (root) => {
    const model = root.scene;
    model.scale.set(0.2, 0.2, 0.2);
    model.position.y -= 0.3;

    // --- RESPONSIVE FRAMING ---
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

    const finalDistance = Math.max(distY, distX);

    // Set Initial Camera Position
    camera.position.set(center.x, center.y, finalDistance);

    // Capture Base Position and LookAt for Parallax
    cameraBase.copy(camera.position);
    lookAtTarget.copy(center);

    camera.near = radius;
    camera.far = radius * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAtTarget);

    mainGroup.add(model);

    model.rotateX(THREE.MathUtils.degToRad(10));
    model.rotateY(THREE.MathUtils.degToRad(-140));

    /* -------------------------------
       RING / GSAP LOGIC
    -------------------------------- */
    {
      const obj3dWrapper = new THREE.Object3D();
      const obj3d = new THREE.Object3D();
      obj3d.position.z = model.position.z - 0.05;
      obj3dWrapper.add(obj3d);
      mainGroup.add(obj3dWrapper);

      const ringRadiuss = [0.2, 0.3, 0.4];
      const width = 0.002;
      const minRadius = 0.18;
      const maxRadius = ringRadiuss[ringRadiuss.length - 1] + width;

      const rings = ringRadiuss.map((innerRadius, index) => {
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
        return mesh;
      });

      rings.forEach((ring) => obj3d.add(ring));

      {
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
          minDistance: number,
          excludeRanges: Array<{ min: number; max: number }> = [],
          maxAttempts = 30
        ) {
          const points: { x: number; y: number }[] = [];
          const cellSize = minDistance / Math.sqrt(2);
          const grid = new Map<string, { x: number; y: number }[]>();
          const gridKey = (x: number, y: number) =>
            `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
          const isInExcludedRange = (dist: number) =>
            excludeRanges.some(
              (range) => dist >= range.min && dist <= range.max
            );

          function isValid(x: number, y: number) {
            const dist = Math.sqrt(x * x + y * y);
            if (dist < minR || dist > maxR || isInExcludedRange(dist))
              return false;
            const gx = Math.floor(x / cellSize),
              gy = Math.floor(y / cellSize);
            for (let i = -2; i <= 2; i++) {
              for (let j = -2; j <= 2; j++) {
                const nearby = grid.get(`${gx + i},${gy + j}`);
                if (nearby)
                  for (const p of nearby)
                    if (
                      Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < minDistance
                    )
                      return false;
              }
            }
            return true;
          }

          function addPoint(x: number, y: number) {
            const key = gridKey(x, y);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push({ x, y });
            points.push({ x, y });
          }

          const initialPoint = (() => {
            let x,
              y,
              dist,
              attempts = 0;
            do {
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.sqrt(
                Math.random() * (maxR * maxR - minR * minR) + minR * minR
              );
              x = Math.cos(angle) * radius;
              y = Math.sin(angle) * radius;
              dist = Math.sqrt(x * x + y * y);
              attempts++;
            } while (isInExcludedRange(dist) && attempts < 100);
            return { x, y };
          })();

          addPoint(initialPoint.x, initialPoint.y);
          const activeList = [initialPoint];
          while (activeList.length > 0) {
            const randomIndex = Math.floor(Math.random() * activeList.length);
            const point = activeList[randomIndex];
            let found = false;
            for (let i = 0; i < maxAttempts; i++) {
              const angle = Math.random() * Math.PI * 2,
                radius = minDistance + Math.random() * minDistance;
              const newX = point.x + Math.cos(angle) * radius,
                newY = point.y + Math.sin(angle) * radius;
              if (isValid(newX, newY)) {
                addPoint(newX, newY);
                activeList.push({ x: newX, y: newY });
                found = true;
                break;
              }
            }
            if (!found) activeList.splice(randomIndex, 1);
          }
          return points;
        }

        const excludeRanges = ringRadiuss.map((innerRadius) => ({
          min: innerRadius - 0.005,
          max: innerRadius + width + 0.005,
        }));

        const planePositions = poissonDiscInRing(
          minRadius,
          maxRadius,
          0.1,
          excludeRanges
        );

        planePositions.forEach((pos) => {
          const _2dPlane = new THREE.Mesh(geometry, material);
          _2dPlane.position.set(pos.x, pos.y, 0.005);
          const angle = Math.atan2(pos.y, pos.x);
          _2dPlane.rotation.z = angle;
          obj3d.add(_2dPlane);
        });
      }

      obj3dWrapper.rotateX(THREE.MathUtils.degToRad(-90));

      gsap.to(obj3dWrapper.rotation, {
        x: THREE.MathUtils.degToRad(-45),
        z: THREE.MathUtils.degToRad(20),
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          invalidateOnRefresh: true,
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
    }

    {
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
    }

    {
      const directionalLight = new THREE.DirectionalLight("#ffffff", 5);
      directionalLight.position.copy(camera.position);
      mainGroup.add(directionalLight);
      mainGroup.add(directionalLight.target);
    }
    mainGroup.add(new THREE.AmbientLight("#ffffff", 0.2));

    const material = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    gui.addColor(material, "color").name("Ground color");
  });

  /* -------------------------------
     PARALLAX (UPDATED TO CAMERA)
-------------------------------- */

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function parallax() {
    mouse.x += (targetMouse.x - mouse.x) * 0.12;
    mouse.y += (targetMouse.y - mouse.y) * 0.12;

    const px = clamp(mouse.x, -1, 1);
    const py = clamp(mouse.y, -1, 1);

    // Apply parallax to the CAMERA instead of mainGroup
    // We add an offset to the base coordinates we captured during loading
    camera.position.x = cameraBase.x + px * 0.35;
    camera.position.y = cameraBase.y + py * 0.35;

    // Optional: Keep the camera looking at the model center for a slight swivel effect
    camera.lookAt(lookAtTarget);
  }

  const render = () => {
    resizeRendererToCanvasSize();
    parallax();
    renderer.render(scene, camera);
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
}

main();
