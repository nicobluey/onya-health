import { BookingProvider } from './state';
import MobileView from './mobile';
import DesktopView from './desktop';
import HomeHub from './HomeHub';
import PatientPortal from './PatientPortal';
import PatientLogin from './PatientLogin';
import { getServiceForPath, SERVICE_CONFIGS } from './services';

function App() {
  const pathname = window.location.pathname.toLowerCase();

  if (pathname === '/patient-login') {
    return <PatientLogin />;
  }

  if (pathname === '/patient' || pathname.startsWith('/patient/')) {
    return <PatientPortal />;
  }

  const serviceSlug = getServiceForPath(window.location.pathname);

  if (!serviceSlug) {
    return <HomeHub />;
  }

  const service = SERVICE_CONFIGS[serviceSlug];

  return (
    <BookingProvider>
      <div className="md:hidden">
        <MobileView service={service} />
      </div>
      <div className="hidden md:block">
        <DesktopView service={service} />
      </div>
    </BookingProvider>
  );
}

export default App;
