// Enhanced cleanup function with memory management
function performCleanup(fullCleanup = false) {
  const scene = document.querySelector('a-scene');
  const arSystem = scene?.systems['mindar-image-system'];
  
  // Clean up video resources
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video && !video.paused) {
      video.pause();
      video.currentTime = 0;
      if (fullCleanup) {
        const src = video.src;
        video.src = '';
        video.load();
        // Reload video source after cleanup
        setTimeout(() => { video.src = src; }, 100);
      }
    }
  });

  // Clean up WebGL context and textures
  if (scene?.renderer) {
    const gl = scene.renderer.getContext();
    
    // Clean up WebGL textures
    const textures = scene.renderer.info.memory.textures || [];
    textures.forEach(texture => {
      if (texture && texture.dispose) {
        texture.dispose();
      }
    });

    // Clean up WebGL buffers
    if (gl) {
      const numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      for (let unit = 0; unit < numTextureUnits; unit++) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      }
      
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.warn('GC not available');
      }
    }
  }

  // Clean up AR system if needed
  if (fullCleanup && arSystem) {
    try {
      arSystem.stop();
      setTimeout(() => {
        arSystem.start();
      }, 1000);
    } catch (e) {
      console.warn('AR system cleanup error:', e);
    }
  }

  return Promise.resolve();
}

// Optimization system
const AROptimizer = {
  lastCleanup: Date.now(),
  errorCount: 0,
  isProcessing: false,
  
  initialize() {
    this.setupAutoCleanup();
    this.setupErrorHandling();
    this.setupMemoryMonitoring();
  },

  setupAutoCleanup() {
    // Light cleanup every 2 minutes
    setInterval(() => {
      if (!document.hidden && !this.isProcessing) {
        this.isProcessing = true;
        performCleanup(false)
          .finally(() => {
            this.isProcessing = false;
          });
      }
    }, 120000);

    // Full cleanup every 10 minutes
    setInterval(() => {
      if (!document.hidden && !this.isProcessing) {
        this.isProcessing = true;
        performCleanup(true)
          .finally(() => {
            this.isProcessing = false;
          });
      }
    }, 600000);
  },

  setupErrorHandling() {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    scene.addEventListener('arError', async () => {
      this.errorCount++;
      
      if (this.errorCount > 3) {
        await performCleanup(true);
        this.errorCount = 0;
      } else {
        await performCleanup(false);
      }

      setTimeout(() => {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }, 300000);
    });
  },

  setupMemoryMonitoring() {
    if ('memory' in performance) {
      setInterval(() => {
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        if (usedJSHeapSize > jsHeapSizeLimit * 0.8) {
          if (!this.isProcessing) {
            this.isProcessing = true;
            performCleanup(true)
              .finally(() => {
                this.isProcessing = false;
              });
          }
        }
      }, 30000);
    }
  }
};

