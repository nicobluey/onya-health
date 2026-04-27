import {
  BookingProvider,
  DesktopFlowView,
  MobileFlowView,
  getServiceForPath,
  SERVICE_CONFIGS,
} from '../consult-flow';
import { BlogIndexPage } from '../components/blog/BlogIndexPage';
import { BlogArticlePage } from '../components/blog/BlogArticlePage';
import { isHealthTopicRoute } from '../pages/HealthTopicLandingPage';
import {
  AboutPage,
  CertificateVerifyPage,
  ContactPage,
  FairWorkCertificatesPage,
  HealthTopicLandingPage,
  HomePage,
  MedicalCertificateUseCasePage,
  PatientPortalPage,
  PatientLoginPage,
  PatientResetPasswordPage,
  PrivacyPolicyPage,
  TermsConditionsPage,
  TrustSafetyPage,
} from '../pages';

const MED_CERT_LANDING_PATHS = new Set([
  '/doctor',
  '/student',
  '/caretaker',
  '/ca',
  '/work',
  '/medical-certificate-doctor',
  '/medical-certificate-student',
  '/medical-certificate-caretaker',
  '/medical-certificate-work',
  '/medical-certificate-university',
  '/medical-certificate-carers-leave',
]);

export function AppRouter() {
  const pathname = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const viewParam = searchParams.get('view')?.trim().toLowerCase();
  const shouldOpenBooking = viewParam === 'booking';

  if (pathname === '/doctor/booking' || pathname === '/doctor/booking/') {
    searchParams.set('view', 'booking');
    const nextPath = `/doctor?${searchParams.toString()}`;
    window.location.replace(nextPath);
    return null;
  }

  const renderServiceFlow = (serviceKey: keyof typeof SERVICE_CONFIGS) => {
    const service = SERVICE_CONFIGS[serviceKey];
    return (
      <BookingProvider>
        <div className="md:hidden">
          <MobileFlowView service={service} />
        </div>
        <div className="hidden md:block">
          <DesktopFlowView service={service} />
        </div>
      </BookingProvider>
    );
  };

  if (pathname === '/blog') {
    return <BlogIndexPage />;
  }

  if (pathname.startsWith('/blog/')) {
    const slug = pathname.split('/').filter(Boolean)[1] ?? '';
    return <BlogArticlePage slug={slug} />;
  }

  if (pathname === '/patient-login') {
    return <PatientLoginPage />;
  }

  if (pathname === '/about' || pathname === '/about-us') {
    return <AboutPage />;
  }

  if (pathname === '/fair-work-medical-certificates') {
    return <FairWorkCertificatesPage />;
  }

  if (pathname === '/privacy' || pathname === '/privacy-policy') {
    return <PrivacyPolicyPage />;
  }

  if (pathname === '/terms' || pathname === '/terms-and-conditions') {
    return <TermsConditionsPage />;
  }

  if (pathname === '/contact') {
    return <ContactPage />;
  }

  if (pathname === '/trust' || pathname === '/trust-safety') {
    return <TrustSafetyPage />;
  }

  if (isHealthTopicRoute(pathname)) {
    return <HealthTopicLandingPage />;
  }

  if (MED_CERT_LANDING_PATHS.has(pathname)) {
    if (shouldOpenBooking) {
      return renderServiceFlow('doctor');
    }
    return <MedicalCertificateUseCasePage />;
  }

  if (pathname === '/patient/reset-password') {
    return <PatientResetPasswordPage />;
  }

  if (pathname === '/verify' || pathname === '/verify/') {
    return <CertificateVerifyPage />;
  }

  if (pathname === '/patient' || pathname.startsWith('/patient/')) {
    return <PatientPortalPage />;
  }

  const serviceSlug = getServiceForPath(window.location.pathname);

  if (!serviceSlug) {
    return <HomePage />;
  }

  return renderServiceFlow(serviceSlug);
}
