# Components Directory Overview

This table summarizes each component in the `src/components` folder, its main purpose, and where it is actually used (rendered) in the application.

| Component              | Description                                                      | Used In (Pages/Components)                |
|------------------------|------------------------------------------------------------------|-------------------------------------------|
| ChatInterface.tsx      | AI Copilot chat interface for portfolio Q&A and quick actions     | CopilotPage                              |
| ErrorBoundary.tsx      | Error boundary for catching and displaying React errors           | AllocationPage, CopilotPage, HomePage, SettingsPage, TickerLookupPage, TransactionsPage |
| FinalEvaluationCard.tsx| Card for displaying portfolio/ticker final evaluation and score   | ReportPage                               |
| InitialChoiceModal.tsx | Modal for initial user choice (demo/upload)                      | App (main layout, not a page)             |
| KpiCard.tsx            | Card for displaying a single KPI (metric, value, icon, etc.)     | HomePage                                  |
| PerformanceChart.tsx   | Line/multi-line chart for performance data (portfolio/ticker)     | HomePage, TickerInfoPage, AssetsPage.old  |
| PortfolioStatusCard.tsx| Card for showing portfolio status, traffic light, and holdings    | TransactionsPage                          |
| SunburstChart.tsx      | Sunburst/pie chart for asset allocation visualization            | HomePage, AllocationPage                  |
| TrafficLight.tsx       | Visual traffic light indicator for portfolio status              | ReportPage                                |

**Notes:**
- This table lists only where components are actually rendered, not just imported.
- For more details, see the source code and usage in the corresponding page/component files.
