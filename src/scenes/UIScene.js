import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        // 确保 UI 在最上层
        this.scene.bringToTop();

        // 分数显示
        this.scoreText = this.add.text(20, 20, 'Score: 0', { 
            fontSize: '24px', 
            fill: '#000',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold'
        });

        // 距离显示 (只显示当前距离)
        this.distanceText = this.add.text(20, 50, 'Dist: 0m', { 
            fontSize: '18px', 
            fill: '#333',
            fontFamily: 'Arial, sans-serif'
        });

        // 血条背景
        this.add.rectangle(20, 80, 204, 24, 0x000000).setOrigin(0, 0); // 黑框
        this.add.rectangle(22, 82, 200, 20, 0xffffff).setOrigin(0, 0); // 白底
        // 血条
        this.hpBar = this.add.rectangle(22, 82, 200, 20, 0xff0000).setOrigin(0, 0);
        // 血量文字
        this.hpText = this.add.text(230, 82, 'HP: 100/100', {
            fontSize: '16px',
            fill: '#000',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        });

        this.debugText = this.add.text(20, 120, 'Tilt to move', { 
            fontSize: '14px', 
            fill: '#666',
            fontFamily: 'Arial, sans-serif'
        });
        
        // 监听 GameScene 事件
        const gameScene = this.scene.get('GameScene');
        
        // 更新分数
        gameScene.events.on('updateScore', (score) => {
            this.scoreText.setText('Score: ' + score);
        });

        // 更新血量
        gameScene.events.on('updateHealth', (hp) => {
            const percentage = Phaser.Math.Clamp(hp, 0, 100) / 100;
            this.hpBar.width = 200 * percentage;
            this.hpText.setText(`HP: ${Math.floor(hp)}/100`);
            
            // 颜色变化：低血量变红闪烁 (简单变色即可)
            if (percentage < 0.3) {
                this.hpBar.fillColor = 0xff0000;
            } else if (percentage < 0.6) {
                this.hpBar.fillColor = 0xffa500; // Orange
            } else {
                this.hpBar.fillColor = 0x00ff00; // Green
            }
        });

        // 更新距离

        // 更新距离
        gameScene.events.on('updateDistance', (distance) => {
            this.distanceText.setText(`Dist: ${Math.floor(distance)}m`);
        });

        gameScene.events.on('updateDebug', (text) => {
            this.debugText.setText(text);
        });
    }
}
