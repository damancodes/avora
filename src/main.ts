import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { generateAssetPath } from "./util";

const mouse = { x: 0, y: 0 };
const targetMouse = { x: 0, y: 0 };

window.addEventListener("mousemove", (event) => {
  // Normalize coordinates from -1 to +1
  targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});
// --- MOBILE GSAP FIXES ---
gsap.registerPlugin(ScrollTrigger);
// Prevents the animation from jumping when the mobile address bar disappears
ScrollTrigger.config({ ignoreMobileResize: true });
ScrollTrigger.normalizeScroll(true);

const gui = new GUI();
gui.hide();

async function main() {
  const scene = new THREE.Scene();

  const mainGroup = new THREE.Object3D();
  scene.add(mainGroup);
  mainGroup.position.y -= 0.2;

  const bgParams = {
    background: "#202020",
  };
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

  // camera.position.set(0, 0, 1);
  scene.add(camera);

  const canvas = document.getElementById("c") as HTMLCanvasElement;

  // --- TEXTURES ---
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
  const contrailTexture = createContrailTexture();
  void contrailTexture;
  // --- RENDERER WITH FLICKER FIX ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    // Fixes Z-fighting/Flickering on mobile GPUs
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
  });

  // Limit pixel ratio to 2 (rendering at 3x or 4x on mobile causes lag/heat)
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

  const gltfLoader = new GLTFLoader();
  const loader = new THREE.TextureLoader();
  const texture = loader.load(generateAssetPath("/images/plane.png"));

  gltfLoader.load(generateAssetPath("/model/plane2.glb"), (root) => {
    const model = root.scene;

    model.scale.set(0.2, 0.2, 0.2);
    model.position.y -= 0.3;
    const box = new THREE.Box3().setFromObject(model);
    const boxSize = box.getSize(new THREE.Vector3()).length();
    const boxCenter = box.getCenter(new THREE.Vector3());

    const sizeToFitOnScreen = boxSize * 1.2;
    const halfSizeToFitOnScreen = sizeToFitOnScreen / 2;
    const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);

    const direction = new THREE.Vector3()
      .subVectors(camera.position, boxCenter)
      .multiply(new THREE.Vector3(1, 0, 1))
      .normalize();

    camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

    camera.position.y = 0;

    camera.near = boxSize / 100;
    camera.far = boxSize * 3;
    camera.updateProjectionMatrix();
    camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);

    mainGroup.add(model);

    // Initial rotation (Kept exactly as requested)
    {
      model.rotateX(THREE.MathUtils.degToRad(10));
      model.rotateY(THREE.MathUtils.degToRad(-140));
      // model.rotateZ(THREE.MathUtils.degToRad(10));
    }

    {
      const obj3dWrapper = new THREE.Object3D();
      const obj3d = new THREE.Object3D();
      obj3d.position.z = model.position.z - 0.05;
      obj3dWrapper.add(obj3d);
      mainGroup.add(obj3dWrapper);

      const ringRadiuss = [0.2, 0.3, 0.4];
      const width = 0.002;
      const minRadius = 0.18; // 0.2
      const maxRadius = ringRadiuss[ringRadiuss.length - 1] + width; // 0.402

      const rings = ringRadiuss.map((innerRadius, index) => {
        const ringGeometry = new THREE.RingGeometry(
          innerRadius,
          innerRadius + width,
          64
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: "#ffffff",
          // map: contrailTexture,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(ringGeometry, ringMaterial);
        // Small Z-offset to prevent overlapping rings from flickering
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
          depthWrite: false, // Add this to prevent depth conflicts
        });

        // Poisson disc sampling for natural distribution without clustering
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

          function gridKey(x: number, y: number) {
            return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
          }

          function isInExcludedRange(dist: number) {
            return excludeRanges.some(
              (range) => dist >= range.min && dist <= range.max
            );
          }

          function isValid(x: number, y: number) {
            const dist = Math.sqrt(x * x + y * y);
            if (dist < minR || dist > maxR) return false;
            if (isInExcludedRange(dist)) return false;

            // Check neighboring cells
            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);

            for (let i = -2; i <= 2; i++) {
              for (let j = -2; j <= 2; j++) {
                const key = `${gx + i},${gy + j}`;
                const nearby = grid.get(key);
                if (nearby) {
                  for (const p of nearby) {
                    const dx = p.x - x;
                    const dy = p.y - y;
                    if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
                      return false;
                    }
                  }
                }
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

          // Start with initial random point
          function randomPointInRing(minR: number, maxR: number) {
            let angle, radius, x, y, dist;
            let attempts = 0;
            do {
              angle = Math.random() * Math.PI * 2;
              radius = Math.sqrt(
                Math.random() * (maxR * maxR - minR * minR) + minR * minR
              );
              x = Math.cos(angle) * radius;
              y = Math.sin(angle) * radius;
              dist = Math.sqrt(x * x + y * y);
              attempts++;
            } while (isInExcludedRange(dist) && attempts < 100);

            return { x, y };
          }

          const initialPoint = randomPointInRing(minR, maxR);
          addPoint(initialPoint.x, initialPoint.y);

          const activeList = [initialPoint];

          while (activeList.length > 0) {
            const randomIndex = Math.floor(Math.random() * activeList.length);
            const point = activeList[randomIndex];
            let found = false;

            for (let i = 0; i < maxAttempts; i++) {
              const angle = Math.random() * Math.PI * 2;
              const radius = minDistance + Math.random() * minDistance;
              const newX = point.x + Math.cos(angle) * radius;
              const newY = point.y + Math.sin(angle) * radius;

              if (isValid(newX, newY)) {
                addPoint(newX, newY);
                activeList.push({ x: newX, y: newY });
                found = true;
                break;
              }
            }

            if (!found) {
              activeList.splice(randomIndex, 1);
            }
          }

          return points;
        }

        // Create exclude ranges for each ring (inner radius to outer radius)
        const excludeRanges = ringRadiuss.map((innerRadius) => ({
          min: innerRadius - 0.005, // Small buffer
          max: innerRadius + width + 0.005, // Small buffer
        }));

        // Generate well-distributed plane positions, excluding ring areas
        const planePositions = poissonDiscInRing(
          minRadius,
          maxRadius,
          0.1,
          excludeRanges
        );

        planePositions.forEach((pos) => {
          const _2dPlane = new THREE.Mesh(geometry, material);
          // Move planes slightly forward in Z to avoid Z-fighting with rings
          _2dPlane.position.set(pos.x, pos.y, 0.005); // Changed from 0 to 0.005
          const angle = Math.atan2(pos.y, pos.x);
          _2dPlane.rotation.z = angle;
          obj3d.add(_2dPlane);
        });
      }
      obj3dWrapper.rotateX(THREE.MathUtils.degToRad(-90));

      // GSAP Animations (Optimized for Mobile)
      gsap.to(obj3dWrapper.rotation, {
        x: THREE.MathUtils.degToRad(-45),
        z: THREE.MathUtils.degToRad(20),
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 1, // Slightly higher scrub for smoother mobile interpolation
          invalidateOnRefresh: true, // Recalculates on resize
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
        x: 8,
        y: 8,
        z: 8,
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
    {
      const ambLight = new THREE.AmbientLight("#ffffff", 0.2);

      mainGroup.add(ambLight);
    }

    {
      const material = new THREE.MeshBasicMaterial({ color: "#ffffff" });
      gui.addColor(material, "color").name("Ground color");
    }
  });

  window.addEventListener("mousemove", (event) => {
    // Normalize coordinates from -1 to +1
    targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  function parallax() {
    mouse.x += (targetMouse.x - mouse.x) * 0.05;
    mouse.y += (targetMouse.y - mouse.y) * 0.05;

    mainGroup.position.x = mouse.x * 0.2;
    mainGroup.position.y = mouse.y * 0.1 + 0.5;

    mainGroup.rotation.y = mouse.x * 0.03;
    mainGroup.rotation.x = -mouse.y * 0.03;
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
