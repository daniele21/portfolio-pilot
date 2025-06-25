import { RadialBarChart, RadialBar } from "recharts";
import React from "react";

export function ProgressCircle({ value, max = 100, size = 120, strokeWidth = 12, children }) {
  const data = [
    { name: "score", value },
  ];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size}
        height={size}
        innerRadius={size / 2 - strokeWidth}
        outerRadius={size / 2}
        data={data}
        startAngle={90}
        endAngle={value / max * 360 + 90}
      >
        <RadialBar minAngle={15} background clockWise={true} dataKey="value" />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
