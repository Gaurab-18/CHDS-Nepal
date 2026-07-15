'use client';

export default function LoadingAnimation() {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gray-950">
      <div style={{ width: 300, height: 300 }}>
        <dotlottie-wc
          src="https://lottie.host/ea0ccf01-f600-41af-906c-1ab0265fbdb1/FpOQqFqk5u.lottie"
          autoplay
          loop
          style={{ width: '300px', height: '300px' }}
        />
      </div>
    </div>
  );
}
