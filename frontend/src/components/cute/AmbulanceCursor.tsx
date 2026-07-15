// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import { useCursor, type CursorType } from '@/providers/CursorProvider';

const isInteractive = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true;
  if (el.getAttribute('role') === 'button') return true;
  if (el.hasAttribute('onclick')) return true;
  if (el.tagName === 'LABEL' && el.getAttribute('for')) return true;
  if (window.getComputedStyle(el).cursor === 'pointer') return true;
  return el.closest('a, button, [role="button"], [onclick]') !== null;
};

const cursorOptions: { type: CursorType; label: string; icon: string }[] = [
  { type: 'ambulance', label: 'Ambulance', icon: '🚑' },
  { type: 'canvas', label: 'Trail', icon: '✨' },
  { type: 'none', label: 'Off', icon: '✕' },
];

function CanvasCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let running = true;
    let phase = 0;
    const pos = { x: 0, y: 0 };

    function initNoise(e: any) {
      this.phase = e.phase || 0;
      this.offset = e.offset || 0;
      this.frequency = e.frequency || 0.001;
      this.amplitude = e.amplitude || 1;
    }
    initNoise.prototype.update = function () {
      this.phase += this.frequency;
      return this.offset + Math.sin(this.phase) * this.amplitude;
    };

    const E = {
      friction: 0.5,
      trails: 20,
      size: 50,
      dampening: 0.25,
      tension: 0.98,
    };

    function Node() {
      this.x = 0;
      this.y = 0;
      this.vy = 0;
      this.vx = 0;
    }

    function Line(spring: number) {
      this.spring = spring + 0.1 * Math.random() - 0.02;
      this.friction = E.friction + 0.01 * Math.random() - 0.002;
      this.nodes = [];
      for (let n = 0; n < E.size; n++) {
        const t = new (Node as any)();
        t.x = pos.x;
        t.y = pos.y;
        this.nodes.push(t);
      }
    }
    (Line as any).prototype.update = function () {
      let e = this.spring;
      const t = this.nodes[0];
      t.vx += (pos.x - t.x) * e;
      t.vy += (pos.y - t.y) * e;
      for (let i = 0, a = this.nodes.length; i < a; i++) {
        const node = this.nodes[i];
        if (i > 0) {
          const prev = this.nodes[i - 1];
          node.vx += (prev.x - node.x) * e;
          node.vy += (prev.y - node.y) * e;
          node.vx += prev.vx * E.dampening;
          node.vy += prev.vy * E.dampening;
        }
        node.vx *= this.friction;
        node.vy *= this.friction;
        node.x += node.vx;
        node.y += node.vy;
        e *= E.tension;
      }
    };
    (Line as any).prototype.draw = function () {
      let nx = this.nodes[0].x;
      let ny = this.nodes[0].y;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      for (let i = 1, a = this.nodes.length - 2; i < a; i++) {
        const e = this.nodes[i];
        const t = this.nodes[i + 1];
        nx = 0.5 * (e.x + t.x);
        ny = 0.5 * (e.y + t.y);
        ctx.quadraticCurveTo(e.x, e.y, nx, ny);
      }
      const e2 = this.nodes[this.nodes.length - 2];
      const t2 = this.nodes[this.nodes.length - 1];
      ctx.quadraticCurveTo(e2.x, e2.y, t2.x, t2.y);
      ctx.stroke();
      ctx.closePath();
    };

    const noise = new (initNoise as any)({ phase: Math.random() * 2 * Math.PI, amplitude: 85, frequency: 0.0015, offset: 285 });
    let lines: any[] = [];

    function createLines() {
      lines = [];
      for (let e = 0; e < E.trails; e++) {
        lines.push(new (Line as any)(0.4 + (e / E.trails) * 0.025));
      }
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if ('touches' in e) {
        pos.x = e.touches[0].pageX;
        pos.y = e.touches[0].pageY;
      } else {
        pos.x = e.clientX;
        pos.y = e.clientY;
      }
      if (lines.length === 0) createLines();
    }

    function render() {
      if (!running) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'hsla(' + Math.round(noise.update()) + ',50%,50%,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        line.update();
        line.draw();
      }
      animationId = window.requestAnimationFrame(render);
    }

    function resize() {
      canvas.width = window.innerWidth - 20;
      canvas.height = window.innerHeight;
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('resize', resize);
    resize();
    render();

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 z-[9998] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}

