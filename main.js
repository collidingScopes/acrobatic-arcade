// Main carousel functionality
const list = document.querySelector('ul')
const items = list.querySelectorAll('li')
const handGestureButton = document.getElementById('hand-gesture-button')

// Track current active index
let currentIndex = 0
let handTrackingActive = false
let lastHandX = null // Changed to null for better initial state
let handMovementThreshold = 10 // Reduced threshold to make gestures more sensitive
let lastNavigationTime = 0
let navigationCooldown = 1000 // Reduced cooldown for better responsiveness
let debugMode = true // Enable debug mode for troubleshooting

// Create webcam and canvas elements for hand tracking
const createWebcamElements = () => {
  // Create container
  const container = document.createElement('div')
  container.id = 'webcam-container'
  container.style.position = 'fixed'
  container.style.bottom = '20px'
  container.style.right = '20px'
  container.style.width = '200px'
  container.style.height = '150px'
  container.style.zIndex = '1000'
  container.style.borderRadius = '8px'
  container.style.overflow = 'hidden'
  container.style.border = '2px solid rgb(255, 77, 0)'
  
  // Create video element
  const video = document.createElement('video')
  video.id = 'webcam'
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'cover'
  // Add mirror effect to the webcam
  video.style.transform = 'scaleX(-1)'
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  
  // Create canvas overlay for hand tracking visualization
  const canvas = document.createElement('canvas')
  canvas.id = 'hand-canvas'
  canvas.style.position = 'absolute'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  // Mirror the canvas as well to match the video
  canvas.style.transform = 'scaleX(-1)'
  
  // Add close button
  const closeButton = document.createElement('button')
  closeButton.textContent = '✕'
  closeButton.style.position = 'absolute'
  closeButton.style.top = '5px'
  closeButton.style.right = '5px'
  closeButton.style.backgroundColor = 'rgba(0,0,0,0.5)'
  closeButton.style.color = 'white'
  closeButton.style.border = 'none'
  closeButton.style.borderRadius = '50%'
  closeButton.style.width = '24px'
  closeButton.style.height = '24px'
  closeButton.style.cursor = 'pointer'
  closeButton.style.zIndex = '1001'
  closeButton.onclick = stopHandTracking
  
  // Add status indicator
  const statusIndicator = document.createElement('div')
  statusIndicator.id = 'tracking-status'
  statusIndicator.textContent = 'Starting...'
  statusIndicator.style.position = 'absolute'
  statusIndicator.style.bottom = '5px'
  statusIndicator.style.left = '5px'
  statusIndicator.style.backgroundColor = 'rgba(0,0,0,0.5)'
  statusIndicator.style.color = 'white'
  statusIndicator.style.padding = '2px 6px'
  statusIndicator.style.borderRadius = '4px'
  statusIndicator.style.fontSize = '12px'
  
  // Debug indicator for hand movement
  if (debugMode) {
    const debugIndicator = document.createElement('div')
    debugIndicator.id = 'debug-indicator'
    debugIndicator.textContent = 'Debug: No movement'
    debugIndicator.style.position = 'absolute'
    debugIndicator.style.top = '5px'
    debugIndicator.style.left = '5px'
    debugIndicator.style.backgroundColor = 'rgba(255,0,0,0.5)'
    debugIndicator.style.color = 'white'
    debugIndicator.style.padding = '2px 6px'
    debugIndicator.style.borderRadius = '4px'
    debugIndicator.style.fontSize = '10px'
    container.appendChild(debugIndicator)
  }
  
  // Assemble container
  container.appendChild(video)
  container.appendChild(canvas)
  container.appendChild(closeButton)
  container.appendChild(statusIndicator)
  document.body.appendChild(container)
  
  return { video, canvas, statusIndicator }
}

const setActiveItem = (index) => {
  // Ensure index is within bounds
  index = Math.max(0, Math.min(index, items.length - 1))
  
  // Update current index
  currentIndex = index
  
  // Update active states
  for (let i = 0; i < items.length; i++) {
    items[i].dataset.active = (i === index).toString()
  }
  
  // Update grid layout
  const cols = new Array(items.length)
    .fill()
    .map((_, i) => {
      return i === index ? '10fr' : '1fr'
    })
    .join(' ')
    
  list.style.setProperty('grid-template-columns', cols)
}

const setIndex = (event) => {
  const closest = event.target.closest('li')
  if (closest) {
    const index = [...items].indexOf(closest)
    setActiveItem(index)
  }
}

