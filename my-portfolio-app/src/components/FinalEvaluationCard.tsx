import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';

/**
 * Props
 * @prop {Object} data - final_evaluation JSON block returned by the backend
 */
export default function FinalEvaluationCard({ data }: { data: any }) {
  if (!data) return null;

  const {
    evaluation_label: label,
    score = 0,
    evaluation_description: description,
    recommendations = [],
    alert,
  } = data;

  const labelMap: Record<string, { color: string; icon: any }> = {
    Critical: { color: "bg-red-600", icon: XCircle },
    Caution: { color: "bg-amber-500", icon: AlertTriangle },
    Acceptable: { color: "bg-green-600", icon: CheckCircle2 },
    Excellent: { color: "bg-emerald-600", icon: CheckCircle2 },
  };
  const { color: labelColor = "bg-slate-500", icon: Icon = CheckCircle2 } = labelMap[label] || {};

  return (
    <div className="w-full bg-white dark:bg-gray-900 rounded-3xl shadow-md border dark:border-gray-700 p-6 md:p-8 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Icon className={`${labelColor} text-white w-5 h-5 rounded-full p-1`} />
          <span className="text-2xl font-semibold tracking-tight">Final Evaluation</span>
        </div>
        <span className={`inline-block ${labelColor} text-white px-3 py-1 text-sm rounded-full font-semibold`}>{label}</span>
      </div>
      {/* Optional Alert Banner */}
      {alert && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-400 rounded-md p-4 text-sm text-amber-900 dark:text-amber-200 mb-6">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{alert}</span>
        </div>
      )}
      {/* Content grid */}
      <div className="grid md:grid-cols-[160px_1fr] gap-8">
        {/* Score Gauge */}
        <div className="flex items-center justify-center">
          <ScoreGauge value={score} />
        </div>
        {/* Narrative section */}
        <div className="space-y-6">
          {/* Description */}
          <div className="prose prose-sm dark:prose-invert max-w-prose leading-relaxed">
            <ReactMarkdown>{description}</ReactMarkdown>
          </div>
          {/* Analyst Opinion and Top 3 Pros & Cons (robust fallback for nested fields) */}
          {(
            data.analyst_opinion ||
            (data.analysts_opinion && (data.analysts_opinion.analyst_sentiment || data.analysts_opinion.consensus_rating || data.analysts_opinion.target_price))
          ) && (
            <div>
              <h3 className="font-semibold mb-2 text-base">Analyst Opinion</h3>
              <div className="text-sm text-gray-800 dark:text-gray-200">
                {data.analyst_opinion ? (
                  <ReactMarkdown>{data.analyst_opinion}</ReactMarkdown>
                ) : (
                  <ul className="list-none p-0 m-0 space-y-1">
                    {data.analysts_opinion?.consensus_rating && (
                      <li><strong>Consensus:</strong> {data.analysts_opinion.consensus_rating}</li>
                    )}
                    {data.analysts_opinion?.target_price !== undefined && (
                      <li><strong>Target Price:</strong> {data.analysts_opinion.target_price}</li>
                    )}
                    {data.analysts_opinion?.analyst_sentiment && (
                      <li><strong>Sentiment:</strong> {data.analysts_opinion.analyst_sentiment}</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
          {(() => {
            // Prefer root-level top_pros/top_cons, else fallback to valuation_summary.top3_pros/top3_cons
            const pros = Array.isArray(data.top_pros) && data.top_pros.length > 0
              ? data.top_pros
              : (Array.isArray(data.valuation_summary?.top3_pros) ? data.valuation_summary.top3_pros : []);
            const cons = Array.isArray(data.top_cons) && data.top_cons.length > 0
              ? data.top_cons
              : (Array.isArray(data.valuation_summary?.top3_cons) ? data.valuation_summary.top3_cons : []);
            if (pros.length === 0 && cons.length === 0) return null;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pros.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-green-700">Top 3 Pros</h4>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {pros.slice(0, 3).map((pro: any, idx: number) => (
                        <li key={"pro-" + idx}>
                          {typeof pro === 'string' ? <ReactMarkdown>{pro}</ReactMarkdown> : <><strong>{pro.pro}:</strong> <ReactMarkdown>{pro.description}</ReactMarkdown></>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {cons.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-red-700">Top 3 Cons</h4>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {cons.slice(0, 3).map((con: any, idx: number) => (
                        <li key={"con-" + idx}>
                          {typeof con === 'string' ? <ReactMarkdown>{con}</ReactMarkdown> : <><strong>{con.con}:</strong> <ReactMarkdown>{con.description}</ReactMarkdown></>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
          {/* Recommendations */}
          <div>
            <h3 className="font-semibold mb-3 text-lg md:text-xl">Actionable Recommendations</h3>
            <ul className="list-disc pl-5 space-y-3 text-base md:text-lg leading-snug marker:text-primary">
              {recommendations.map((rec: any, idx: number) => (
                <li key={rec.recommendation + (rec.recommendation_key || idx)} className="mb-3">
                  <div>
                    <span className="font-bold text-primary dark:text-primary-foreground">
                      {rec.recommendation_key ? `${rec.recommendation_key}: ` : ''}
                    </span>
                    <span className="font-medium text-primary dark:text-primary-foreground">
                      {rec.recommendation}
                    </span>
                    {rec.priority && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold text-white bg-indigo-600">Priority: {rec.priority}</span>
                    )}
                  </div>
                  {rec.rationale && <div className="text-gray-700 dark:text-gray-300 text-sm mt-1"><span className="font-semibold">Rationale:</span> {rec.rationale}</div>}
                  {rec.timing && <div className="text-gray-700 dark:text-gray-300 text-sm"><span className="font-semibold">Timing:</span> {rec.timing}</div>}
                  {rec.trade_size && <div className="text-gray-700 dark:text-gray-300 text-sm"><span className="font-semibold">Trade Size:</span> {rec.trade_size}</div>}
                  {rec.trading_strategy && <div className="text-gray-700 dark:text-gray-300 text-sm"><span className="font-semibold">Strategy:</span> {rec.trading_strategy}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreGauge({ value = 0 }: { value: number }) {
  const size = 140;
  const data = [{ name: "score", value }];
  const fill = value < 60 ? "#f59e0b" : value < 80 ? "#10b981" : "#059669";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size}
        height={size}
        cx="50%"
        cy="50%"
        innerRadius={size / 2 - 12}
        outerRadius={size / 2}
        barSize={12}
        startAngle={90}
        endAngle={value / 100 * 360 + 90}
        data={data}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} dataKey="value" angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: "#e5e7eb" }} dataKey="value" cornerRadius={6} fill={fill} />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground dark:text-white">{value}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
      <span className="block text-center text-xs mt-2 text-muted-foreground">Portfolio Score</span>
    </div>
  );
}
