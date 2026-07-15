'use client';

interface HospitalNode {
  id: string;
  x: number;
  y: number;
  name: string;
}

interface NetworkBackgroundProps {
  nodes: HospitalNode[];
  activeIndex: number;
}

function MedicalCross({ x, y, size = 4, active = false }: { x: number; y: number; size?: number; active?: boolean }) {
  const s = size;
  const h = s * 0.35;
  const w = s * 0.35;
  return (
    <g className="transition-all duration-700">
      <circle cx={x} cy={y} r={s * 0.65} fill={active ? 'rgba(16,185,129,0.15)' : 'transparent'} />
      <rect x={x - h / 2} y={y - s / 2} width={h} height={s} rx={h * 0.3} fill={active ? '#10b981' : '#6b7280'} />
      <rect x={x - s / 2} y={y - h / 2} width={s} height={h} rx={h * 0.3} fill={active ? '#10b981' : '#6b7280'} />
      {active && (
        <circle cx={x} cy={y} r={s * 0.5} fill="none" stroke="#10b981" strokeWidth={0.3} opacity={0.4}>
          <animate attributeName="r" values={`${s * 0.5};${s * 0.9};${s * 0.5}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

export default function NetworkBackground({ nodes, activeIndex }: NetworkBackgroundProps) {
  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <filter id="activeGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="50" cy="50" r="38" fill="url(#hubGlow)" />

        {nodes.map((node, i) => {
          const isActive = i === activeIndex;
          return (
            <g key={node.id}>
              <line
                x1="50" y1="50" x2={node.x} y2={node.y}
                stroke="#10b981"
                strokeWidth={isActive ? 0.35 : 0.1}
                opacity={isActive ? 0.7 : 0.2}
                className="transition-all duration-700 ease-out"
              />
              {isActive && (
                <line
                  x1="50" y1="50" x2={node.x} y2={node.y}
                  stroke="#10b981" strokeWidth={0.6} opacity={0.25}
                  strokeDasharray="1.5 3"
                  className="animate-[pulse_2s_ease-in-out_infinite]"
                />
              )}
            </g>
          );
        })}

        {nodes.map((node, i) => (
          <MedicalCross
            key={node.id}
            x={node.x}
            y={node.y}
            size={5}
            active={i === activeIndex}
          />
        ))}

        <MedicalCross x={50} y={50} size={7} active />

        <text x="50" y="61" textAnchor="middle" fill="#059669" fontSize="2.5" fontWeight="700" letterSpacing="0.3">
          CHDS
        </text>

        {nodes.map((node, i) => {
          const isActive = i === activeIndex;
          const above = node.y <= 45;
          return (
            <text
              key={`label-${node.id}`}
              x={node.x}
              y={above ? node.y - 4.5 : node.y + 5.5}
              textAnchor="middle"
              fill={isActive ? '#10b981' : '#6b7280'}
              fontSize={isActive ? 2.6 : 1.8}
              fontWeight={isActive ? '600' : '400'}
              opacity={isActive ? 1 : 0.45}
              className="transition-all duration-700"
            >
              {node.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
