import React, { useEffect, useRef, useState } from 'react';
import { GameState, Obstacle, ObstacleType, PlayerState, CharacterSkin } from '../types';
import { sounds } from '../utils/audio';

interface RetroGameProps {
  currentTMAction: 'JUMP' | 'CROUCH' | 'NEUTRAL';
  activeController: 'KEYBOARD' | 'TEACHABLE_MACHINE' | 'SIMULATOR';
  onCoinsUpdate?: (coins: number) => void;
  coinsCount: number;
  isDark?: boolean;
}

// 8-Bit Pixel Data for procedural rendering (grid of squares)
// 1 = main color, 2 = accent, 3 = eye/outline, 0 = transparent
const RUNNER_PIXELS = {
  standing_1: [
    "000001111110000",
    "000011111311000",
    "000011111111000",
    "000011110000000",
    "000011111110000",
    "211111111000000",
    "21111111111100",
    "02111111111000",
    "00111111100000",
    "00011001100000",
    "00011001100000",
    "00010000110000"
  ],
  standing_2: [
    "000001111110000",
    "000011111311000",
    "000011111111000",
    "000011110000000",
    "000011111110000",
    "211111111000000",
    "21111111111100",
    "02111111111000",
    "00111111100000",
    "00011001100000",
    "00001100100000",
    "00001100011000"
  ],
  crouching_1: [
    "000000000000000",
    "000000000000000",
    "000000000000000",
    "000001111110000",
    "000011111311000",
    "000011111111000",
    "21111111111100",
    "21111111111000",
    "00111111100000",
    "00011001100000",
    "00011001100000",
    "00010000110000"
  ],
  crouching_2: [
    "000000000000000",
    "000000000000000",
    "000000000000000",
    "000001111110000",
    "000011111311000",
    "000011111111000",
    "21111111111100",
    "21111111111000",
    "00111111100000",
    "00011001100000",
    "00001100100000",
    "00001100011000"
  ],
  jumping: [
    "000001111110000",
    "000011111311000",
    "000011111111000",
    "000011110000000",
    "000011111110000",
    "211111111000000",
    "21111111111100",
    "02111111111000",
    "00111111100000",
    "00110010100000",
    "00100010010000",
    "01100110000000"
  ]
};

const CACTUS_SINGLE_PIXELS = [
  "000111000",
  "001111100",
  "011111110",
  "111011011",
  "111011011",
  "111111111",
  "011111110",
  "000111000",
  "000111000",
  "000111000",
  "000111000",
  "000111000"
];

const BIRD_PIXELS_1 = [
  "0000011100000",
  "0000113110000",
  "0111111111100",
  "1111111111110",
  "0011111111000",
  "0001111100000",
  "0001101100000",
  "0011000110000",
  "0100000011000"
];

const BIRD_PIXELS_2 = [
  "0000011100000",
  "0000113110000",
  "0111111111100",
  "1111111111110",
  "0011111111000",
  "0001111100000",
  "0001101100000",
  "0001100000000",
  "0000110000000"
];

const SKINS: CharacterSkin[] = [
  { id: 'green_dino', name: 'Classic Rex', color: '#10b981', accentColor: '#047857', cost: 0, unlocked: true, description: 'The timeless prehistorical jumper.' },
  { id: 'cyborg_rex', name: 'Cyborg 2077', color: '#00f0ff', accentColor: '#ff0055', cost: 15, unlocked: false, description: 'Fitted with neon photon boosters.' },
  { id: 'royal_dragon', name: 'Royal Gold', color: '#f59e0b', accentColor: '#78350f', cost: 35, unlocked: false, description: 'Direct descendant of legendary dragon-lords.' },
  { id: 'cosmic_void', name: 'Void Walker', color: '#8b5cf6', accentColor: '#3b0764', cost: 50, unlocked: false, description: 'Woven from starry dark-energy particles.' },
];

