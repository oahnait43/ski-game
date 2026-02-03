import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // === 简笔画/涂鸦风格资源生成 ===
        
        // 1. 玩家 (Stickman on Snowboard) - 纯线条
        const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        const drawDoodleSnowboarder = (g, pose) => {
            g.lineStyle(3, 0x000000, 1); // 加粗线条
            
            // 头部 (不封口的圆，更有手绘感)
            g.beginPath();
            g.arc(32, 18, 6, 0.2, 6.0); 
            g.strokePath();
            
            // 身体
            g.beginPath();
            
            if (pose === 'straight') {
                // 身体
                g.moveTo(32, 24); g.lineTo(32, 42);
                // 腿
                g.moveTo(32, 42); g.lineTo(26, 55);
                g.moveTo(32, 42); g.lineTo(38, 55);
                // 手
                g.moveTo(32, 30); g.lineTo(20, 38);
                g.moveTo(32, 30); g.lineTo(44, 38);
                // 板 (单笔线条)
                g.lineStyle(4, 0x000000, 1);
                g.moveTo(20, 58); g.lineTo(44, 58);

            } else if (pose === 'left') {
                g.moveTo(32, 24); g.lineTo(28, 40); // 倾斜
                g.moveTo(28, 40); g.lineTo(20, 52);
                g.moveTo(28, 40); g.lineTo(32, 52);
                g.moveTo(28, 30); g.lineTo(15, 40);
                g.moveTo(28, 30); g.lineTo(40, 35);
                // 板 (倾斜)
                g.lineStyle(4, 0x000000, 1);
                g.moveTo(15, 55); g.lineTo(35, 50);

            } else if (pose === 'right') {
                g.moveTo(32, 24); g.lineTo(36, 40);
                g.moveTo(36, 40); g.lineTo(44, 52);
                g.moveTo(36, 40); g.lineTo(32, 52);
                g.moveTo(36, 30); g.lineTo(49, 40);
                g.moveTo(36, 30); g.lineTo(24, 35);
                g.lineStyle(4, 0x000000, 1);
                g.moveTo(29, 50); g.lineTo(49, 55);

            } else if (pose === 'jump') {
                // 抓板动作
                g.moveTo(32, 20); g.lineTo(32, 35);
                g.moveTo(32, 35); g.lineTo(25, 42); // 腿缩起
                g.moveTo(32, 35); g.lineTo(39, 42);
                g.moveTo(32, 25); g.lineTo(32, 45); // 手抓下去
                g.lineStyle(4, 0x000000, 1);
                g.moveTo(20, 45); g.lineTo(44, 45); // 板横置

            } else if (pose === 'crash') {
                // 散架
                g.moveTo(30, 40); g.lineTo(20, 30);
                g.moveTo(34, 40); g.lineTo(44, 30);
                g.moveTo(32, 45); g.lineTo(25, 55);
                g.moveTo(32, 45); g.lineTo(39, 55);
                g.lineStyle(4, 0x000000, 1);
                g.moveTo(10, 20); g.lineTo(20, 40); // 板飞了
            }
            g.strokePath();
        };

        ['straight', 'left', 'right', 'jump', 'crash'].forEach(pose => {
            playerGraphics.clear();
            drawDoodleSnowboarder(playerGraphics, pose);
            playerGraphics.generateTexture(`player_${pose}`, 64, 64);
        });

        // 2. 小狗 (简笔画)
        const dogGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        dogGraphics.lineStyle(2, 0x000000, 1);
        
        const drawDog = (g, frame) => {
            g.beginPath();
            // 头
            g.strokeCircle(10, 15, 6);
            // 耳朵
            g.moveTo(6, 10); g.lineTo(4, 6);
            g.moveTo(14, 10); g.lineTo(16, 6);
            // 身体
            g.strokeRect(16, 12, 14, 8);
            // 尾巴
            g.moveTo(30, 12); g.lineTo(34, 8);
            // 腿
            if (frame === 1) {
                g.moveTo(18, 20); g.lineTo(18, 26);
                g.moveTo(28, 20); g.lineTo(28, 26);
            } else {
                g.moveTo(18, 20); g.lineTo(16, 25);
                g.moveTo(28, 20); g.lineTo(30, 25);
            }
            g.strokePath();
        };

        dogGraphics.clear(); drawDog(dogGraphics, 1);
        dogGraphics.generateTexture('dog_1', 40, 30);
        
        dogGraphics.clear(); drawDog(dogGraphics, 2);
        dogGraphics.generateTexture('dog_2', 40, 30);

        // 3. 树木 (简笔画风格：几笔线条)
        const treeG = this.make.graphics({x:0, y:0, add: false});
        treeG.lineStyle(3, 0x000000, 1);
        treeG.beginPath();
        // 树冠 (三个三角形叠加的感觉，但不封口)
        treeG.moveTo(30, 5); treeG.lineTo(15, 25); treeG.lineTo(25, 25);
        treeG.lineTo(10, 45); treeG.lineTo(30, 45);
        treeG.lineTo(5, 65); treeG.lineTo(55, 65);
        treeG.lineTo(30, 45); treeG.lineTo(50, 45);
        treeG.lineTo(35, 25); treeG.lineTo(45, 25);
        treeG.lineTo(30, 5);
        // 树干
        treeG.moveTo(30, 65); treeG.lineTo(30, 75);
        treeG.strokePath();
        treeG.generateTexture('tree', 60, 80);

        // 4. 跳板 (简笔画)
        const rampG = this.make.graphics({x:0, y:0, add: false});
        rampG.lineStyle(3, 0x000000, 1);
        rampG.beginPath();
        // 三角形侧面
        rampG.moveTo(5, 45); 
        rampG.lineTo(55, 25); // 坡面
        rampG.lineTo(55, 45);
        rampG.lineTo(5, 45);
        // 简单的纹理线条
        rampG.moveTo(20, 45); rampG.lineTo(20, 38);
        rampG.moveTo(40, 45); rampG.lineTo(40, 30);
        rampG.strokePath();
        rampG.generateTexture('ramp', 60, 50);

        // 5. 雪堆 (简笔画曲线)
        const moundG = this.make.graphics({x:0, y:0, add: false});
        moundG.lineStyle(2, 0x000000, 1);
        moundG.beginPath();
        moundG.arc(20, 20, 15, 3.2, 6.2); // 不封口的圆弧
        moundG.strokePath();
        moundG.generateTexture('mound', 40, 30);
        
        // 6. 装饰 (小草/小石头)
        const decoG = this.make.graphics({x:0, y:0, add: false});
        decoG.lineStyle(2, 0x000000, 0.5);
        decoG.beginPath();
        decoG.moveTo(5, 10); decoG.lineTo(0, 0);
        decoG.moveTo(5, 10); decoG.lineTo(10, 2);
        decoG.strokePath();
        decoG.generateTexture('snow_deco', 10, 10);

        // 7. 指示旗 (Gate) - 移除横杠，只保留旗子
        const gateG = this.make.graphics({x:0, y:0, add: false});
        // 左旗 (蓝色)
        gateG.lineStyle(3, 0x000000, 1);
        gateG.beginPath();
        gateG.moveTo(10, 40); gateG.lineTo(10, 0); // 杆子
        gateG.strokePath();
        gateG.lineStyle(2, 0x0000FF, 1);
        gateG.beginPath();
        gateG.moveTo(10, 2); gateG.lineTo(30, 10); gateG.lineTo(10, 18); // 旗面
        gateG.strokePath();
        gateG.generateTexture('gate_left', 40, 40);

        // 右旗 (红色)
        gateG.clear();
        gateG.lineStyle(3, 0x000000, 1);
        gateG.beginPath();
        gateG.moveTo(30, 40); gateG.lineTo(30, 0);
        gateG.strokePath();
        gateG.lineStyle(2, 0xFF0000, 1);
        gateG.beginPath();
        gateG.moveTo(30, 2); gateG.lineTo(10, 10); gateG.lineTo(30, 18);
        gateG.strokePath();
        gateG.generateTexture('gate_right', 40, 40);

        // 8. 简笔画狗熊 (Bear) - 新增
        const bearG = this.make.graphics({x:0, y:0, add: false});
        bearG.lineStyle(3, 0x000000, 1);
        bearG.beginPath();
        // 身体 (大椭圆)
        bearG.strokeEllipse(40, 40, 25, 35);
        // 头
        bearG.strokeCircle(40, 15, 12);
        // 耳朵
        bearG.strokeCircle(30, 8, 4);
        bearG.strokeCircle(50, 8, 4);
        // 手
        bearG.moveTo(25, 30); bearG.lineTo(10, 50);
        bearG.moveTo(55, 30); bearG.lineTo(70, 50);
        // 腿
        bearG.moveTo(30, 70); bearG.lineTo(25, 90);
        bearG.moveTo(50, 70); bearG.lineTo(55, 90);
        bearG.strokePath();
        // 愤怒表情
        bearG.lineStyle(2, 0x000000, 1);
        bearG.beginPath();
        bearG.moveTo(35, 12); bearG.lineTo(45, 18); // 眉毛
        bearG.moveTo(45, 12); bearG.lineTo(35, 18);
        bearG.strokePath();
        bearG.generateTexture('bear', 80, 95);

        // 9. 简笔画飞鸟 (Bird) - 新增
        const birdG = this.make.graphics({x:0, y:0, add: false});
        birdG.lineStyle(2, 0x000000, 1);
        birdG.beginPath();
        // 简单的 "m" 形状 (使用直线代替不支持的贝塞尔曲线)
        birdG.moveTo(0, 10); 
        birdG.lineTo(10, 0);
        birdG.lineTo(20, 10);
        birdG.lineTo(30, 0);
        birdG.lineTo(40, 10);
        birdG.strokePath();
        birdG.generateTexture('bird', 40, 20);

        // 10. 粒子
        const particleG = this.make.graphics({x:0, y:0, add: false});
        particleG.fillStyle(0x000000, 0.5); // 黑色小点，像墨水点
        particleG.fillCircle(2, 2, 2);
        particleG.generateTexture('snow_particle', 4, 4);

        // 11. 血包 (Health Pack) - 新增
        const hpG = this.make.graphics({x:0, y:0, add: false});
        hpG.fillStyle(0xFFFFFF, 1);
        hpG.fillRect(0, 0, 30, 30); // 白底
        hpG.lineStyle(2, 0x000000, 1);
        hpG.strokeRect(0, 0, 30, 30); // 黑框
        hpG.fillStyle(0xFF0000, 1);
        hpG.fillRect(10, 5, 10, 20); // 红十字竖
        hpG.fillRect(5, 10, 20, 10); // 红十字横
        hpG.generateTexture('health_pack', 30, 30);

        // 12. 金币 (Gold Coin) - 新增
        const coinG = this.make.graphics({x:0, y:0, add: false});
        coinG.lineStyle(2, 0xDAA520, 1); // 金色边框
        coinG.fillStyle(0xFFD700, 1); // 金色填充
        coinG.fillCircle(15, 15, 12);
        coinG.strokeCircle(15, 15, 12);
        // 内部 $ 符号
        coinG.fillStyle(0xDAA520, 1);
        coinG.text = this.add.text(0, 0, '$', { fontSize: '18px', color: '#DAA520', fontStyle: 'bold' });
        coinG.text.setVisible(false); // 只是借用一下
        // 由于 graphics 很难画文字，这里简单画个矩形代表中间的孔或者符号
        coinG.fillStyle(0xDAA520, 1); 
        coinG.fillRect(12, 8, 6, 14);
        coinG.generateTexture('gold_coin', 30, 30);
    }

    create() {
        this.scene.start('GameScene');
        // 同时启动 UI 场景
        this.scene.launch('UIScene');
    }
}
