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
    if (Array.isArray(textures)) {
      textures.forEach(texture => {
        if (texture && texture.dispose) {
          texture.dispose();
        }
      });
    }

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
    const video = document.querySelector('#vid1');
    const videoEntity = document.querySelector('#videoEntity');

    const mindarScene = this.el;

    if (!video || !videoEntity) {
      console.error('Video or video entity is missing');
      return;
    }

    // Set up Three.js video texture
    video.addEventListener('play', () => {
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat; // Ensure the format matches the video content
      videoTexture.generateMipmaps = false;

      const material = new THREE.MeshBasicMaterial({ map: videoTexture });
      const mesh = videoEntity.getObject3D('mesh');
      debugger
      if (mesh) {
        mesh.material = material;
      } else {
        console.warn('Mesh not found on video entity');
      }
    });

    // Handle target found
    mindarScene.addEventListener('targetFound', () => {
      console.log('Target found!');
      videoEntity.setAttribute('visible', 'true');
      video.play().catch((error) => {
        console.warn('Video playback failed:', error);
      });
    });

    // Handle target lost
    mindarScene.addEventListener('targetLost', () => {
      console.log('Target lost!');
      videoEntity.setAttribute('visible', 'false');
      video.pause();
    });
  },
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
  // const videos = [
  //   document.getElementById('vid1'),
  // ];

  // const targets = videos.map((video, i) => ({
  //   video: video, // Source of the video
  //   entity: document.querySelector(`a-entity[mindar-image-target="targetIndex: ${i}"]`),
  //   videoElement: document.querySelector(`a-entity[mindar-image-target="targetIndex: ${i}"] a-video`),
  //   loaded: false
  // }));

  // let currentTarget = null;

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

      // function pauseAllVideosExcept(activeVideo) {
      //   videos.forEach(video => {
      //     if (video && video !== activeVideo) {
      //       video.pause();
      //       video.currentTime = 0;
      //     }
      //   });
      // }

      // Enhanced play button handler with error recovery
      // playButton.addEventListener('click', () => {
      //   if (currentTarget && currentTarget.video) {
      //     const startPlayback = async () => {
      //       currentTarget.videoElement.setAttribute('visible', true);
      //       playButton.style.display = 'none';
      //       try {
      //         await currentTarget.video.play();
      //       } catch (err) {
      //         console.warn('Playback failed, retrying:', err);
      //         setTimeout(async () => {
      //           try {
      //             await currentTarget.video.play();
      //           } catch (error) {
      //             console.error('Retry failed:', error);
      //             playButton.style.display = 'flex';
      //             currentTarget.videoElement.setAttribute('visible', false);
      //           }
      //         }, 100);
      //       }
      //     };
      //     startPlayback();
      //   }
      // });

      // Enhanced target handling with cleanup
      // targets.forEach(target => {
      //   if (!target.video) return;

      //   target.entity.addEventListener('targetFound', () => {
      //     if (currentTarget && currentTarget !== target) {
      //       currentTarget.video.pause();
      //       currentTarget.video.currentTime = 0;
      //       currentTarget.videoElement.setAttribute('visible', false);
      //     }
          
      //     currentTarget = target;
      //     target.video.currentTime = 0;
      //     pauseAllVideosExcept(target.video);
      //     target.videoElement.setAttribute('visible', false);
      //     target.video.play();
      //     playButton.style.display = 'flex';
      //   });

      //   target.entity.addEventListener('targetLost', () => {
      //     if (currentTarget === target) {
      //       target.video.pause();
      //       target.video.currentTime = 0;
      //       playButton.style.display = 'none';
      //       target.videoElement.setAttribute('visible', false);
      //       currentTarget = null;
      //     }
      //   });

      //   // Enhanced video event handlers
      //   target.video.addEventListener('play', () => {
      //     pauseAllVideosExcept(target.video);
      //   });

      //   target.video.addEventListener('ended', () => {
      //     if (target.video.loop) {
      //       target.video.currentTime = 0;
      //       target.video.play().catch(() => {
      //         playButton.style.display = 'flex';
      //       });
      //     }
      //   });

      //   target.video.addEventListener('error', () => {
      //     console.warn('Video error, attempting recovery');
      //     if (currentTarget === target) {
      //       // playButton.style.display = 'none';
      //       target.videoElement.setAttribute('visible', false);
      //     }
      //     const currentSrc = target.video.src;
      //     target.video.src = '';
      //     target.video.load();
      //     target.video.src = currentSrc;
      //   });

      //   target.video.muted = false;
      // });
    })
    .catch(function(err) {
      console.error('Camera initialization error:', err);
      loadingProgress.textContent = 'Camera permission denied';
    });
  }, 0);
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

// document.querySelector('a-scene').setAttribute('video-material', '');