// Handle keyboard navigation
const handleKeyboardNavigation = (event) => {
  if (event.key === 'ArrowLeft') {
    setActiveItem(currentIndex - 1)
    event.preventDefault()
  } else if (event.key === 'ArrowRight') {
    setActiveItem(currentIndex + 1)
    event.preventDefault()
  } else if (event.key === 'Enter') {
    // Get the active article element
    const activeItem = items[currentIndex]
    if (activeItem) {
      // Find the link within the active article and click it
      const link = activeItem.querySelector('a')
      if (link) {
        event.preventDefault()
        link.click()
      }
    }
  }
}

// Hand tracking initialization
const startHandTracking = async () => {
  if (handTrackingActive) return
  
  try {
    // Create elements for webcam and tracking visualization
    const { video, canvas, statusIndicator } = createWebcamElements()
    const ctx = canvas.getContext('2d')
    
    // Initialize webcam
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480, facingMode: 'user' }
    })
    video.srcObject = stream
    
    // Start playing the video
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve)
      }
    })
    
    // Set canvas size to match video dimensions
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    
    if (debugMode) {
      console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`)
      console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`)
    }
    
    // Load MediaPipe Hands solution
    const hands = new window.Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    })
    
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    })
    
    statusIndicator.textContent = 'Tracking active'
    handTrackingActive = true
    
    // Variables for index finger detection and timing
    let indexFingerUpStartTime = null;
    let isIndexFingerUp = false;
    const requiredHoldTime = 800; // milliseconds
    
    // Function to check if only the index finger is up
    const isOnlyIndexFingerUp = (landmarks) => {
      // For this detection we will use:
      // - Index finger tip (landmark 8) should be much higher than middle finger tip (landmark 12)
      // - Middle, ring, and pinky tips should be close to their respective mcp joints
      
      // Get relevant landmarks
      const indexTip = landmarks[8]; // Index finger tip
      const middleTip = landmarks[12]; // Middle finger tip
      const ringTip = landmarks[16]; // Ring finger tip
      const pinkyTip = landmarks[20]; // Pinky finger tip
      
      const indexMCP = landmarks[5]; // Index finger MCP joint
      const middleMCP = landmarks[9]; // Middle finger MCP joint
      const ringMCP = landmarks[13]; // Ring finger MCP joint
      const pinkyMCP = landmarks[17]; // Pinky finger MCP joint
      
      // Calculate vertical distances (in screen coordinates Y gets larger as you go down)
      const indexUp = indexMCP.y - indexTip.y > 0.05; // Index finger is extended upward
      
      // Check that other fingers are curled (tip close to MCP)
      const middleCurled = Math.abs(middleTip.y - middleMCP.y) < 0.1;
      const ringCurled = Math.abs(ringTip.y - ringMCP.y) < 0.1;
      const pinkyCurled = Math.abs(pinkyTip.y - pinkyMCP.y) < 0.1;
      
      // Also check that middle tip is not extended like index
      const middleNotUp = middleMCP.y - middleTip.y < 0.1;
      
      return indexUp && middleCurled && ringCurled && pinkyCurled && middleNotUp;
    };
    
    // Helper function to trigger click on active item
    const clickActiveItem = () => {
      const activeItem = items[currentIndex];
      if (activeItem) {
        const link = activeItem.querySelector('a');
        if (link) {
            statusIndicator.textContent = 'Clicking link!';
            link.click();
        }
      }
    };

    // Handle hand tracking results
    hands.onResults((results) => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Draw hand landmarks
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        statusIndicator.textContent = 'Hand detected';
        
        // Get wrist position (landmark 0)
        const wrist = landmarks[0];
        const handX = wrist.x * canvas.width;
        
        // Draw hand position indicator
        ctx.fillStyle = 'rgba(255, 77, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(handX, wrist.y * canvas.height, 10, 0, 2 * Math.PI);
        ctx.fill();
        
        // Check for index finger gesture
        const currentOnlyIndexUp = isOnlyIndexFingerUp(landmarks);
        const now = Date.now();
        
        // Handle index finger detection logic with timing
        if (currentOnlyIndexUp) {
          // Draw index finger indicator
          const indexTip = landmarks[8];
          ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
          ctx.beginPath();
          ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 15, 0, 2 * Math.PI);
          ctx.fill();
          
          if (!isIndexFingerUp) {
            // Just started holding up index finger
            isIndexFingerUp = true;
            indexFingerUpStartTime = now;
            statusIndicator.textContent = 'Index finger detected';
          } else {
            // Check if held long enough
            const heldDuration = now - indexFingerUpStartTime;
            if (heldDuration >= requiredHoldTime) {
                clickActiveItem();
            } else {
              // Update status with countdown
              statusIndicator.textContent = `Hold index finger: ${Math.round((requiredHoldTime - heldDuration) / 100) / 10}s`;
            }
          }
        } else {
          // Reset the timer if finger position changed
          isIndexFingerUp = false;
          indexFingerUpStartTime = null;
        }
        
        // Also draw a line showing the movement threshold
        if (lastHandX !== null) {
          // Draw threshold lines
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
          ctx.beginPath();
          ctx.moveTo(lastHandX - handMovementThreshold, wrist.y * canvas.height);
          ctx.lineTo(lastHandX + handMovementThreshold, wrist.y * canvas.height);
          ctx.stroke();
          
          // Show movement amount
          if (debugMode) {
            const debugIndicator = document.getElementById('debug-indicator');
            if (debugIndicator) {
              const movementAmount = Math.abs(handX - lastHandX);
              let debugText = `Movement: ${movementAmount.toFixed(1)}px (Threshold: ${handMovementThreshold}px)`;
              if (currentOnlyIndexUp) {
                debugText += ' | Index finger up!';
              }
              debugIndicator.textContent = debugText;
              debugIndicator.style.backgroundColor = currentOnlyIndexUp ? 
                'rgba(0,255,0,0.5)' : (movementAmount > handMovementThreshold ? 
                  'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)');
            }
          }
        }
        
        // Handle hand movement for navigation
        if (lastHandX !== null && now - lastNavigationTime > navigationCooldown) {
          const movementAmount = Math.abs(handX - lastHandX);
          
          if (movementAmount > handMovementThreshold) {
            // Fixed: The directionality was incorrect - now using correctly inverted logic
            // Since the webcam is mirrored, handX < lastHandX means the hand actually moved right
            if (handX < lastHandX) {
              // Hand moved right (in the mirrored view)
              setActiveItem(currentIndex + 1);
              lastNavigationTime = now;
              statusIndicator.textContent = 'Moved right ➡️';
            } else {
              // Hand moved left (in the mirrored view)
              setActiveItem(currentIndex - 1);
              lastNavigationTime = now;
              statusIndicator.textContent = 'Moved left ⬅️';
            }
          }
        }
        
        lastHandX = handX;
      } else {
        statusIndicator.textContent = 'No hand detected';
        // Don't reset lastHandX to allow for hand re-entry without losing position reference
        
        // Reset index finger detection
        isIndexFingerUp = false;
        indexFingerUpStartTime = null;
      }
    });
    
    // Start processing webcam feed
    const camera = new window.Camera(video, {
      onFrame: async () => {
        await hands.send({image: video})
      },
      width: canvas.width,
      height: canvas.height
    })
    camera.start()
    
  } catch (error) {
    console.error('Error starting hand tracking:', error)
    alert('Failed to initialize hand tracking. Please ensure you have granted camera permissions.')
    handTrackingActive = false
  }
}

