export default function RiskGauge({ score, size = 200 }) {
    const r = 75;
    const cx = size / 2;
    const cy = size * 0.6;
    const arcLen = Math.PI * r;
    const filled = (score / 100) * arcLen;
    const color = score >= 65 ? '#FF4444' : score >= 35 ? '#FFA500' : '#00CC66';
    const label = score >= 65 ? 'HIGH RISK' : score >= 35 ? 'MEDIUM RISK' : 'LOW RISK';

    return (
        <div className="risk-gauge-container">
            <svg width={size} height={size * 0.68} viewBox={`0 0 ${size} ${size * 0.68}`}>
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <linearGradient id={`gaugeGrad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00CC66" />
                        <stop offset="50%" stopColor="#FFA500" />
                        <stop offset="100%" stopColor="#FF4444" />
                    </linearGradient>
                </defs>

                {/* Background arc */}
                <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke="#1A1A2E"
                    strokeWidth={20}
                    strokeLinecap="round"
                />

                {/* Filled arc */}
                <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={20}
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${arcLen}`}
                    filter="url(#glow)"
                    style={{ transition: 'stroke-dasharray 1.2s ease, stroke 0.5s ease' }}
                />

                {/* Score text */}
                <text
                    x={cx} y={cy - 16}
                    textAnchor="middle"
                    fontSize={42}
                    fontWeight="800"
                    fill={color}
                    fontFamily="'Inter', sans-serif"
                    style={{ transition: 'fill 0.5s ease' }}
                >
                    {score}%
                </text>

                {/* Label */}
                <text
                    x={cx} y={cy + 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#64748B"
                    letterSpacing="3"
                    fontFamily="'Inter', sans-serif"
                    fontWeight="600"
                >
                    {label}
                </text>
            </svg>
        </div>
    );
}
