import { ErrorBoundary } from '../components/ErrorBoundary';
import TickerInfoPage from './TickerInfoPage';

export default function TickerLookupPage() {
  return (
    <ErrorBoundary>
      <TickerInfoPage />
    </ErrorBoundary>
  );
}
