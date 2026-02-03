import Phaser from 'phaser';
import Player from '../objects/Player';
import Dog from '../objects/Dog';
import Competitor from '../objects/Competitor';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        // 从 URL 参数或传入数据获取配置
        const urlParams = new URLSearchParams(window.location.search);
        
        this.config = {
            slope: parseFloat(urlParams.get('slope')) || 0.005, // 坡度带来的额外推力
            turnSpeed: parseFloat(urlParams.get('turn')) || 0.05, // 转向灵敏度
            obstacleDensity: parseInt(urlParams.get('density')) || 2, // 障碍物密度
            friction: parseFloat(urlParams.get('friction')) || 0.005 // 摩擦力
        };
        
        console.log('Game Config:', this.config);
    }

    create() {
        // 设置世界边界：扩大宽度以适应缩小后的视野
        const worldWidth = this.scale.width * 3; // 进一步扩大边界 (2 -> 3)
        this.matter.world.setBounds(-worldWidth / 2, -1000, worldWidth * 2, Infinity, 30, true, true, false, false);
        
        // 创建玩家
        this.player = new Player(this, this.scale.width / 2, 100);
        
        // 摄像机设置
        this.cameras.main.setZoom(0.5); // 进一步缩小 (0.6 -> 0.5)
        // startFollow(target, roundPixels, lerpX, lerpY, offsetX, offsetY)
        // offsetY 设为 -300 让人物处于屏幕偏上位置
        this.cameras.main.startFollow(this.player.sprite, false, 0.1, 0.1, 0, -300);
        this.cameras.main.setBackgroundColor('#ffffff'); // 纯白背景
        
        // 输入控制
        this.cursors = this.input.keyboard.createCursorKeys();
        
        // 移动端重力感应变量
        this.tiltInput = 0;
        
        // iOS 权限处理覆盖层
        this.checkOrientationPermission();

        // 障碍物管理
        this.obstacles = [];
        this.decorations = []; // 装饰物（不碰撞）
        this.dogs = []; // 狗
        this.competitors = []; // 同行者
        this.bears = []; // 狗熊
        this.birds = []; // 鸟群
        this.healthPacks = []; // 血包
        this.goldCoins = []; // 金币
        this.gates = []; // 旗门 (独立管理，不用物理引擎检测)
        this.lastSpawnY = 400; 

        // 碰撞检测
        this.matter.world.on('collisionstart', (event) => {
            // 确保场景没有被暂停或结束
            if (!this.scene.isActive()) return;

            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                this.handleCollision(bodyA, bodyB);
            });
        });
        
        // 状态
        this.score = 0;    // 积分
        this.hp = 100;     // 血量
        this.distance = 0; // 距离
        this.startTime = Date.now(); // 开始时间
        this.endTime = 0; // 结束时间
        this.startY = this.player.sprite.y;
        this.isGameOver = false;
        this.isFinished = false; // 是否到达终点
        
        // 发送初始血量
        this.events.emit('updateHealth', this.hp);

        // 监听落地事件 (来自 Player)
        this.events.on('playerLanded', () => {
             // 落地加分
             this.addScore(50, this.player.sprite.x, this.player.sprite.y - 80, 'NICE LANDING! +50', '#00ff00');
        });
        
        // 地形生成状态
        this.currentZone = 'normal'; // normal, forest, mound_field
        this.zoneRemainingLength = 0;
        
        // 初始化粒子池
        this.createParticleManager();
        
        // 待销毁对象队列 (防止物理计算中修改世界导致死锁)
        this.pendingDestroy = [];
    }

    checkOrientationPermission() {
        const overlay = document.getElementById('start-overlay');
        const startBtn = document.getElementById('start-btn');
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // 如果是 PC，直接启用键盘和鼠标控制，不显示权限请求
        if (!isMobile) {
            overlay.style.display = 'none';
            this.events.emit('updateDebug', 'PC Mode: Keyboard Only');
            return;
        }

        // 移动端：统一显示点击开始，确保获取用户交互上下文
        overlay.style.display = 'flex';
        
        startBtn.onclick = () => {
            // 尝试恢复音频上下文 (解决部分浏览器音频无法自动播放问题)
            if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
                this.sound.context.resume();
            }

            // iOS 13+ 需要显式请求权限
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                            this.events.emit('updateDebug', 'iOS Permission Granted');
                        } else {
                            this.events.emit('updateDebug', 'iOS Permission Denied: ' + response);
                            // 降级方案：启用鼠标/触控模拟
                            this.enableMouseControl();
                        }
                    })
                    .catch(error => {
                        console.error(error);
                        this.events.emit('updateDebug', 'iOS Error: ' + error.message);
                    })
                    .finally(() => {
                        overlay.style.display = 'none';
                    });
            } else {
                // Android / 旧 iOS / 其他设备
                // 直接绑定事件，但必须在点击事件中执行以确保生效
                if (window.DeviceOrientationEvent) {
                    window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                    // 某些 Android 设备可能需要 deviceorientationabsolute
                    if ('ondeviceorientationabsolute' in window) {
                        window.addEventListener('deviceorientationabsolute', this.handleOrientation.bind(this));
                    }
                    this.events.emit('updateDebug', 'Android/Standard Sensor Active');
                } else {
                    this.events.emit('updateDebug', 'Sensor Not Supported');
                    this.enableMouseControl();
                }
                overlay.style.display = 'none';
            }
        };
        
        this.events.emit('updateDebug', 'Waiting for User Interaction...');
    }

    enableMouseControl() {
        this.events.emit('updateDebug', 'Mouse Control Enabled');
        this.input.on('pointermove', (pointer) => {
            // 将鼠标 X 坐标映射到 -1 到 1 的 tilt 值
            const centerX = this.scale.width / 2;
            const tilt = (pointer.x - centerX) / (this.scale.width / 2);
            // 限制范围
            this.tiltInput = Phaser.Math.Clamp(tilt, -1, 1);
        });
    }

    addScore(points, x, y, message, color) {
        if (this.isGameOver || this.isFinished) return;
        
        this.score += points;
        this.events.emit('updateScore', this.score);
        
        if (message) {
            this.showFloatingText(x, y, message, color);
        }
    }

    updateHealth(amount) {
        if (this.isGameOver || this.isFinished) return;
        
        this.hp += amount;
        if (this.hp > 100) this.hp = 100;
        
        this.events.emit('updateHealth', this.hp);
        
        // 视觉提示
        const color = amount > 0 ? '#00ff00' : '#ff0000';
        const sign = amount > 0 ? '+' : '';
        // 可爱提示：心形符号
        const icon = amount > 0 ? '❤️' : '💔';
        this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, `${icon} ${sign}${amount}`, color);

        if (this.hp <= 0) {
            this.hp = 0;
            this.gameOver();
        }
    }

    handleCollision(bodyA, bodyB) {
        // 如果游戏结束，不再处理碰撞
        if (this.isGameOver) return;

        // 辅助函数：获取标签
        const getLabel = (body) => body.label;
        const hasLabel = (label) => getLabel(bodyA) === label || getLabel(bodyB) === label;
        
        // 玩家碰撞检测
        if (hasLabel('playerCollider')) {
            const otherBody = getLabel(bodyA) === 'playerCollider' ? bodyB : bodyA;
            const label = otherBody.label;

            // 只要确保在 destroy 之前检查 active 即可
            if (otherBody.gameObject && !otherBody.gameObject.active) return;
            
            // 处理传感器类型的碰撞 (金币、血包) - 即使跳跃中也能吃到
            if (label === 'gold_coin') {
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.addScore(50, this.player.sprite.x, this.player.sprite.y - 80, '💰 +50', '#FFD700');
                    otherBody.gameObject.destroy();
                }
                return;
            } else if (label === 'health_pack') {
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.updateHealth(1);
                    otherBody.gameObject.destroy();
                }
                return;
            }

            // 跳跃期间忽略障碍物碰撞 (树、雪包、狗)
            if (this.player.isJumping && (label === 'obstacle' || label === 'mound' || label === 'dog')) {
                return;
            }

            if (label === 'obstacle') {
                // 树：触发摔倒，不结束游戏
                this.player.crash();
                // 树震动效果
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.tweens.add({
                        targets: otherBody.gameObject,
                        scaleX: 1.2,
                        scaleY: 0.8,
                        yoyo: true,
                        duration: 100,
                        repeat: 1
                    });
                }
                // 扣血 (2滴)
                this.updateHealth(-2);
                
            } else if (label === 'ramp') {
                // 跳板：跳跃
                this.player.jump();
                // 落地分在 playerLanded 事件中处理
                
            } else if (label === 'mound') {
                // 雪堆：颠簸
                this.player.hitObstacle();
                // 不扣血，不扣分
                this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 40, 'Bump!', '#ffaa00');
                
                // 雪包炸裂特效 (复用粒子系统)
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    // 安全访问 position，如果 body 已经被销毁可能没有 position
                    const x = otherBody.position ? otherBody.position.x : otherBody.gameObject.x;
                    const y = otherBody.position ? otherBody.position.y : otherBody.gameObject.y;
                    
                    this.emitSnowExplosion(x, y);
                    
                    // 加入待销毁队列，不立即销毁
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            } else if (label === 'dog') {
                // 狗：绊倒摔跤，并叫一声
                this.player.crash();
                // 扣血 (10滴)
                this.updateHealth(-10);
                this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, '🐶 Wang!', '#ffffff');
                
            } else if (label === 'gateSensor') {
                // 穿过旗门 (旧逻辑兼容，防止重复触发，主要逻辑在 updateGates)
                // 加入待销毁队列
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            }
        }
    }

    showFloatingText(x, y, message, color, bgColor = null) {
        const style = { 
            fontSize: '24px', 
            fill: color, 
            fontFamily: 'Comic Sans MS, cursive, sans-serif', // 更可爱的字体
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        };
        if (bgColor) style.backgroundColor = bgColor;

        const text = this.add.text(x, y, message, style).setOrigin(0.5).setDepth(1000);
        
        // 随机倾斜一点
        text.setAngle(Phaser.Math.Between(-10, 10));

        this.tweens.add({
            targets: text,
            y: y - 100,
            alpha: 0,
            scale: { from: 1, to: 1.5 },
            angle: { from: text.angle, to: text.angle + Phaser.Math.Between(-10, 10) },
            duration: 1000,
            ease: 'Back.out',
            onComplete: () => text.destroy()
        });
    }

    checkCollision(bodyA, bodyB) {
        // Deprecated: logic moved to handleCollision
        return false;
    }

    handleOrientation(event) {
        const gamma = event.gamma; // 左右倾斜
        
        // 增加有效性检查，防止 null/undefined 报错
        if (gamma !== null && gamma !== undefined) {
            // 限制在 -30 到 30 度
            let tilt = gamma / 30;
            if (tilt > 1) tilt = 1;
            if (tilt < -1) tilt = -1;
            this.tiltInput = tilt;
            
            // 更新 UI 调试信息
            this.events.emit('updateDebug', `Tilt: ${gamma.toFixed(1)} | Input: ${tilt.toFixed(2)}`);
        }
    }

    update() {
        if (this.isGameOver) return;
        // 如果已经到达终点，停止大部分逻辑，只保留必要的渲染
        if (this.isFinished) return;

        try {
            // 输入处理
            let control = 0; // 默认为 0
            
            // 优先检查键盘输入 (PC端)
            if (this.cursors.left.isDown) {
                control = -1;
            } else if (this.cursors.right.isDown) {
                control = 1;
            } else {
                // 如果没有键盘输入，才使用重力感应 (移动端)
                control = this.tiltInput;
            }

            if (this.player && this.player.isAlive && this.player.sprite && this.player.sprite.active) {
                this.player.update({ tilt: control }, this.config);
            }
            
            // 更新小狗 (增加有效性检查)
            if (this.dogs) {
                this.dogs.forEach(dog => {
                    if (dog && dog.active && typeof dog.update === 'function') dog.update();
                });
            }

            // 更新同行者 (增加有效性检查)
            if (this.competitors) {
                this.competitors.forEach(comp => {
                    if (comp && comp.sprite && comp.sprite.active && typeof comp.update === 'function') {
                        comp.update(this.player.sprite.y, this.config);
                    }
                });
            }

            // 更新旗门检测
            this.updateGates();

            // 更新狗熊
            this.updateBears();

            // 更新鸟
            this.updateBirds();

            // 更新分数和距离
            if (this.player && this.player.sprite) {
                const currentDistance = Math.floor((this.player.sprite.y - this.startY) / 10);
                if (currentDistance > this.distance) {
                    this.distance = currentDistance;
                    this.events.emit('updateDistance', this.distance);
                    
                    // 检查终点
                    if (this.distance >= 8848 && !this.isFinished) {
                        this.reachFinishLine();
                    }
                }
            }

            // 动态生成环境
            const viewBottom = this.cameras.main.scrollY + this.scale.height;
            // 预加载下方 1000 像素的内容
            if (this.lastSpawnY < viewBottom + 1000) {
                this.spawnEnvironment(this.lastSpawnY, this.lastSpawnY + 500);
                this.lastSpawnY += 500;
            }
            
            // 处理延迟销毁队列 (安全销毁)
            if (this.pendingDestroy && this.pendingDestroy.length > 0) {
                this.pendingDestroy.forEach(obj => {
                    if (obj && obj.active) {
                        obj.destroy();
                    }
                });
                this.pendingDestroy = []; // 清空队列
            }
            
            this.cleanupEnvironment();
        } catch (error) {
            console.error('Game Loop Error:', error);
            // 尝试恢复或忽略错误，避免卡死
        }
    }

    updateGates() {
        if (!this.player || !this.player.sprite) return;
        const playerX = this.player.sprite.x;
        const playerY = this.player.sprite.y;
        
        this.gates.forEach(gate => {
            if (!gate || gate.passed) return;
            
            // 简单的 Y 轴穿过检测
            // 如果玩家刚刚经过旗门的 Y 线
            if (playerY > gate.y && playerY < gate.y + 50) { // 50 是检测容差
                // 检查 X 轴是否在旗门范围内
                const halfWidth = gate.width / 2;
                if (playerX > gate.x - halfWidth && playerX < gate.x + halfWidth) {
                    gate.passed = true;
                    // 触发得分
                    this.addScore(100, gate.x, gate.y - 50, 'PERFECT! +100', '#ffff00');
                    // 增加血量
                    this.updateHealth(1);
                }
            }
        });
    }

    reachFinishLine() {
        if (this.isFinished) return; // 防止重复触发
        this.isFinished = true;
        this.endTime = Date.now(); // 记录结束时间
        
        try {
            this.player.sprite.setVelocity(0, 0); // 停止
            this.physics.pause(); // 暂停物理
            
            // 播放彩带特效 (放在 try-catch 中，防止报错阻断后续逻辑)
            try {
                this.fireConfetti();
            } catch (err) {
                console.error('Confetti Error:', err);
            }
            
            // 保存并显示排行榜
            this.saveScore();
            this.showLeaderboard();
        } catch (error) {
            console.error('Finish Line Error:', error);
            // 即使报错也尝试显示排行榜作为保底
            this.showLeaderboard();
        }
    }

    fireConfetti() {
        // 创建多个颜色的彩带粒子
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
        
        // 创建一个简单的矩形纹理用于彩带
        if (!this.textures.exists('confetti')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 10, 5);
            g.generateTexture('confetti', 10, 5);
        }

        const emitter = this.add.particles(0, 0, 'confetti', {
            x: { min: 0, max: this.scale.width },
            y: -50,
            lifespan: 3000,
            speedY: { min: 100, max: 300 },
            speedX: { min: -100, max: 100 },
            angle: { min: 0, max: 360 },
            rotate: { min: 0, max: 360 },
            gravityY: 100,
            scale: { min: 0.5, max: 1.5 },
            tint: colors,
            quantity: 2,
            frequency: 50
        });
        
        // 5秒后停止
        this.time.delayedCall(5000, () => emitter.stop());
    }

    saveScore() {
        // 计算用时
        const durationMs = this.endTime - this.startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        const timeStr = `${minutes}m ${seconds}s`;

        const record = {
            date: new Date().toLocaleString(),
            score: this.score,
            time: timeStr // 新增用时
        };
        
        let leaderboard = [];
        try {
            const stored = localStorage.getItem('ski_leaderboard');
            if (stored) {
                leaderboard = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load leaderboard', e);
        }
        
        leaderboard.push(record);
        // 按分数降序排序
        leaderboard.sort((a, b) => b.score - a.score);
        // 只保留前10名
        leaderboard = leaderboard.slice(0, 10);
        
        try {
            localStorage.setItem('ski_leaderboard', JSON.stringify(leaderboard));
        } catch (e) {
            console.error('Failed to save leaderboard', e);
        }
    }

    showLeaderboard() {
        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // 背景遮罩
        const bg = this.add.rectangle(cx, cy, width * 0.9, height * 0.8, 0xffffff, 0.95)
            .setStrokeStyle(4, 0x000000)
            .setScrollFactor(0)
            .setDepth(2000);
            
        // 标题
        this.add.text(cx, cy - height * 0.35, 'CONGRATULATIONS!', {
            fontSize: '32px',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this.add.text(cx, cy - height * 0.28, `Final Score: ${this.score}`, {
            fontSize: '48px',
            fill: '#000000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 显示本次用时
        const durationMs = this.endTime - this.startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        this.add.text(cx, cy - height * 0.23, `Time: ${minutes}m ${seconds}s`, {
            fontSize: '24px',
            fill: '#333333'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this.add.text(cx, cy - height * 0.18, 'TOP 10 LEADERBOARD', {
            fontSize: '24px',
            fill: '#333333',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 排行榜列表
        let leaderboard = [];
        try {
            leaderboard = JSON.parse(localStorage.getItem('ski_leaderboard') || '[]');
        } catch (e) {}
        
        let startY = cy - height * 0.12;
        const lineHeight = 30;
        
        leaderboard.forEach((record, index) => {
            const rank = index + 1;
            const dateStr = record.date.split(' ')[0]; // 只显示日期
            const scoreStr = record.score;
            const timeStr = record.time || '--';
            
            // 排名
            this.add.text(cx - 140, startY + index * lineHeight, `#${rank}`, { fontSize: '20px', fill: '#666' })
                .setOrigin(0, 0.5).setScrollFactor(0).setDepth(2001);
            // 日期
            this.add.text(cx - 90, startY + index * lineHeight, dateStr, { fontSize: '16px', fill: '#666' })
                .setOrigin(0, 0.5).setScrollFactor(0).setDepth(2001);
            // 用时
            this.add.text(cx + 10, startY + index * lineHeight, timeStr, { fontSize: '16px', fill: '#666' })
                .setOrigin(0, 0.5).setScrollFactor(0).setDepth(2001);
            // 分数
            this.add.text(cx + 140, startY + index * lineHeight, scoreStr, { fontSize: '20px', fill: '#000', fontStyle: 'bold' })
                .setOrigin(1, 0.5).setScrollFactor(0).setDepth(2001);
        });

        // 重玩按钮
        const restartBtn = this.add.text(cx, cy + height * 0.3, 'TAP TO PLAY AGAIN', {
            fontSize: '28px',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            this.scene.restart();
        });
        
        // 简单动效
        this.tweens.add({
            targets: restartBtn,
            scale: 1.1,
            yoyo: true,
            repeat: -1,
            duration: 800
        });
    }

    updateBears() {
        if (!this.player || !this.player.sprite || !this.player.sprite.body) return;
        const playerPos = this.player.sprite.body.position;
        
        this.bears.forEach(bear => {
            if (!bear || !bear.body) return;
            // 1. 巡逻逻辑
            if (Math.abs(bear.x - bear.startX) > bear.patrolRange) {
                bear.direction *= -1;
                bear.setVelocityX(0);
            }
            // 只有在没有追逐玩家时才巡逻
            const distToPlayer = Phaser.Math.Distance.Between(bear.x, bear.y, playerPos.x, playerPos.y);
            
            if (distToPlayer < 300) {
                // 发现玩家！吼叫
                if (this.time.now > bear.nextRoarTime) {
                    this.showFloatingText(bear.x, bear.y - 60, 'ROAR!', '#ff0000', '#ffffff');
                    bear.nextRoarTime = this.time.now + 3000;
                    
                    // 震动一下
                    this.tweens.add({
                        targets: bear,
                        scaleX: 1.2,
                        scaleY: 1.2,
                        yoyo: true,
                        duration: 200
                    });
                }
                
                // 追逐玩家 (简单的向玩家移动)
                const dx = playerPos.x - bear.x;
                const dy = playerPos.y - bear.y;
                bear.setVelocityX(dx > 0 ? 3 : -3); // 加速追赶
                bear.setVelocityY(dy > 0 ? 3 : -1); 

                // 检查是否抓到玩家
                if (distToPlayer < 50 && !this.isGameOver) { // 距离判定稍微放宽
                    if (this.hp > 0) {
                        // 持续扣血
                        if (!bear.nextAttackTime || this.time.now > bear.nextAttackTime) {
                            this.updateHealth(-5); // 每次扣5血
                            bear.nextAttackTime = this.time.now + 500; // 每0.5秒一次
                            this.showFloatingText(bear.x, bear.y - 60, 'GNAW!', '#ff0000', '#ffffff');
                            
                            // 玩家受伤反馈
                            this.player.hitObstacle();
                        }
                    } else {
                         // 血量归零，触发特殊死亡动画
                         this.bearEatPlayer(bear);
                    }
                }
                
            } else {
                // 继续巡逻
                bear.setVelocityX(bear.direction * 0.5); // 慢悠悠走
            }
        });
    }

    bearEatPlayer(bear) {
        this.isGameOver = true;
        this.player.isAlive = false;
        this.player.sprite.setVelocity(0, 0);
        
        // 1. 狗熊扑向屏幕
        // 创建一个新的大狗熊 Sprite 在屏幕最前方
        const bigBear = this.add.image(bear.x, bear.y, 'bear');
        bigBear.setDepth(2000);
        
        // 动画：变大扑脸
        this.tweens.add({
            targets: bigBear,
            scale: 5,
            x: this.cameras.main.midPoint.x,
            y: this.cameras.main.midPoint.y,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                // 黑屏
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.time.delayedCall(1000, () => {
                    this.scene.restart();
                });
            }
        });
        
        this.showFloatingText(bear.x, bear.y - 100, 'CHOMP!', '#ff0000', '#000000');
    }

    updateBirds() {
        if (!this.player || !this.player.sprite) return;
        const playerY = this.player.sprite.y;
        
        this.birds.forEach(birdObj => {
            if (!birdObj || !birdObj.sprite) return;
            if (birdObj.state === 'idle') {
                // 检查玩家是否靠近
                if (Math.abs(birdObj.groundY - playerY) < 200) {
                    // 惊吓起飞
                    birdObj.state = 'flying';
                    // 随机飞向左上或右上
                    birdObj.velocityX = (Math.random() - 0.5) * 5;
                    birdObj.velocityY = -3 - Math.random() * 2;
                }
            } else if (birdObj.state === 'flying') {
                birdObj.sprite.x += birdObj.velocityX;
                birdObj.sprite.y += birdObj.velocityY;
                // 慢慢淡出
                birdObj.sprite.alpha -= 0.01;
            }
        });
    }

    spawnEnvironment(startY, endY) {
        // 终点线位置 (8848m * 10 = 88480px + startY)
        const finishY = this.startY + 88480;
        
        // 如果本次生成范围覆盖了终点线
        if (startY <= finishY && endY >= finishY) {
            this.createFinishLine(finishY);
        }

        // 更新地形区域状态
        if (this.zoneRemainingLength <= 0) {
            // 随机选择新地形
            const rand = Math.random();
            if (rand < 0.5) {
                this.currentZone = 'normal';
                this.zoneRemainingLength = 1000 + Math.random() * 1000;
            } else if (rand < 0.75) {
                this.currentZone = 'forest';
                this.zoneRemainingLength = 800 + Math.random() * 800;
                this.showFloatingText(this.player.sprite.x, startY, 'DENSE FOREST!', '#228B22');
            } else {
                this.currentZone = 'mound_field';
                this.zoneRemainingLength = 600 + Math.random() * 600;
                this.showFloatingText(this.player.sprite.x, startY, 'MOUND FIELD!', '#4169E1');
            }
        }
        
        // 减少剩余长度
        this.zoneRemainingLength -= (endY - startY);

        const density = this.config.obstacleDensity || 2;
        // 扩大生成范围，覆盖新的世界宽度
        const viewWidth = this.scale.width / 0.5; // 考虑 zoom
        const centerX = this.player.sprite.x;
        const minX = centerX - viewWidth / 1.5;
        const maxX = centerX + viewWidth / 1.5;
        
        // 根据不同地形执行不同生成逻辑
        if (this.currentZone === 'forest') {
            this.spawnForestZone(startY, endY, minX, maxX, centerX);
        } else if (this.currentZone === 'mound_field') {
            this.spawnMoundFieldZone(startY, endY, minX, maxX);
        } else {
            this.spawnNormalZone(startY, endY, minX, maxX, density);
        }

        // 统一生成可收集物品 (金币、血包)
        this.spawnCollectibles(startY, endY, minX, maxX);
    }

    spawnForestZone(startY, endY, minX, maxX, centerX) {
        // 密林：降低密度，增加随机性
        const step = 80; // 树木间隔增加 (60 -> 80)
        
        for (let y = startY; y < endY; y += step) {
            // 计算通道中心 (正弦波蜿蜒)
            const pathOffset = Math.sin(y * 0.005) * 300;
            const pathCenter = centerX + pathOffset;
            const pathWidth = 350; // 通道变宽 (250 -> 350)
            
            // 填充通道左侧
            for (let x = minX; x < pathCenter - pathWidth / 2; x += Phaser.Math.Between(80, 150)) { // 间距增加
                this.createObstacle(x, y + Phaser.Math.Between(-30, 30));
            }
            
            // 填充通道右侧
            for (let x = pathCenter + pathWidth / 2; x < maxX; x += Phaser.Math.Between(80, 150)) { // 间距增加
                this.createObstacle(x, y + Phaser.Math.Between(-30, 30));
            }
            
            // 通道中间极少障碍
            if (Math.random() < 0.05) { // 概率降低 (0.1 -> 0.05)
                this.createObstacle(pathCenter + Phaser.Math.Between(-50, 50), y);
            }
        }
    }

    spawnMoundFieldZone(startY, endY, minX, maxX) {
        // 雪包阵：适量雪包 + 跳板
        const count = 8; // 数量减半 (15 -> 8)
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            
            // 确保生成在视野内
            if (Math.random() < 0.3) {
                this.createRamp(x, y); // 30% 是跳板
            } else {
                this.createMound(x, y); // 70% 是雪包
            }
        }
        
        // 少量树木点缀
        for (let i = 0; i < 2; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }
    }

    spawnNormalZone(startY, endY, minX, maxX, density) {
        // 1. 生成树木 (致命障碍)
        const obstacleCount = Phaser.Math.Between(1, density * 2);
        for (let i = 0; i < obstacleCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }

        // 2. 生成跳板 (Ramp) - 提高概率
        if (Phaser.Math.Between(0, 10) > 4) { // 60% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createRamp(x, y);
        }

        // 3. 生成雪堆 (Mound) - 提高概率
        if (Phaser.Math.Between(0, 10) > 2) { // 80% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createMound(x, y);
        }

        // 4. 生成小狗
        if (Phaser.Math.Between(0, 20) > 18) { // 10% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.dogs.push(new Dog(this, x, y));
        }

        // 5. 生成同行者 (Competitor) - 增加生成
        if (Phaser.Math.Between(0, 20) > 12) { // 提高概率 (15 -> 12)
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            // 速度因子多样化：0.5 ~ 1.5
            const speedFactor = 0.5 + Math.random() * 1.0;
            this.competitors.push(new Competitor(this, x, y, speedFactor));
        }

        // 6. 生成装饰
        const decoCount = Phaser.Math.Between(3, 8);
        for (let i = 0; i < decoCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createDecoration(x, y);
        }

        // 7. 生成指示旗 (Gate) - 新增
        if (Phaser.Math.Between(0, 10) > 6) { // 40% 概率
            // 门需要一定宽度
            const gateWidth = 150;
            // 确保生成在可玩区域内
            const x = Phaser.Math.Between(minX + 100, maxX - 100);
            const y = Phaser.Math.Between(startY, endY);
            this.createGate(x, y, gateWidth);
        }

        // 8. 生成狗熊 (Bear) - 稀有
        if (Phaser.Math.Between(0, 50) > 48) { // 4% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBear(x, y);
        }

        // 9. 生成鸟群 (Birds)
        if (Phaser.Math.Between(0, 20) > 15) { // 25% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBirds(x, y);
        }
    }

    spawnCollectibles(startY, endY, minX, maxX) {
        // 生成血包 (Health Packs)
        if (Phaser.Math.Between(0, 20) > 10) { // 50% 概率生成
            if (Math.random() < 0.2) {
                // 连续一串 (大补给)
                const startX = Phaser.Math.Between(minX + 50, maxX - 50);
                const startY_Pack = Phaser.Math.Between(startY, endY - 300);
                for (let i = 0; i < 10; i++) {
                    this.createHealthPack(startX, startY_Pack + i * 30);
                }
            } else {
                // 单个散落
                const count = Phaser.Math.Between(1, 3);
                for (let i = 0; i < count; i++) {
                    const x = Phaser.Math.Between(minX, maxX);
                    const y = Phaser.Math.Between(startY, endY);
                    this.createHealthPack(x, y);
                }
            }
        }

        // 生成金币 (Gold Coins)
        if (Phaser.Math.Between(0, 20) > 5) { // 75% 概率
            // 可能是圆弧形或者直线形
            const shapeType = Math.random();
            const startX = Phaser.Math.Between(minX + 100, maxX - 100);
            const startY_Coin = Phaser.Math.Between(startY, endY - 200);
            
            if (shapeType < 0.5) {
                // 竖直线
                for (let i = 0; i < 5; i++) {
                    this.createGoldCoin(startX, startY_Coin + i * 40);
                }
            } else {
                // 随机散落
                const count = Phaser.Math.Between(3, 8);
                for (let i = 0; i < count; i++) {
                    const x = Phaser.Math.Between(minX, maxX);
                    const y = Phaser.Math.Between(startY, endY);
                    this.createGoldCoin(x, y);
                }
            }
        }
    }

    createParticleManager() {
        // 创建全局复用的粒子管理器
        if (!this.snowParticleManager) {
            this.snowParticleManager = this.add.particles(0, 0, 'snow_particle', {
                speed: { min: 50, max: 150 },
                scale: { start: 1, end: 0 },
                lifespan: 500,
                quantity: 10,
                emitting: false // 默认不发射
            });
            this.snowParticleManager.setDepth(100); // 确保在障碍物上方
        }
    }

    emitSnowExplosion(x, y) {
        if (this.snowParticleManager) {
            this.snowParticleManager.emitParticleAt(x, y, 10);
        }
    }

    createFinishLine(y) {
        // 创建终点横幅
        const width = this.scale.width * 2; // 足够宽
        const graphics = this.make.graphics({x: 0, y: 0, add: false});
        
        // 绘制黑白格旗帜
        const boxSize = 40;
        const cols = Math.ceil(width / boxSize);
        const rows = 2;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                graphics.fillStyle((i + j) % 2 === 0 ? 0x000000 : 0xffffff, 1);
                graphics.fillRect(i * boxSize, j * boxSize, boxSize, boxSize);
            }
        }
        graphics.generateTexture('finish_banner', width, boxSize * rows);
        
        const banner = this.add.image(this.player.sprite.x, y, 'finish_banner');
        banner.setDepth(500);
        
        // 两侧立柱
        const postLeft = this.add.rectangle(this.player.sprite.x - 300, y, 20, 300, 0x8B4513).setDepth(500);
        const postRight = this.add.rectangle(this.player.sprite.x + 300, y, 20, 300, 0x8B4513).setDepth(500);
        
        // 添加文字
        const text = this.add.text(this.player.sprite.x, y - 100, 'FINISH LINE', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(501);
        
        // 确保不会被清理
        // (不需要特殊处理，cleanupEnvironment 只清理上方的)
    }

    createGate(x, y, width) {
        // 左旗
        const leftFlag = this.add.image(x - width / 2, y, 'gate_left');
        // 右旗
        const rightFlag = this.add.image(x + width / 2, y, 'gate_right');
        
        // 不再创建物理实体，而是创建一个逻辑对象
        const gate = {
            x: x,
            y: y,
            width: width,
            leftFlag: leftFlag,
            rightFlag: rightFlag,
            passed: false // 是否已穿过
        };
        
        this.gates.push(gate);
    }

    createBear(x, y) {
        const bear = this.matter.add.sprite(x, y, 'bear', null, {
            isStatic: false, // 狗熊会动
            label: 'bear',
            friction: 0.1,
            density: 0.05
        });
        bear.setFixedRotation(); // 不倒
        
        // 简单的巡逻逻辑属性
        bear.startX = x;
        bear.patrolRange = 100;
        bear.direction = 1;
        bear.nextRoarTime = 0;
        bear.nextAttackTime = 0; // 新增攻击冷却
        
        this.bears.push(bear);
    }

    createBirds(x, y) {
        // 生成一群鸟 (3-5只)
        const count = Phaser.Math.Between(3, 5);
        for (let i = 0; i < count; i++) {
            const bird = this.add.image(x + Phaser.Math.Between(-20, 20), y + Phaser.Math.Between(-20, 20), 'bird');
            bird.setScale(0.5 + Math.random() * 0.5);
            // 鸟不参与物理碰撞，只是视觉元素
            this.birds.push({
                sprite: bird,
                state: 'idle', // idle, flying
                groundY: y
            });
        }
    }

    createHealthPack(x, y) {
        const hp = this.matter.add.sprite(x, y, 'health_pack', null, {
            isStatic: true,
            isSensor: true,
            label: 'health_pack'
        });
        
        // 简单的浮动动画
        this.tweens.add({
            targets: hp,
            y: y - 10,
            yoyo: true,
            repeat: -1,
            duration: 1000,
            ease: 'Sine.easeInOut'
        });
        
        this.healthPacks.push(hp);
    }

    createGoldCoin(x, y) {
        const coin = this.matter.add.sprite(x, y, 'gold_coin', null, {
            isStatic: true,
            isSensor: true,
            label: 'gold_coin'
        });
        
        // 旋转动画
        this.tweens.add({
            targets: coin,
            scaleX: 0, // 翻转效果
            yoyo: true,
            repeat: -1,
            duration: 500
        });
        
        this.goldCoins.push(coin);
    }

    createObstacle(x, y) {
        if (!this.textures.exists('tree')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0x228B22, 1); // ForestGreen
            g.fillTriangle(0, 60, 30, 0, 60, 60); // 变大一点
            g.fillStyle(0x8B4513, 1); // SaddleBrown
            g.fillRect(22, 60, 16, 15);
            g.generateTexture('tree', 60, 75);
        }

        const obstacle = this.matter.add.sprite(x, y, 'tree', null, {
            isStatic: true,
            label: 'obstacle',
            shape: {
                type: 'circle',
                radius: 10, // 缩小碰撞半径 (15 -> 10)
                offset: { x: 0, y: 25 } // 向下偏移，只碰撞树根/树干 (20 -> 25)
            },
            restitution: 0.2, 
            friction: 0.8
        });
        this.obstacles.push(obstacle);
    }

    createRamp(x, y) {
        if (!this.textures.exists('ramp')) {
             // 重新绘制更明显的跳板
             const rampG = this.make.graphics({x:0, y:0, add: false});
             rampG.fillStyle(0x4169E1, 1); // 皇家蓝
             rampG.lineStyle(3, 0x000080, 1); 
             rampG.beginPath();
             rampG.moveTo(0, 40);
             rampG.lineTo(60, 10); // 更宽更陡
             rampG.lineTo(60, 40);
             rampG.closePath();
             rampG.fillPath();
             rampG.strokePath();
             rampG.generateTexture('ramp', 60, 40);
        }

        const ramp = this.matter.add.sprite(x, y, 'ramp', null, {
            isStatic: true,
            isSensor: true,
            label: 'ramp'
        });
        this.obstacles.push(ramp);
    }

    createMound(x, y) {
        if (!this.textures.exists('mound')) {
             // 重新绘制更明显的雪堆
             const moundG = this.make.graphics({x:0, y:0, add: false});
             moundG.fillStyle(0xE0FFFF, 1); 
             moundG.lineStyle(2, 0xADD8E6, 1);
             moundG.beginPath();
             moundG.arc(30, 30, 25, Math.PI, 0); // 更大
             moundG.strokePath();
             moundG.fillPath();
             moundG.generateTexture('mound', 60, 30);
        }
        
        const mound = this.matter.add.sprite(x, y, 'mound', null, {
            isStatic: true,
            isSensor: true, 
            label: 'mound'
        });
        this.obstacles.push(mound);
    }

    createDecoration(x, y) {
        if (!this.textures.exists('snow_deco')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0xdceefc, 1); // 浅蓝色雪痕
            g.fillCircle(5, 5, 5);
            g.generateTexture('snow_deco', 10, 10);
        }
        
        const deco = this.add.image(x, y, 'snow_deco');
        deco.setAlpha(0.6);
        this.decorations.push(deco);
    }

    cleanupEnvironment() {
        const viewTop = this.cameras.main.scrollY;
        
        // 清理障碍物
        this.obstacles = this.obstacles.filter(obs => {
            // 如果对象已经被销毁（例如被撞碎），直接从列表中移除
            if (!obs.active) return false;

            if (obs.y < viewTop - 200) {
                // 如果是旗门物理实体(旧逻辑兼容)或传感器实体
                // 检查 leftFlag 和 rightFlag 是否存在且有 destroy 方法
                if (obs.leftFlag && typeof obs.leftFlag.destroy === 'function') {
                    obs.leftFlag.destroy();
                }
                if (obs.rightFlag && typeof obs.rightFlag.destroy === 'function') {
                    obs.rightFlag.destroy();
                }
                
                obs.destroy();
                return false;
            }
            return true;
        });

        // 清理纯逻辑旗门
        this.gates = this.gates.filter(gate => {
            if (gate.y < viewTop - 200) {
                if (gate.leftFlag && typeof gate.leftFlag.destroy === 'function') {
                    gate.leftFlag.destroy();
                }
                if (gate.rightFlag && typeof gate.rightFlag.destroy === 'function') {
                    gate.rightFlag.destroy();
                }
                return false;
            }
            return true;
        });

        // 清理狗
        this.dogs = this.dogs.filter(dog => {
            if (dog.sprite.y < viewTop - 200) {
                dog.sprite.destroy();
                return false;
            }
            return true;
        });

        // 清理狗熊
        this.bears = this.bears.filter(bear => {
            if (bear.y < viewTop - 500) {
                bear.destroy();
                return false;
            }
            return true;
        });

        // 清理鸟
        this.birds = this.birds.filter(bird => {
            if (bird.sprite.y < viewTop - 500) {
                bird.sprite.destroy();
                return false;
            }
            return true;
        });

        // 清理同行者
        this.competitors = this.competitors.filter(comp => {
            if (comp.sprite.y < viewTop - 500) { // 稍微宽松一点
                comp.sprite.destroy();
                return false;
            }
            return true;
        });

        // 清理装饰
        this.decorations = this.decorations.filter(deco => {
            if (deco.y < viewTop - 200) {
                deco.destroy();
                return false;
            }
            return true;
        });

        // 清理血包
        this.healthPacks = this.healthPacks.filter(hp => {
            if (!hp.active) return false; // 已经被吃掉
            if (hp.y < viewTop - 200) {
                hp.destroy();
                return false;
            }
            return true;
        });

        // 清理金币
        this.goldCoins = this.goldCoins.filter(coin => {
            if (!coin.active) return false;
            if (coin.y < viewTop - 200) {
                coin.destroy();
                return false;
            }
            return true;
        });
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        this.player.die();
        this.cameras.main.shake(500, 0.01);
        
        this.events.emit('updateDebug', 'Game Over! Tap to restart.');

        // 点击屏幕重新开始
        this.time.delayedCall(1000, () => {
            this.input.once('pointerdown', () => {
                this.scene.restart();
            });
        });
    }
}
