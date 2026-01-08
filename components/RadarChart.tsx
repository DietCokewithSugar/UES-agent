import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { DimensionScore } from '../types';

interface RadarChartProps {
  data: DimensionScore[];
}

// Custom tooltip with soft skeuomorphic styling
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div 
        className="px-4 py-3 rounded-xl"
        style={{
          background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFBFD 100%)',
          boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.12), 0 16px 48px -12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.8)'
        }}
      >
        <p className="text-xs font-semibold text-clay-500 mb-1">{data.dimension}</p>
        <p className="text-lg font-bold" style={{
          background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          {data.score} 分
        </p>
      </div>
    );
  }
  return null;
};

export const ETSRadarChart: React.FC<RadarChartProps> = ({ data }) => {
  return (
    <div className="h-64 w-full relative">
      {/* Soft background glow */}
      <div 
        className="absolute inset-0 opacity-30 rounded-3xl"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 70%)'
        }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          {/* Custom polar grid with softer colors */}
          <PolarGrid 
            stroke="rgba(139, 92, 246, 0.12)" 
            strokeWidth={1}
            gridType="polygon"
          />
          
          {/* Axis labels with custom styling */}
          <PolarAngleAxis 
            dataKey="dimension" 
            tick={({ payload, x, y, cx, cy, ...rest }) => {
              // Calculate angle for positioning
              const radius = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
              const angle = Math.atan2(y - cy, x - cx);
              const adjustedX = cx + (radius + 8) * Math.cos(angle);
              const adjustedY = cy + (radius + 8) * Math.sin(angle);
              
              return (
                <text
                  {...rest}
                  x={adjustedX}
                  y={adjustedY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    fill: '#5A6B86',
                    fontFamily: 'Noto Sans SC, Outfit, system-ui, sans-serif'
                  }}
                >
                  {payload.value}
                </text>
              );
            }}
          />
          
          <PolarRadiusAxis 
            angle={30} 
            domain={[0, 100]} 
            tick={false} 
            axisLine={false} 
          />
          
          {/* Main radar area with gradient fill */}
          <defs>
            <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.6} />
              <stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="radarStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="50%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            {/* Glow filter for the stroke */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          <Radar
            name="ETS 评分"
            dataKey="score"
            stroke="url(#radarStroke)"
            strokeWidth={2.5}
            fill="url(#radarGradient)"
            fillOpacity={1}
            filter="url(#glow)"
            dot={{
              r: 4,
              fill: '#8B5CF6',
              stroke: '#FFFFFF',
              strokeWidth: 2,
              filter: 'drop-shadow(0 2px 4px rgba(139, 92, 246, 0.4))'
            }}
            activeDot={{
              r: 6,
              fill: '#7C3AED',
              stroke: '#FFFFFF',
              strokeWidth: 2,
              filter: 'drop-shadow(0 4px 8px rgba(139, 92, 246, 0.5))'
            }}
          />
          
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};