import * as THREE from 'three';
import {
  PALETTE,
  LIGHTING,
  CAMERA,
  QUALITY_CONFIG,
  QUALITY_TIERS,
  resolvePixelRatio,
  smoothstep,
} from '../config/constants.js';

const DEFAULT_TIER = QUALITY_TIERS.MEDIUM;

const MOON_OFFSET = Object.freeze({ x: -38, y: 72, z: 30 });

const SHADOW_CAMERA = Object.freeze({
  HALF_EXTENT: 42,
  NEAR: 1,
  FAR: 220,
  BIAS: -0.0004,
  NORMAL_BIAS: 0.025,
  FALLBACK_MAP_SIZE: 1024,
});

const ENVIRONMENT = Object.freeze({
  RADIUS: 50,
  WIDTH_SEGMENTS: 64,
  HEIGHT_SEGMENTS: 72,
  BLUR_SIGMA: 0.04,
  NEAR: 0.1,
  FAR: 100,
  GROUND: 0x0d1217,
  HORIZON: 0x1b2631,
  BAND: 0x5a6f84,
  ZENITH: 0x2c3d4f,
  BAND_CENTER: 0.15,
  BAND_WIDTH: 0.11,
  PANELS: Object.freeze([
    Object.freeze({
      color: 0x9fb4c8,
      intensity: 1.2,
      width: 48,
      height: 7,
      distance: 30,
      azimuth: Math.PI,
      elevation: 0.2,
    }),
    Object.freeze({
      color: 0x7f97ad,
      intensity: 0.8,
      width: 30,
      height: 10,
      distance: 30,
      azimuth: Math.PI * 0.42,
      elevation: 0.62,
    }),
    Object.freeze({
      color: 0x6d8399,
      intensity: 0.55,
      width: 26,
      height: 7,
      distance: 30,
      azimuth: -Math.PI * 0.35,
      elevation: 0.34,
    }),
  ]),
  PANEL_SEGMENTS_X: 16,
  PANEL_SEGMENTS_Y: 8,
});

const isValidTier = (tier) => typeof tier === 'string' && Object.prototype.hasOwnProperty.call(QUALITY_CONFIG, tier);