const stopHandTracking = () => {
  if (!handTrackingActive) return
  
  const container = document.getElementById('webcam-container')
  if (container) {
    // Stop all tracks from the video stream
    const video = document.getElementById('webcam')
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks()
      tracks.forEach(track => track.stop())
    }
    
    // Remove the container
    document.body.removeChild(container)
  }
  
  handTrackingActive = false
  lastHandX = null
}

// Toggle hand tracking on button click
handGestureButton.addEventListener('click', () => {
  if (handTrackingActive) {
    stopHandTracking()
  } else {
    // Add MediaPipe scripts if they haven't been added yet
    if (!window.Hands) {
      const loadScripts = async () => {
        // Create function to load scripts sequentially
        const loadScript = (src) => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = src
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
        }
        
        try {
          // Load required MediaPipe scripts
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js')
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js')
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js')
          
          // Start tracking once scripts are loaded
          startHandTracking()
        } catch (error) {
          console.error('Error loading MediaPipe scripts:', error)
          alert('Failed to load hand tracking libraries. Please check your internet connection.')
        }
      }
      
      loadScripts()
    } else {
      startHandTracking()
    }
  }
})

// Add event listeners
list.addEventListener('focus', setIndex, true)
list.addEventListener('click', setIndex)
list.addEventListener('pointermove', setIndex)
document.addEventListener('keydown', handleKeyboardNavigation)

const resync = () => {
  const w = Math.max(
    ...[...items].map((i) => {
      return i.offsetWidth
    })
  )
  list.style.setProperty('--article-width', w)
}

// Initialize active item
setActiveItem(currentIndex)

window.addEventListener('resize', resync)
resync()