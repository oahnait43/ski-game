import Phaser from 'phaser';
import PreloadScene from './scenes/PreloadScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import './style.css';

// iOS 音频修复：提供假的 AudioContext
if (typeof window !== 'undefined') {
  const FakeAudioContext = function() {
    this.state = 'running';
    this.destination = { 
      connect: function() {},
      disconnect: function() {}
    };
    this.currentTime = 0;
    
    this.createGain = function() { 
      return { 
        connect: function() { return this; },
        disconnect: function() {},
        gain: {
          value: 1,
          setValueAtTime: function() { return this; },
          linearRampToValueAtTime: function() { return this; },
          exponentialRampToValueAtTime: function() { return this; },
          setTargetAtTime: function() { return this; },
          cancelScheduledValues: function() { return this; }
        }
      }; 
    };
    
    this.createBufferSource = function() {
      return { 
        connect: function() { return this; }, 
        disconnect: function() {},
        start: function() {},
        stop: function() {}
      }; 
    };
    
    this.createBuffer = function() {
      return { duration: 0, length: 0, sampleRate: 44100 };
    };
    
    this.decodeAudioData = function() { 
      return Promise.resolve(this.createBuffer()); 
    };
    
    this.resume = function() { 
      this.state = 'running';
      return Promise.resolve(); 
    };
    
    this.suspend = function() { 
      this.state = 'suspended';
      return Promise.resolve(); 
    };
    
    this.close = function() { return Promise.resolve(); };
    
    this.createPanner = function() {
      return { connect: function() { return this; }, disconnect: function() {} };
    };
    
    this.createAnalyser = function() {
      return { connect: function() { return this; }, disconnect: function() {} };
    };
    
    this.createDynamicsCompressor = function() {
      return { connect: function() { return this; }, disconnect: function() {} };
    };
  };
  
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    backgroundColor: '#f0f8ff',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'matter',
        matter: {
            debug: false,
            gravity: { y: 0.5 },
            runner: {
                isFixed: true,
                fps: 60
            }
        }
    },
    scene: [PreloadScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
