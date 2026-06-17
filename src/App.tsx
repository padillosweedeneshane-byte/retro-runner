import React, { useState, useEffect } from 'react';
import { Sun, Moon, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import RetroGame from './components/RetroGame';
import TeachableSetup from './components/TeachableSetup';
import { ControllerInputType } from './types';

export default function App() {
  const [currentTMAction, setCurrentTMAction] = useState<'JUMP' | 'CROUCH' | 'NEUTRAL'>('NEUTRAL');
  const [activeController, setActiveController] = useState<ControllerInputType>('KEYBOARD');
  const [coinsCount, setCoinsCount] = useState<number>(0);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('tm_runner_dark_theme') === 'true';
  });

  // Sync wallet on Mount
  useEffect(() => {
    const savedCoins = localStorage.getItem('tm_runner_coins_count_v1');
    if (savedCoins) {
      setCoinsCount(parseInt(savedCoins, 10));
    }
  }, []);

  // Update theme setting on toggle
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem('tm_runner_dark_theme', nextDark ? 'true' : 'false');
  };

  const handleCoinsUpdate = (newCoins: number) => {
    setCoinsCount(newCoins);
    localStorage.setItem('tm_runner_coins_count_v1', newCoins.toString());
  };

  return (
    <main 
      className={`min-h-screen transition-colors duration-300 flex flex-col justify-between ${
        isDark ? 'bg-[#18181b] text-[#f4f4f5]' : 'bg-[#f7f7f7] text-[#535353]'
      }`} 
      id="app-container"
    >
      {/* Header Bar */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14 }}
        className={`border-b-4 px-4 py-4 md:px-8 sticky top-0 z-40 transition-colors duration-300 ${
          isDark 
            ? 'border-[#f4f4f5] bg-[#27272a] shadow-[0_4px_0_0_rgba(255,255,255,0.15)]' 
            : 'border-[#535353] bg-white shadow-[0_4px_0_0_rgba(83,83,83,0.1)]'
        }`}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: -4 }}
              whileTap={{ scale: 0.95 }}
              className={`w-10 h-10 border-4 flex items-center justify-center font-black transition-all ${
                isDark 
                  ? 'border-[#f4f4f5] bg-[#3f3f46] text-white shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]' 
                  : 'border-[#535353] bg-[#f7f7f7] text-[#535353] shadow-[3px_3px_0px_0px_rgba(83,83,83,1)]'
              }`}
            >
              <span>8B</span>
            </motion.div>
            <div>
              <h1 className={`font-extrabold text-sm md:text-base tracking-widest uppercase transition-colors ${
                isDark ? 'text-white' : 'text-[#535353]'
              }`}>
                Teachable 8-Bit Jumper
              </h1>
              <p className={`text-[10px] md:text-xs font-mono font-bold transition-colors ${
                isDark ? 'text-[#a1a1aa]' : 'text-[#777777]'
              }`}>
                Offline retro-runner styled by trained posture maps
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            {/* Theme Toggle Button */}
            <motion.button
              type="button"
              onClick={toggleTheme}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`p-2 border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                isDark 
                  ? 'border-[#f4f4f5] bg-[#3f3f46] text-yellow-300 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                  : 'border-[#535353] bg-white text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] hover:bg-[#f0f0f0]'
              }`}
              title={isDark ? "Activate Light Theme" : "Activate Dark Theme"}
            >
              {isDark ? (
                <>
                  <Sun size={14} className="animate-spin-slow" />
                  <span className="font-mono text-[9px] font-bold uppercase">LIGHT ON</span>
                </>
              ) : (
                <>
                  <Moon size={14} />
                  <span className="font-mono text-[9px] font-bold uppercase">DARK ON</span>
                </>
              )}
            </motion.button>

            {/* Status Indicator */}
            <div className={`flex items-center gap-2 px-3 py-1 border-2 transition-all ${
              isDark 
                ? 'bg-[#27272a] border-[#f4f4f5] shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                : 'bg-white border-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
            }`}>
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className={`text-[10px] font-bold uppercase transition-colors ${
                isDark ? 'text-[#f4f4f5]' : 'text-[#535353]'
              }`}>
                POSTURES: OK
              </span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content Area */}
      <section className="flex-1 px-4 py-6 md:py-8">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          
          {/* Top Instructions Alert Banner */}
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            whileHover={{ scale: 1.005 }}
            className={`flex border-4 border-dashed p-4 gap-3.5 transition-all duration-300 ${
              isDark 
                ? 'bg-[#27272a]/70 border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]' 
                : 'bg-white/80 border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,0.15)]'
            }`}
          >
            <div className={`w-8 h-8 border-2 flex items-center justify-center flex-shrink-0 font-bold transition-all ${
              isDark 
                ? 'border-[#f4f4f5] bg-[#3f3f46] text-white' 
                : 'border-[#535353] bg-[#e0e0e0] text-[#535353]'
            }`}>
              i
            </div>
            <div className={`text-[11px] leading-relaxed font-mono font-bold transition-colors duration-300 ${
              isDark ? 'text-[#d4d4d8]' : 'text-[#535353]'
            }`}>
              <strong className={isDark ? 'text-white' : 'text-black'}>CONSOLE OPERATIONAL INSTRUCTIONS:</strong> This console is interactive. Play instantly in <span className="underline">Keyboard mode</span> or toggle <span className="underline">Webcam</span> to feed visual postures directly from camera frames to control player action vectors. Try out <span className="underline">Sliders</span> manually to test response triggers.
            </div>
          </motion.div>

          {/* Core Game Component */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <RetroGame
              currentTMAction={currentTMAction}
              activeController={activeController}
              onCoinsUpdate={handleCoinsUpdate}
              coinsCount={coinsCount}
              isDark={isDark}
            />
          </motion.div>

          {/* Teachable Setup Panel (Webcam / Sliders) */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <TeachableSetup
              onTMActionChange={setCurrentTMAction}
              activeController={activeController}
              onControllerChange={setActiveController}
              currentCoins={coinsCount}
              isDark={isDark}
            />
          </motion.div>

        </div>
      </section>

      {/* Footer bar */}
      <footer className={`border-t-4 transition-colors duration-300 p-5 text-[10px] font-bold text-center uppercase tracking-widest mt-8 flex flex-col sm:flex-row justify-between items-center max-w-5xl mx-auto w-full gap-2 ${
        isDark 
          ? 'border-[#f4f4f5] bg-[#27272a] text-[#a1a1aa]' 
          : 'border-[#535353] bg-white text-[#535353]'
      }`}>
        <span>8-Bit Gesture Runner • Immersive Chrome Layout</span>
        <span>{new Date().getFullYear()} © Teachable Machine System</span>
      </footer>
    </main>
  );
}
