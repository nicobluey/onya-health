import { AppRouter } from './app/AppRouter';
import { useGlobalMagneticButtons } from './components/useGlobalMagneticButtons';

export default function App() {
  useGlobalMagneticButtons();
  return <AppRouter />;
}
