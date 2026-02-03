import Phaser from 'phaser';
import Player from '../objects/Player';
import Dog from '../objects/Dog';
import Competitor from '../objects/Competitor';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        const urlParams = new URLSearchParams(window.location.search);
        
        this.config = {
            slope: parseFloat(urlParams.get('slope')) || 0.005,
            turnSpeed: parseFloat(urlParams.get('turn')) || 0.05,
            obstacleDensity: Math.min(parseInt(urlParams.get('density')) || 2, 3),
            friction: parseFloat(urlParams.get('friction')) || 0.005
        };
        
        console.log('Game Config:', this.config);
    }

    create() {
        const worldWidth = this.scale.width * 3;
        this.matter.world.setBounds(-worldWidth / 2, -1000, worldWidth * 2, Infinity, 30, true, true, false, false);
        
        this.player = new Player(this, this.scale.width / 2, 100);
        
        this.cameras.main.setZoom(0.5);
        this.cameras.main.startFollow(this.player.sprite, false, 0.1, 0.1, 0, -300);
        this.cameras.main.setBackgroundColor('#ffffff');
        
        this.cursors = this.input.keyboard.createCursorKeys();
        this.tiltInput = 0;
        
        this.checkOrientationPermission();

        // 物体数组
        this.obstacles = [];
        this.decorations = [];
        this.dogs = [];
        this.competitors = [];
        this.bears = [];
        this.birds = [];
        this.healthPacks = [];
        this.goldCoins = [];
        this.gates = [];
        this.lastSpawnY = 400; 

        // 性能优化：限制最大物体数量
        this.maxObstacles = 50;
        this.maxDecorations = 30;
        this.maxDogs = 5;
        this.maxCompetitors = 5;
        this.maxBears = 2;
        this.maxBirds = 10;

        // 碰撞检测 - 使用防抖
        this.lastCollisionTime = 0;
        this.matter.world.on('collisionstart', (event) => {
            if (!this.scene.isActive()) return;
            const now = Date.now();
            if (now - this.lastCollisionTime < 50) return; // 50ms 防抖
            this.lastCollisionTime = now;
            
            event.pairs.forEach((pair) => {
                this.handleCollision(pair.bodyA, pair.bodyB);
            });
        });
        
        this.score = 0;
        this.hp = 100;
        this.distance = 0;
        this.startTime = Date.now();
        this.endTime = 0;
        this.startY = this.player.sprite.y;
        this.isGameOver = false;
        this.isFinished = false;
        
        this.events.emit('updateHealth', this.hp);

        this.events.on('playerLanded', () => {
             this.addScore(50, this.player.sprite.x, this.player.sprite.y - 80, 'NICE! +50', '#00ff00');
        });
        
        this.currentZone = 'normal';
        this.zoneRemainingLength = 0;
        
        this.createParticleManager();
        this.pendingDestroy = [];
        
        // FPS 监控
        this.frameCount = 0;
        this.lastFpsTime = Date.now();
    }

    checkOrientationPermission() {
        const overlay = document.getElementById('start-overlay');
        const startBtn = document.getElementById('start-btn');
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (!isMobile) {
            overlay.style.display = 'none';
            return;
        }

        overlay.style.display = 'flex';
        
        startBtn.onclick = () => {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                        }
                        overlay.style.display = 'none';
                    })
                    .catch(() => {
                        overlay.style.display = 'none';
                    });
            } else {
                if (window.DeviceOrientationEvent) {
                    window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                }
                overlay.style.display = 'none';
            }
        };
    }

    handleOrientation(event) {
        const gamma = event.gamma;
        if (gamma !== null && gamma !== undefined) {
            let tilt = gamma / 30;
            tilt = Math.max(-1, Math.min(1, tilt));
            this.tiltInput = tilt;
        }
    }

    update() {
        if (this.isGameOver || this.isFinished) return;

        try {
            // FPS 检查
            this.frameCount++;
            const now = Date.now();
            if (now - this.lastFpsTime > 1000) {
                console.log('FPS:', this.frameCount);
                this.frameCount = 0;
                this.lastFpsTime = now;
            }

            let control = 0;
            if (this.cursors.left.isDown) control = -1;
            else if (this.cursors.right.isDown) control = 1;
            else control = this.tiltInput;

            if (this.player?.isAlive && this.player.sprite?.active) {
                this.player.update({ tilt: control }, this.config);
            }
            
            // 每 3 帧更新一次非关键对象
            if (this.frameCount % 3 === 0) {
                this.dogs.forEach(dog => dog?.active && dog.update?.());
                this.competitors.forEach(comp => comp?.sprite?.active && comp.update?.(this.player.sprite.y, this.config));
                this.updateGates();
                this.updateBears();
                this.updateBirds();
            }

            if (this.player?.sprite) {
                const currentDistance = Math.floor((this.player.sprite.y - this.startY) / 10);
                if (currentDistance > this.distance) {
                    this.distance = currentDistance;
                    this.events.emit('updateDistance', this.distance);
                    
                    if (this.distance >= 8848 && !this.isFinished) {
                        this.reachFinishLine();
                    }
                }
            }

            // 生成环境 - 每 1000 像素生成一次
            const viewBottom = this.cameras.main.scrollY + this.scale.height;
            if (this.lastSpawnY < viewBottom + 800) {
                this.spawnEnvironment(this.lastSpawnY, this.lastSpawnY + 800);
                this.lastSpawnY += 800;
            }
            
            // 处理待销毁队列
            if (this.pendingDestroy.length > 0) {
                this.pendingDestroy.forEach(obj => obj?.active && obj.destroy());
                this.pendingDestroy = [];
            }
            
            // 每 10 帧清理一次环境
            if (this.frameCount % 10 === 0) {
                this.cleanupEnvironment();
            }
        } catch (error) {
            console.error('Game Loop Error:', error);
        }
    }

    handleCollision(bodyA, bodyB) {
        if (this.isGameOver) return;

        const getLabel = (body) => body.label;
        const hasLabel = (label) => getLabel(bodyA) === label || getLabel(bodyB) === label;
        
        if (!hasLabel('playerCollider')) return;
        
        const otherBody = getLabel(bodyA) === 'playerCollider' ? bodyB : bodyA;
        const label = otherBody.label;

        if (!otherBody.gameObject?.active) return;
        
        if (label === 'gold_coin') {
            this.addScore(50, this.player.sprite.x, this.player.sprite.y - 80, '+50', '#FFD700');
            otherBody.gameObject.destroy();
            return;
        } else if (label === 'health_pack') {
            this.updateHealth(1);
            otherBody.gameObject.destroy();
            return;
        }

        if (this.player.isJumping && (label === 'obstacle' || label === 'mound' || label === 'dog')) {
            return;
        }

        if (label === 'obstacle') {
            this.player.crash();
            this.updateHealth(-2);
        } else if (label === 'ramp') {
            this.player.jump();
        } else if (label === 'mound') {
            this.player.hitObstacle();
            if (otherBody.gameObject?.active) {
                this.pendingDestroy.push(otherBody.gameObject);
            }
        } else if (label === 'dog') {
            this.player.crash();
            this.updateHealth(-10);
        }
    }

    addScore(points, x, y, message, color) {
        if (this.isGameOver || this.isFinished) return;
        this.score += points;
        this.events.emit('updateScore', this.score);
    }

    updateHealth(amount) {
        if (this.isGameOver || this.isFinished) return;
        this.hp = Math.max(0, Math.min(100, this.hp + amount));
        this.events.emit('updateHealth', this.hp);
        if (this.hp <= 0) this.gameOver();
    }

    spawnEnvironment(startY, endY) {
        const finishY = this.startY + 88480;
        if (startY <= finishY && endY >= finishY) {
            this.createFinishLine(finishY);
        }

        if (this.zoneRemainingLength <= 0) {
            const rand = Math.random();
            if (rand < 0.5) {
                this.currentZone = 'normal';
                this.zoneRemainingLength = 1500;
            } else if (rand < 0.75) {
                this.currentZone = 'forest';
                this.zoneRemainingLength = 1200;
            } else {
                this.currentZone = 'mound_field';
                this.zoneRemainingLength = 1000;
            }
        }
        this.zoneRemainingLength -= (endY - startY);

        const density = this.config.obstacleDensity || 2;
        const viewWidth = this.scale.width / 0.5;
        const centerX = this.player.sprite.x;
        const minX = centerX - viewWidth / 1.5;
        const maxX = centerX + viewWidth / 1.5;
        
        // 限制最大数量，不再生成新物体
        if (this.currentZone === 'forest' && this.obstacles.length < this.maxObstacles) {
            this.spawnForestZone(startY, endY, minX, maxX, centerX);
        } else if (this.currentZone === 'mound_field' && this.obstacles.length < this.maxObstacles) {
            this.spawnMoundFieldZone(startY, endY, minX, maxX);
        } else if (this.obstacles.length < this.maxObstacles) {
            this.spawnNormalZone(startY, endY, minX, maxX, density);
        }

        if (this.goldCoins.length < 10) {
            this.spawnCollectibles(startY, endY, minX, maxX);
        }
    }

    spawnNormalZone(startY, endY, minX, maxX, density) {
        const obstacleCount = Math.min(Phaser.Math.Between(1, density), 3);
        for (let i = 0; i < obstacleCount && this.obstacles.length < this.maxObstacles; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }

        if (Math.random() < 0.3 && this.obstacles.length < this.maxObstacles) {
            this.createRamp(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }

        if (Math.random() < 0.4 && this.obstacles.length < this.maxObstacles) {
            this.createMound(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }

        if (Math.random() < 0.1 && this.dogs.length < this.maxDogs) {
            this.dogs.push(new Dog(this, Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY)));
        }

        if (Math.random() < 0.3 && this.competitors.length < this.maxCompetitors) {
            this.competitors.push(new Competitor(this, Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY), 0.5 + Math.random()));
        }

        const decoCount = Math.min(Phaser.Math.Between(2, 5), this.maxDecorations - this.decorations.length);
        for (let i = 0; i < decoCount && this.decorations.length < this.maxDecorations; i++) {
            this.createDecoration(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }
    }

    spawnForestZone(startY, endY, minX, maxX, centerX) {
        const step = 120;
        for (let y = startY; y < endY && this.obstacles.length < this.maxObstacles; y += step) {
            const pathOffset = Math.sin(y * 0.005) * 300;
            const pathCenter = centerX + pathOffset;
            const pathWidth = 400;
            
            for (let x = minX; x < pathCenter - pathWidth / 2 && this.obstacles.length < this.maxObstacles; x += Phaser.Math.Between(100, 180)) {
                this.createObstacle(x, y + Phaser.Math.Between(-30, 30));
            }
            
            for (let x = pathCenter + pathWidth / 2; x < maxX && this.obstacles.length < this.maxObstacles; x += Phaser.Math.Between(100, 180)) {
                this.createObstacle(x, y + Phaser.Math.Between(-30, 30));
            }
        }
    }

    spawnMoundFieldZone(startY, endY, minX, maxX) {
        const count = 5;
        for (let i = 0; i < count && this.obstacles.length < this.maxObstacles; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            if (Math.random() < 0.3) this.createRamp(x, y);
            else this.createMound(x, y);
        }
        
        if (Math.random() < 0.3 && this.obstacles.length < this.maxObstacles) {
            this.createObstacle(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }
    }

    spawnCollectibles(startY, endY, minX, maxX) {
        if (Math.random() < 0.3 && this.goldCoins.length < 10) {
            this.createGoldCoin(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }
        if (Math.random() < 0.1 && this.healthPacks.length < 3) {
            this.createHealthPack(Phaser.Math.Between(minX, maxX), Phaser.Math.Between(startY, endY));
        }
    }

    createObstacle(x, y) {
        if (this.obstacles.length >= this.maxObstacles) return;
        const obstacle = this.matter.add.sprite(x, y, 'tree', null, {
            isStatic: true,
            label: 'obstacle'
        });
        obstacle.setBody({ type: 'rectangle', width: 30, height: 30 });
        this.obstacles.push(obstacle);
    }

    createRamp(x, y) {
        if (this.obstacles.length >= this.maxObstacles) return;
        const ramp = this.matter.add.sprite(x, y, 'ramp', null, {
            isStatic: true,
            label: 'ramp',
            isSensor: true
        });
        this.obstacles.push(ramp);
    }

    createMound(x, y) {
        if (this.obstacles.length >= this.maxObstacles) return;
        const mound = this.matter.add.sprite(x, y, 'mound', null, {
            isStatic: true,
            label: 'mound'
        });
        mound.setBody({ type: 'circle', radius: 20 });
        this.obstacles.push(mound);
    }

    createDecoration(x, y) {
        if (this.decorations.length >= this.maxDecorations) return;
        const deco = this.add.image(x, y, 'tree_small');
        deco.setScale(0.5 + Math.random() * 0.5);
        deco.setAlpha(0.5 + Math.random() * 0.5);
        this.decorations.push(deco);
    }

    createGoldCoin(x, y) {
        const coin = this.matter.add.sprite(x, y, 'gold_coin', null, {
            isStatic: true,
            isSensor: true,
            label: 'gold_coin'
        });
        this.goldCoins.push(coin);
    }

    createHealthPack(x, y) {
        const hp = this.matter.add.sprite(x, y, 'health_pack', null, {
            isStatic: true,
            isSensor: true,
            label: 'health_pack'
        });
        this.healthPacks.push(hp);
    }

    createFinishLine(y) {
        const graphics = this.make.graphics({x: 0, y: 0, add: false});
        const boxSize = 40;
        const cols = 20;
        const rows = 2;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                graphics.fillStyle((i + j) % 2 === 0 ? 0x000000 : 0xffffff, 1);
                graphics.fillRect(i * boxSize, j * boxSize, boxSize, boxSize);
            }
        }
        graphics.generateTexture('finish_banner', cols * boxSize, boxSize * rows);
        
        const banner = this.add.image(this.player.sprite.x, y, 'finish_banner');
        banner.setDepth(500);
        
        this.add.text(this.player.sprite.x, y - 100, 'FINISH', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(501);
    }

    updateGates() {
        if (!this.player?.sprite) return;
        const playerX = this.player.sprite.x;
        const playerY = this.player.sprite.y;
        
        this.gates.forEach(gate => {
            if (!gate || gate.passed) return;
            if (playerY > gate.y && playerY < gate.y + 50) {
                const halfWidth = gate.width / 2;
                if (playerX > gate.x - halfWidth && playerX < gate.x + halfWidth) {
                    gate.passed = true;
                    this.addScore(100, gate.x, gate.y - 50, '+100', '#ffff00');
                    this.updateHealth(1);
                }
            }
        });
    }

    updateBears() {
        if (!this.player?.sprite?.body) return;
        const playerPos = this.player.sprite.body.position;
        
        this.bears.forEach(bear => {
            if (!bear?.body) return;
            const distToPlayer = Phaser.Math.Distance.Between(bear.x, bear.y, playerPos.x, playerPos.y);
            
            if (distToPlayer < 200) {
                const dx = playerPos.x - bear.x;
                bear.setVelocityX(dx > 0 ? 2 : -2);
                
                if (distToPlayer < 40 && !this.isGameOver) {
                    if (!bear.nextAttackTime || Date.now() > bear.nextAttackTime) {
                        this.updateHealth(-5);
                        bear.nextAttackTime = Date.now() + 1000;
                        this.player.hitObstacle();
                    }
                }
            } else {
                if (Math.abs(bear.x - bear.startX) > bear.patrolRange) {
                    bear.direction *= -1;
                }
                bear.setVelocityX(bear.direction * 0.3);
            }
        });
    }

    updateBirds() {
        if (!this.player?.sprite) return;
        const playerY = this.player.sprite.y;
        
        this.birds.forEach(birdObj => {
            if (!birdObj?.sprite) return;
            if (birdObj.state === 'idle' && Math.abs(birdObj.groundY - playerY) < 150) {
                birdObj.state = 'flying';
                birdObj.sprite.setTexture('bird_flying');
            }
        });
    }

    cleanupEnvironment() {
        const viewTop = this.cameras.main.scrollY;
        
        this.obstacles = this.obstacles.filter(obs => {
            if (!obs.active || obs.y < viewTop - 300) {
                if (obs.active) obs.destroy();
                return false;
            }
            return true;
        });

        this.decorations = this.decorations.filter(deco => {
            if (deco.y < viewTop - 200) {
                deco.destroy();
                return false;
            }
            return true;
        });

        this.dogs = this.dogs.filter(dog => {
            if (!dog.sprite?.active || dog.sprite.y < viewTop - 300) {
                if (dog.sprite?.active) dog.sprite.destroy();
                return false;
            }
            return true;
        });

        this.competitors = this.competitors.filter(comp => {
            if (!comp.sprite?.active || comp.sprite.y < viewTop - 300) {
                if (comp.sprite?.active) comp.sprite.destroy();
                return false;
            }
            return true;
        });

        this.bears = this.bears.filter(bear => {
            if (!bear.active || bear.y < viewTop - 400) {
                if (bear.active) bear.destroy();
                return false;
            }
            return true;
        });

        this.birds = this.birds.filter(bird => {
            if (!bird.sprite?.active || bird.sprite.y < viewTop - 400) {
                if (bird.sprite?.active) bird.sprite.destroy();
                return false;
            }
            return true;
        });

        this.healthPacks = this.healthPacks.filter(hp => {
            if (!hp.active || hp.y < viewTop - 200) {
                if (hp.active) hp.destroy();
                return false;
            }
            return true;
        });

        this.goldCoins = this.goldCoins.filter(coin => {
            if (!coin.active || coin.y < viewTop - 200) {
                if (coin.active) coin.destroy();
                return false;
            }
            return true;
        });

        this.gates = this.gates.filter(gate => {
            if (gate.y < viewTop - 200) {
                if (gate.leftFlag) gate.leftFlag.destroy();
                if (gate.rightFlag) gate.rightFlag.destroy();
                return false;
            }
            return true;
        });
    }

    createParticleManager() {
        if (!this.snowParticleManager) {
            this.snowParticleManager = this.add.particles(0, 0, 'snow_particle', {
                speed: { min: 50, max: 150 },
                scale: { start: 1, end: 0 },
                lifespan: 500,
                quantity: 5,
                emitting: false
            });
            this.snowParticleManager.setDepth(100);
        }
    }

    emitSnowExplosion(x, y) {
        if (this.snowParticleManager) {
            this.snowParticleManager.emitParticleAt(x, y, 5);
        }
    }

    showFloatingText(x, y, message, color) {
        const text = this.add.text(x, y, message, {
            fontSize: '20px',
            fill: color,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(1000);
        
        this.tweens.add({
            targets: text,
            y: y - 80,
            alpha: 0,
            duration: 800,
            onComplete: () => text.destroy()
        });
    }

    reachFinishLine() {
        if (this.isFinished) return;
        this.isFinished = true;
        this.endTime = Date.now();
        
        try {
            this.player.sprite.setVelocity(0, 0);
            this.showLeaderboard();
        } catch (error) {
            console.error('Finish Error:', error);
        }
    }

    showLeaderboard() {
        const durationMs = this.endTime - this.startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        
        const record = {
            date: new Date().toLocaleString(),
            score: this.score,
            time: `${minutes}m ${seconds}s`
        };
        
        let leaderboard = [];
        try {
            const stored = localStorage.getItem('ski_leaderboard');
            if (stored) leaderboard = JSON.parse(stored);
        } catch (e) {}
        
        leaderboard.push(record);
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 10);
        
        try {
            localStorage.setItem('ski_leaderboard', JSON.stringify(leaderboard));
        } catch (e) {}
        
        const bg = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2, 0x000000, 0.8);
        bg.setScrollFactor(0);
        bg.setDepth(2000);
        
        const cam = this.cameras.main;
        const centerX = cam.midPoint.x;
        const centerY = cam.midPoint.y;
        
        this.add.text(centerX, centerY - 200, 'LEADERBOARD', {
            fontSize: '48px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
        
        let yPos = centerY - 120;
        leaderboard.forEach((entry, index) => {
            const text = `${index + 1}. ${entry.score} pts - ${entry.time}`;
            this.add.text(centerX, yPos, text, {
                fontSize: '24px',
                fill: index === 0 ? '#FFD700' : '#ffffff'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
            yPos += 40;
        });
        
        const restartText = this.add.text(centerX, centerY + 200, 'Tap to Restart', {
            fontSize: '28px',
            fill: '#00ff00'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
        
        this.input.once('pointerdown', () => {
            this.scene.restart();
        });
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        this.add.text(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, 'GAME OVER', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
        
        this.time.delayedCall(2000, () => {
            this.scene.restart();
        });
    }
}
