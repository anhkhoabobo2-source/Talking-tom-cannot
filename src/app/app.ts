import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

const BUBBLE_RADIUS = 20;
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const COLS = 10;
const ROWS = 15;
const CANVAS_WIDTH = COLS * BUBBLE_DIAMETER;
const CANVAS_HEIGHT = 600;

const COLORS = ['#FF5722', '#4CAF50', '#2196F3', '#FFEB3B', '#9C27B0'];
const EMOJIS = ['🐱', '😸', '😹', '😻', '😼'];

interface Bubble {
  x: number;
  y: number;
  colorIdx: number;
  row: number;
  col: number;
  popScale?: number;
  vy?: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="game-container bg-slate-900 w-full h-screen flex flex-col items-center justify-center overflow-hidden font-sans">
      <h1 class="text-3xl md:text-4xl font-bold text-white mb-4 text-center" style="font-family: 'Comic Sans MS', cursive, sans-serif;">Talking Tom Bubble Pop!</h1>
      <div class="relative">
        <canvas #gameCanvas 
                [width]="CANVAS_WIDTH" 
                [height]="CANVAS_HEIGHT" 
                class="bg-slate-800 rounded-lg shadow-2xl border-4 border-slate-700 cursor-crosshair touch-none"
                (mousemove)="onMouseMove($event)"
                (mousedown)="onMouseDown($event)"
                (touchstart)="onTouchStart($event)"
                (touchmove)="onTouchMove($event)"
                (touchend)="onTouchEnd($event)"></canvas>
        
        <div *ngIf="gameOver" class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg z-10">
          <h2 class="text-5xl font-bold text-white mb-6 text-center" style="font-family: 'Comic Sans MS', cursive, sans-serif;">{{win ? 'You Win!' : 'Game Over'}}</h2>
          <button (click)="resetGame()" class="px-8 py-4 bg-green-500 hover:bg-green-400 text-white font-bold rounded-full text-2xl transition-transform hover:scale-105 active:scale-95 shadow-lg border-4 border-green-700">Play Again</button>
        </div>
      </div>
      <div class="mt-6 flex gap-8 items-center">
        <div class="text-white font-bold text-2xl bg-slate-800 px-6 py-2 rounded-full border-2 border-slate-600 shadow-inner">Score: {{score}}</div>
        <button (click)="toggleMute()" class="text-white bg-slate-800 p-3 rounded-full border-2 border-slate-600 hover:bg-slate-700 transition-colors shadow-inner flex items-center justify-center w-14 h-14">
          <span class="material-icons text-3xl">{{isMuted ? 'volume_off' : 'volume_up'}}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  CANVAS_WIDTH = CANVAS_WIDTH;
  CANVAS_HEIGHT = CANVAS_HEIGHT;
  
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  
  grid: (Bubble | null)[][] = [];
  currentBubble: Bubble | null = null;
  nextBubbleColorIdx: number = 0;
  
  mouseX: number = CANVAS_WIDTH / 2;
  mouseY: number = CANVAS_HEIGHT / 2;
  
  isShooting: boolean = false;
  shootVx: number = 0;
  shootVy: number = 0;
  
  score: number = 0;
  gameOver: boolean = false;
  win: boolean = false;
  
  poppingBubbles: Bubble[] = [];
  droppingBubbles: Bubble[] = [];
  