function AmbulanceSVG() {
  const ambRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100 });
  const dirRef = useRef(1);
  const rafRef = useRef<number>(0);
  const flashRef = useRef<boolean>(true);

  useEffect(() => {
    const el = ambRef.current;
    if (!el) return;

    let currentX = -100;
    let currentY = -100;
    let hidden = false;

    const onMouse = (e: MouseEvent) => {
      if (isInteractive(e.target)) {
        if (!hidden) { hidden = true; el.style.opacity = '0'; }
      } else {
        if (hidden) { hidden = false; el.style.opacity = '1'; }
        posRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    let flashInterval: NodeJS.Timeout;
    const startFlash = () => {
      flashInterval = setInterval(() => {
        flashRef.current = !flashRef.current;
        el.querySelectorAll('.amb-flash').forEach((f) => {
          (f as HTMLElement).style.opacity = flashRef.current ? '1' : '0.3';
        });
      }, 400);
    };
    startFlash();

    const animate = () => {
      const target = posRef.current;
      currentX += (target.x - currentX) * 0.12;
      currentY += (target.y - currentY) * 0.12;
      const dx = target.x - currentX;
      if (Math.abs(dx) > 1) dirRef.current = dx > 0 ? 1 : -1;
      el.style.transform = `translate(${currentX - 28}px, ${currentY - 22}px) scaleX(${dirRef.current})`;
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', onMouse);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', onMouse);
      cancelAnimationFrame(rafRef.current);
      clearInterval(flashInterval);
    };
  }, []);

  return (
    <div
      ref={ambRef}
      className="fixed top-0 left-0 z-[9999] pointer-events-none will-change-transform"
      style={{ width: 56, height: 44 }}
    >
      <svg viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="28" cy="40" rx="22" ry="2.5" fill="#000" opacity="0.15" />
        <rect x="6" y="12" width="44" height="22" rx="5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
        <rect x="12" y="8" width="32" height="6" rx="2" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8" />
        <rect x="30" y="12" width="20" height="22" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
        <rect x="10" y="10" width="12" height="8" rx="2" fill="#1e293b" opacity="0.85" />
        <rect x="12" y="12" width="3" height="4" rx="1" fill="#64748b" opacity="0.4" />
        <rect x="5" y="18" width="3" height="10" rx="1" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
        <rect x="5" y="19" width="1.5" height="2" rx="0.3" fill="#94a3b8" />
        <rect x="5" y="22.5" width="1.5" height="2" rx="0.3" fill="#94a3b8" />
        <rect x="5" y="26" width="1.5" height="2" rx="0.3" fill="#94a3b8" />
        <rect x="3" y="16" width="2" height="3" rx="0.5" fill="#fef08a" stroke="#eab308" strokeWidth="0.3" />
        <rect x="12" y="22" width="38" height="4" fill="#ef4444" />
        <rect x="12" y="22" width="38" height="4" fill="url(#redShine)" opacity="0.15" />
        <rect x="32" y="23.5" width="10" height="2.5" rx="0.5" fill="#fff" />
        <rect x="36.25" y="20" width="1.5" height="9.5" rx="0.5" fill="#fff" />
        <rect className="amb-flash" x="18" y="5" width="5" height="4" rx="1.5" fill="#ef4444" stroke="#dc2626" strokeWidth="0.5" />
        <rect className="amb-flash" x="25" y="5" width="5" height="4" rx="1.5" fill="#3b82f6" stroke="#2563eb" strokeWidth="0.5" />
        <rect className="amb-flash" x="32" y="5" width="5" height="4" rx="1.5" fill="#ef4444" stroke="#dc2626" strokeWidth="0.5" />
        <rect x="18" y="7" width="5" height="2" rx="0.5" fill="#fef08a" opacity="0.6" />
        <rect x="25" y="7" width="5" height="2" rx="0.5" fill="#fef08a" opacity="0.6" />
        <rect x="32" y="7" width="5" height="2" rx="0.5" fill="#fef08a" opacity="0.6" />
        <rect x="44" y="14" width="4" height="5" rx="1" fill="#1e293b" opacity="0.6" />
        <circle cx="16" cy="34" r="5.5" fill="#1e293b" />
        <circle cx="16" cy="34" r="3.5" fill="#334155" />
        <circle cx="16" cy="34" r="1.5" fill="#64748b" />
        <rect x="14.5" y="33" width="3" height="2" rx="0.3" fill="#475569" />
        <circle cx="40" cy="34" r="5.5" fill="#1e293b" />
        <circle cx="40" cy="34" r="3.5" fill="#334155" />
        <circle cx="40" cy="34" r="1.5" fill="#64748b" />
        <rect x="38.5" y="33" width="3" height="2" rx="0.3" fill="#475569" />
        <path d="M10 34 Q10 30, 16 30 Q22 30, 22 34" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.5" />
        <path d="M34 34 Q34 30, 40 30 Q46 30, 46 34" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
        <line x1="28" y1="14" x2="28" y2="34" stroke="#94a3b8" strokeWidth="0.5" opacity="0.5" />
        <text x="34" y="21" fontFamily="Arial, sans-serif" fontSize="2.5" fontWeight="bold" fill="#1e293b" opacity="0.7">AMB</text>
        <defs>
          <linearGradient id="redShine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function CursorController() {
  const { cursorType, setCursorType } = useCursor();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {cursorType === 'ambulance' && <AmbulanceSVG />}
      {cursorType === 'canvas' && <CanvasCursor />}
      {cursorType === 'none' && null}

      <div className="fixed bottom-4 right-4 z-[9999]">
        {menuOpen && (
          <div className="mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            {cursorOptions.map((opt) => (
              <button
                key={opt.type}
                onClick={() => { setCursorType(opt.type); setMenuOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  cursorType === opt.type
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="mr-1.5">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg transition-colors bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
        >
          {cursorType === 'ambulance' ? '🚑 Ambulance' : cursorType === 'canvas' ? '✨ Trail' : '✕ Off'}
        </button>
      </div>
    </>
  );
}
