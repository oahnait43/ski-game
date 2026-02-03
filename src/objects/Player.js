import Phaser from 'phaser';

export default class Player {
    constructor(scene, x, y) {
        this.scene = scene;
        
        // 使用 Matter.js 的 Sprite
        this.sprite = scene.matter.add.sprite(x, y, 'player_straight');
        
        const Body = Phaser.Physics.Matter.Matter.Body;
        const Bodies = Phaser.Physics.Matter.Matter.Bodies;

        // 碰撞体：主要是底部的圆形，确保顺滑
        const mainBody = Bodies.circle(x, y + 10, 15, { label: 'playerCollider' });
        
        this.sprite.setExistingBody(mainBody);
        
        // 调整 Origin，确保脚部在底部
        this.sprite.setOrigin(0.5, 0.6);

        // 物理属性
        this.sprite.setFriction(0.005); // 地面摩擦力
        this.sprite.setFrictionAir(0.02); // 增加空气阻力，限制终极速度
        this.sprite.setBounce(0.1); // 降低弹性
        this.sprite.setMass(50);
        this.sprite.setFixedRotation(); 

        // 状态
        this.isAlive = true; // 保留作为整体开关
        this.isCrashed = false; // 是否处于摔倒状态
        this.isRecovering = false; // 是否处于无敌恢复状态
        this.isJumping = false;
        
        // 粒子发射器 (雪花)
        this.particles = scene.add.particles(0, 0, 'snow_particle', {
            speed: { min: 50, max: 100 },
            angle: { min: 220, max: 320 }, // 向后上方飞溅
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 500,
            gravityY: 100,
            follow: this.sprite,
            followOffset: { x: 0, y: 20 }, // 跟随脚底
            emitting: false
        });
        
        // 确保粒子在玩家下方渲染
        this.particles.setDepth(this.sprite.depth - 1);
    }

    update(controls, config = { turnSpeed: 0.05, slope: 0.005 }) {
        if (!this.isAlive) return;
        
        // 限制最大速度 (防止穿透)
        const maxVelocity = 25; 
        if (this.sprite.body.velocity.y > maxVelocity) {
            this.sprite.setVelocityY(maxVelocity);
        }
        
        // 确保水平速度衰减
        if (this.isCrashed) {
            this.sprite.setVelocityX(this.sprite.body.velocity.x * 0.9);
            return;
        }

        const velocity = this.sprite.body.velocity;

        // 1. 物理运动
        // 转向时会产生阻力减速 (模拟真实滑雪刻滑减速)
        // 压弯越深，减速越明显
        const turnDrag = Math.abs(controls.tilt) * 0.08;
        
        // 基础空气阻力 + 转向阻力
        // 直行时 (tilt接近0) 阻力极小，可以持续加速
        let airFriction = 0.001 + turnDrag;
        
        this.sprite.setFrictionAir(airFriction);

        const forceX = controls.tilt * config.turnSpeed;
        this.sprite.applyForce({ x: forceX, y: 0 });

        // 速度限制 (软限制，靠阻力平衡)
        const maxSpeedX = 20; // 提高横向极速
        if (velocity.x > maxSpeedX) this.sprite.setVelocityX(maxSpeedX);
        if (velocity.x < -maxSpeedX) this.sprite.setVelocityX(-maxSpeedX);

        // 坡度推力 (如果在地面上)
        if (!this.isJumping) {
            this.sprite.applyForce({ x: 0, y: config.slope });
            
            // 生成滑行轨迹 (Trail)
            if (this.scene.time.now % 50 < 20) { // 每隔几帧生成一个点
                this.createTrail();
            }
        }

        // 2. 视觉表现 (切换 Sprite 帧)
        // 恢复中的闪烁效果
        if (this.isRecovering) {
            this.sprite.setAlpha(this.scene.time.now % 200 < 100 ? 0.5 : 1);
        } else {
            this.sprite.setAlpha(1);
        }

        if (this.isJumping) {
            this.sprite.setTexture('player_jump');
            this.particles.stop(); // 跳跃时不产生雪花
            this.sprite.setRotation(0);
        } else {
            // 根据 tilt 值进行更平滑的视觉旋转
            const targetRotation = controls.tilt * 0.5; // 加大旋转幅度
            const currentRotation = this.sprite.rotation;
            this.sprite.setRotation(Phaser.Math.Linear(currentRotation, targetRotation, 0.2));

            if (controls.tilt < -0.1) {
                this.sprite.setTexture('player_left');
                this.particles.start();
                // 调整粒子：雪浪向右喷射，且更猛烈
                this.particles.angle = { min: -30, max: 60 };
                this.particles.speed = { min: 100 + Math.abs(velocity.y)*10, max: 200 + Math.abs(velocity.y)*20 };
            } else if (controls.tilt > 0.1) {
                this.sprite.setTexture('player_right');
                this.particles.start();
                // 调整粒子：雪浪向左喷射
                this.particles.angle = { min: 120, max: 210 };
                this.particles.speed = { min: 100 + Math.abs(velocity.y)*10, max: 200 + Math.abs(velocity.y)*20 };
            } else {
                this.sprite.setTexture('player_straight');
                // 直行时只有轻微雪尘
                if (velocity.y > 5) {
                    this.particles.start();
                    this.particles.angle = { min: 250, max: 290 };
                    this.particles.speed = { min: 50, max: 100 };
                } else {
                    this.particles.stop();
                }
            }
        }
    }

