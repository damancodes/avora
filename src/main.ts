import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import GUI from "lil-gui";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger"; // Add this
import { generateAssetPath } from "./util";
gsap.registerPlugin(ScrollTrigger);

const gui = new GUI();
gui.hide();
async function main() {
  const scene = new THREE.Scene();
  scene.position.y += 0.1;

  // --- MOUSE PARALLAX START ---
  const cursor = { x: 0, y: 0 };

  window.addEventListener("mousemove", (e) => {
    cursor.x = e.clientX / window.innerWidth - 0.5;
    cursor.y = e.clientY / window.innerHeight - 0.5;

    // Smoothly transition the scene position
    // gsap.to(scene.position, {
    //   x: cursor.x * 0.3, // Adjust 0.3 to increase/decrease horizontal intensity
    //   y: cursor.y * -0.3 + 0.1, // Adjust 0.3 to increase/decrease vertical intensity
    //   duration: 1.5,
    //   ease: "power3.out",
    // });
    gsap.to(camera.rotation, {
      y: -cursor.x * 0.05,
      x: -cursor.y * 0.05,
      duration: 2,
      ease: "power2.out",
    });
  });
  const bgParams = {
    background: "#202020",
  };
  scene.background = new THREE.Color(bgParams.background);

  // add color controller
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

  camera.position.set(0, 0, 1);

  scene.add(camera);

  const canvas = document.getElementById("c") as HTMLCanvasElement;

  //textures

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

  ///textures
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // const controls = new OrbitControls(camera, canvas);
  // controls.target.set(0, 0, 0);
  // controls.update();

  function resizeRendererToCanvasSize(_renderer: THREE.WebGLRenderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const needResize = canvas.width != width || canvas.height != height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  const gltfLoader = new GLTFLoader();

  const loader = new THREE.TextureLoader();
  const texture = loader.load(generateAssetPath("/images/plane.png"));

  gltfLoader.load(generateAssetPath("/model/plane1.glb"), (root) => {
    const model = root.scene;
    model.scale.set(0.01, 0.01, 0.01);

    //positioning the camera
    const box = new THREE.Box3().setFromObject(model);
    const boxSize = box.getSize(new THREE.Vector3()).length();
    const boxCenter = box.getCenter(new THREE.Vector3());

    const sizeToFitOnScreen = boxSize * 1.2;
    const halfSizeToFitOnScreen = sizeToFitOnScreen / 2;
    const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);
    // compute a unit vector that points in the direction the camera is now
    // in the xz plane from the center of the box
    const direction = new THREE.Vector3()
      .subVectors(camera.position, boxCenter)
      .multiply(new THREE.Vector3(1, 0, 1))
      .normalize();

    // move the camera to a position distance units way from the center
    // in whatever direction the camera was from the center already
    camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

    // pick some near and far values for the frustum that
    // will contain the box.

    camera.near = boxSize / 100;
    camera.far = boxSize * 3;

    camera.updateProjectionMatrix();

    camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);

    camera.updateProjectionMatrix();
    scene.add(model);
    //initial rotation
    {
      model.rotateY(THREE.MathUtils.degToRad(-140));
      model.rotateZ(-0.2);
      model.rotateX(-0.3);
    }

    {
      // 1. Setup the container for the rings
      const obj3dWrapper = new THREE.Object3D();
      const obj3d = new THREE.Object3D();
      // Offset it slightly behind the plane
      obj3d.position.z = model.position.z - 0.05;
      obj3dWrapper.add(obj3d);
      scene.add(obj3dWrapper);

      const ringRadiuss = [0.1, 0.2, 0.3];
      const width = 0.002; // Increased width to make the "vapor" more visible

      const rings = ringRadiuss.map((innerRadius) => {
        const ringGeometry = new THREE.RingGeometry(
          innerRadius,
          innerRadius + width,
          64 // 64 segments is enough for a smooth circle
        );

        // Use BasicMaterial so it's always visible and "glows"
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: "#ffffff",
          map: contrailTexture, // This uses your soft canvas gradient
          transparent: true,

          depthWrite: false,
          side: THREE.DoubleSide,
        });

        return new THREE.Mesh(ringGeometry, ringMaterial);
      });

      // Add rings to the parent object
      rings.forEach((ring) => obj3d.add(ring));

      {
        // 1. Define geometry and material once to save memory
        const geometry = new THREE.PlaneGeometry(0.02, 0.02);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,

          opacity: 0.2,
          side: THREE.DoubleSide, // Optional: makes planes visible from both sides
        });

        const positions = [
          // Quadrant 1: Top Right (+x, +y)
          { x: 0.15, y: 0.45 },
          { x: 0.45, y: 0.15 },
          { x: 0.3, y: 0.3 },
          { x: 0.2, y: 0.1 },
          { x: 0.1, y: 0.2 },

          // Quadrant 2: Top Left (-x, +y)
          { x: -0.15, y: 0.45 },
          { x: -0.45, y: 0.15 },
          { x: -0.3, y: 0.3 },
          { x: -0.2, y: 0.1 },
          { x: -0.1, y: 0.2 },

          // Quadrant 3: Bottom Left (-x, -y)
          { x: -0.15, y: -0.45 },
          { x: -0.45, y: -0.15 },
          { x: -0.3, y: -0.3 },
          { x: -0.2, y: -0.1 },
          { x: -0.1, y: -0.2 },

          // Quadrant 4: Bottom Right (+x, -y)
          { x: 0.15, y: -0.45 },
          { x: 0.45, y: -0.15 },
          { x: 0.3, y: -0.3 },
          { x: 0.2, y: -0.1 },
          { x: 0.1, y: -0.2 },
        ];

        // Implementation
        positions.forEach((pos) => {
          const _2dPlane = new THREE.Mesh(geometry, material);

          _2dPlane.position.set(pos.x, pos.y, 0);

          // Rotation still calculates based on the fixed position
          const angle = Math.atan2(pos.y, pos.x);
          _2dPlane.rotation.z = angle;

          obj3d.add(_2dPlane);
        });
      }
      // 2. Initial Rotation to align with the plane's exhaust direction
      obj3dWrapper.rotateX(THREE.MathUtils.degToRad(-90));

      // 3. GSAP Animations
      // Rotation animation
      gsap.to(obj3dWrapper.rotation, {
        x: THREE.MathUtils.degToRad(-45),
        z: THREE.MathUtils.degToRad(20),
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
        },
        ease: "sine.inOut",
      });
      gsap.to(obj3d.rotation, {
        z: "+=" + Math.PI * 2,
        duration: 50,
        repeat: -1,
        ease: "linear",
      });

      // Scale animation (Expanding effect)
      obj3d.scale.set(0, 0, 0);
      gsap.to(obj3d.scale, {
        x: 8,
        y: 8,
        z: 8,
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
        },
      });
    }

    {
      gsap.to(model.rotation, {
        // x: THREE.MathUtils.degToRad(5),
        z: "+=0.2",
        repeat: -1,
        duration: 3,
        yoyo: true,
        ease: "sine.inOut",
      });

      //animations scroll
      gsap.to(model.rotation, {
        x: "+=0.4",
        y: "+=1",
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5, // FIX: Lower scrub on mobile feels more responsive
        },
      });
    }

    {
      //lights 1
      const directionalLight = new THREE.DirectionalLight("#ffffff", 14);

      directionalLight.position.copy(camera.position);
      scene.add(directionalLight);
      scene.add(directionalLight.target);
    }

    {
      //GROUND MESH

      const material = new THREE.MeshBasicMaterial({
        color: "#ffffff",
      });

      gui.addColor(material, "color").name("Ground color");

      // groundMesh.rotateX(Math.PI / 2);
    }
  });

  const render = () => {
    renderer.render(scene, camera);
    if (resizeRendererToCanvasSize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }
    // controls.update();
    window.requestAnimationFrame(render);
  };
  window.requestAnimationFrame(render);
}

main();