export class RendererManager {
  constructor(canvas, initialTier = DEFAULT_TIER) {
    this.canvas = canvas;
    this.currentTier = null;
    this.contextLost = false;
    this.resizeFrame = 0;
    this.shadowsEnabled = false;
    this.environmentTarget = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.TONE_MAPPING_EXPOSURE;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(PALETTE.FOG, 1);

    const startTier = isValidTier(initialTier) ? initialTier : DEFAULT_TIER;
    const { width, height } = this.readViewportSize();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.SKY);
    this.scene.fog = new THREE.FogExp2(PALETTE.FOG, QUALITY_CONFIG[startTier].fogDensity);

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV_MIN, width / height, CAMERA.NEAR, CAMERA.FAR);
    this.camera.position.set(0, 5, 12);
    this.camera.lookAt(0, 1, -30);
    this.scene.add(this.camera);

    this.hemiLight = new THREE.HemisphereLight(PALETTE.HEMI_SKY, PALETTE.HEMI_GROUND, LIGHTING.HEMI_INTENSITY);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(PALETTE.MOONLIGHT, LIGHTING.MOON_INTENSITY);
    this.configureMoonShadow();
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    this.moonOffset = new THREE.Vector3(MOON_OFFSET.x, MOON_OFFSET.y, MOON_OFFSET.z);
    this.lightForward = this.moonOffset.clone().normalize();
    this.lightRight = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, this.lightForward).normalize();
    this.lightUp = new THREE.Vector3().crossVectors(this.lightForward, this.lightRight).normalize();
    this.shadowFocus = new THREE.Vector3();

    this.buildEnvironment();

    this.handleResize = this.handleResize.bind(this);
    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored = this.handleContextRestored.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize, { passive: true });
      window.addEventListener('orientationchange', this.handleResize, { passive: true });
    }
    if (canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    }

    this.applyQualityTier(startTier);
  }

  configureMoonShadow() {
    const shadow = this.moonLight.shadow;
    const shadowCamera = shadow.camera;
    shadowCamera.left = -SHADOW_CAMERA.HALF_EXTENT;
    shadowCamera.right = SHADOW_CAMERA.HALF_EXTENT;
    shadowCamera.top = SHADOW_CAMERA.HALF_EXTENT;
    shadowCamera.bottom = -SHADOW_CAMERA.HALF_EXTENT;
    shadowCamera.near = SHADOW_CAMERA.NEAR;
    shadowCamera.far = SHADOW_CAMERA.FAR;
    shadowCamera.updateProjectionMatrix();
    shadow.bias = SHADOW_CAMERA.BIAS;
    shadow.normalBias = SHADOW_CAMERA.NORMAL_BIAS;
    shadow.mapSize.set(SHADOW_CAMERA.FALLBACK_MAP_SIZE, SHADOW_CAMERA.FALLBACK_MAP_SIZE);
    this.moonLight.castShadow = false;
  }

  buildEnvironment() {
    let generator = null;
    let skyGeometry = null;
    let skyMaterial = null;
    const panelGeometries = [];
    const panelMaterials = [];

    try {
      const environmentScene = new THREE.Scene();

      skyGeometry = new THREE.SphereGeometry(
        ENVIRONMENT.RADIUS,
        ENVIRONMENT.WIDTH_SEGMENTS,
        ENVIRONMENT.HEIGHT_SEGMENTS,
      );
      skyGeometry.setAttribute('color', this.createSkyColors(skyGeometry));
      skyMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        toneMapped: false,
      });
      environmentScene.add(new THREE.Mesh(skyGeometry, skyMaterial));

      for (const panel of ENVIRONMENT.PANELS) {
        const geometry = new THREE.PlaneGeometry(
          panel.width,
          panel.height,
          ENVIRONMENT.PANEL_SEGMENTS_X,
          ENVIRONMENT.PANEL_SEGMENTS_Y,
        );
        geometry.setAttribute('color', this.createPanelFalloff(geometry, panel.width, panel.height));
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(panel.color).multiplyScalar(panel.intensity),
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        const horizontal = Math.cos(panel.elevation) * panel.distance;
        mesh.position.set(
          Math.sin(panel.azimuth) * horizontal,
          Math.sin(panel.elevation) * panel.distance,
          Math.cos(panel.azimuth) * horizontal,
        );
        mesh.lookAt(0, 0, 0);
        environmentScene.add(mesh);
        panelGeometries.push(geometry);
        panelMaterials.push(material);
      }

      generator = new THREE.PMREMGenerator(this.renderer);
      const target = generator.fromScene(
        environmentScene,
        ENVIRONMENT.BLUR_SIGMA,
        ENVIRONMENT.NEAR,
        ENVIRONMENT.FAR,
      );

      const previousTarget = this.environmentTarget;
      this.environmentTarget = target;
      this.scene.environment = target.texture;
      this.scene.environmentIntensity = LIGHTING.ENVIRONMENT_INTENSITY;

      if (previousTarget) {
        try {
          previousTarget.dispose();
        } catch (disposeError) {
          console.warn('RendererManager: previous environment disposal failed.', disposeError);
        }
      }
    } catch (error) {
      console.warn('RendererManager: procedural environment unavailable.', error);
    } finally {
      skyGeometry?.dispose();
      skyMaterial?.dispose();
      for (const geometry of panelGeometries) geometry.dispose();
      for (const material of panelMaterials) material.dispose();
      generator?.dispose();
    }
  }

  createSkyColors(geometry) {
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const ground = new THREE.Color(ENVIRONMENT.GROUND);
    const horizon = new THREE.Color(ENVIRONMENT.HORIZON);
    const band = new THREE.Color(ENVIRONMENT.BAND);
    const zenith = new THREE.Color(ENVIRONMENT.ZENITH);
    const mixed = new THREE.Color();

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const length = Math.hypot(x, y, z) || 1;
      const elevation = y / length;
      const towardHorizonGlow = Math.max(0, -z / length);

      if (elevation < 0) {
        mixed.copy(horizon).lerp(ground, smoothstep(0, 0.22, -elevation));
      } else {
        mixed.copy(horizon).lerp(zenith, smoothstep(0.05, 0.85, elevation));
        const bandDistance = Math.abs(elevation - ENVIRONMENT.BAND_CENTER) / ENVIRONMENT.BAND_WIDTH;
        const bandStrength = Math.exp(-bandDistance * bandDistance * 2.2) * (0.7 + 0.3 * towardHorizonGlow);
        mixed.lerp(band, Math.min(1, bandStrength));
      }

      colors[index * 3] = mixed.r;
      colors[index * 3 + 1] = mixed.g;
      colors[index * 3 + 2] = mixed.b;
    }

    return new THREE.BufferAttribute(colors, 3);
  }

  createPanelFalloff(geometry, width, height) {
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;

    for (let index = 0; index < positions.count; index += 1) {
      const u = Math.abs(positions.getX(index) / halfWidth);
      const v = Math.abs(positions.getY(index) / halfHeight);
      const falloff = (1 - smoothstep(0.35, 1, u)) * (1 - smoothstep(0.2, 1, v));
      colors[index * 3] = falloff;
      colors[index * 3 + 1] = falloff;
      colors[index * 3 + 2] = falloff;
    }

    return new THREE.BufferAttribute(colors, 3);
  }

  readViewportSize() {
    if (typeof window === 'undefined') return { width: 1280, height: 720 };
    const width = Math.max(1, Math.floor(window.innerWidth || 1));
    const height = Math.max(1, Math.floor(window.innerHeight || 1));
    return { width, height };
  }

  applyQualityTier(tier) {
    const resolvedTier = isValidTier(tier) ? tier : DEFAULT_TIER;
    const config = QUALITY_CONFIG[resolvedTier];

    this.renderer.setPixelRatio(resolvePixelRatio(resolvedTier));
    this.onResize();

    if (this.scene.fog) this.scene.fog.density = config.fogDensity;

    const shadowsEnabled = Boolean(config.shadows);
    const shadow = this.moonLight.shadow;
    const mapSize = config.shadowMapSize > 0 ? config.shadowMapSize : SHADOW_CAMERA.FALLBACK_MAP_SIZE;

    if (shadow.mapSize.x !== mapSize || shadow.mapSize.y !== mapSize) {
      shadow.mapSize.set(mapSize, mapSize);
      this.releaseShadowMap();
    }

    if (!shadowsEnabled) this.releaseShadowMap();

    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.moonLight.castShadow = shadowsEnabled;

    if (shadowsEnabled !== this.shadowsEnabled) {
      this.shadowsEnabled = shadowsEnabled;
      this.invalidateMaterials();
    }

    this.currentTier = resolvedTier;
    this.setShadowFocus(this.shadowFocus.x, this.shadowFocus.y, this.shadowFocus.z);
  }

  releaseShadowMap() {
    const shadow = this.moonLight.shadow;
    if (!shadow.map) return;
    try {
      shadow.map.dispose();
    } catch (error) {
      console.warn('RendererManager: shadow map disposal failed.', error);
    }
    shadow.map = null;
  }

  invalidateMaterials() {
    this.scene.traverse((object) => {
      const material = object.material;
      if (!material) return;
      if (Array.isArray(material)) {
        for (let index = 0; index < material.length; index += 1) {
          if (material[index]) material[index].needsUpdate = true;
        }
      } else {
        material.needsUpdate = true;
      }
    });
  }

  getCurrentTier() {
    return this.currentTier;
  }

  setShadowFocus(x, y, z) {
    const focus = this.shadowFocus;
    focus.set(x, y, z);

    const mapSize = this.moonLight.shadow.mapSize.x || SHADOW_CAMERA.FALLBACK_MAP_SIZE;
    const texelSize = (SHADOW_CAMERA.HALF_EXTENT * 2) / mapSize;

    const right = this.lightRight;
    const up = this.lightUp;
    const forward = this.lightForward;

    const rightAmount = Math.round(focus.dot(right) / texelSize) * texelSize;
    const upAmount = Math.round(focus.dot(up) / texelSize) * texelSize;
    const forwardAmount = focus.dot(forward);

    const target = this.moonLight.target;
    target.position.set(
      right.x * rightAmount + up.x * upAmount + forward.x * forwardAmount,
      right.y * rightAmount + up.y * upAmount + forward.y * forwardAmount,
      right.z * rightAmount + up.z * upAmount + forward.z * forwardAmount,
    );
    this.moonLight.position.copy(target.position).add(this.moonOffset);

    target.updateMatrixWorld();
    this.moonLight.updateMatrixWorld();
  }

  render() {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    if (this.resizeFrame) return;
    if (typeof requestAnimationFrame === 'function') {
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.onResize();
      });
    } else {
      this.onResize();
    }
  }

  onResize() {
    const { width, height } = this.readViewportSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  handleContextLost(event) {
    event?.preventDefault?.();
    this.contextLost = true;
  }

  handleContextRestored() {
    this.contextLost = false;
    this.releaseShadowMap();
    this.buildEnvironment();
    this.applyQualityTier(this.currentTier ?? DEFAULT_TIER);
  }

  isContextLost() {
    return this.contextLost;
  }

  getDrawCalls() {
    return this.renderer.info.render.calls;
  }

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('orientationchange', this.handleResize);
      if (this.resizeFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.resizeFrame);
    }
    this.resizeFrame = 0;
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    }
    this.releaseShadowMap();
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.scene.environment = null;
    this.renderer.dispose();
  }
}