// Register video material component
AFRAME.registerComponent('video-material', {
  schema: {
    video: { type: 'selector' }
  },

  init: function () {
    const mesh = this.el.getObject3D('mesh');
    const video = this.data.video;
    debugger;

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      uniform sampler2D videoTexture;
      
      void main() {
        vec4 color = texture2D(videoTexture, vUv);
        float dx = min(vUv.x, 1.0 - vUv.x);
        float dy = min(vUv.y, 1.0 - vUv.y);
        float edgeDistance = min(dx, dy);
        float fadeWidth = 0.15;
        float opacity = smoothstep(0.0, fadeWidth, edgeDistance);
        float globalOpacity = 0.8;
        gl_FragColor = vec4(color.rgb, color.a * opacity * globalOpacity);
      }
    `;

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        videoTexture: { value: videoTexture }
      },
      transparent: true,
      alphaTest: 0.01
    });

    mesh.material = material;

    // Enhanced cleanup on component removal
    this.el.addEventListener('componentremoved', (evt) => {
      if (evt.detail.name === 'video-material') {
        if (material.uniforms.videoTexture.value) {
          material.uniforms.videoTexture.value.dispose();
        }
        material.dispose();
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const loadingProgress = document.getElementById('loading-progress');
  const loadingScreen = document.getElementById('loading-screen');
  const arScene = document.getElementById('ar-scene');
  const scene = document.querySelector('a-scene');
  
  // Initialize scene settings
  loadingScreen.style.display = 'flex';
  loadingProgress.style.display = 'block';
  scene.renderer.setClearColor(0x000000, 0);
  scene.object3D.background = null;

  // Initialize video elements
  const videos = [
    document.getElementById('vid1'),
  ];

  const targets = videos.map((video, i) => ({
    video: video,
    entity: document.querySelector(`a-entity[mindar-image-target="targetIndex: ${i}"]`),
    plane: document.querySelector(`a-entity[mindar-image-target="targetIndex: ${i}"] a-plane`),
    loaded: false
  }));

  let currentTarget = null;

  // Initialize AR Optimizer
  AROptimizer.initialize();

  // Camera initialization with enhanced error handling
  setTimeout(() => {
    loadingProgress.textContent = 'Starting camera...';
    
    navigator.mediaDevices.getUserMedia({ 
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })
    .then(function(stream) {
      stream.getTracks().forEach(track => track.stop());
      
      scene.addEventListener('arReady', function() {
        loadingScreen.style.display = 'none';
        loadingProgress.style.display = 'none';
        arScene.classList.add('ready');
      });

      function pauseAllVideosExcept(activeVideo) {
        videos.forEach(video => {
          if (video && video !== activeVideo) {
            video.pause();
            video.currentTime = 0;
          }
        });
      }

      const playButton = document.getElementById('playButton');

      // Enhanced play button handler with error recovery
      playButton.addEventListener('click', () => {
        if (currentTarget && currentTarget.video) {
          const startPlayback = async () => {
            currentTarget.plane.setAttribute('visible', true);
            playButton.style.display = 'none';
            try {
              await currentTarget.video.play();
            } catch (err) {
              console.warn('Playback failed, retrying:', err);
              setTimeout(async () => {
                try {
                  await currentTarget.video.play();
                } catch (error) {
                  console.error('Retry failed:', error);
                  playButton.style.display = 'flex';
                  currentTarget.plane.setAttribute('visible', false);
                }
              }, 100);
            }
          };
          startPlayback();
        }
      });

      // Enhanced target handling with cleanup
      targets.forEach(target => {
        if (!target.video) return;

        target.entity.addEventListener('targetFound', () => {
          if (currentTarget && currentTarget !== target) {
            currentTarget.video.pause();
            currentTarget.video.currentTime = 0;
            currentTarget.plane.setAttribute('visible', false);
          }
          
          currentTarget = target;
          target.video.currentTime = 0;
          pauseAllVideosExcept(target.video);
          target.plane.setAttribute('visible', false);
          playButton.style.display = 'flex';
        });

        target.entity.addEventListener('targetLost', () => {
          if (currentTarget === target) {
            target.video.pause();
            target.video.currentTime = 0;
            playButton.style.display = 'none';
            target.plane.setAttribute('visible', false);
            currentTarget = null;
          }
        });

        // Enhanced video event handlers
        target.video.addEventListener('play', () => {
          pauseAllVideosExcept(target.video);
        });

        target.video.addEventListener('ended', () => {
          if (target.video.loop) {
            target.video.currentTime = 0;
            target.video.play().catch(() => {
              playButton.style.display = 'flex';
            });
          }
        });

        target.video.addEventListener('error', () => {
          console.warn('Video error, attempting recovery');
          if (currentTarget === target) {
            playButton.style.display = 'none';
            target.plane.setAttribute('visible', false);
          }
          const currentSrc = target.video.src;
          target.video.src = '';
          target.video.load();
          target.video.src = currentSrc;
        });

        target.video.muted = false;
      });
    })
    .catch(function(err) {
      console.error('Camera initialization error:', err);
      loadingProgress.textContent = 'Camera permission denied';
    });
  }, 2000);
});

// Enhanced visibility change handling
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    performCleanup(true);
  }
});

// Additional cleanup handlers
window.addEventListener('beforeunload', () => performCleanup(true));
window.addEventListener('pagehide', () => performCleanup(true));