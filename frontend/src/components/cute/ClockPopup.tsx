// @ts-nocheck
'use client';

import { useEffect, useRef } from 'react';

export default function ClockPopup({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const cursor = { x: width / 2, y: height / 2 };
    let animFrame: number;
    const del = 0.4;

    const theDays = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const theMonths = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

    function getDateParts() {
      const d = new Date();
      return (' ' + theDays[d.getDay()] + ' ' + d.getDate() + ' ' + theMonths[d.getMonth()] + ' ' + d.getFullYear()).split('');
    }

    const clockNumbers = ['3','4','5','6','7','8','9','10','11','12','1','2'];
    const F = clockNumbers.length;
    const hourHand = ['•','•','•'];
    const minuteHand = ['•','•','•','•'];
    const secondHand = ['•','•','•','•','•'];
    const siz = 45;
    const eqf = 360 / F;
    const han = siz / 6.5;

    let dateInWords = getDateParts();
    const eqd = 360 / dateInWords.length;
    const sum = dateInWords.length + F + hourHand.length + minuteHand.length + secondHand.length + 1;

    const dy = []; const dx = []; const zy = []; const zx = [];
    for (let i = 0; i < sum; i++) { dy[i] = 0; dx[i] = 0; zy[i] = 0; zx[i] = 0; }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function onMove(e) {
      cursor.x = e.clientX ?? e.touches[0].clientX;
      cursor.y = e.clientY ?? e.touches[0].clientY;
    }

    function updatePositions() {
      const wb = 80;
      zy[0] = Math.round(dy[0] += (cursor.y - dy[0]) * del);
      zx[0] = Math.round(dx[0] += (cursor.x - dx[0]) * del);
      for (let i = 1; i < sum; i++) {
        zy[i] = Math.round(dy[i] += (zy[i - 1] - dy[i]) * del);
        zx[i] = Math.round(dx[i] += (zx[i - 1] - dx[i]) * del);
        if (dy[i - 1] >= height - 80) dy[i - 1] = height - 80;
        if (dx[i - 1] >= width - wb) dx[i - 1] = width - wb;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      const time = new Date();
      const secs = time.getSeconds();
      const sec = (Math.PI * (secs - 15)) / 30;
      const mins = time.getMinutes();
      const min = (Math.PI * (mins - 15)) / 30;
      const hrs = time.getHours();
      const hr = (Math.PI * (hrs - 3)) / 6 + (Math.PI * time.getMinutes()) / 360;

      dateInWords = getDateParts();

      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < dateInWords.length; i++) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(dateInWords[i], dx[i] + siz * 1.5 * Math.cos(-sec + (i * eqd * Math.PI) / 180), dy[i] + siz * 1.5 * Math.sin(-sec + (i * eqd * Math.PI) / 180));
      }
      for (let i = 0; i < F; i++) {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(clockNumbers[i], dx[dateInWords.length + i] + siz * Math.cos((i * eqf * Math.PI) / 180), dy[dateInWords.length + i] + siz * Math.sin((i * eqf * Math.PI) / 180));
      }
      for (let i = 0; i < hourHand.length; i++) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(hourHand[i], dx[dateInWords.length + F + i] + i * han * Math.cos(hr), dy[dateInWords.length + F + i] + i * han * Math.sin(hr));
      }
      for (let i = 0; i < minuteHand.length; i++) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(minuteHand[i], dx[dateInWords.length + F + hourHand.length + i] + i * han * Math.cos(min), dy[dateInWords.length + F + hourHand.length + i] + i * han * Math.sin(min));
      }
      for (let i = 0; i < secondHand.length; i++) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText(secondHand[i], dx[dateInWords.length + F + hourHand.length + minuteHand.length + i] + i * han * Math.sin(sec), dy[dateInWords.length + F + hourHand.length + minuteHand.length + i] + i * han * Math.cos(sec));
      }
    }

    function loop() {
      updatePositions();
      draw();
      animFrame = requestAnimationFrame(loop);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    resize();
    loop();

    return () => {
      cancelAnimationFrame(animFrame);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100vw', height: '100vh' }}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[100000] w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700 text-lg font-bold transition-colors"
      >
        ✕
      </button>
      <div className="absolute bottom-8 text-center pointer-events-none">
        <div className="text-gray-400 text-sm font-mono tracking-widest">
          {new Date().toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>
    </div>
  );
}
