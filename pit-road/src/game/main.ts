import { AUTO, Game, Scale, Types } from 'phaser';
import { TallerScene }    from './scenes/TallerScene';
import { CarreraScene }   from './scenes/CarreraScene';
import { ResultadosScene } from './scenes/ResultadosScene';

const config: Types.Core.GameConfig = {
    type:            AUTO,
    backgroundColor: '#08111e',
    parent:          'game-container',
    scene:           [TallerScene, CarreraScene, ResultadosScene],
    scale: {
        mode:       Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width:      960,
        height:     540,
    },
    physics: {
        default: 'arcade',
        arcade:  { debug: false },
    },
};

const StartGame = (parent: string) => new Game({ ...config, parent });
export default StartGame;
