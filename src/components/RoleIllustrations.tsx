import { WorkerRoleId } from '../types/airQuality';

export function SquiggleUnderline({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 16"
      width="180"
      height="16"
      fill="none"
      aria-hidden="true"
      className={className}
      preserveAspectRatio="none"
    >
      <path
        d="M3 10.5C18 3.5 32 3.5 46 10.5C60 17.5 74 3.5 89 10.5C104 17.5 118 3.5 133 10.5C148 17.5 162 4.5 177 9.5"
        stroke="#FF4D8D"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeliveryIllustration({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" className={className}>
      <rect x="10" y="22" width="16" height="18" rx="3" fill="#FF5C35" stroke="#141414" strokeWidth="2.5" />
      <path
        d="M27 21C27 14.3726 32.3726 9 39 9C45.6274 9 51 14.3726 51 21V25H27V21Z"
        fill="#FFD23F"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="38" y="16" width="13" height="7" rx="2" fill="#7DD3FC" stroke="#141414" strokeWidth="2.2" />
      <path
        d="M20 42H46L50 32H40L36 42H20Z"
        fill="#7DD3FC"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M44 32L42 25H48" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="48" r="7" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
      <circle cx="19" cy="48" r="2.2" fill="#141414" />
      <circle cx="47" cy="48" r="7" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
      <circle cx="47" cy="48" r="2.2" fill="#141414" />
    </svg>
  );
}

function DriverIllustration({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" className={className}>
      <path
        d="M14 26C14 17.1634 21.1634 10 30 10H38C45.732 10 52 16.268 52 24V42H12V28C12 26.8954 12.8954 26 14 26Z"
        fill="#FFD23F"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="12" y="32" width="40" height="10" fill="#141414" />
      <rect x="18" y="16" width="13" height="12" rx="2" fill="#7DD3FC" stroke="#141414" strokeWidth="2.3" />
      <rect x="35" y="16" width="11" height="12" rx="2" fill="#7DD3FC" stroke="#141414" strokeWidth="2.3" />
      <circle cx="49" cy="37" r="3" fill="#FF5C35" stroke="#FFFDF2" strokeWidth="1.5" />
      <circle cx="20" cy="47" r="6.5" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
      <circle cx="20" cy="47" r="2" fill="#141414" />
      <circle cx="44" cy="47" r="6.5" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
      <circle cx="44" cy="47" r="2" fill="#141414" />
    </svg>
  );
}

function VendorIllustration({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" className={className}>
      <path d="M10 22L16 11H48L54 22H10Z" fill="#FF4D8D" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d="M10 22C10 25.5 15 27 17.5 22C20 27 25 27 27.5 22C30 27 34 27 36.5 22C39 27 44 27 46.5 22C49 27 54 25.5 54 22"
        fill="#FFD23F"
        stroke="#141414"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <line x1="16" y1="25" x2="16" y2="36" stroke="#141414" strokeWidth="2.5" />
      <line x1="48" y1="25" x2="48" y2="36" stroke="#141414" strokeWidth="2.5" />
      <rect x="13" y="36" width="38" height="13" rx="2" fill="#FF9F1C" stroke="#141414" strokeWidth="2.5" />
      <circle cx="24" cy="33" r="4" fill="#6EE7B7" stroke="#141414" strokeWidth="2.2" />
      <circle cx="33" cy="33" r="4" fill="#FFD23F" stroke="#141414" strokeWidth="2.2" />
      <circle cx="41" cy="33" r="4" fill="#FF4D8D" stroke="#141414" strokeWidth="2.2" />
      <circle cx="21" cy="52" r="5" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
      <circle cx="43" cy="52" r="5" fill="#FFFFFF" stroke="#141414" strokeWidth="2.5" />
    </svg>
  );
}

function PoliceIllustration({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" className={className}>
      <path d="M14 23L19 11H45L50 23H14Z" fill="#2563EB" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M13 23H51C51 27 44 29 32 29C20 29 13 27 13 23Z" fill="#141414" />
      <circle cx="32" cy="17" r="3.5" fill="#FFD23F" stroke="#141414" strokeWidth="2" />
      <rect x="21" y="29" width="22" height="16" rx="6" fill="#FDE68A" stroke="#141414" strokeWidth="2.5" />
      <path d="M23 36H41V42C41 44.5 37 46 32 46C27 46 23 44.5 23 42V36Z" fill="#7DD3FC" stroke="#141414" strokeWidth="2.2" />
      <path
        d="M15 56C15 49 21 46 32 46C43 46 49 49 49 56H15Z"
        fill="#6EE7B7"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="28" y="46" width="8" height="10" fill="#FFD23F" stroke="#141414" strokeWidth="2" />
    </svg>
  );
}

function GeneralIllustration({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" className={className}>
      <circle cx="44" cy="18" r="8" fill="#FFD23F" stroke="#141414" strokeWidth="2.5" />
      <circle cx="26" cy="22" r="8" fill="#EAD6FF" stroke="#141414" strokeWidth="2.5" />
      <path
        d="M13 48C13 38.6112 18.8203 33 26 33C33.1797 33 39 38.6112 39 48H13Z"
        fill="#7DD3FC"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M36 33H52C54.2091 33 56 31.2091 56 29C56 26.7909 54.2091 25 52 25"
        stroke="#141414"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M39 41H54C55.6569 41 57 42.3431 57 44C57 45.6569 55.6569 47 54 47"
        stroke="#FF4D8D"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RoleIllustration({
  roleId,
  className = 'w-14 h-14',
}: {
  roleId: WorkerRoleId;
  className?: string;
}) {
  switch (roleId) {
    case 'delivery':
      return <DeliveryIllustration className={className} />;
    case 'driver':
      return <DriverIllustration className={className} />;
    case 'vendor':
      return <VendorIllustration className={className} />;
    case 'police':
      return <PoliceIllustration className={className} />;
    case 'general':
    default:
      return <GeneralIllustration className={className} />;
  }
}
