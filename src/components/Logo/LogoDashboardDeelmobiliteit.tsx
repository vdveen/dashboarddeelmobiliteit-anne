import { edition } from '../../config/edition';

interface LogoDashboardDeelmobiliteitProps {
  /** Text color of the logo. Defaults to the app's dark text color. */
  color?: string;
}

function LogoDashboardDeelmobiliteit({
  color = '#343E47'
}: LogoDashboardDeelmobiliteitProps) {
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{
        font: 'normal normal bold 20px/24px Inter',
        color
      }}>
        Dashboard Deelmobiliteit
      </div>
      <div style={{
        marginTop: '4px',
        borderBottom: '3px solid #15AEEF'
      }} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '6px'
      }}>
        <img
          src={edition.logo}
          alt={edition.logoAlt}
          style={{ flex: '1 1 0', minWidth: 0, height: 'auto' }}
        />
        <span style={{
          font: 'normal normal 600 11px/14px Inter',
          color: '#00325F'
        }}>
          editie
        </span>
      </div>
    </div>
  )
}

export default LogoDashboardDeelmobiliteit;
