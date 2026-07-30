import { ErrorBoundary } from './ErrorBoundary.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <div>Hello</div>
    </ErrorBoundary>
  );
}