  isMuted: boolean = false;
  private audioContext: AudioContext | null = null;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resetGame();
    this.gameLoop();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationFrameId);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
  }

  playSound(type: 'shoot' | 'pop' | 'drop') {
    if (this.isMuted) return;
    
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      const osc = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      if (type === 'shoot') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
      } else if (type === 'pop') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
      } else if (type === 'drop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.3);
      }
    } catch (e) {
      console.error('Audio play failed', e);
    }
  }

  resetGame() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      this.grid[r] = new Array(COLS).fill(null);
    }
    
    for (let r = 0; r < 5; r++) {
      const colsInRow = r % 2 === 0 ? COLS : COLS - 1;
      for (let c = 0; c < colsInRow; c++) {
        this.grid[r][c] = {
          x: this.getColX(r, c),
          y: this.getRowY(r),
          colorIdx: Math.floor(Math.random() * COLORS.length),
          row: r,
          col: c
        };
      }
    }
    
    this.score = 0;
    this.gameOver = false;
    this.win = false;
    this.poppingBubbles = [];
    this.droppingBubbles = [];
    this.nextBubbleColorIdx = Math.floor(Math.random() * COLORS.length);
    this.spawnBubble();
  }

  getColX(row: number, col: number): number {
    const offset = row % 2 === 0 ? BUBBLE_RADIUS : BUBBLE_DIAMETER;
    return offset + col * BUBBLE_DIAMETER;
  }

  getRowY(row: number): number {
    return BUBBLE_RADIUS + row * ROW_HEIGHT;
  }

  spawnBubble() {
    this.currentBubble = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - BUBBLE_RADIUS - 10,
      colorIdx: this.nextBubbleColorIdx,
      row: -1,
      col: -1
    };
    this.nextBubbleColorIdx = Math.floor(Math.random() * COLORS.length);
    this.isShooting = false;
  }

  onMouseMove(e: MouseEvent) {
    if (this.gameOver) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  onMouseDown(e: MouseEvent) {
    if (this.gameOver || this.isShooting || !this.currentBubble) return;
    this.shoot();
  }

  onTouchStart(e: TouchEvent) {
    if (this.gameOver) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouseX = e.touches[0].clientX - rect.left;
    this.mouseY = e.touches[0].clientY - rect.top;
  }

  onTouchMove(e: TouchEvent) {
    if (this.gameOver) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouseX = e.touches[0].clientX - rect.left;
    this.mouseY = e.touches[0].clientY - rect.top;
  }

  onTouchEnd(e: TouchEvent) {
    if (this.gameOver || this.isShooting || !this.currentBubble) return;
    this.shoot();
  }

  shoot() {
    if (!this.currentBubble) return;
    
    const dx = this.mouseX - this.currentBubble.x;
    const dy = this.mouseY - this.currentBubble.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return;
    
    const speed = 15;
    this.shootVx = (dx / dist) * speed;
    this.shootVy = (dy / dist) * speed;
    
    if (this.shootVy > -2) {
      this.shootVy = -2;
      const newDist = Math.sqrt(this.shootVx * this.shootVx + this.shootVy * this.shootVy);
      this.shootVx = (this.shootVx / newDist) * speed;
      this.shootVy = (this.shootVy / newDist) * speed;
    }
    
    this.isShooting = true;
    this.playSound('shoot');
  }

  gameLoop = () => {
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  }

  update() {
    if (this.gameOver) return;

    for (let i = this.poppingBubbles.length - 1; i >= 0; i--) {
      const b = this.poppingBubbles[i];
      b.popScale = (b.popScale || 1) + 0.1;
      if (b.popScale > 1.5) {
        this.poppingBubbles.splice(i, 1);
      }
    }

    for (let i = this.droppingBubbles.length - 1; i >= 0; i--) {
      const b = this.droppingBubbles[i];
      b.vy = (b.vy || 0) + 0.5;
      b.y += b.vy;
      if (b.y > CANVAS_HEIGHT + BUBBLE_RADIUS) {
        this.droppingBubbles.splice(i, 1);
      }
    }

    if (this.isShooting && this.currentBubble) {
      this.currentBubble.x += this.shootVx;
      this.currentBubble.y += this.shootVy;

      if (this.currentBubble.x <= BUBBLE_RADIUS) {
        this.currentBubble.x = BUBBLE_RADIUS;
        this.shootVx *= -1;
      } else if (this.currentBubble.x >= CANVAS_WIDTH - BUBBLE_RADIUS) {
        this.currentBubble.x = CANVAS_WIDTH - BUBBLE_RADIUS;
        this.shootVx *= -1;
      }

      let snapped = false;
      if (this.currentBubble.y <= BUBBLE_RADIUS) {
        snapped = this.snapBubble(this.currentBubble);
      } else {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const b = this.grid[r][c];
            if (b) {
              const dx = this.currentBubble.x - b.x;
              const dy = this.currentBubble.y - b.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < BUBBLE_DIAMETER - 2) {
                snapped = this.snapBubble(this.currentBubble);
                break;
              }
            }
          }
          if (snapped) break;
        }
      }

      if (snapped) {
        this.isShooting = false;
        this.resolveMatches();
      }
    }
    
    if (!this.isShooting && !this.poppingBubbles.length && !this.droppingBubbles.length) {
      let hasBubbles = false;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.grid[r][c]) {
            hasBubbles = true;
            if (r >= ROWS - 2) {
              this.gameOver = true;
              this.win = false;
            }
          }
        }
      }
      if (!hasBubbles) {
        this.gameOver = true;
        this.win = true;
      }
    }
  }

  snapBubble(bubble: Bubble): boolean {
    let minDist = Infinity;
    let bestR = 0;
    let bestC = 0;

    for (let r = 0; r < ROWS; r++) {
      const colsInRow = r % 2 === 0 ? COLS : COLS - 1;
      for (let c = 0; c < colsInRow; c++) {
        if (!this.grid[r][c]) {
          const gx = this.getColX(r, c);
          const gy = this.getRowY(r);
          const dx = bubble.x - gx;
          const dy = bubble.y - gy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            bestR = r;
            bestC = c;
          }
        }
      }
    }

    if (minDist < BUBBLE_DIAMETER) {
      bubble.row = bestR;
      bubble.col = bestC;
      bubble.x = this.getColX(bestR, bestC);
      bubble.y = this.getRowY(bestR);
      this.grid[bestR][bestC] = bubble;
      return true;
    }
    return false;
  }

  getNeighbors(r: number, c: number): {r: number, c: number}[] {
    const neighbors = [];
    const isEven = r % 2 === 0;
    
    const dirs = isEven ? [
      [-1, -1], [-1, 0],
      [0, -1], [0, 1],
      [1, -1], [1, 0]
    ] : [
      [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, 0], [1, 1]
    ];

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0) {
        const colsInRow = nr % 2 === 0 ? COLS : COLS - 1;
        if (nc < colsInRow) {
          neighbors.push({r: nr, c: nc});
        }
      }
    }
    return neighbors;
  }

  resolveMatches() {
    if (!this.currentBubble) return;
    
    const startR = this.currentBubble.row;
    const startC = this.currentBubble.col;
    const colorIdx = this.currentBubble.colorIdx;
    
    const matchGroup: {r: number, c: number}[] = [];
    const visited = new Set<string>();
    const queue = [{r: startR, c: startC}];
    visited.add(`${startR},${startC}`);
    
    while (queue.length > 0) {
      const {r, c} = queue.shift()!;
      matchGroup.push({r, c});
      
      const neighbors = this.getNeighbors(r, c);
      for (const n of neighbors) {
        const key = `${n.r},${n.c}`;
        if (!visited.has(key)) {
          visited.add(key);
          const b = this.grid[n.r][n.c];
          if (b && b.colorIdx === colorIdx) {
            queue.push(n);
          }
        }
      }
    }
    
    if (matchGroup.length >= 3) {
      this.playSound('pop');
      for (const pos of matchGroup) {
        const b = this.grid[pos.r][pos.c]!;
        b.popScale = 1;
        this.poppingBubbles.push(b);
        this.grid[pos.r][pos.c] = null;
        this.score += 10;
      }
      
      this.dropDisconnected();
    }
    
    this.spawnBubble();
  }

  dropDisconnected() {
    const connected = new Set<string>();
    const queue: {r: number, c: number}[] = [];
    
    for (let c = 0; c < COLS; c++) {
      if (this.grid[0][c]) {
        queue.push({r: 0, c});
        connected.add(`0,${c}`);
      }
    }
    
    while (queue.length > 0) {
      const {r, c} = queue.shift()!;
      const neighbors = this.getNeighbors(r, c);
      for (const n of neighbors) {
        const key = `${n.r},${n.c}`;
        if (!connected.has(key) && this.grid[n.r][n.c]) {
          connected.add(key);
          queue.push(n);
        }
      }
    }
    
    let droppedAny = false;
    for (let r = 0; r < ROWS; r++) {
      const colsInRow = r % 2 === 0 ? COLS : COLS - 1;
      for (let c = 0; c < colsInRow; c++) {
        if (this.grid[r][c] && !connected.has(`${r},${c}`)) {
          const b = this.grid[r][c]!;
          b.vy = 0;
          this.droppingBubbles.push(b);
          this.grid[r][c] = null;
          this.score += 20;
          droppedAny = true;
        }
      }
    }
    
    if (droppedAny) {
      this.playSound('drop');
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    if (this.currentBubble && !this.isShooting && !this.gameOver) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.currentBubble.x, this.currentBubble.y);
      
      const dx = this.mouseX - this.currentBubble.x;
      const dy = this.mouseY - this.currentBubble.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 0 && dy < 0) {
        const length = 200;
        const endX = this.currentBubble.x + (dx / dist) * length;
        const endY = this.currentBubble.y + (dy / dist) * length;
        
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([10, 10]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }
    
    for (let r = 0; r < ROWS; r++) {
      const colsInRow = r % 2 === 0 ? COLS : COLS - 1;
      for (let c = 0; c < colsInRow; c++) {
        const b = this.grid[r][c];
        if (b) {
          this.drawBubble(b);
        }
      }
    }
    
    for (const b of this.droppingBubbles) {
      this.drawBubble(b);
    }
    
    for (const b of this.poppingBubbles) {
      this.ctx.save();
      this.ctx.translate(b.x, b.y);
      this.ctx.scale(b.popScale || 1, b.popScale || 1);
      this.ctx.globalAlpha = Math.max(0, 1 - ((b.popScale || 1) - 1) * 2);
      this.drawBubbleAt(0, 0, b.colorIdx);
      this.ctx.restore();
    }
    
    if (this.currentBubble) {
      this.drawBubble(this.currentBubble);
    }
    
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.arc(CANVAS_WIDTH / 2 - 60, CANVAS_HEIGHT - BUBBLE_RADIUS - 10, BUBBLE_RADIUS * 0.6, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.save();
    this.ctx.translate(CANVAS_WIDTH / 2 - 60, CANVAS_HEIGHT - BUBBLE_RADIUS - 10);
    this.ctx.scale(0.6, 0.6);
    this.drawBubbleAt(0, 0, this.nextBubbleColorIdx);
    this.ctx.restore();
  }

  drawBubble(b: Bubble) {
    this.drawBubbleAt(b.x, b.y, b.colorIdx);
  }

  drawBubbleAt(x: number, y: number, colorIdx: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, BUBBLE_RADIUS - 1, 0, Math.PI * 2);
    this.ctx.fillStyle = COLORS[colorIdx];
    this.ctx.fill();
    
    this.ctx.beginPath();
    this.ctx.arc(x - 6, y - 6, BUBBLE_RADIUS * 0.3, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.fill();
    
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(EMOJIS[colorIdx], x, y + 2);
    
    this.ctx.beginPath();
    this.ctx.arc(x, y, BUBBLE_RADIUS - 1, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }
}
