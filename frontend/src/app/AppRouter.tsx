import {
  BookingProvider,
  DesktopFlowView,
  MobileFlowView,
  getServiceForPath,
  SERVICE_CONFIGS,
} from '../consult-flow';
import { BlogIndexPage } from '../components/blog/BlogIndexPage';
import { BlogArticlePage } from '../components/blog/BlogArticlePage';
import {
  AboutPage,
  CertificateCampaignPage,
  FairWorkCertificatesPage,
  HomePage,
  PatientPortalPage,
  PatientLoginPage,
  PatientResetPasswordPage,
} from '../pages';

export function AppRouter() {
  const pathname = window.location.pathname.toLowerCase();

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

  if (
    pathname === '/medical-certificate-work' ||
    pathname === '/medical-certificate-university' ||
    pathname === '/medical-certificate-carers-leave'
  ) {
    return <CertificateCampaignPage />;
  }

  if (pathname === '/patient/reset-password') {
    return <PatientResetPasswordPage />;
  }

  if (pathname === '/patient' || pathname.startsWith('/patient/')) {
    return <PatientPortalPage />;
  }

  const serviceSlug = getServiceForPath(window.location.pathname);

  if (!serviceSlug) {
    return <HomePage />;
  }

  const service = SERVICE_CONFIGS[serviceSlug];

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
}
