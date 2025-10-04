import { ErrorBoundary } from '../components/ErrorBoundary';
import SimpleHome from './home/SimpleHome';

export default function HomePage() {
  return (
    <ErrorBoundary>
      <SimpleHome />
    </ErrorBoundary>
  );
}
