import React, { useEffect, useRef, useState } from 'react';
import { TeachableClassMapping, PredictionResult, ControllerInputType } from '../types';
import { sounds } from '../utils/audio';

interface TeachableSetupProps {
  onTMActionChange: (action: 'JUMP' | 'CROUCH' | 'NEUTRAL') => void;
  activeController: ControllerInputType;
  onControllerChange: (controller: ControllerInputType) => void;
  currentCoins: number;
  isDark?: boolean;
}

// Extend global window interface for external CDN scripts loaded dynamically
declare global {
  interface Window {
    tmImage?: any;
    tf?: any;
  }
}

export default function TeachableSetup({
  onTMActionChange,
  activeController,
  onControllerChange,
  currentCoins,
  isDark = false
}: TeachableSetupProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modelRef = useRef<any>(null);
  const isPredictingRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  // Loaded libraries state
  const [librariesLoaded, setLibrariesLoaded] = useState<boolean>(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Model input configuration
  // Pre-populate with a real, working, public model URL for testing!
  const [modelUrl, setModelUrl] = useState<string>('https://teachablemachine.withgoogle.com/models/p-N-z_JId/');
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Webcam stream state
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Model output class mappings
  const [classes, setClasses] = useState<string[]>(['Neutral/Idle', 'Jump Pose', 'Crouch Pose']);
  const [mappings, setMappings] = useState<TeachableClassMapping[]>([
    { className: 'Neutral/Idle', mappedAction: 'NEUTRAL' },
    { className: 'Jump Pose', mappedAction: 'JUMP' },
    { className: 'Crouch Pose', mappedAction: 'CROUCH' },
  ]);

  // Live predictions state for the visualization panel
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [detectedAction, setDetectedAction] = useState<'JUMP' | 'CROUCH' | 'NEUTRAL'>('NEUTRAL');

  // Simulator values for manual slider-testing (when webcam / external model isn't active)
  const [simJumpVal, setSimJumpVal] = useState<number>(0);
  const [simCrouchVal, setSimCrouchVal] = useState<number>(0);

  // 1. Dynamically Load TensorFlow.js and Teachable Machine libraries
  useEffect(() => {
    if (window.tmImage && window.tf) {
      setLibrariesLoaded(true);
      return;
    }

    const loadScripts = async () => {
      try {
        // Load TensorFlow.js first
        const tfScript = document.createElement('script');
        tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0/dist/tf.min.js';
        tfScript.async = true;
        
        await new Promise<void>((resolve, reject) => {
          tfScript.onload = () => resolve();
          tfScript.onerror = () => reject(new Error('Failed to load TensorFlow.js from CDN'));
          document.head.appendChild(tfScript);
        });

        // Next lead Teachable Machine image module
        const tmScript = document.createElement('script');
        tmScript.src = 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js';
        tmScript.async = true;

        await new Promise<void>((resolve, reject) => {
          tmScript.onload = () => resolve();
          tmScript.onerror = () => reject(new Error('Failed to load Teachable Machine Image Module from CDN'));
          document.head.appendChild(tmScript);
        });

        setLibrariesLoaded(true);
      } catch (err: any) {
        setLoadingError(err.message || 'Error occurred while fetching libraries');
      }
    };

    loadScripts();
  }, []);

  // 2. Setup Webcam Stream
  const restartWebcam = async () => {
    stopWebcam();
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setWebcamActive(true);
    } catch (err: any) {
      setWebcamError('Webcam permission denied or unavailable. Please check your camera settings.');
      setWebcamActive(false);
    }
  };

  const stopWebcam = () => {
    isPredictingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setWebcamActive(false);
    setPredictions([]);
    setDetectedAction('NEUTRAL');
    onTMActionChange('NEUTRAL');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // 3. Load Teachable Machine Model URL
  const loadTMModel = async () => {
    if (!librariesLoaded) return;
    setIsModelLoading(true);
    setModelError(null);

    // Format URL to ensure trailing slash
    let formattedUrl = modelUrl.trim();
    if (formattedUrl && !formattedUrl.endsWith('/')) {
      formattedUrl += '/';
    }

    try {
      const tm = window.tmImage;
      if (!tm) {
        throw new Error('Teachable Machine SDK not ready. Check CDN connection.');
      }

      const modelJSON = formattedUrl + 'model.json';
      const metadataJSON = formattedUrl + 'metadata.json';

      const loadedModel = await tm.load(modelJSON, metadataJSON);
      modelRef.current = loadedModel;

      // Extract class names
      const labels = loadedModel.getClassLabels() as string[];
      setClasses(labels);

      // Guess sensible starting mappings based on class names
      const initialMappings: TeachableClassMapping[] = labels.map((label, idx) => {
        const lowerLabel = label.toLowerCase();
        let mappedAction: 'JUMP' | 'CROUCH' | 'NEUTRAL' = 'NEUTRAL';
        
        if (lowerLabel.includes('jump') || lowerLabel.includes('up') || lowerLabel.includes('raised') || lowerLabel.includes('wave')) {
          mappedAction = 'JUMP';
        } else if (lowerLabel.includes('crouch') || lowerLabel.includes('down') || lowerLabel.includes('lean') || lowerLabel.includes('duck')) {
          mappedAction = 'CROUCH';
        } else if (idx === 0) {
          mappedAction = 'NEUTRAL';
        } else if (idx === 1 && labels.length === 2) {
          mappedAction = 'JUMP'; // fallback for binary classifier
        }
        
        return { className: label, mappedAction };
      });

      setMappings(initialMappings);
      setModelLoaded(true);
      sounds.playMilestone();
    } catch (err: any) {
      console.error(err);
      setModelError('Failed to read model files. Verify that the URL is a active Teachable Machine Image export link (containing model.json and metadata.json).');
      setModelLoaded(false);
    } finally {
      setIsModelLoading(false);
    }
  };

  // 4. Prediction Animation Loop
  const startPredicting = () => {
    if (!modelRef.current || !videoRef.current || !webcamActive) return;
    
    isPredictingRef.current = true;
    
    const predictFrame = async () => {
      if (!isPredictingRef.current || !modelRef.current || !videoRef.current) return;

      try {
        const rawPredictions = await modelRef.current.predict(videoRef.current);
        const results = rawPredictions.map((p: any) => ({
          className: p.className,
          probability: p.probability
        })) as PredictionResult[];

        setPredictions(results);

        // Find prediction with highest intensity
        let maxPred = results[0];
        for (let i = 1; i < results.length; i++) {
          if (results[i].probability > maxPred.probability) {
            maxPred = results[i];
          }
        }

        // Set action if probability exceeds 80% confidence threshold
        if (maxPred && maxPred.probability > 0.78) {
          const map = mappings.find(m => m.className === maxPred.className);
          const mappedAction = map ? map.mappedAction : 'NEUTRAL';
          
          setDetectedAction(mappedAction);
          onTMActionChange(mappedAction);
        } else {
          setDetectedAction('NEUTRAL');
          onTMActionChange('NEUTRAL');
        }
      } catch (err) {
        console.error('Frame prediction error', err);
      }

      animationFrameRef.current = requestAnimationFrame(predictFrame);
    };

    animationFrameRef.current = requestAnimationFrame(predictFrame);
  };

  // Start predicting when webcam becomes active and model is ready
  useEffect(() => {
    if (webcamActive && modelLoaded && activeController === 'TEACHABLE_MACHINE') {
      startPredicting();
    } else {
      isPredictingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      isPredictingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [webcamActive, modelLoaded, mappings, activeController]);

  // Adjust manual simulation inputs
  useEffect(() => {
    if (activeController !== 'SIMULATOR') return;

    // Simulate predictions locally based on user slider adjustments
    const totalSim = simJumpVal + simCrouchVal;
    const idleProb = Math.max(0, 100 - totalSim);

    const mockPredictions: PredictionResult[] = [
      { className: 'Jump Pose (Simulated)', probability: simJumpVal / 100 },
      { className: 'Crouch Pose (Simulated)', probability: simCrouchVal / 100 },
      { className: 'Neutral Pose (Simulated)', probability: idleProb / 100 },
    ];
    setPredictions(mockPredictions);

    if (simJumpVal > 75) {
      setDetectedAction('JUMP');
      onTMActionChange('JUMP');
    } else if (simCrouchVal > 75) {
      setDetectedAction('CROUCH');
      onTMActionChange('CROUCH');
    } else {
      setDetectedAction('NEUTRAL');
      onTMActionChange('NEUTRAL');
    }
  }, [simJumpVal, simCrouchVal, activeController]);

  // Update Mapping Choice
  const handleMappingChange = (className: string, action: 'JUMP' | 'CROUCH' | 'NEUTRAL') => {
    const updated = mappings.map(m => {
      if (m.className === className) {
        return { ...m, mappedAction: action };
      }
      return m;
    });
    setMappings(updated);
    sounds.playCoin();
  };

  return (
    <div 
      className={`w-full transition-all duration-300 border-4 p-5 mt-6 rounded-none ${
        isDark 
          ? 'bg-[#27272a] border-[#f4f4f5] shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] text-[#f4f4f5]' 
          : 'bg-white border-[#535353] shadow-[8px_8px_0px_0px_rgba(83,83,83,1)] text-[#535353]'
      }`} 
      id="teachable-machine-module"
    >
      {/* Title block */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between border-b-4 pb-4 mb-4 gap-3 transition-colors duration-300 ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}>
        <div>
          <h2 className={`font-sans text-lg font-black flex items-center gap-2 uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#333333]'}`}>
            <span className={`p-2 border-2 ${isDark ? 'border-[#f4f4f5] bg-[#18181b] text-yellow-400' : 'border-[#535353] bg-[#e0e0e0] text-[#535353]'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </span>
            Teachable Setup Console
          </h2>
          <p className={`font-mono text-xs mt-1.5 font-bold ${isDark ? 'text-zinc-400' : 'text-[#777777]'}`}>
            Synchronize video feed maps with postures to trigger jump & crouch moves.
          </p>
        </div>

        {/* Input Switch Controller Row */}
        <div className={`flex p-1 border-4 items-center rounded-none transition-all ${
          isDark 
            ? 'bg-[#18181b] border-[#f4f4f5] shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]' 
            : 'bg-[#e0e0e0] border-[#535353] shadow-[3px_3px_0px_0px_rgba(83,83,83,1)]'
        }`}>
          <button
            id="control-keyboard-toggle"
            onClick={() => {
              stopWebcam();
              onControllerChange('KEYBOARD');
              sounds.playCoin();
            }}
            className={`px-3 py-1.5 font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer rounded-none border-2 ${
              activeController === 'KEYBOARD' 
                ? isDark 
                  ? 'bg-white border-[#f4f4f5] text-[#18181b] font-black' 
                  : 'bg-white border-[#535353] text-[#535353] shadow-sm font-black' 
                : isDark 
                  ? 'text-[#a1a1aa] border-transparent hover:text-white' 
                  : 'text-[#777777] border-transparent hover:text-black'
            }`}
          >
            KEYS
          </button>
          
          <button
            id="control-simulator-toggle"
            onClick={() => {
              stopWebcam();
              onControllerChange('SIMULATOR');
              sounds.playCoin();
            }}
            className={`px-3 py-1.5 font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer rounded-none border-2 ${
              activeController === 'SIMULATOR' 
                ? isDark 
                  ? 'bg-white border-[#f4f4f5] text-[#18181b] font-black' 
                  : 'bg-white border-[#535353] text-[#535353] shadow-sm font-black' 
                : isDark 
                  ? 'text-[#a1a1aa] border-transparent hover:text-white' 
                  : 'text-[#777777] border-transparent hover:text-black'
            }`}
          >
            SLIDERS
          </button>

          <button
            id="control-webcam-toggle"
            onClick={() => {
              onControllerChange('TEACHABLE_MACHINE');
              restartWebcam();
              sounds.playCoin();
            }}
            className={`px-3 py-1.5 font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer rounded-none border-2 ${
              activeController === 'TEACHABLE_MACHINE' 
                ? isDark 
                  ? 'bg-yellow-400 text-black border-yellow-400 shadow-sm font-black' 
                  : 'bg-[#535353] text-white border-[#535353] shadow-sm font-black' 
                : isDark 
                  ? 'text-[#a1a1aa] border-transparent hover:text-white' 
                  : 'text-[#777777] border-transparent hover:text-black'
            }`}
          >
            WEBCAM
          </button>
        </div>
      </div>

      {loadingError && (
        <div className="bg-red-50 border-2 border-red-500 text-red-700 p-3 text-xs font-mono mb-4 font-bold">
          ⚠️ Library Load Error: {loadingError}. Check network or proxy restrictions.
        </div>
      )}

      {/* Controller Mode Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
        
        {/* LEFT COLUMN: Webcam or Slider Simulation View */}
        <div className={`lg:col-span-5 flex flex-col rounded-none border-4 p-3.5 items-center justify-center min-h-[220px] transition-all duration-300 ${
          isDark 
            ? 'bg-[#1a1a1a] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] text-[#f4f4f5]' 
            : 'bg-white border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,0.15)] text-[#535353]'
        }`}>
          
          {activeController === 'KEYBOARD' && (
            <div className="text-center p-4">
              <div className={`mx-auto w-14 h-14 flex items-center justify-center mb-3 shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] border-4 ${
                isDark 
                  ? 'bg-zinc-850 border-[#f4f4f5] shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] text-white' 
                  : 'bg-[#e0e0e0] border-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] text-[#535353]'
              }`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className={`text-sm font-black uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-[#333333]'}`}>Keyboard Mode Active</h4>
              <p className={`text-xs font-mono font-bold mt-2 max-w-xs mx-auto leading-normal ${isDark ? 'text-[#a1a1aa]' : 'text-[#777777]'}`}>
                No camera feed. Control the dino instantly with physical keys:
              </p>
              <div className="flex gap-2 justify-center mt-4 text-[10px] font-mono">
                <span className={`px-2.5 py-1.5 border-2 shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] font-bold uppercase transition-all ${
                  isDark 
                    ? 'bg-zinc-900 border-[#f4f4f5] text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                    : 'bg-white border-[#535353] text-[#535353]'
                }`}>Space / Up</span>
                <span className={`px-2.5 py-1.5 border-2 shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] font-bold uppercase transition-all ${
                  isDark 
                    ? 'bg-zinc-900 border-[#f4f4f5] text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                    : 'bg-white border-[#535353] text-[#535353]'
                }`}>Down Arrow</span>
              </div>
            </div>
          )}

          {activeController === 'SIMULATOR' && (
            <div className="w-full text-center p-2">
              <h4 className={`text-xs font-black uppercase font-mono tracking-wider mb-2 text-left border-b-2 pb-1 transition-colors ${
                isDark ? 'text-white border-zinc-700' : 'text-[#333333] border-[#535353]'
              }`}>
                Slider Test-Bench (Simulation)
              </h4>
              <p className={`font-mono font-bold text-[10px] leading-tight mb-4 text-left ${isDark ? 'text-zinc-400' : 'text-[#777777]'}`}>
                Trigger class thresholds manually. Exceed <strong>78% threshold</strong> on either parameter to trigger a move vector.
              </p>

              <div className="space-y-4 my-2">
                <div>
                  <div className={`flex justify-between text-[11px] font-mono font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-[#535353]'}`}>
                    <span>CLASS: JUMP POSE</span>
                    <span className={simJumpVal > 75 ? (isDark ? "text-yellow-400 font-extrabold" : "text-blue-700 font-extrabold") : ""}>{simJumpVal}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={simJumpVal}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setSimJumpVal(v);
                      if (v > 75) setSimCrouchVal(0); // inhibit crouch if jumping
                    }}
                    className={`w-full h-2 rounded-none appearance-none cursor-pointer border ${
                      isDark 
                        ? 'bg-zinc-850 border-zinc-500 accent-yellow-400 text-yellow-400' 
                        : 'bg-[#e0e0e0] border-[#535353] accent-[#535353]'
                    }`}
                  />
                </div>

                <div>
                  <div className={`flex justify-between text-[11px] font-mono font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-[#535353]'}`}>
                    <span>CLASS: CROUCH POSE</span>
                    <span className={simCrouchVal > 75 ? (isDark ? "text-yellow-400 font-extrabold" : "text-amber-700 font-extrabold") : ""}>{simCrouchVal}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={simCrouchVal}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setSimCrouchVal(v);
                      if (v > 75) setSimJumpVal(0); // inhibit jump if crouching
                    }}
                    className={`w-full h-2 rounded-none appearance-none cursor-pointer border ${
                      isDark 
                        ? 'bg-zinc-850 border-zinc-500 accent-yellow-400 text-yellow-400' 
                        : 'bg-[#e0e0e0] border-[#535353] accent-[#535353]'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeController === 'TEACHABLE_MACHINE' && (
            <div className={`relative w-full aspect-video rounded-none overflow-hidden flex flex-col items-center justify-center border-4 shadow-inner ${
              isDark ? 'border-[#f4f4f5] bg-zinc-950' : 'border-[#535353] bg-white'
            }`}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-transform ${webcamActive ? 'scale-x-[-1] opacity-100' : 'opacity-0'}`}
              />

              {!webcamActive && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-4 text-center ${
                  isDark ? 'bg-zinc-900' : 'bg-[#f7f7f7]'
                }`}>
                  <div className={`w-10 h-10 border-2 flex items-center justify-center mb-2 animate-pulse ${
                    isDark ? 'border-zinc-500 bg-zinc-850 text-white' : 'border-[#535353] bg-white text-[#535353]'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#535353]'}`}>Camera Feed Offline</p>
                  <p className={`font-mono text-[9px] mt-1 mb-4 ${isDark ? 'text-zinc-400' : 'text-[#777777]'}`}>Confirm webcam settings are enabled for the viewport frame.</p>
                  <button
                    id="enable-webcam-btn"
                    onClick={restartWebcam}
                    className={`font-mono font-bold text-[10px] px-3.5 py-1.5 transition-all border-2 uppercase cursor-pointer ${
                      isDark 
                        ? 'bg-zinc-800 border-[#f4f4f5] text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none' 
                        : 'bg-white border-[#535353] text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                    }`}
                  >
                    Enable Webcam
                  </button>
                </div>
              )}

              {webcamActive && (
                <div className="absolute bottom-2 left-2 flex gap-1.5">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className={`font-mono text-[9px] uppercase font-bold tracking-widest border px-1.5 py-0.5 ${
                    isDark ? 'text-green-400 bg-black/90 border-zinc-700' : 'text-emerald-700 bg-white/90 border-[#535353]'
                  }`}>
                    CAMERA ACTIVE
                  </span>
                </div>
              )}

              {webcamActive && (
                <button
                  id="stop-webcam-btn"
                  onClick={stopWebcam}
                  className={`absolute top-2 right-2 p-1.5 text-[9px] uppercase font-mono px-2 border-2 font-bold cursor-pointer transition ${
                    isDark 
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-[#f4f4f5] shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                      : 'bg-white hover:bg-gray-100 text-[#535353] border-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
                  }`}
                >
                  STOP FEED
                </button>
              )}

              {webcamError && (
                <div className={`absolute inset-0 p-4 flex flex-col justify-center items-center text-center ${
                  isDark ? 'bg-zinc-950/95' : 'bg-white/95'
                }`}>
                  <p className="text-red-500 text-xs font-mono font-bold leading-normal mb-3">{webcamError}</p>
                  <button
                    onClick={restartWebcam}
                    className={`px-3 py-1 text-xs font-mono border-2 cursor-pointer font-bold ${
                      isDark ? 'bg-zinc-800 border-[#f4f4f5] text-white' : 'bg-white border-[#535353] text-[#535353]'
                    }`}
                  >
                    RETRY CAMERA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
 
        {/* RIGHT COLUMN: Classifier URL Input & Class Mapping Grid */}
        <div className="lg:col-span-7 flex flex-col">
          
          {/* Teachable Machine URL Paste panel */}
          <div className={`p-4 border-4 mb-4 transition-all duration-300 ${
            isDark 
              ? 'bg-[#18181b] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)]' 
              : 'bg-white border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,0.15)]'
          }`}>
            <label className={`font-mono text-[10px] font-black uppercase tracking-wider block mb-1 ${isDark ? 'text-zinc-300' : 'text-[#535353]'}`}>
              Google Teachable Machine Model URL (Image Project)
            </label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={modelUrl}
                onChange={(e) => setModelUrl(e.target.value)}
                placeholder="https://teachablemachine.withgoogle.com/models/..."
                className={`flex-1 border-2 focus:outline-none text-xs px-3 py-2 font-mono font-bold transition-colors ${
                  isDark 
                    ? 'bg-zinc-905 border-[#f4f4f5] focus:border-yellow-400 text-white' 
                    : 'bg-white border-[#535353] focus:border-black text-[#535353]'
                }`}
              />
              <button
                id="load-tm-model-btn"
                onClick={loadTMModel}
                disabled={isModelLoading || !librariesLoaded}
                className={`px-4 py-2 font-mono text-xs font-bold border-2 cursor-pointer transition ${
                  isModelLoading 
                    ? 'bg-[#e0e0e0] text-gray-400 cursor-wait' 
                    : isDark 
                      ? 'bg-yellow-400 hover:bg-yellow-300 text-black border-[#f4f4f5] shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]' 
                      : 'bg-[#535353] hover:bg-[#333333] border-[#535353] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]'
                }`}
              >
                {isModelLoading ? 'LOADING...' : 'IMPORT'}
              </button>
            </div>
            
            {modelError && (
              <p className="text-red-500 text-[10px] font-mono mt-1.5 leading-tight font-bold">
                ⚠️ {modelError}
              </p>
            )}

            {!modelLoaded && !modelError && (
              <div className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-mono font-bold ${isDark ? 'text-zinc-400' : 'text-[#777777]'}`}>
                <span className={`w-2 h-2 rounded-sm bg-yellow-400 border ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}></span>
                <span>Using fallback <strong>Simulation classes</strong>. Insert your shared model endpoint above.</span>
              </div>
            )}

            {modelLoaded && (
              <div className="mt-2.5 flex items-center gap-1.5 text-green-500 text-[11px] font-mono font-extrabold">
                <span className={`w-2.5 h-2.5 bg-green-500 border ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}></span>
                <span>SUCCESS: {classes.length} distinct classes loaded.</span>
              </div>
            )}
          </div>

          {/* Active mapping assignment table */}
          <div className={`p-4 border-4 flex-1 flex flex-col justify-between transition-all duration-300 ${
            isDark 
              ? 'bg-[#18181b] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)]' 
              : 'bg-white border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,0.15)]'
          }`}>
            <div>
              <h3 className={`font-sans text-xs font-black uppercase tracking-wider mb-2 border-b-2 pb-1 transition-colors duration-300 ${
                isDark ? 'text-white border-zinc-750' : 'text-[#535353] border-[#535353]'
              }`}>
                Class Output -to- Gamer Action Map
              </h3>
              
              <div className="space-y-2 mt-3 max-h-[160px] overflow-y-auto">
                {classes.map((className) => {
                  const currentMapping = mappings.find(m => m.className === className);
                  const activeAction = currentMapping ? currentMapping.mappedAction : 'NEUTRAL';
                  
                  return (
                    <div key={className} className={`flex items-center justify-between border-b-2 border-dashed pb-2 last:border-0 last:pb-0 gap-2 ${
                      isDark ? 'border-zinc-800' : 'border-gray-300'
                    }`}>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`w-2.5 h-2.5 bg-gray-500 border inline-block flex-shrink-0 animate-pulse ${isDark ? 'border-zinc-500' : 'border-[#535353]'}`}></span>
                        <span className={`font-mono text-xs font-bold truncate max-w-[140px] sm:max-w-xs ${isDark ? 'text-zinc-200' : 'text-[#535353]'}`}>{className}</span>
                      </div>

                      <select
                        aria-label={`Map ${className} to action`}
                        value={activeAction}
                        onChange={(e) => handleMappingChange(className, e.target.value as 'JUMP' | 'CROUCH' | 'NEUTRAL')}
                        className={`border-2 font-mono text-xs rounded-none px-2 py-1 focus:outline-none cursor-pointer font-bold text-center ${
                          isDark 
                            ? 'bg-zinc-900 border-[#f4f4f5] text-white' 
                            : 'bg-white border-[#535353] text-[#535353]'
                        }`}
                      >
                        <option value="NEUTRAL">Neutral / Idle</option>
                        <option value="JUMP">Trigger JUMP 🦘</option>
                        <option value="CROUCH">Trigger CROUCH 🦖</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Predicted meter feedback visualization */}
            {predictions.length > 0 && (
              <div className={`mt-4 pt-3.5 border-t-2 ${isDark ? 'border-zinc-800' : 'border-[#535353]'}`}>
                <h4 className={`font-mono text-[10px] font-black uppercase tracking-wider mb-2 flex items-center justify-between ${
                  isDark ? 'text-zinc-300' : 'text-[#333333]'
                }`}>
                  <span>LIVE SYSTEM CONFIDENCE FEEDBACK</span>
                  <span className={`font-extrabold border px-2 ${
                    isDark ? 'text-yellow-400 bg-zinc-900 border-[#f4f4f5]' : 'text-blue-700 bg-[#e0e0e0] border-[#535353]'
                  }`}>ACTIVE: {detectedAction === 'NEUTRAL' ? 'NONE/IDLE' : detectedAction}</span>
                </h4>
                
                <div className="grid grid-cols-3 gap-2">
                  {predictions.map((p) => {
                    const probPercent = Math.round(p.probability * 100);
                    const isWinning = p.probability > 0.78;
                    return (
                      <div key={p.className} className={`p-2 border-2 text-center overflow-hidden transition-all duration-300 ${
                        isWinning 
                          ? isDark 
                            ? 'border-[#f4f4f5] bg-green-950/20 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.7)]' 
                            : 'border-[#535353] bg-green-50 shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]' 
                          : isDark 
                            ? 'border-zinc-700 border-dotted bg-zinc-905' 
                            : 'border-[#535353] border-dotted bg-white'
                      }`}>
                        <div className={`text-[10px] font-mono truncate uppercase font-extrabold ${isDark ? 'text-zinc-300' : 'text-[#535353]'}`}>{p.className}</div>
                        <div className={`text-sm font-mono font-black mt-0.5 ${isDark ? 'text-white' : 'text-[#535353]'}`}>{probPercent}%</div>
                        <div className={`w-full h-1.5 border overflow-hidden mt-1 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-[#f0f0f0] border-[#535353]'}`}>
                          <div 
                            className={`h-full rounded-none transition-all duration-75 ${isWinning ? 'bg-green-500' : (isDark ? 'bg-zinc-400' : 'bg-[#535353]')}`}
                            style={{ width: `${probPercent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Guide details for training models in 1 minute */}
      <div className={`mt-5 p-4 border-4 border-dashed font-sans transition-all duration-300 ${
        isDark 
          ? 'bg-[#18181b]/50 border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]' 
          : 'bg-white border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,0.1.2)]'
      }`}>
        <h3 className={`font-mono text-xs font-black uppercase tracking-widest mb-2.5 flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-[#333333]'}`}>
          <svg className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-[#535353]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Quick Teachable Machine Training Guide
        </h3>
        <ol className={`font-mono text-[11px] font-bold space-y-2 list-decimal list-inside pl-1 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-[#535353]'}`}>
          <li>
            Open <a href="https://teachablemachine.withgoogle.com/train/image" target="_blank" rel="noreferrer" className={`underline font-black ${isDark ? 'text-yellow-400 hover:text-yellow-300' : 'text-blue-700 hover:text-blue-900'}`}>Teachable Machine Web App</a> in a new tab.
          </li>
          <li>
            Record three posture classes physically: <span className="underline">Neutral/Idle</span>, <span className="underline">Jump Pose</span> (e.g. raise hands), and <span className="underline">Crouch Pose</span> (e.g. duck/bend down).
          </li>
          <li>
            Click <strong className={isDark ? 'text-white font-extrabold' : 'text-black'}>Train Model</strong>, let it compile fully, then tap <strong className={isDark ? 'text-white font-extrabold' : 'text-black'}>Export Model</strong>.
          </li>
          <li>
            Choose the <strong className={isDark ? 'text-white font-extrabold' : 'text-black'}>Tensorflow.js</strong> tab, click <strong className={isDark ? 'text-white font-extrabold' : 'text-black'}>Upload my model</strong>, wait for the public link to generate, and save/paste it inside the IMPORT field above!
          </li>
        </ol>
      </div>

    </div>
  );
}