    createTrail() {
        // 创建一个简单的淡出圆形作为轨迹
        const trail = this.scene.add.circle(this.sprite.x, this.sprite.y + 20, 3, 0xdddddd, 0.6);
        trail.setDepth(this.sprite.depth - 2); // 在最底层
        
        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scale: 0,
            duration: 1000,
            onComplete: () => trail.destroy()
        });
    }

    jump() {
        if (this.isCrashed || this.isJumping || this.isRecovering) return false;
        
        this.isJumping = true;
        
        // 动态计算跳跃参数
        const currentVelY = this.sprite.body.velocity.y;
        
        // 1. 速度越快，冲力越大 (基础 15 + 速度加成)
        // 假设正常速度范围是 5-25
        const jumpImpulse = 15 + (currentVelY * 0.8); 
        this.sprite.setVelocityY(currentVelY + jumpImpulse);
        
        // 2. 速度越快，滞空时间越长
        // 基础 800ms，每增加 1 速度增加 30ms，上限 2000ms
        const baseDuration = 800;
        const extraDuration = Math.min(1200, currentVelY * 40);
        const totalDuration = baseDuration + extraDuration;
        
        // 3. 速度越快，跳得越高 (缩放比例)
        const scaleFactor = 1.5 + Math.min(1.0, currentVelY * 0.05); // max 2.5

        // 视觉上放大模拟腾空
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: scaleFactor,
            scaleY: scaleFactor,
            duration: totalDuration * 0.6, // 上升阶段占 60%
            yoyo: true,
            ease: 'Sine.easeInOut'
        });

        // 空中 360度 翻转特效
        this.scene.tweens.add({
            targets: this.sprite,
            angle: 360,
            duration: totalDuration * 0.8,
            ease: 'Cubic.out'
        });

        // 落地回调
        this.scene.time.delayedCall(totalDuration, () => {
            if (!this.scene || !this.sprite.active) return; // 安全检查
            this.isJumping = false;
            this.sprite.setAngle(0); 
            // 落地时的尘土特效
            this.particles.emitParticleAt(this.sprite.x, this.sprite.y, 20);
            
            // 触发落地事件
            this.scene.events.emit('playerLanded');
        });

        return true;
    }

    hitObstacle() {
        if (this.isCrashed || this.isRecovering) return;

        // 减速明显一点，但不要太慢导致卡住
        const currentVel = this.sprite.body.velocity;
        // 保持至少 2 的速度，或者当前速度的 50%
        const newSpeedY = Math.max(2, currentVel.y * 0.5);
        this.sprite.setVelocityY(newSpeedY); 
        
        // 视觉反馈：变红震动
        this.sprite.setTint(0xFF0000);
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.2,
            scaleY: 0.8,
            yoyo: true,
            duration: 100,
            onComplete: () => this.sprite.clearTint()
        });
    }
    
    crash() {
        if (this.isCrashed || this.isRecovering) return;
        
        this.isCrashed = true;
        this.sprite.setTexture('player_crash');
        this.particles.stop();
        
        // 允许物理旋转摔倒
        this.sprite.setFixedRotation(false); 
        
        // 施加反向力（被撞飞）
        this.sprite.applyForce({ x: (Math.random() - 0.5) * 0.1, y: -0.05 });
        
        // 1.5秒后自动恢复
        this.scene.time.delayedCall(1500, () => {
            this.recover();
        });
    }

    recover() {
        this.isCrashed = false;
        this.isRecovering = true;
        
        // 恢复直立
        this.sprite.setAngle(0);
        this.sprite.setFixedRotation(true);
        this.sprite.setTexture('player_straight');
        
        // 2秒无敌时间
        this.scene.time.delayedCall(2000, () => {
            this.isRecovering = false;
            this.sprite.setAlpha(1);
        });
    }

    die() {
        // Deprecated: 使用 crash 代替
        this.crash();
    }
}