export default function RetroGame({
  currentTMAction,
  activeController,
  onCoinsUpdate,
  coinsCount,
  isDark = false
}: RetroGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Game States
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [glowEffect, setGlowEffect] = useState<boolean>(false);

  // Dino Store
  const [skins, setSkins] = useState<CharacterSkin[]>([]);
  const [activeSkinId, setActiveSkinId] = useState<string>('green_dino');

  // Ref vectors to prevent state reading stale closures in canvas animation frame
  const gameInfoRef = useRef({
    gameState: 'IDLE' as GameState,
    score: 0,
    highScore: 0,
    speed: 4.5,
    obstacles: [] as Obstacle[],
    playerY: 0,
    playerVelocityY: 0,
    playerState: 'RUNNING' as PlayerState,
    ticks: 0,
    lastSpawnTick: 0,
    coins: 0,
    daytimeCycle: 0, // 0: Day, 1: Sunset, 2: Cybernight
    stars: [] as { x: number; y: number; size: number; alpha: number }[],
    clouds: [] as { x: number; y: number; speed: number; size: number }[],
    mountains: [] as { x: number; h: number; w: number; speed: number }[],
    particles: [] as { x: number; y: number; vx: number; vy: number; color: string; size: number; alpha: number }[],
  });

  // Track key actions physically
  const keysRef = useRef<{ jump: boolean; crouch: boolean }>({ jump: false, crouch: false });

  // Load High Score and Unlocked Skins on Mount
  useEffect(() => {
    const savedHighScore = localStorage.getItem('tm_runner_high_score');
    if (savedHighScore) {
      const parsed = parseInt(savedHighScore, 10);
      setHighScore(parsed);
      gameInfoRef.current.highScore = parsed;
    }

    const savedSkins = localStorage.getItem('tm_runner_skins_v1');
    const savedActiveSkin = localStorage.getItem('tm_runner_active_skin');
    if (savedSkins) {
      try {
        setSkins(JSON.parse(savedSkins));
      } catch (e) {
        setSkins(SKINS);
      }
    } else {
      setSkins(SKINS);
      localStorage.setItem('tm_runner_skins_v1', JSON.stringify(SKINS));
    }

    if (savedActiveSkin) {
      setActiveSkinId(savedActiveSkin);
    }
  }, []);

  // Sync mute state to audio manager
  useEffect(() => {
    sounds.setMute(isMuted);
  }, [isMuted]);

  // Handle Keyboard Triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeController !== 'KEYBOARD' && gameState === 'PLAYING') return;

      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        keysRef.current.jump = true;

        if (gameState !== 'PLAYING') {
          startGame();
        }
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        keysRef.current.crouch = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        keysRef.current.jump = false;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        keysRef.current.crouch = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, activeController]);

  // Map Teachable Machine action in real-time
  useEffect(() => {
    if (activeController !== 'TEACHABLE_MACHINE') return;

    if (currentTMAction === 'JUMP') {
      keysRef.current.jump = true;
      keysRef.current.crouch = false;

      if (gameState !== 'PLAYING') {
        startGame();
      }
    } else if (currentTMAction === 'CROUCH') {
      keysRef.current.jump = false;
      keysRef.current.crouch = true;
    } else {
      keysRef.current.jump = false;
      keysRef.current.crouch = false;
    }
  }, [currentTMAction, activeController, gameState]);

  // Start the Game Loop
  const startGame = () => {
    sounds.playJump();
    const g = gameInfoRef.current;
    g.gameState = 'PLAYING';
    g.score = 0;
    g.speed = 4.8;
    g.playerY = 0;
    g.playerVelocityY = 0;
    g.playerState = 'RUNNING';
    g.obstacles = [];
    g.ticks = 0;
    g.lastSpawnTick = 10;
    setGameState('PLAYING');
    setScore(0);

    // Initial stars, clouds, mountains setup
    g.stars = [];
    for (let i = 0; i < 30; i++) {
      g.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 110,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random()
      });
    }

    g.clouds = [];
    for (let i = 0; i < 4; i++) {
      g.clouds.push({
        x: 100 + i * 220 + Math.random() * 50,
        y: 20 + Math.random() * 40,
        speed: 0.15 + Math.random() * 0.1,
        size: 20 + Math.random() * 15
      });
    }

    g.mountains = [];
    for (let i = 0; i < 6; i++) {
      g.mountains.push({
        x: i * 160 + Math.random() * 40,
        h: 25 + Math.random() * 25,
        w: 60 + Math.random() * 45,
        speed: 0.3
      });
    }
  };

  // Canvas size and drawing tick Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    // Ground position
    const groundY = 200;
    const gravity = 0.5;

    // Canvas coordinate space base: 800x250
    const BASE_WIDTH = 800;
    const BASE_HEIGHT = 250;

    const gameLoop = () => {
      const g = gameInfoRef.current;

      // Handle Ticks
      g.ticks++;

      // Resize logic representation
      ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

      // Daytime calculation of theme colors
      // Score determines diurnal loop: Every 330 scores shifts the sky
      const cycleLength = 330;
      const cycle = Math.floor(g.score / cycleLength) % 3;
      g.daytimeCycle = cycle;

      let skyGrad = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);

      if (g.daytimeCycle === 0) {
        // Classic Sunny Sky Blue
        skyGrad.addColorStop(0, '#bae6fd'); // sky-200
        skyGrad.addColorStop(1, '#f0f9ff'); // sky-50
      } else if (g.daytimeCycle === 1) {
        // Sunset Warm Amber
        skyGrad.addColorStop(0, '#f97316'); // orange-500
        skyGrad.addColorStop(1, '#ffedd5'); // orange-100
      } else {
        // Retro Cyberpunk Neon Purple
        skyGrad.addColorStop(0, '#1e1b4b'); // indigo-950
        skyGrad.addColorStop(1, '#311042'); // purple-950
      }

      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

      // Draw Night Stars
      if (g.daytimeCycle === 2) {
        ctx.fillStyle = '#ffffff';
        g.stars.forEach(star => {
          // twinkle effect
          star.alpha += (Math.random() * 0.1 - 0.05);
          if (star.alpha < 0.1) star.alpha = 0.1;
          if (star.alpha > 1) star.alpha = 1;
          ctx.save();
          ctx.globalAlpha = star.alpha;
          ctx.fillRect(star.x, star.y, star.size, star.size);
          ctx.restore();
        });
      }

      // Draw Clouds
      ctx.fillStyle = g.daytimeCycle === 2 ? 'rgba(139, 92, 246, 0.4)' : '#ffffff';
      g.clouds.forEach(cloud => {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.size * 2.5 < 0) {
          cloud.x = BASE_WIDTH + 20;
          cloud.y = 20 + Math.random() * 40;
        }
        // Render 8-bit clouds (stacked pixel blocks)
        ctx.fillRect(cloud.x, cloud.y, cloud.size, cloud.size * 0.5);
        ctx.fillRect(cloud.x + cloud.size * 0.25, cloud.y - cloud.size * 0.2, cloud.size * 0.6, cloud.size * 0.4);
        ctx.fillRect(cloud.x + cloud.size * 0.5, cloud.y + cloud.size * 0.1, cloud.size * 0.5, cloud.size * 0.45);
      });

      // Draw Far Mountains Parallax
      g.mountains.forEach(mtn => {
        if (g.gameState === 'PLAYING') {
          mtn.x -= mtn.speed * (g.speed / 4.5);
        }
        if (mtn.x + mtn.w < 0) {
          mtn.x = BASE_WIDTH + Math.random() * 50;
        }
        ctx.fillStyle = g.daytimeCycle === 0 
          ? '#93c5fd' // sky-300
          : g.daytimeCycle === 1 
            ? '#fca5a5' // red-300
            : '#4c1d95'; // purple-900

        // 8-bit stepped triangular mountains
        ctx.beginPath();
        ctx.moveTo(mtn.x, groundY);
        ctx.lineTo(mtn.x + mtn.w * 0.5, groundY - mtn.h);
        ctx.lineTo(mtn.x + mtn.w, groundY);
        ctx.fill();
        ctx.closePath();
      });

      // Draw Midground bushes / trees
      ctx.fillStyle = g.daytimeCycle === 0 ? '#10b981' : g.daytimeCycle === 1 ? '#b91c1c' : '#312e81';
      // Little trees/bushes procedurally scattered along ground
      if (g.ticks % 200 === 0 && g.gameState === 'PLAYING') {
        // can keep tracks of decorative elements if we want, or simple ground textures
      }

      // Draw Base Ground line
      ctx.strokeStyle = g.daytimeCycle === 2 ? '#ff007f' : '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(BASE_WIDTH, groundY);
      ctx.stroke();

      // Mini Ground dots / cracks for retro look
      ctx.fillStyle = g.daytimeCycle === 2 ? '#ff007f' : '#6b7280';
      for (let i = 0; i < BASE_WIDTH; i += 40) {
        const dotOffset = (g.gameState === 'PLAYING') ? (g.ticks * (g.speed)) % 40 : 0;
        ctx.fillRect((i - dotOffset + 40) % BASE_WIDTH, groundY + 4, 3, 2);
        ctx.fillRect((i - dotOffset + 18) % BASE_WIDTH, groundY + 12, 1, 1);
      }

      // Active Theme skin lookup
      const selectedSkin = skins.find(s => s.id === activeSkinId) || SKINS[0];

      // Handle Running Dust particles
      if (g.gameState === 'PLAYING' && g.playerY === 0 && g.playerState !== 'CROUCHING') {
        if (g.ticks % 6 === 0) {
          g.particles.push({
            x: 65, // player foot position
            y: groundY - 2,
            vx: -(g.speed * 0.5) + Math.random() * 1,
            vy: -1 - Math.random() * 2,
            color: selectedSkin.accentColor,
            size: 2 + Math.random() * 3,
            alpha: 1
          });
        }
      }

      // Physics/Movement ONLY IF playing
      if (g.gameState === 'PLAYING') {
        const wantsJump = keysRef.current.jump;
        const wantsCrouch = keysRef.current.crouch;

        // Player state
        if (g.playerY > 0) {
          g.playerState = 'JUMPING';
        } else if (wantsCrouch) {
          if (g.playerState !== 'CROUCHING') {
            sounds.playCrouch();
          }
          g.playerState = 'CROUCHING';
        } else {
          g.playerState = 'RUNNING';
        }

        // Apply controller forces
        if (wantsJump && g.playerY === 0) {
          g.playerVelocityY = 9.8; // jump impulse
          g.playerY = 1;
          sounds.playJump();

          // Sparkle jumping particles
          for (let p = 0; p < 8; p++) {
            g.particles.push({
              x: 80,
              y: groundY,
              vx: -3 + Math.random() * 4,
              vy: -2 - Math.random() * 4,
              color: selectedSkin.color,
              size: 3 + Math.random() * 3,
              alpha: 1
            });
          }
        }

        // Apply Gravity
        if (g.playerY > 0) {
          // If crouching while in mid-air, plummet faster
          const effectiveGravity = wantsCrouch ? gravity * 3 : gravity;
          g.playerVelocityY -= effectiveGravity;
          g.playerY += g.playerVelocityY;

          if (g.playerY <= 0) {
            g.playerY = 0;
            g.playerVelocityY = 0;
          }
        }

        // Game Speed Acceleration slightly over time
        g.speed += 0.0003;
        if (g.speed > 11) g.speed = 11; // terminal runner speed limit

        // Increment distance score
        if (g.ticks % 5 === 0) {
          g.score += 1;
          setScore(g.score);

          // Milestone triggers
          if (g.score % 100 === 0) {
            sounds.playMilestone();
            setGlowEffect(true);
            setTimeout(() => setGlowEffect(false), 800);
          }
        }

        // --- Obstacle Spawning Logic ---
        // Spawn interval: 70 - 150 ticks based on speed
        const spawnDelay = Math.max(50, 110 - Math.floor(g.speed * 4));
        if (g.ticks - g.lastSpawnTick > spawnDelay && Math.random() < 0.12) {
          // Choose obstacle type
          const rand = Math.random();
          let type: ObstacleType = 'CACTUS_SINGLE';
          let obstacleWidth = 18;
          let obstacleHeight = 32;
          let obsOffset_Y = 0;

          if (rand < 0.3) {
            type = 'CACTUS_SINGLE';
            obstacleWidth = 18;
            obstacleHeight = 32 + Math.floor(Math.random() * 8); // variable heights
          } else if (rand < 0.55) {
            type = 'CACTUS_DOUBLE';
            obstacleWidth = 34;
            obstacleHeight = 32;
          } else if (rand < 0.72) {
            type = 'BIRD_LOW'; // fly low, player must jump over
            obstacleWidth = 30;
            obstacleHeight = 20;
            obsOffset_Y = 24; // flying height
          } else if (rand < 0.85) {
            type = 'BIRD_HIGH'; // fly high, must crouch to dodge
            obstacleWidth = 30;
            obstacleHeight = 20;
            obsOffset_Y = 48; // flies above head
          } else {
            type = 'COIN'; // floating coin
            obstacleWidth = 14;
            obstacleHeight = 14;
            obsOffset_Y = 40 + Math.random() * 30; // floating high or mid
          }

          g.obstacles.push({
            id: Date.now() + Math.random(),
            x: BASE_WIDTH + 10,
            y: obsOffset_Y,
            width: obstacleWidth,
            height: obstacleHeight,
            type: type,
            speed: g.speed,
            frame: 0,
            hasPassed: false
          });
          g.lastSpawnTick = g.ticks;
        }

        // --- Update Particles ---
        g.particles = g.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.03;
          return p.alpha > 0 && p.x > 0 && p.y < groundY + 50;
        });
      }

      // Draw all Particles
      g.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
      });

      // --- Draw & Process Obstacles ---
      g.obstacles = g.obstacles.filter(obs => {
        if (g.gameState === 'PLAYING') {
          obs.x -= g.speed;
        }

        // Flapping animation frames
        if (g.ticks % 10 === 0) {
          obs.frame = obs.frame === 0 ? 1 : 0;
        }

        // Render obstacle
        if (obs.type === 'CACTUS_SINGLE') {
          // Draw Cactus green
          ctx.fillStyle = g.daytimeCycle === 2 ? '#39ff14' : '#15803d'; // green cyber vs dark green
          renderPixelIcon(ctx, obs.x, groundY - obs.height, obs.width, obs.height, CACTUS_SINGLE_PIXELS, g.daytimeCycle === 2 ? '#ff007f' : undefined);
        } else if (obs.type === 'CACTUS_DOUBLE') {
          ctx.fillStyle = g.daytimeCycle === 2 ? '#39ff14' : '#047857';
          // Draw two cactuses close together
          renderPixelIcon(ctx, obs.x, groundY - obs.height, obs.width * 0.45, obs.height, CACTUS_SINGLE_PIXELS, g.daytimeCycle === 2 ? '#00ffff' : undefined);
          renderPixelIcon(ctx, obs.x + obs.width * 0.55, groundY - obs.height * 0.85, obs.width * 0.45, obs.height * 0.85, CACTUS_SINGLE_PIXELS, g.daytimeCycle === 2 ? '#00ffff' : undefined);
        } else if (obs.type === 'BIRD_LOW' || obs.type === 'BIRD_HIGH') {
          // Wing flap frame picker
          const framePixels = obs.frame === 0 ? BIRD_PIXELS_1 : BIRD_PIXELS_2;
          ctx.fillStyle = g.daytimeCycle === 2 ? '#ff007f' : '#b91c1c'; // Cyber pink vs deep red bird
          renderPixelIcon(ctx, obs.x, groundY - obs.y - obs.height, obs.width, obs.height, framePixels, '#ffffff');
        } else if (obs.type === 'COIN') {
          // Draw animated gold circle coin
          const spinScale = Math.sin(g.ticks * 0.15);
          ctx.save();
          ctx.translate(obs.x + obs.width / 2, groundY - obs.y - obs.height / 2);
          ctx.scale(Math.abs(spinScale), 1);
          
          // Outer Gold pixel ring
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);
          
          // Inner Shiny Gold core
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-obs.width * 0.25, -obs.height * 0.25, obs.width * 0.5, obs.height * 0.5);
          ctx.restore();
        }

        // --- Collision Detection ---
        // Player box coordinates
        const playerWidth = 32;
        // Crouching player has a shorter height and is closer to ground
        const playerHeight = g.playerState === 'CROUCHING' ? 22 : 40;
        const playerX = 80;
        const playerYTop = groundY - g.playerY - (g.playerState === 'CROUCHING' ? 22 : 40);

        // AABB box
        const playerBox = {
          left: playerX + 6,
          right: playerX + playerWidth - 4,
          top: playerYTop + 4,
          bottom: groundY - g.playerY
        };

        // Obstacle box
        const obsBox = {
          left: obs.x + 2,
          right: obs.x + obs.width - 2,
          top: groundY - obs.y - obs.height + 2,
          bottom: groundY - obs.y
        };

        const isColliding = (
          playerBox.right >= obsBox.left &&
          playerBox.left <= obsBox.right &&
          playerBox.bottom >= obsBox.top &&
          playerBox.top <= obsBox.bottom
        );

        if (isColliding) {
          if (obs.type === 'COIN') {
            // Collect coin instead of crashing
            sounds.playCoin();
            g.coins += 1;
            if (onCoinsUpdate) {
              onCoinsUpdate(g.coins);
            }
            // Spawn splash stars at coin position
            for (let c = 0; c < 6; c++) {
              g.particles.push({
                x: obs.x + obs.width / 2,
                y: groundY - obs.y - obs.height / 2,
                vx: -2 + Math.random() * 4,
                vy: -2 + Math.random() * 4,
                color: '#fbbf24',
                size: 2 + Math.random() * 2,
                alpha: 1
              });
            }
            return false; // remove coin from render list
          } else {
            // CRASHED! End game
            sounds.playHit();
            g.gameState = 'GAMEOVER';
            setGameState('GAMEOVER');

            // Save High Score
            if (g.score > g.highScore) {
              g.highScore = g.score;
              setHighScore(g.score);
              localStorage.setItem('tm_runner_high_score', g.score.toString());
            }

            // Splash of particles on explosion
            for (let e = 0; e < 25; e++) {
              g.particles.push({
                x: playerX + 16,
                y: playerYTop + playerHeight / 2,
                vx: -4 + Math.random() * 8,
                vy: -5 - Math.random() * 5,
                color: selectedSkin.color,
                size: 3 + Math.random() * 4,
                alpha: 1
              });
            }
          }
        }

        // Keep obstacle if still on screen
        return obs.x + obs.width > -50;
      });

      // --- Draw Player Character ---
      if (g.gameState !== 'GAMEOVER') {
        const pX = 80;
        const pY = groundY - g.playerY - (g.playerState === 'CROUCHING' ? 44 : 44);

        // Fetch running leg framework
        let activeModelPixels = RUNNER_PIXELS.standing_1;
        if (g.playerState === 'JUMPING') {
          activeModelPixels = RUNNER_PIXELS.jumping;
        } else if (g.playerState === 'CROUCHING') {
          activeModelPixels = (g.ticks % 10 < 5) ? RUNNER_PIXELS.crouching_1 : RUNNER_PIXELS.crouching_2;
        } else {
          // Alternative legs to simulate running
          activeModelPixels = (g.ticks % 12 < 6) ? RUNNER_PIXELS.standing_1 : RUNNER_PIXELS.standing_2;
        }

        ctx.fillStyle = selectedSkin.color;
        renderPixelIcon(
          ctx, 
          pX, 
          pY, 
          44, 
          44, 
          activeModelPixels, 
          selectedSkin.accentColor
        );
      } else {
        // Draw dead character pose
        const pX = 80;
        const pY = groundY - g.playerY - 44;
        ctx.fillStyle = '#9ca3af'; // dead gray color
        renderPixelIcon(ctx, pX, pY, 44, 44, RUNNER_PIXELS.jumping, '#374151');
      }

      // Request next frame
      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [skins, activeSkinId, gameState]);

  // Procedural pixel-art converter from binary block layouts
  const renderPixelIcon = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pixelGrid: string[],
    secondaryColor?: string
  ) => {
    const rows = pixelGrid.length;
    const cols = pixelGrid[0].length;
    const blockW = width / cols;
    const blockH = height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const char = pixelGrid[r][c];
        if (char === '0') continue; // transparent

        if (char === '1') {
          ctx.fillRect(x + c * blockW, y + r * blockH, Math.ceil(blockW), Math.ceil(blockH));
        } else if (char === '2' && secondaryColor) {
          ctx.fillStyle = secondaryColor;
          ctx.fillRect(x + c * blockW, y + r * blockH, Math.ceil(blockW), Math.ceil(blockH));
          // Restore original context drawing fill style
          ctx.fillStyle = ctx.fillStyle;
        } else if (char === '3') {
          // Eye color (dark or bright depending on cyber theme)
          ctx.fillStyle = '#000000';
          ctx.fillRect(x + c * blockW, y + r * blockH, Math.ceil(blockW), Math.ceil(blockH));
        }
      }
    }
  };

  // Dino Shop Unlocker Trigger
  const purchaseSkin = (skin: CharacterSkin) => {
    if (coinsCount < skin.cost) return;

    // Deduct coins
    const updatedCoins = coinsCount - skin.cost;
    if (onCoinsUpdate) {
      onCoinsUpdate(updatedCoins);
      gameInfoRef.current.coins = updatedCoins;
    }

    // Mark as unlocked
    const updatedSkins = skins.map(s => {
      if (s.id === skin.id) {
        return { ...s, unlocked: true };
      }
      return s;
    });

    setSkins(updatedSkins);
    localStorage.setItem('tm_runner_skins_v1', JSON.stringify(updatedSkins));
    
    // Auto Equip
    equipSkin(skin.id);
    sounds.playCoin();
  };

  const equipSkin = (skinId: string) => {
    setActiveSkinId(skinId);
    localStorage.setItem('tm_runner_active_skin', skinId);
    sounds.playMilestone();
  };

  return (
    <div 
      className={`flex flex-col w-full transition-all duration-300 border-4 p-4 md:p-6 relative overflow-hidden rounded-none ${
        isDark 
          ? 'bg-[#27272a] border-[#f4f4f5] shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] text-[#f4f4f5]' 
          : 'bg-white border-[#535353] shadow-[8px_8px_0px_0px_rgba(83,83,83,1)] text-[#535353]'
      }`} 
      id="retro-game-module"
    >
      {/* GLOW SCREEN EFFECT ON HIGHSCORE */}
      <div className={`absolute inset-0 bg-yellow-400 bg-opacity-20 pointer-events-none transition-opacity duration-300 ${glowEffect ? 'opacity-100' : 'opacity-0'} z-50`} />

      {/* Retro HUD Panel */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between border-b-4 pb-4 mb-4 gap-2 transition-colors duration-300 ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-all border-2 ${
            isDark 
              ? 'bg-[#18181b] border-[#f4f4f5] text-[#f4f4f5] shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
              : 'bg-[#e0e0e0] border-[#535353] text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
          }`}>
            CONTROLLER: <span className={activeController === 'TEACHABLE_MACHINE' ? (isDark ? 'text-yellow-400 animate-pulse font-extrabold' : 'text-blue-700 animate-pulse font-extrabold') : 'text-[#535353]'}>{activeController}</span>
          </span>
          {activeController === 'TEACHABLE_MACHINE' && (
            <span className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase border-2 transition-all ${
              currentTMAction === 'JUMP' ? 'bg-green-100 border-green-700 text-green-700' : 
              currentTMAction === 'CROUCH' ? 'bg-amber-100 border-amber-700 text-amber-700' : 
              (isDark ? 'bg-[#3f3f46] border-[#f4f4f5] text-[#f4f4f5]' : 'bg-[#f0f0f0] border-[#535353] text-[#535353]')
            }`}>
              POSE: {currentTMAction}
            </span>
          )}
        </div>

        {/* Scores & Wallet */}
        <div className="flex items-center gap-4 text-right font-mono">
          <div className={`flex items-center gap-2 border-2 px-3 py-1 text-xs font-bold transition-all ${
            isDark 
              ? 'bg-yellow-950/40 border-[#f4f4f5] text-yellow-300 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
              : 'bg-yellow-100 border-[#535353] text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
          }`}>
            <span className="w-3 h-3 bg-yellow-500 border border-[#535353] inline-block animate-bounce shadow-sm"></span>
            <span>{coinsCount} COINS</span>
          </div>
          <div className={`text-xs uppercase font-extrabold transition-colors ${isDark ? 'text-[#a1a1aa]' : 'text-[#777777]'}`}>
            HI: <span className={isDark ? 'text-white' : 'text-[#333333]'}>{highScore.toString().padStart(5, '0')}</span>
          </div>
          <div className={`text-xs font-black whitespace-nowrap px-3 py-1 border-2 transition-all ${
            isDark 
              ? 'bg-[#3f3f46] border-[#f4f4f5] text-white' 
              : 'bg-[#535353] border-[#535353] text-white'
          }`}>
            SCORE: <span className="text-green-300 font-mono font-bold">{score.toString().padStart(5, '0')}</span>
          </div>
        </div>
      </div>

      {/* Screen Frame Container with aspect scaling */}
      <div className={`relative w-full aspect-[800/250] overflow-hidden border-4 shadow-[4px_4px_0px_0px_rgba(83,83,83,0.15)] group rounded-none transition-all duration-300 ${
        isDark ? 'border-[#f4f4f5] bg-[#1a1625]' : 'border-[#535353] bg-[#e0e0e0]'
      }`}>
        <canvas
          ref={canvasRef}
          width={800}
          height={250}
          className={`w-full h-full block italic transition-colors duration-300 ${
            isDark ? 'bg-[#18181b]' : 'bg-[#f7f7f7]'
          }`}
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Start Game overlay */}
        {gameState === 'IDLE' && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center text-center p-4 transition-colors duration-300 ${
            isDark ? 'bg-[#18181b]/95' : 'bg-white/95'
          }`}>
            <p className={`font-mono tracking-widest text-[11px] font-bold animate-pulse mb-1 ${
              isDark ? 'text-yellow-400' : 'text-[#535353]'
            }`}>
              • READY PLAYER ONE •
            </p>
            <h1 className={`font-sans text-2xl md:text-3xl font-black tracking-widest mb-3 uppercase drop-shadow-md ${
              isDark ? 'text-white' : 'text-[#535353]'
            }`}>
              DINO RUNNER
            </h1>
            <p className={`font-mono text-[11px] max-w-md mb-6 leading-normal ${
              isDark ? 'text-zinc-300' : 'text-[#777777]'
            }`}>
              {activeController === 'KEYBOARD' 
                ? 'Use [SPACE / UP] to Jump, [DOWN] to Crouch. Dodge obstacles and run!' 
                : 'Stand in front of the Webcam and pose to control Rex. Trigger actions!'}
            </p>
            <button
              id="start-running-btn"
              onClick={startGame}
              className={`font-mono font-bold text-xs px-6 py-2.5 transition-all cursor-pointer uppercase font-extrabold border-4 ${
                isDark 
                  ? 'bg-[#3f3f46] hover:bg-[#52525b] border-[#f4f4f5] text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                  : 'bg-white hover:bg-[#e0e0e0] border-[#535353] text-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
              }`}
            >
              Start Running (SPACE)
            </button>
          </div>
        )}

        {/* Game Over overlay */}
        {gameState === 'GAMEOVER' && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center text-center p-4 border-2 transition-colors duration-300 ${
            isDark ? 'bg-[#18181b]/95 border-[#f4f4f5]' : 'bg-[#f7f7f7]/95 border-[#535353]'
          }`}>
            <h2 className={`font-mono font-black text-3xl md:text-4xl tracking-tight mb-1 animate-bounce ${
              isDark ? 'text-white' : 'text-[#535353]'
            }`}>
              GAME OVER
            </h2>
            <p className={`font-mono text-xs mb-1 font-bold ${isDark ? 'text-zinc-300' : 'text-[#777777]'}`}>
              You scored <span className="text-green-600 font-extrabold">{score}</span> points
            </p>
            {score >= highScore && score > 0 && (
              <p className="text-yellow-600 font-mono text-[11px] uppercase font-bold mb-4 tracking-widest">
                🏆 NEW RECORD SET! 🏆
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                id="retry-game-btn"
                onClick={startGame}
                className={`font-mono text-xs px-6 py-2.5 transition-all cursor-pointer font-bold duration-75 border-4 ${
                  isDark 
                    ? 'bg-[#3f3f46] hover:bg-[#52525b] border-[#f4f4f5] text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                    : 'bg-white hover:bg-[#e0e0e0] border-[#535353] text-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
                }`}
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}

        {/* Audio control button floated locally on screen */}
        <div className="absolute bottom-2.5 right-2.5 flex gap-2">
          <button
            id="audio-mute-toggle"
            onClick={() => setIsMuted(prev => !prev)}
            className={`p-1.5 border-2 cursor-pointer transition ${
              isDark 
                ? 'bg-[#3f3f46] hover:bg-[#52525b] border-[#f4f4f5] text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                : 'bg-white hover:bg-[#f0f0f0] border-[#535353] text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]'
            }`}
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Arcade Controller Buttons */}
      <div className={`mt-4 border-4 p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none transition-colors duration-300 ${
        isDark 
          ? 'bg-[#18181b] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]' 
          : 'bg-[#f0f0f0] border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)]'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-[#535353] animate-pulse" />
          <span className={`text-[11px] font-black font-mono uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-[#535353]'}`}>
            Arcade Controller Pad:
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center md:justify-end">
          {/* Start/Action Button when ready */}
          {(gameState === 'IDLE' || gameState === 'GAMEOVER') && (
            <button
              type="button"
              onClick={startGame}
              className={`px-4 py-2.5 font-mono text-xs font-bold uppercase transition-all cursor-pointer font-black border-2 ${
                isDark 
                  ? 'bg-yellow-400 hover:bg-yellow-300 border-[#f4f4f5] text-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none' 
                  : 'bg-[#ffd54f] hover:bg-[#ffe082] border-[#535353] text-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
              }`}
            >
              🕹️ START / RESTART
            </button>
          )}

          {/* JUMP BUTTON */}
          <button
            type="button"
            onMouseDown={() => {
              if (gameState !== 'PLAYING') {
                startGame();
              }
              keysRef.current.jump = true;
            }}
            onMouseUp={() => {
              keysRef.current.jump = false;
            }}
            onMouseLeave={() => {
              keysRef.current.jump = false;
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              if (gameState !== 'PLAYING') {
                startGame();
              }
              keysRef.current.jump = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.jump = false;
            }}
            className={`px-6 py-3 font-mono text-xs text-white uppercase transition-all cursor-pointer font-black tracking-widest flex items-center justify-center gap-2 select-none min-w-[130px] border-4 ${
              isDark 
                ? 'bg-[#f03e3e] hover:bg-[#fa5252] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none' 
                : 'bg-[#ff6b6b] hover:bg-[#ff8787] border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
            }`}
          >
            <span>JUMP [▲]</span>
          </button>

          {/* CROUCH BUTTON */}
          <button
            type="button"
            onMouseDown={() => {
              keysRef.current.crouch = true;
            }}
            onMouseUp={() => {
              keysRef.current.crouch = false;
            }}
            onMouseLeave={() => {
              keysRef.current.crouch = false;
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current.crouch = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.crouch = false;
            }}
            className={`px-6 py-3 font-mono text-xs text-white uppercase transition-all cursor-pointer font-black tracking-widest flex items-center justify-center gap-2 select-none min-w-[130px] border-4 ${
              isDark 
                ? 'bg-[#1c7ed6] hover:bg-[#228be6] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none' 
                : 'bg-[#4dabf7] hover:bg-[#74c0fc] border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
            }`}
          >
            <span>CROUCH [▼]</span>
          </button>
        </div>
      </div>

      {/* Dino Shop Skin custom selection widgets */}
      <div className={`mt-5 border-t-4 pt-4 transition-colors duration-300 ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}>
        <h3 className={`font-mono text-xs uppercase tracking-wider font-bold mb-3 flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-[#535353]'}`}>
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          Dino Skin Wardrobe
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {skins.map(skin => {
            const isActive = activeSkinId === skin.id;
            const canAfford = coinsCount >= skin.cost;
            return (
              <div
                key={skin.id}
                className={`p-3 rounded-none border-4 transition-all flex flex-col justify-between ${
                  isDark 
                    ? isActive 
                      ? 'bg-[#18181b] border-[#f4f4f5] shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] text-[#f4f4f5]' 
                      : skin.unlocked 
                        ? 'bg-[#18181b] border-2 border-dashed border-[#f4f4f5] hover:border-solid hover:bg-[#27272a]' 
                        : 'bg-[#27272a]/40 border-zinc-700 opacity-60'
                    : isActive 
                      ? 'bg-white border-[#535353] shadow-[4px_4px_0px_0px_rgba(83,83,83,1)] text-[#535353]' 
                      : skin.unlocked 
                        ? 'bg-white border-2 border-dashed border-[#535353] hover:border-solid hover:bg-white' 
                        : 'bg-zinc-100 border-zinc-300 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className={`font-extrabold font-mono text-xs ${isDark ? 'text-white' : 'text-[#535353]'}`}>{skin.name}</span>
                    <span 
                      className={`w-4 h-4 border-2 ${isDark ? 'border-[#f4f4f5]' : 'border-[#535353]'}`}
                      style={{ backgroundColor: skin.color }}
                    />
                  </div>
                  <p className={`font-mono text-[10px] leading-tight mb-3 min-h-[32px] ${isDark ? 'text-zinc-400' : 'text-[#777777]'}`}>
                    {skin.description}
                  </p>
                </div>

                <div className="mt-auto">
                  {skin.unlocked ? (
                    isActive ? (
                      <span className={`w-full text-center block py-1.5 font-mono text-[10px] font-black uppercase border border-transparent ${
                        isDark ? 'bg-white text-black' : 'bg-[#535353] text-[#ffffff]'
                      }`}>
                        Current Skin
                      </span>
                    ) : (
                      <button
                        onClick={() => equipSkin(skin.id)}
                        className={`w-full text-center py-1.5 font-mono text-[10px] font-black uppercase transition cursor-pointer border-2 shadow-[2px_2px_0px_0px_rgba(83,83,83,1)] active:shadow-none hover:translate-y-[1px] ${
                          isDark 
                            ? 'bg-[#27272a] border-[#f4f4f5] text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                            : 'bg-white border-[#535353] text-[#535353]'
                        }`}
                      >
                        EQUIP SKIN
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => purchaseSkin(skin)}
                      disabled={!canAfford}
                      className={`w-full py-1.5 font-mono text-[10px] font-black uppercase transition text-center flex items-center justify-center gap-1 cursor-pointer border-2 ${
                        canAfford 
                          ? isDark 
                            ? 'bg-yellow-400 border-[#f4f4f5] text-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]' 
                            : 'bg-yellow-300 text-[#535353] border-[#535353] shadow-[2px_2px_0px_0px_rgba(83,83,83,1)]' 
                          : isDark 
                            ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' 
                            : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 bg-yellow-500 rounded-sm"></span>
                      UNLOCK • {skin.cost} Coins
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
