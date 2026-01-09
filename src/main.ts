import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import gsap from "gsap";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

RectAreaLightUniformsLib.init();

function main() {
  const canvas = document.querySelector("#c") as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---------- Camera (FIXED near/far) ----------
  const fov = 45;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const near = 0.1;
  const far = 20;

  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(0, 0, 5);

  // const controls = new OrbitControls(camera, canvas);

  const scene = new THREE.Scene();

  // scene.fog = new THREE.Fog(0xcccccc, 2, 15);
  // ---------- GUI ----------

  // ---------- Helpers ----------
  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // ---------- Lights ----------

  // const ambientLight = new THREE.AmbientLight(0xffffff, 3);
  // scene.add(ambientLight);

  const gltfLoader = new GLTFLoader();

  gltfLoader.load("/model/youearnbtc.glb", (gltf) => {
    const model = gltf.scene;
    model.position.y = 0.01;
    model.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const coinObject: THREE.Object3D = model.children.find(
      (obj) => obj.name === "coin"
    ) as THREE.Object3D;

    const textObject: THREE.Object3D = model.children.find(
      (obj) => obj.name === "Text"
    ) as THREE.Object3D;
    const textMesh = textObject as THREE.Mesh;
    textMesh.castShadow = true;
    textMesh.receiveShadow = true;

    textMesh.material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
    });

    console.log("textobject ", textObject);

    {
      const planeGeometry = new THREE.PlaneGeometry(20, 20, 10, 10);
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: "#000000",
      });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.position.z = -5;

      scene.add(plane);

      {
        const rectangleLight = new THREE.RectAreaLight(0xffffff, 50, 3, 3);
        rectangleLight.position.set(0, 0, 3);
        rectangleLight.lookAt(0, 0, 0);
        plane.add(rectangleLight);
      }

      // const axesHelper = new THREE.AxesHelper(10);
      // plane.add(axesHelper);
    }

    if (coinObject) {
      gsap.to(coinObject.rotation, {
        z: "+=" + Math.PI * 2,
        duration: 10,
        repeat: -1,
        ease: "none",
      });
    }
    {
      const sun = new THREE.DirectionalLight(0xffffff, 0.8);

      sun.position.set(4, 4, 10);
      sun.lookAt(0, 0, 0);
      scene.add(sun);
      scene.add(sun.target);
    }
    {
      const sun = new THREE.DirectionalLight(0xffffff, 10 / 3);

      sun.position.set(-4, 4, 10);
      sun.lookAt(0, 0, 0);
      scene.add(sun);
      scene.add(sun.target);
    }
    {
      const frontRectangleLight = new THREE.RectAreaLight(
        0xffffff,
        0.5,
        20,
        20
      );
      frontRectangleLight.lookAt(0, 0, 0);
      frontRectangleLight.position.set(0, 3, 10);
      scene.add(frontRectangleLight);
    }

    scene.add(model);
  });

  // ---------- Resize ----------
  function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;

    if (needResize) {
      renderer.setSize(width, height, false);
    }

    return needResize;
  }

  // ---------- Render loop ----------
  function render() {
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
    // controls.update();
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
