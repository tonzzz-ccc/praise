import { brandingLogo, brandingText, useBranding } from '../hooks/useBranding'
import './AuthShell.css'

// Login and Forgot Password layout. The agency name, center name, both logos and the background come from
// Settings > System Settings (shared with EMIS), with the bundled DOH/MTRC defaults.
export default function AuthShell({ children }) {
  const branding = useBranding()
  const agencyName = brandingText(branding, 'agency_name')
  const centerName = brandingText(branding, 'center_name')

  return (
    <div className="auth-page">
      <aside
        className="auth-brand"
        style={branding ? { '--auth-background': `url("${brandingLogo(branding, 'login_background')}")` } : undefined}
      >
        {/* Wait for the settings so the default logos never flash before custom ones. */}
        <div className="auth-logos">
          {branding && (
            <>
              <img src={brandingLogo(branding, 'login_left')} alt={`${agencyName} logo`} />
              <img src={brandingLogo(branding, 'login_right')} alt={`${centerName} logo`} />
            </>
          )}
        </div>
        <p className="auth-agency">{agencyName}</p>
        <p className="auth-system-name">PRAISE</p>
        <p className="auth-system-full">Program on Awards and Incentives for Service Excellence</p>
        <p className="auth-center">{centerName}</p>
      </aside>
      <main className="auth-panel">
        <div className="auth-card">{children}</div>
        <p className="auth-footer">
          © {new Date().getFullYear()} {agencyName} · Program on Awards and Incentives for Service Excellence
        </p>
      </main>
    </div>
  )
}
