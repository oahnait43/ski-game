import Phaser from 'phaser';

export default class Dog {
    constructor(scene, x, y) {
        this.scene = scene;
        
        // 使用 Matter.js Sprite
        this.sprite = scene.matter.add.sprite(x, y, 'dog_1', null, {
            isSensor: true, // 传感器模式：只触发碰撞事件，不产生物理反弹
            label: 'dog'
        });
        
        this.sprite.setIgnoreGravity(true); // 狗不受重力影响 (为了简化 AI 跑动)
        
        // 随机跑动方向
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.speed = Phaser.Math.Between(1, 3);
        
        // 播放动画
        this.scene.anims.create({
            key: 'dog_run',
            frames: [
                { key: 'dog_1' },
                { key: 'dog_2' }
            ],
            frameRate: 10,
            repeat: -1
        });
        
        this.sprite.play('dog_run');
        this.sprite.setFlipX(this.direction === -1); // 根据方向翻转
    }

    update() {
        this.sprite.x += this.direction * this.speed;
        
        // 碰到边界反弹
        if (this.sprite.x < 0) {
            this.direction = 1;
            this.sprite.setFlipX(false);
        } else if (this.sprite.x > this.scene.scale.width) {
            this.direction = -1;
            this.sprite.setFlipX(true);
        }
    }
}
