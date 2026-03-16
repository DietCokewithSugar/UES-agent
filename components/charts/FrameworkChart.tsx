import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { DimensionScore, EvaluationFramework } from '../../types';
import { ETSRadarChart } from '../RadarChart';

interface FrameworkChartProps {
  framework: EvaluationFramework;
  data: DimensionScore[];
}

export const FrameworkChart: React.FC<FrameworkChartProps> = ({ framework, data }) => {
  if (framework.visualization.primaryChart === 'bar') {
    return (
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dimension" tick={{ fontSize: 12 }} />
            <YAxis domain={[framework.scoreRange.min, framework.scoreRange.max]} />
            <Tooltip />
            <Bar dataKey="score" fill="#7c3aed" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return <ETSRadarChart data={data} />;
};
