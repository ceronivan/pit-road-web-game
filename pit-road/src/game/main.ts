import { AUTO, Game, Types } from 'phaser';
import { TallerScene } from './scenes/TallerScene';
import { CarreraScene } from './scenes/CarreraScene';
import { ResultadosScene } from './scenes/ResultadosScene';

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 320,
    height: 180,
    zoom: 3,
    pixelArt: true,
    roundPixels: true,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scene: [TallerScene, CarreraScene, ResultadosScene],
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};

const StartGame = (parent: string) => new Game({ ...config, parent });

export default StartGame;
