export type GameState = 'IDLE' | 'PLAYING' | 'GAMEOVER';

export type ObstacleType = 'CACTUS_SINGLE' | 'CACTUS_DOUBLE' | 'BIRD_HIGH' | 'BIRD_LOW' | 'COIN';

export interface Obstacle {
  id: number;
  x: number;
  y: number; // ground level offset or altitude
  width: number;
  height: number;
  type: ObstacleType;
  speed: number;
  frame: number;
  hasPassed: boolean;
  scoreValue?: number;
}

export type PlayerState = 'RUNNING' | 'JUMPING' | 'CROUCHING';

export interface CharacterSkin {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  cost: number;
  unlocked: boolean;
  description: string;
}

export type ControllerInputType = 'KEYBOARD' | 'TEACHABLE_MACHINE' | 'SIMULATOR';

export interface TeachableClassMapping {
  className: string;
  mappedAction: 'JUMP' | 'CROUCH' | 'NEUTRAL';
}

export interface PredictionResult {
  className: string;
  probability: number;
}
